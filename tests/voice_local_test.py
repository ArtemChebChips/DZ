"""Read-only pilot checks. Run: python3 tests/voice_local_test.py -v.

No sockets, real subprocesses, Claude, ASR downloads or personal data.
Expected failures document known defects in sources owned by another chat.
"""
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import Mock, patch
import wave

sys.dont_write_bytecode = True
SOURCE = Path(__file__).resolve().parents[1] / 'scripts' / 'voice-local'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


agent = load('audit_voice_agent', SOURCE / 'agent.py')
with patch.dict(sys.modules, {'agent': agent}), patch.dict(os.environ):
    server = load('audit_voice_server', SOURCE / 'server.py')

PAYLOAD = {'text': 'Синтетическое учебное задание', 'context': {'subjects': [], 'lessons': []}}
AUTH = {'loggedIn': True, 'authMethod': 'claude.ai', 'subscriptionType': 'pro'}
OUTPUT = {'tasks': [{'subjectId': None, 'title': 'Синтетическое задание', 'deadlineText': '', 'question': 'Выбери дату', 'deadline': {'type': 'missing', 'value': '', 'kind': ''}}]}


def process(data, code=0):
    return subprocess.CompletedProcess([], code, json.dumps(data), '')


class HandlerTests(unittest.TestCase):
    def setUp(self):
        self.previous_lock = server.lock
        server.lock = threading.Lock()
        self.addCleanup(setattr, server, 'lock', self.previous_lock)
        self.parser = patch.object(server, 'parse_tasks', return_value=OUTPUT).start()
        self.transcriber = patch.object(server, 'transcribe', return_value={'text': 'Синтетическая запись'}).start()
        self.addCleanup(patch.stopall)

    def post(self, body=b'{}', headers=None, path='/agent/parse'):
        handler = object.__new__(server.Handler)
        handler.path = path
        handler.headers = {'Origin': 'http://127.0.0.1:4175', 'X-DZ-Client': 'local', 'Content-Length': str(len(body))}
        if headers is not None:
            handler.headers.update(headers)
        handler.connection = Mock()
        handler.rfile = io.BytesIO(body)
        handler.reply = Mock()
        handler.do_POST()
        self.assertFalse(server.lock.locked(), 'Lock must be released after processing')
        return handler.reply.call_args.args

    def test_valid_json_and_audio(self):
        self.assertEqual(self.post(json.dumps(PAYLOAD).encode()), (200, OUTPUT))
        self.assertEqual(self.post(b'synthetic bytes', path='/agent/transcribe'), (200, {'text': 'Синтетическая запись'}))
        self.transcriber.assert_called_once_with(b'synthetic bytes')

    def test_authorized_localhost_alias(self):
        self.assertEqual(self.post(headers={'Origin': 'http://localhost:4175'})[0], 200)

    def test_rejects_missing_and_foreign_access(self):
        for headers in [{'Origin': None}, {'Origin': 'https://example.invalid'}, {'Origin': 'http://127.0.0.1:4176'}, {'X-DZ-Client': None}, {'X-DZ-Client': 'other'}]:
            with self.subTest(headers=headers):
                self.assertEqual(self.post(headers=headers)[0], 403)
        self.parser.assert_not_called()
        self.transcriber.assert_not_called()

    def test_unknown_endpoint(self):
        self.assertEqual(self.post(path='/agent/unknown')[0], 404)
        self.parser.assert_not_called()

    def test_invalid_declared_lengths(self):
        for size in ['0', '-1', 'not-a-number', '200001', '9' * 30]:
            with self.subTest(size=size):
                self.assertEqual(self.post(headers={'Content-Length': size})[0], 413)
        self.parser.assert_not_called()

    def test_separate_audio_limit(self):
        self.assertEqual(self.post(b'x', {'Content-Length': '12000001'}, '/agent/transcribe')[0], 413)
        self.transcriber.assert_not_called()

    def test_invalid_json_and_utf8(self):
        for body in [b'{broken', b'\xff', b'']:
            with self.subTest(body=body):
                self.assertEqual(self.post(body)[0], 400 if body else 413)
        self.parser.assert_not_called()

    def test_parser_input_error_is_400(self):
        self.parser.side_effect = ValueError('Нужен текст')
        self.assertEqual(self.post(), (400, {'error': 'Нужен текст'}))

    def test_process_timeout_is_504(self):
        self.parser.side_effect = subprocess.TimeoutExpired('synthetic', 90)
        self.assertEqual(self.post()[0], 504)

    def test_processing_error_is_generic(self):
        self.parser.side_effect = RuntimeError('private synthetic detail')
        status, response = self.post()
        self.assertEqual(status, 500)
        self.assertNotIn('private', response['error'])

    def test_lock_409_and_recovery(self):
        server.lock.acquire()
        handler = object.__new__(server.Handler)
        handler.path = '/agent/parse'
        handler.headers = {'Origin': 'http://127.0.0.1:4175', 'X-DZ-Client': 'local', 'Content-Length': '2'}
        handler.reply = Mock()
        handler.do_POST()
        self.assertEqual(handler.reply.call_args.args[0], 409)
        self.assertTrue(server.lock.locked())
        self.parser.assert_not_called()
        server.lock.release()
        self.assertEqual(self.post()[0], 200)

    def test_reply_no_store_and_disconnect(self):
        handler = object.__new__(server.Handler)
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()
        handler.wfile = io.BytesIO()
        server.Handler.reply(handler, 200, OUTPUT)
        self.assertEqual(json.loads(handler.wfile.getvalue()), OUTPUT)
        handler.send_header.assert_any_call('Cache-Control', 'no-store')
        handler.wfile = Mock()
        for exception in [BrokenPipeError, ConnectionResetError]:
            handler.wfile.write.side_effect = exception()
            server.Handler.reply(handler, 200, OUTPUT)

    def test_disconnect_finishes_processing_and_releases_lock(self):
        # Браузерная отмена не обещает остановку Claude; это документированное поведение.
        handler = object.__new__(server.Handler)
        handler.path = '/agent/parse'
        handler.headers = {'Origin': 'http://127.0.0.1:4175', 'X-DZ-Client': 'local', 'Content-Length': '2'}
        handler.connection = Mock()
        handler.rfile = io.BytesIO(b'{}')
        handler.wfile = Mock()
        handler.wfile.write.side_effect = BrokenPipeError()
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()
        handler.do_POST()
        self.parser.assert_called_once_with({})
        handler.send_response.assert_called_once_with(200)
        self.assertFalse(server.lock.locked())

    @unittest.expectedFailure
    def test_known_bug_non_object_json_should_be_client_error(self):
        self.parser.side_effect = agent.parse_tasks
        self.assertEqual(self.post(b'[]')[0], 400)  # Сейчас AttributeError -> 500.


class AgentTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'DZ_CLAUDE_BIN': '/synthetic/claude', 'PATH': '/synthetic'}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.run = patch.object(agent.subprocess, 'run', side_effect=[process(AUTH), process({'structured_output': OUTPUT})]).start()
        self.addCleanup(patch.stopall)

    def test_valid_pro_and_max_subscription(self):
        for subscription in ['pro', 'max']:
            self.run.reset_mock()
            self.run.side_effect = [process({**AUTH, 'subscriptionType': subscription}), process({'structured_output': OUTPUT})]
            self.assertEqual(agent.parse_tasks(PAYLOAD), OUTPUT)
            self.assertEqual(self.run.call_count, 2)

    def test_invalid_text_and_context_before_subprocess(self):
        for payload in [{}, {**PAYLOAD, 'text': ''}, {**PAYLOAD, 'text': ' '}, {**PAYLOAD, 'text': 'x' * 8001}, {**PAYLOAD, 'context': None}, {**PAYLOAD, 'context': {}}, {**PAYLOAD, 'context': {'subjects': [], 'lessons': None}}]:
            with self.subTest(payload_type=type(payload).__name__):
                with self.assertRaises(ValueError):
                    agent.parse_tasks(payload)
        self.run.assert_not_called()

    def test_rejects_other_auth_methods_and_subscriptions(self):
        for auth in [{**AUTH, 'loggedIn': False}, {**AUTH, 'authMethod': 'api'}, {**AUTH, 'subscriptionType': 'free'}, {**AUTH, 'subscriptionType': None}]:
            self.run.reset_mock()
            self.run.side_effect = [process(auth)]
            with self.assertRaises(ValueError):
                agent.parse_tasks(PAYLOAD)
            self.assertEqual(self.run.call_count, 1)

    def test_command_has_no_tools_or_session_persistence(self):
        agent.parse_tasks(PAYLOAD)
        args, options = self.run.call_args
        command = args[0]
        for flag in ['--safe-mode', '--strict-mcp-config', '--no-session-persistence']:
            self.assertIn(flag, command)
        self.assertEqual(command[command.index('--tools') + 1], '')
        self.assertEqual(options['cwd'], '/tmp')
        self.assertEqual(options['timeout'], 90)
        self.assertEqual(json.loads(options['input']), PAYLOAD)
        self.assertEqual(self.run.call_args_list[0].kwargs['timeout'], 30)

    def test_filters_api_keys_and_provider_switches(self):
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'synthetic', 'ANTHROPIC_AUTH_TOKEN': 'synthetic', 'CLAUDE_CODE_USE_BEDROCK': '1', 'CLAUDE_CODE_USE_VERTEX': '1'}):
            agent.parse_tasks(PAYLOAD)
        for call in self.run.call_args_list:
            self.assertFalse(any(key.startswith(('ANTHROPIC_', 'CLAUDE_CODE_USE_')) for key in call.kwargs['env']))

    def test_auth_timeout_and_parse_timeout_propagate(self):
        for stage in [0, 1]:
            self.run.side_effect = [subprocess.TimeoutExpired('synthetic', 30)] if stage == 0 else [process(AUTH), subprocess.TimeoutExpired('synthetic', 90)]
            with self.assertRaises(subprocess.TimeoutExpired):
                agent.parse_tasks(PAYLOAD)

    def test_parse_nonzero_exit_and_error_result_rejected(self):
        for response in [process({'structured_output': OUTPUT}, 1), process({'is_error': True, 'structured_output': OUTPUT}), process({'structured_output': None}), process({'structured_output': {'tasks': 'bad'}})]:
            self.run.side_effect = [process(AUTH), response]
            with self.assertRaises(ValueError):
                agent.parse_tasks(PAYLOAD)

    def test_invalid_auth_and_response_json_rejected(self):
        broken = subprocess.CompletedProcess([], 0, 'not JSON', '')
        for responses in [[broken], [process(AUTH), broken]]:
            self.run.side_effect = responses
            with self.assertRaises(ValueError):
                agent.parse_tasks(PAYLOAD)

    @unittest.expectedFailure
    def test_known_bug_failed_auth_command_should_not_parse(self):
        self.run.side_effect = [process(AUTH, 1), process({'structured_output': OUTPUT})]
        with self.assertRaises(ValueError):
            agent.parse_tasks(PAYLOAD)

    @unittest.expectedFailure
    def test_known_bug_wrong_auth_shape_should_have_actionable_error(self):
        self.run.side_effect = [process([])]
        with self.assertRaises(ValueError):
            agent.parse_tasks(PAYLOAD)

    @unittest.expectedFailure
    def test_known_bug_wrong_result_shape_should_have_actionable_error(self):
        self.run.side_effect = [process(AUTH), process([])]
        with self.assertRaises(ValueError):
            agent.parse_tasks(PAYLOAD)


