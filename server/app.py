"""Сервис ДЗ за HTTPS reverse proxy. По умолчанию только 127.0.0.1:4286."""
import argparse
from collections import defaultdict, deque
import getpass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time

from asr import Parakeet
from store import APIError, Store

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts/voice-local'))
from agent import parse_tasks


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, store, origins, parse=parse_tasks, transcribe=None):
        super().__init__(address, Handler)
        self.store, self.origins, self.parse = store, set(origins), parse
        self.transcribe = transcribe or Parakeet().transcribe
        self.agent_lock = threading.Lock()
        self.rate_lock = threading.Lock()
        self.attempts = defaultdict(deque)

    def limit(self, key, count, window=60):
        with self.rate_lock:
            now = time.monotonic()
            # Удаляем устаревшие ключи: память не растёт от новых адресов/сессий.
            for old_key in list(self.attempts):
                entries = self.attempts[old_key]
                while entries and entries[0] <= now - 300:
                    entries.popleft()
                if not entries:
                    del self.attempts[old_key]
            entries = self.attempts[key]
            if sum(value > now - window for value in entries) >= count:
                raise APIError(429, 'Слишком много запросов. Подожди немного.')
            entries.append(now)


class Handler(BaseHTTPRequestHandler):
    server_version = 'DZ'

    def log_message(self, *args):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(20)

    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        origin = self.headers.get('Origin')
        if origin in self.server.origins:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        if self.headers.get('Origin') not in self.server.origins:
            return self.reply(403, {'error': 'Этот адрес приложения не разрешён.'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.send_header('Access-Control-Max-Age', '600')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/health':
            self.reply(200, {'version': 1, 'status': 'ok'})
        else:
            self.reply(404, {'error': 'Неизвестный запрос.'})

    def read_body(self, limit):
        if self.headers.get('Transfer-Encoding'):
            raise APIError(400, 'Нужен запрос с известной длиной.')
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            size = 0
        if not 0 < size <= limit:
            raise APIError(413, 'Запрос пустой или слишком большой.')
        body = self.rfile.read(size)
        if len(body) != size:
            raise APIError(400, 'Запрос прерван.')
        return body

    def read_json(self, limit=2_000_000):
        if self.headers.get_content_type() != 'application/json':
            raise APIError(415, 'Нужен JSON-запрос.')
        try:
            value = json.loads(self.read_body(limit))
        except (ValueError, UnicodeError):
            raise APIError(400, 'Некорректный JSON.') from None
        if not isinstance(value, dict):
            raise APIError(400, 'Нужен объект JSON.')
        return value

    def do_POST(self):
        try:
            if self.headers.get('Origin') not in self.server.origins:
                raise APIError(403, 'Этот адрес приложения не разрешён.')
            if self.path == '/api/login':
                # IP берём только от доверенного proxy, по умолчанию — от соединения.
                ip = self.headers.get('X-Real-IP') if os.environ.get('DZ_TRUST_PROXY') == '1' else self.client_address[0]
                self.server.limit(('login', ip), 8, 300)
                payload = self.read_json(4096)
                return self.reply(200, self.server.store.login(payload.get('username'), payload.get('password')))
            authorization = self.headers.get('Authorization', '')
            if not authorization.startswith('Bearer '):
                raise APIError(401, 'Войди в аккаунт.')
            token = authorization[7:]
            user = self.server.store.authenticate(token)
            self.server.limit(('user', user['id']), 120)
            if self.path == '/api/logout':
                self.server.store.logout(token)
                return self.reply(200, {'ok': True})
            if self.path == '/api/sync':
                return self.reply(200, self.server.store.sync(user['id'], self.read_json()))
            if self.path not in ('/api/agent/parse', '/api/agent/transcribe'):
                raise APIError(404, 'Неизвестный запрос.')
            self.server.limit(('agent', user['id']), 12)
            body = self.read_json(200_000) if self.path.endswith('/parse') else self.read_body(12_000_000)
            if not self.server.agent_lock.acquire(blocking=False):
                raise APIError(409, 'Предыдущая запись ещё обрабатывается. Подожди.')
            try:
                result = self.server.parse(body) if self.path.endswith('/parse') else self.server.transcribe(body)
            finally:
                self.server.agent_lock.release()
            self.reply(200, result)
        except APIError as error:
            self.reply(error.status, {'error': str(error)})
        except (ValueError, ImportError, FileNotFoundError) as error:
            message = str(error) if isinstance(error, ValueError) else 'Распознавание или Claude ещё не настроены на сервере.'
            self.reply(503, {'error': message})
        except subprocess.TimeoutExpired:
            self.reply(504, {'error': 'Обработка заняла слишком долго. Попробуй ещё раз.'})
        except Exception:
            self.reply(500, {'error': 'Сервис недоступен. Данные на устройстве сохранены.'})


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description='Сервер синхронизации и агента ДЗ')
    parser.add_argument('command', choices=['serve', 'create-user', 'backup'], nargs='?', default='serve')
    parser.add_argument('--db', default=os.environ.get('DZ_DATABASE', 'server-data.local/dz.sqlite3'))
    parser.add_argument('--username')
    parser.add_argument('--output')
    parser.add_argument('--port', type=int, default=int(os.environ.get('DZ_SERVER_PORT', '4286')))
    args = parser.parse_args()
    store = Store(args.db)
    if args.command == 'create-user':
        password = getpass.getpass('Пароль (от 12 символов): ')
        if password != getpass.getpass('Повтори пароль: '):
            parser.error('Пароли не совпадают.')
        store.create_user(args.username, password)
        print('Аккаунт создан.')
    elif args.command == 'backup':
        if not args.output:
            parser.error('Укажи --output для копии базы.')
        if Path(args.output).resolve() == Path(args.db).resolve() or Path(args.output).exists():
            parser.error('Копия должна быть новым отдельным файлом.')
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        store.backup(args.output)
        print('Резервная копия создана.')
    else:
        origins = os.environ.get('DZ_ALLOWED_ORIGINS', 'http://127.0.0.1:4185,http://localhost:4185').split(',')
        print(f'ДЗ: сервер на 127.0.0.1:{args.port}', flush=True)
        Server(('127.0.0.1', args.port), store, [value.strip() for value in origins]).serve_forever()


if __name__ == '__main__':
    main()
