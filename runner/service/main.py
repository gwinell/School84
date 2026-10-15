import hmac
import json
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
    language: Literal["python", "javascript"] = "python"
    code: str = Field(min_length=1, max_length=30_000)
    tests: list[TestCase] = Field(min_length=1, max_length=12)
    lint: bool = True
    checkerCode: str | None = Field(default=None, max_length=30_000)


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


def create_sandbox(code: str, test_input: str = "", extra_environment: dict[str, str] | None = None):
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
        environment={"S84_TASK_CODE": code, "S84_TASK_INPUT": test_input, **(extra_environment or {})},
    )
    container.start()
    return container


def run_lint(code: str, language: str, linters: list[str] | None = None) -> dict:
    container = None
    try:
        container = create_sandbox(code)
        if language == "python":
            command = ["/usr/local/bin/ruff", "check", "--output-format", "concise", "--stdin-filename", "solution.py", "-"]
            source = "import os,subprocess,sys\nsource=os.environ.pop('S84_TASK_CODE')\nos.environ.clear()\nresult=subprocess.run(" + repr(command) + ",input=source,text=True,capture_output=True,timeout=1.5)\nsys.stdout.write(result.stdout);sys.stderr.write(result.stderr);sys.exit(result.returncode)"
            exec_command = ["python", "-I", "-c", source]
        else:
            # Use only a fixed CLI ruleset; do not load task-provided ESLint config/plugins.
            command = [
                "/usr/local/bin/eslint", "--no-config-lookup", "--stdin",
                "--stdin-filename", "solution.js", "--global", "console",
                "--global", "process", "--global", "require", "--global", "module",
                "--global", "Buffer", "--rule", "no-undef:error",
                "--rule", "no-unreachable:error",
            ]
            source = "import os,subprocess,sys\nsource=os.environ.pop('S84_TASK_CODE')\nos.environ.clear()\nresult=subprocess.run(" + repr(command) + ",input=source,text=True,capture_output=True,timeout=1.5)\nsys.stdout.write(result.stdout);sys.stderr.write(result.stderr);sys.exit(result.returncode)"
            exec_command = ["python", "-I", "-c", source]
        return run_exec(container, exec_command, LINT_TIMEOUT_SECONDS)
    finally:
        if container is not None:
            try:
                container.remove(force=True)
            except docker.errors.NotFound:
                pass


