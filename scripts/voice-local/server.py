"""Личный локальный сервис. Запуск из корня: .voice-test.local/venv/bin/python scripts/voice-local/server.py"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from agent import parse_tasks

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / '.voice-test.local'
os.environ['PATH'] = str(LOCAL / 'bin') + os.pathsep + os.environ.get('PATH', '')
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HOME'] = str(LOCAL / 'huggingface')
os.environ['NUMBA_CACHE_DIR'] = str(LOCAL / 'numba')
lock = threading.Lock()
model = None
ALLOWED = {'http://127.0.0.1:4175', 'http://localhost:4175'}


def transcribe(audio):
    global model
    import mlx.core as mx
    from parakeet_mlx import from_pretrained
    # Декодирование ограничено 61 секундой; оригинал удаляется после запроса.
    with tempfile.TemporaryDirectory(prefix='dz-audio-') as directory:
        source = Path(directory) / 'input'
        target = Path(directory) / 'audio.wav'
        source.write_bytes(audio)
        result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(source), '-t', '61', '-ar', '16000', '-ac', '1', str(target)], capture_output=True, timeout=20)
        if result.returncode:
            raise ValueError('Не удалось прочитать запись.')
        import wave
        with wave.open(str(target)) as wav:
            duration = wav.getnframes() / wav.getframerate()
        if duration > 60:
            raise ValueError('Запись длиннее минуты. Запиши короче.')
        if model is None:
            mx.set_cache_limit(256 * 1024 * 1024)
            model = from_pretrained((LOCAL / 'model-path.txt').read_text().strip())
            mx.eval(model.parameters())
        text = model.transcribe(target, chunk_duration=30, overlap_duration=2).text.strip()
        if not text:
            raise ValueError('Не удалось разобрать речь. Попробуй ещё раз или введи текст.')
        return {'text': text}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Не записываем личные тексты, URL и аудио в логи.

    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_POST(self):
        if self.headers.get('Origin') not in ALLOWED or self.headers.get('X-DZ-Client') != 'local':
            return self.reply(403, {'error': 'Доступ только из локального приложения.'})
        if self.path not in ('/agent/parse', '/agent/transcribe'):
            return self.reply(404, {'error': 'Неизвестный запрос.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            size = 0
        limit = 200_000 if self.path.endswith('/parse') else 12_000_000
        if not 0 < size <= limit:
            return self.reply(413, {'error': 'Слишком большой или пустой запрос.'})
        if not lock.acquire(blocking=False):
            return self.reply(409, {'error': 'Предыдущий запрос ещё обрабатывается. Подожди.'})
        try:
            self.connection.settimeout(20)
            body = self.rfile.read(size)
            output = parse_tasks(json.loads(body)) if self.path.endswith('/parse') else transcribe(body)
            self.reply(200, output)
        except ValueError as error:
            self.reply(400, {'error': str(error)})
        except subprocess.TimeoutExpired:
            self.reply(504, {'error': 'Обработка заняла слишком долго. Текст сохранён на экране; попробуй ещё раз.'})
        except Exception:
            self.reply(500, {'error': 'Локальная обработка недоступна. Проверь запуск моделей.'})
        finally:
            lock.release()


if __name__ == '__main__':
    print('ДЗ: локальный агент на 127.0.0.1:4176', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 4176), Handler).serve_forever()
