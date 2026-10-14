import hmac
import os
import time
import threading
from typing import Literal

import docker
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
client = docker.from_env()
TOKEN = os.environ["RUNNER_TOKEN"]
IMAGE = os.environ.get("SANDBOX_IMAGE", "school84-python-sandbox:local")
MAX_OUTPUT_BYTES = 16_000
TEST_TIMEOUT_SECONDS = 2.5
LINT_TIMEOUT_SECONDS = 2.0
RUN_SLOTS = threading.BoundedSemaphore(2)


class TestCase(BaseModel):
    input: str = Field(max_length=5_000)
    output: str = Field(max_length=5_000)


class RunRequest(BaseModel):
    code: str = Field(min_length=1, max_length=30_000)
    tests: list[TestCase] = Field(min_length=1, max_length=12)
    lint: bool = True


def run_exec(container, command: list[str], timeout: float) -> dict:
    started = time.monotonic()
    exec_id = client.api.exec_create(container.id, command, stdout=True, stderr=True)["Id"]
    stdout_parts = []
    stderr_parts = []
    output_size = {"stdout": 0, "stderr": 0}
    stream_done = threading.Event()
    stream_ready = threading.Event()
    output_exceeded = threading.Event()
    stream_errors = []

    def read_output():
        try:
            stream = client.api.exec_start(exec_id, stream=True, demux=True)
            stream_ready.set()
            for stdout_chunk, stderr_chunk in stream:
                if stdout_chunk:
                    if len(stdout_chunk) > MAX_OUTPUT_BYTES - output_size["stdout"]:
                        output_exceeded.set()
                    remaining = MAX_OUTPUT_BYTES - output_size["stdout"]
                    if remaining > 0:
                        stdout_parts.append(stdout_chunk[:remaining])
                        output_size["stdout"] += min(len(stdout_chunk), remaining)
                if stderr_chunk:
                    if len(stderr_chunk) > MAX_OUTPUT_BYTES - output_size["stderr"]:
                        output_exceeded.set()
                    remaining = MAX_OUTPUT_BYTES - output_size["stderr"]
                    if remaining > 0:
                        stderr_parts.append(stderr_chunk[:remaining])
                        output_size["stderr"] += min(len(stderr_chunk), remaining)
                if output_exceeded.is_set():
                    try:
                        container.kill()
                    except docker.errors.APIError:
                        pass
                    break
            if hasattr(stream, "close"):
                stream.close()
        except Exception as error:
            stream_errors.append(error)
        finally:
            stream_ready.set()
            stream_done.set()

    output_thread = threading.Thread(target=read_output, daemon=True)
    output_thread.start()
    # Never inspect an exec that the output thread has not started yet: Docker
    # reports Running=False/ExitCode=None for an exec that is still pending.
    stream_ready.wait(timeout=timeout)
    while time.monotonic() - started < timeout:
        execution = client.api.exec_inspect(exec_id)
        if not execution["Running"]:
            break
        time.sleep(0.05)
    else:
        container.kill()
        return {"timedOut": True, "exitCode": None, "stdout": "", "stderr": "", "durationMs": int((time.monotonic() - started) * 1000)}

    stream_done.wait(timeout=1)
    output_thread.join(timeout=1)
    return {
        "timedOut": False,
        "exitCode": 1 if output_exceeded.is_set() or stream_errors or not stream_done.is_set() else execution.get("ExitCode", 1),
        "outputExceeded": output_exceeded.is_set(),
        "stdout": b"".join(stdout_parts).decode("utf-8", errors="replace"),
        "stderr": b"".join(stderr_parts).decode("utf-8", errors="replace"),
        "durationMs": int((time.monotonic() - started) * 1000),
    }


def create_sandbox(code: str, test_input: str = ""):
    container = client.containers.create(
        IMAGE,
        command=["sleep", "60"],
        user="10001:10001",
        network_disabled=True,
        read_only=True,
        mem_limit="96m",
        nano_cpus=500_000_000,
        pids_limit=24,
        cap_drop=["ALL"],
        security_opt=["no-new-privileges:true"],
        tmpfs={"/tmp": "rw,noexec,nosuid,size=8m"},
        environment={"S84_TASK_CODE": code, "S84_TASK_INPUT": test_input},
    )
    container.start()
    return container


