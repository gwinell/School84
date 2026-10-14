"""Runner regressions with Docker/HTTP mocked; no container or live service used."""
import importlib.util
import os
from pathlib import Path
import sys
import threading
import time
import types
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch


class FakeHTTPException(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        super().__init__(detail)


class FakeApp:
    def __init__(self, **kwargs):
        pass

    def get(self, *args):
        return lambda fn: fn

    post = get


docker_stub = types.SimpleNamespace(
    from_env=lambda: types.SimpleNamespace(),
    errors=types.SimpleNamespace(APIError=RuntimeError, NotFound=RuntimeError, ImageNotFound=RuntimeError),
)
fastapi_stub = types.SimpleNamespace(FastAPI=FakeApp, Header=lambda **kwargs: None, HTTPException=FakeHTTPException)
pydantic_stub = types.SimpleNamespace(BaseModel=object, Field=lambda **kwargs: None)
spec = importlib.util.spec_from_file_location('runner_under_test', Path(__file__).resolve().parents[1] / 'runner/service/main.py')
runner = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {'docker': docker_stub, 'fastapi': fastapi_stub, 'pydantic': pydantic_stub}), patch.dict(os.environ, {'RUNNER_TOKEN': 'test-token-only'}):
    spec.loader.exec_module(runner)


class FakeContainer:
    id = 'test-container'

    def __init__(self):
        self.killed = False
        self.removed = False

    def kill(self):
        self.killed = True

    def remove(self, **kwargs):
        self.removed = True


class RunnerTests(unittest.TestCase):
    def execution(self, stdout=b'', stderr=b'', delay=0):
        started = threading.Event()
        container = FakeContainer()

        class API:
            def exec_create(self, *args, **kwargs):
                return {'Id': 'exec'}

            def exec_start(self, *args, **kwargs):
                if delay:
                    time.sleep(delay)
                started.set()
                return iter([(stdout, stderr)])

            def exec_inspect(self, *args):
                if not started.is_set():
                    raise AssertionError('inspected pending exec before exec_start')
                return {'Running': False, 'ExitCode': 0}

        with patch.object(runner, 'client', types.SimpleNamespace(api=API())):
            return runner.run_exec(container, ['python'], 0.5), container

    def test_stdout_overflow_is_flagged_and_killed(self):
        result, container = self.execution(b'1' + b' ' * 17000 + b'WRONG ANSWER')
        self.assertTrue(result['outputExceeded'])
        self.assertNotEqual(result['exitCode'], 0)
        self.assertEqual(len(result['stdout']), runner.MAX_OUTPUT_BYTES)
        self.assertTrue(container.killed)

    def test_stderr_overflow_is_flagged_and_killed(self):
        result, container = self.execution(stderr=b'e' * (runner.MAX_OUTPUT_BYTES + 1))
        self.assertTrue(result['outputExceeded'])
        self.assertNotEqual(result['exitCode'], 0)
        self.assertTrue(container.killed)

    def test_exact_output_limit_is_allowed(self):
        result, container = self.execution(b'1' * runner.MAX_OUTPUT_BYTES)
        self.assertFalse(result['outputExceeded'])
        self.assertEqual(result['exitCode'], 0)
        self.assertFalse(container.killed)

    def test_waits_for_exec_start_before_inspection(self):
        result, _ = self.execution(b'1', delay=0.03)
        self.assertEqual(result['stdout'], '1')
        self.assertEqual(result['exitCode'], 0)

    def test_exec_start_failure_cannot_report_success(self):
        def broken_start(*args, **kwargs):
            raise RuntimeError('Docker stream unavailable')

        api = types.SimpleNamespace(
            exec_create=lambda *args, **kwargs: {'Id': 'exec'},
            exec_start=broken_start,
            exec_inspect=lambda *args: {'Running': False, 'ExitCode': 0},
        )
        with patch.object(runner, 'client', types.SimpleNamespace(api=api)):
            result = runner.run_exec(FakeContainer(), ['python'], 0.5)
        self.assertNotEqual(result['exitCode'], 0)
        self.assertEqual(result['stdout'], '')

    def test_truncated_prefix_never_accepts_expected_answer(self):
        container = FakeContainer()
        request = types.SimpleNamespace(code="print('1' + ' ' * 17000 + 'WRONG ANSWER')", tests=[types.SimpleNamespace(input='', output='1')], lint=False)
        truncated = {'timedOut': False, 'exitCode': 1, 'outputExceeded': True, 'stdout': '1' + ' ' * 15999, 'stderr': '', 'durationMs': 1}
        with patch.object(runner, 'client', types.SimpleNamespace(images=types.SimpleNamespace(get=lambda image: None))), patch.object(runner, 'create_sandbox', return_value=container), patch.object(runner, 'run_exec', return_value=truncated):
            result = runner.execute_run(request)
        self.assertEqual(result['status'], 'RUNTIME_ERROR')
        self.assertEqual(result['passedTests'], 0)
        self.assertTrue(container.removed)

    def test_global_cap_rejects_third_request_and_releases_slots(self):
        entered = 0
        lock = threading.Lock()
        both_entered = threading.Event()
        release = threading.Event()

        def execute(request):
            nonlocal entered
            with lock:
                entered += 1
                if entered == 2:
                    both_entered.set()
            if not release.wait(timeout=2):
                raise AssertionError('test release timeout')
            return {'status': 'ACCEPTED'}

        with patch.object(runner, 'RUN_SLOTS', threading.BoundedSemaphore(2)), patch.object(runner, 'execute_run', side_effect=execute):
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(runner.run, object(), 'Bearer test-token-only') for _ in range(2)]
                try:
                    self.assertTrue(both_entered.wait(timeout=1))
                    with self.assertRaises(FakeHTTPException) as error:
                        runner.run(object(), 'Bearer test-token-only')
                    self.assertEqual(error.exception.status_code, 429)
                    self.assertEqual(entered, 2)
                finally:
                    release.set()
                for future in futures:
                    self.assertEqual(future.result()['status'], 'ACCEPTED')
            self.assertTrue(runner.RUN_SLOTS.acquire(blocking=False))
            self.assertTrue(runner.RUN_SLOTS.acquire(blocking=False))
            runner.RUN_SLOTS.release()
            runner.RUN_SLOTS.release()

    def test_error_releases_slot_and_invalid_token_cannot_execute(self):
        with patch.object(runner, 'RUN_SLOTS', threading.BoundedSemaphore(2)), patch.object(runner, 'execute_run', side_effect=RuntimeError('Docker unavailable')) as execute:
            with self.assertRaises(FakeHTTPException) as error:
                runner.run(object(), 'Bearer invalid')
            self.assertEqual(error.exception.status_code, 401)
            execute.assert_not_called()
            for _ in range(3):
                with self.assertRaises(RuntimeError):
                    runner.run(object(), 'Bearer test-token-only')
            self.assertTrue(runner.RUN_SLOTS.acquire(blocking=False))
            self.assertTrue(runner.RUN_SLOTS.acquire(blocking=False))
            runner.RUN_SLOTS.release()
            runner.RUN_SLOTS.release()


if __name__ == '__main__':
    unittest.main()
