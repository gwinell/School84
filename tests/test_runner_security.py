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

    def test_execute_run_passes_language_and_checker_and_requires_io_match(self):
        request = types.SimpleNamespace(
            language='javascript', code='process.stdout.write("yes")',
            tests=[types.SimpleNamespace(input='', output='yes')], lint=False,
            checkerCode='function check({actualOutput}) { return actualOutput === "yes"; }',
        )
        checked = {
            'status': 'OK', 'stdout': 'yes', 'stderr': '', 'checkerPassed': True,
            'durationMs': 5,
        }
        with patch.object(runner, 'client', types.SimpleNamespace(images=types.SimpleNamespace(get=lambda image: None))), patch.object(runner, 'run_one', return_value=checked) as run_one:
            result = runner.execute_run(request)
        run_one.assert_called_once_with(request.code, '', 'yes', 'javascript', request.checkerCode)
        self.assertEqual(result['status'], 'ACCEPTED')

        request.tests[0].output = 'different'
        with patch.object(runner, 'client', types.SimpleNamespace(images=types.SimpleNamespace(get=lambda image: None))), patch.object(runner, 'run_one', return_value=checked):
            result = runner.execute_run(request)
        self.assertEqual(result['status'], 'WRONG_ANSWER')

    def test_checker_rejection_fails_even_when_output_matches(self):
        request = types.SimpleNamespace(
            language='python', code='print("same")',
            tests=[types.SimpleNamespace(input='', output='same')], lint=False,
            checkerCode='def check(input_text, expected_output, actual_output, source_code): return "author check failed"',
        )
        with patch.object(runner, 'client', types.SimpleNamespace(images=types.SimpleNamespace(get=lambda image: None))), patch.object(
            runner, 'run_one', return_value={
                'status': 'OK', 'stdout': 'same', 'stderr': 'author check failed',
                'checkerPassed': False, 'durationMs': 7,
            }
        ):
            result = runner.execute_run(request)
        self.assertEqual(result['status'], 'WRONG_ANSWER')
        self.assertEqual(result['checks'][0]['errorText'], 'author check failed')

    def test_checker_runs_in_a_separate_sandbox_and_both_are_removed(self):
        solution_container = FakeContainer()
        checker_container = FakeContainer()
        sandbox_calls = []

        def make_sandbox(code, test_input='', extra_environment=None):
            sandbox_calls.append((code, test_input, extra_environment or {}))
            return solution_container if len(sandbox_calls) == 1 else checker_container

        executions = [
            {'timedOut': False, 'exitCode': 0, 'outputExceeded': False, 'stdout': 'answer\n', 'stderr': '', 'durationMs': 12},
            {'timedOut': False, 'exitCode': 0, 'outputExceeded': False, 'stdout': 'S84_CHECKER:{"passed":true,"message":""}', 'stderr': '', 'durationMs': 8},
        ]
        with patch.object(runner, 'create_sandbox', side_effect=make_sandbox) as create, patch.object(
            runner, 'run_exec', side_effect=executions,
        ) as run_exec:
            result = runner.run_one('print("answer")', 'input', 'answer\n', 'python', 'def check(i,e,a,s): return a == e')

        self.assertEqual(result['status'], 'OK')
        self.assertTrue(result['checkerPassed'])
        self.assertEqual(len(sandbox_calls), 2)
        self.assertNotIn('S84_CHECKER_CODE', sandbox_calls[0][2])
        self.assertEqual(sandbox_calls[1][2]['S84_CHECKER_CODE'], 'def check(i,e,a,s): return a == e')
        self.assertTrue(solution_container.removed)
        self.assertTrue(checker_container.removed)
        self.assertEqual([call.args[2] for call in run_exec.call_args_list], [1.8, 0.7])

    def test_python_request_without_language_remains_compatible(self):
        request = types.SimpleNamespace(
            code='print("ok")', tests=[types.SimpleNamespace(input='', output='ok')], lint=False,
        )
        with patch.object(runner, 'client', types.SimpleNamespace(images=types.SimpleNamespace(get=lambda image: None))), patch.object(runner, 'run_one', return_value={
            'status': 'OK', 'stdout': 'ok', 'stderr': '', 'durationMs': 1,
        }) as run_one:
            result = runner.execute_run(request)
        run_one.assert_called_once_with(request.code, '', 'ok', 'python', None)
        self.assertEqual(result['status'], 'ACCEPTED')

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