class TranscribeTests(unittest.TestCase):
    def setUp(self):
        self.old_model = server.model
        self.addCleanup(setattr, server, 'model', self.old_model)
        self.mx = types.ModuleType('mlx.core')
        self.mx.set_cache_limit = Mock()
        self.mx.eval = Mock()
        mlx = types.ModuleType('mlx')
        mlx.core = self.mx
        parakeet = types.ModuleType('parakeet_mlx')
        self.model = Mock()
        self.model.transcribe.return_value = types.SimpleNamespace(text='  Синтетическая речь  ')
        self.factory = parakeet.from_pretrained = Mock(return_value=self.model)
        self.modules = patch.dict(sys.modules, {'mlx': mlx, 'mlx.core': self.mx, 'parakeet_mlx': parakeet})
        self.modules.start()
        self.addCleanup(self.modules.stop)
        self.directory = tempfile.TemporaryDirectory(prefix='dz-voice-audit-')
        self.addCleanup(self.directory.cleanup)
        self.old_local = server.LOCAL
        server.LOCAL = Path(self.directory.name)
        (server.LOCAL / 'model-path.txt').write_text('/synthetic/model')
        self.addCleanup(setattr, server, 'LOCAL', self.old_local)
        self.duration = 1
        self.paths = []

        def ffmpeg(command, **options):
            self.paths.append(Path(command[command.index('-i') + 1]).parent)
            self.assertEqual(options['timeout'], 20)
            self.assertEqual(command[command.index('-t') + 1], '61')
            self.assertEqual(command[command.index('-ar') + 1], '16000')
            self.assertEqual(command[command.index('-ac') + 1], '1')
            with wave.open(command[-1], 'wb') as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(16000)
                output.writeframes(b'\0\0' * int(self.duration * 16000))
            return subprocess.CompletedProcess(command, 0, b'', b'')

        self.run = patch.object(server.subprocess, 'run', side_effect=ffmpeg).start()
        self.addCleanup(patch.stopall)

    def test_synthetic_decode_strips_text_and_removes_temp_audio(self):
        server.model = None
        self.assertEqual(server.transcribe(b'synthetic audio'), {'text': 'Синтетическая речь'})
        self.assertTrue(all(not directory.exists() for directory in self.paths))
        self.factory.assert_called_once_with('/synthetic/model')
        self.mx.set_cache_limit.assert_called_once_with(256 * 1024 * 1024)

    def test_loaded_model_is_reused(self):
        server.model = self.model
        server.transcribe(b'synthetic')
        self.factory.assert_not_called()

    def test_sixty_seconds_allowed_and_longer_rejected(self):
        server.model = self.model
        self.duration = 60
        server.transcribe(b'synthetic')
        self.duration = 60.01
        with self.assertRaisesRegex(ValueError, 'длиннее минуты'):
            server.transcribe(b'synthetic')
        self.assertEqual(self.model.transcribe.call_count, 1)
        self.assertTrue(all(not directory.exists() for directory in self.paths))

    def test_decode_failure_does_not_load_model(self):
        server.model = None
        self.run.side_effect = None
        self.run.return_value = subprocess.CompletedProcess([], 1, b'', b'error')
        with self.assertRaisesRegex(ValueError, 'прочитать запись'):
            server.transcribe(b'synthetic')
        self.factory.assert_not_called()

    def test_silence_rejected(self):
        server.model = self.model
        self.model.transcribe.return_value = types.SimpleNamespace(text='  ')
        with self.assertRaisesRegex(ValueError, 'разобрать речь'):
            server.transcribe(b'synthetic')
        self.assertTrue(all(not directory.exists() for directory in self.paths))


if __name__ == '__main__':
    unittest.main()