def run_one(code: str, test_input: str, expected_output: str, language: str = "python", checker_code: str | None = None) -> dict:
    started = time.monotonic()
    container = None
    try:
        container = create_sandbox(code, test_input, {"S84_LANGUAGE": language})
        # Capture the learner's output in a bounded tmpfs file. The checker runs
        # later in a different container, so learner processes cannot reach it.
        bootstrap = r'''import os,subprocess,sys,tempfile
source=os.environ.pop('S84_TASK_CODE')
task_input=os.environ.pop('S84_TASK_INPUT')
language=os.environ.pop('S84_LANGUAGE')
os.environ.clear()
if language == 'python':
    child=[sys.executable,'-I','-c',"import os,sys; src=os.environ.pop('S84_CHILD_CODE'); os.environ.clear(); exec(compile(src,'<solution>','exec'),{'__name__':'__main__'})"]
    child_env={'S84_CHILD_CODE':source}
else:
    child=['node','-e',source]
    child_env={}
with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
    try:
        run=subprocess.run(child,input=task_input.encode(),stdout=out,stderr=err,timeout=1.8,env=child_env)
    except subprocess.TimeoutExpired:
        print('S84_TIMEOUT',file=sys.stderr); sys.exit(124)
    out.seek(0); actual_bytes=out.read(16001)
    err.seek(0); task_error=err.read(16000).decode('utf-8','replace')
    if len(actual_bytes)>16000:
        print('S84_OUTPUT_EXCEEDED',file=sys.stderr); sys.exit(125)
    actual=actual_bytes.decode('utf-8','replace')
    if run.returncode:
        sys.stderr.write(task_error); sys.exit(run.returncode)
    sys.stderr.write(task_error)
sys.stdout.write(actual)
'''
        execution = run_exec(container, ["python", "-I", "-c", bootstrap], 1.8)
        if execution.get("outputExceeded"):
            return {"status": "RUNTIME_ERROR", "stdout": "", "stderr": "Превышен допустимый объём вывода.", "durationMs": int((time.monotonic() - started) * 1000)}
        if execution["timedOut"]:
            return {"status": "TIME_LIMIT", "stdout": "", "stderr": "Превышено время выполнения.", "durationMs": int((time.monotonic() - started) * 1000)}
        exit_code = execution["exitCode"]
        stdout = execution["stdout"]
        stderr = execution["stderr"]
        status = "OK" if exit_code == 0 else "TIME_LIMIT" if exit_code == 124 else "RUNTIME_ERROR"
    finally:
        if container is not None:
            try:
                container.remove(force=True)
            except docker.errors.NotFound:
                pass

    if status != "OK" or not checker_code:
        return {"status": status, "stdout": stdout, "stderr": stderr[-MAX_OUTPUT_BYTES:], "checkerPassed": True, "checkerMessage": "", "durationMs": int((time.monotonic() - started) * 1000)}

    checker_container = None
    checker_environment = {
        "S84_CHECKER_CODE": checker_code,
        "S84_CHECKER_INPUT": test_input,
        "S84_CHECKER_EXPECTED": expected_output,
        "S84_CHECKER_ACTUAL": stdout,
        "S84_CHECKER_SOURCE": code,
        "S84_LANGUAGE": language,
    }
    try:
        checker_container = create_sandbox("", "", checker_environment)
        if language == "python":
            check_bootstrap = r'''import json,os
checker=os.environ.pop('S84_CHECKER_CODE')
values={key:os.environ.pop(name) for key,name in [('input','S84_CHECKER_INPUT'),('expected','S84_CHECKER_EXPECTED'),('actual','S84_CHECKER_ACTUAL'),('source','S84_CHECKER_SOURCE')]}
os.environ.clear()
namespace={}
exec(compile(checker,'<checker>','exec'),namespace)
fn=namespace.get('check')
if not callable(fn): raise RuntimeError('Checker must define check(...)')
result=fn(values['input'],values['expected'],values['actual'],values['source'])
passed=result if isinstance(result,bool) else not result if isinstance(result,str) else False
message=result[:2000] if isinstance(result,str) else ''
print('S84_CHECKER:'+json.dumps({'passed':passed,'message':message},ensure_ascii=False))
'''
            checker_command = ["python", "-I", "-c", check_bootstrap]
        else:
            check_bootstrap = r'''const checker=process.env.S84_CHECKER_CODE;
const args={input:process.env.S84_CHECKER_INPUT,expectedOutput:process.env.S84_CHECKER_EXPECTED,actualOutput:process.env.S84_CHECKER_ACTUAL,sourceCode:process.env.S84_CHECKER_SOURCE};
delete process.env.S84_CHECKER_CODE; delete process.env.S84_CHECKER_INPUT; delete process.env.S84_CHECKER_EXPECTED; delete process.env.S84_CHECKER_ACTUAL; delete process.env.S84_CHECKER_SOURCE; delete process.env.S84_LANGUAGE;
const check=new Function(checker+'; return typeof check === "function" ? check : undefined;')();
if(!check) throw new Error('Checker must define check(...)');
const result=check(args); const passed=typeof result==='boolean'?result:(typeof result==='string'?!result:false);
process.stdout.write('S84_CHECKER:'+JSON.stringify({passed,message:typeof result==='string'?result.slice(0,2000):''}));
'''
            checker_command = ["node", "-e", check_bootstrap]
        checked = run_exec(checker_container, checker_command, 0.7)
        if checked.get("timedOut") or checked.get("outputExceeded") or checked["exitCode"] != 0:
            return {"status": "RUNTIME_ERROR", "stdout": stdout, "stderr": checked["stderr"][-MAX_OUTPUT_BYTES:] or "Не удалось выполнить дополнительную проверку.", "checkerPassed": False, "checkerMessage": "", "durationMs": int((time.monotonic() - started) * 1000)}
        try:
            raw = checked["stdout"]
            if not raw.startswith("S84_CHECKER:"):
                raise ValueError("Missing checker result")
            checker_result = json.loads(raw[len("S84_CHECKER:"):])
            checker_passed = checker_result.get("passed") is True
            checker_message = checker_result.get("message", "")
        except (json.JSONDecodeError, AttributeError, ValueError):
            return {"status": "RUNTIME_ERROR", "stdout": stdout, "stderr": "Проверяющая программа вернула некорректный результат.", "checkerPassed": False, "checkerMessage": "", "durationMs": int((time.monotonic() - started) * 1000)}
        return {"status": "OK", "stdout": stdout, "stderr": checker_message[-MAX_OUTPUT_BYTES:] or stderr[-MAX_OUTPUT_BYTES:], "checkerPassed": checker_passed, "checkerMessage": checker_message, "durationMs": int((time.monotonic() - started) * 1000)}
    finally:
        if checker_container is not None:
            try:
                checker_container.remove(force=True)
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
    language = getattr(request, "language", "python")
    checker_code = getattr(request, "checkerCode", None)
    if request.lint:
        lint = run_lint(request.code, language)
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
        check = run_one(request.code, test.input, test.output, language, checker_code)
        total_duration += check["durationMs"]
        normalized_actual = check["stdout"].replace("\r\n", "\n").rstrip()
        normalized_expected = test.output.replace("\r\n", "\n").rstrip()
        passed = check["status"] == "OK" and normalized_actual == normalized_expected and check.get("checkerPassed", True)
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