def run_lint(code: str) -> dict:
    container = None
    try:
        container = create_sandbox(code)
        bootstrap = (
            "import os,subprocess,sys\n"
            "source=os.environ.pop('S84_TASK_CODE')\n"
            "os.environ.clear()\n"
            "result=subprocess.run(['/usr/local/bin/ruff','check','--output-format','concise','--stdin-filename','solution.py','-'],input=source,text=True,capture_output=True,timeout=1.5)\n"
            "sys.stdout.write(result.stdout);sys.stderr.write(result.stderr);sys.exit(result.returncode)"
        )
        return run_exec(container, ["python", "-I", "-c", bootstrap], LINT_TIMEOUT_SECONDS)
    finally:
        if container is not None:
            try:
                container.remove(force=True)
            except docker.errors.NotFound:
                pass


def run_one(code: str, test_input: str) -> dict:
    container = None
    started = time.monotonic()
    try:
        container = create_sandbox(code, test_input)
        bootstrap = (
            "import io,os,sys\n"
            "source=os.environ.pop('S84_TASK_CODE')\n"
            "task_input=os.environ.pop('S84_TASK_INPUT')\n"
            "os.environ.clear()\n"
            "sys.stdin=io.TextIOWrapper(io.BytesIO(task_input.encode()),encoding='utf-8')\n"
            "exec(compile(source,'<solution>','exec'),{'__name__':'__main__'})"
        )
        execution = run_exec(container, ["python", "-I", "-c", bootstrap], TEST_TIMEOUT_SECONDS)
        if execution.get("outputExceeded"):
            return {"status": "RUNTIME_ERROR", "stdout": "", "stderr": "Превышен допустимый объём вывода.", "durationMs": int((time.monotonic() - started) * 1000)}
        if execution["timedOut"]:
            return {"status": "TIME_LIMIT", "stdout": "", "stderr": "Превышено время выполнения.", "durationMs": int((time.monotonic() - started) * 1000)}
        exit_code = execution["exitCode"]
        stdout = execution["stdout"]
        stderr = execution["stderr"]
        return {
            "status": "OK" if exit_code == 0 else "RUNTIME_ERROR",
            "stdout": stdout,
            "stderr": stderr[-MAX_OUTPUT_BYTES:],
            "durationMs": int((time.monotonic() - started) * 1000),
        }
    finally:
        if container is not None:
            try:
                container.remove(force=True)
            except docker.errors.NotFound:
                pass


@app.get("/health")
def health():
    return {"status": "ok"}


def execute_run(request: RunRequest):
    try:
        client.images.get(IMAGE)
    except docker.errors.ImageNotFound as error:
        raise HTTPException(status_code=503, detail="Sandbox image is not built. Start the runner using the README instructions.") from error

    lint_duration = 0
    lint_output = ""
    if request.lint:
        lint = run_lint(request.code)
        lint_duration = lint["durationMs"]
        lint_output = (lint["stdout"] + lint["stderr"])[-MAX_OUTPUT_BYTES:] if lint["exitCode"] != 0 else ""
        if lint["timedOut"] or lint["exitCode"] != 0:
            return {
                "status": "LINT_ERROR",
                "passedTests": 0,
                "totalTests": len(request.tests),
                "actualOutput": "",
                "errorText": "Исправьте замечания линтера." if not lint["timedOut"] else "Проверка линтером превысила время.",
                "lintOutput": lint_output,
                "durationMs": lint_duration,
                "checks": [],
            }

    checks = []
    total_duration = lint_duration
    for index, test in enumerate(request.tests):
        check = run_one(request.code, test.input)
        total_duration += check["durationMs"]
        normalized_actual = check["stdout"].replace("\r\n", "\n").rstrip()
        normalized_expected = test.output.replace("\r\n", "\n").rstrip()
        passed = check["status"] == "OK" and normalized_actual == normalized_expected
        checks.append({
            "status": "PASSED" if passed else check["status"] if check["status"] != "OK" else "WRONG_ANSWER",
            "actualOutput": check["stdout"][:MAX_OUTPUT_BYTES],
            "errorText": check["stderr"][-MAX_OUTPUT_BYTES:] or None,
            "durationMs": check["durationMs"],
        })
        if not passed:
            break

    passed_count = sum(item["status"] == "PASSED" for item in checks)
    status = "ACCEPTED" if passed_count == len(request.tests) else checks[-1]["status"]
    return {
        "status": status,
        "passedTests": passed_count,
        "totalTests": len(request.tests),
        "actualOutput": checks[-1]["actualOutput"] if checks else "",
        "errorText": checks[-1]["errorText"] if checks else None,
        "lintOutput": lint_output or None,
        "durationMs": total_duration,
        "checks": checks,
    }


@app.post("/run")
def run(request: RunRequest, authorization: str | None = Header(default=None)):
    provided = authorization.removeprefix("Bearer ") if authorization else ""
    if not hmac.compare_digest(provided, TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not RUN_SLOTS.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Runner is busy. Try again later.")
    try:
        return execute_run(request)
    finally:
        RUN_SLOTS.release()
