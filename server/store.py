"""Личные аккаунты и записи. SQLite — единственный постоянный серверный файл."""
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import date
from pathlib import Path


class APIError(Exception):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)


def integer(value):
    return type(value) is int and 0 <= value <= 9007199254740991


def identifier(value):
    return isinstance(value, str) and 0 < len(value) <= 256


def validate_task(task):
    fields = {'id', 'title', 'subjectId', 'due', 'done', 'entryType', 'testBatchId', 'lessonId', 'kind'}
    if not isinstance(task, dict) or not set(task) <= fields:
        raise APIError(400, 'Некорректное задание.')
    if not identifier(task.get('id')) or not isinstance(task.get('title'), str) or not 0 < len(task['title'].strip()) <= 32000:
        raise APIError(400, 'У задания нет идентификатора или текста.')
    if not isinstance(task.get('subjectId'), str) or len(task['subjectId']) > 256 or type(task.get('done')) is not bool:
        raise APIError(400, 'Некорректный предмет или статус.')
    try:
        due = task.get('due')
        if not isinstance(due, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', due):
            raise ValueError()
        date.fromisoformat(due)
    except ValueError:
        raise APIError(400, 'Некорректная дата задания.') from None
    if 'entryType' in task and task['entryType'] not in ('homework', 'note'):
        raise APIError(400, 'Некорректный вид записи.')
    if 'kind' in task and task['kind'] not in ('lecture', 'seminar', 'lab', 'other'):
        raise APIError(400, 'Некорректный вид занятия.')
    for key in ('lessonId', 'testBatchId'):
        if key in task and not identifier(task[key]):
            raise APIError(400, 'Некорректная связь задания.')


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version > 1:
                raise RuntimeError('База создана более новой версией сервера.')
            db.executescript('''
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
                    salt TEXT NOT NULL, password TEXT NOT NULL, sequence INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS tasks (
                    user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL,
                    revision INTEGER NOT NULL, body TEXT,
                    PRIMARY KEY(user_id, id)
                );
                CREATE INDEX IF NOT EXISTS tasks_revision ON tasks(user_id, revision);
                CREATE TABLE IF NOT EXISTS operations (
                    user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL,
                    request TEXT NOT NULL, result TEXT NOT NULL,
                    PRIMARY KEY(user_id, id)
                );
                PRAGMA user_version = 1;
            ''')
            db.execute('PRAGMA journal_mode=WAL')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def password_hash(password, salt):
        return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1, dklen=32).hex()

    def create_user(self, username, password):
        if not isinstance(username, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{3,40}', username):
            raise APIError(400, 'Логин: 3–40 латинских букв, цифр, _ или -.')
        if not isinstance(password, str) or not 12 <= len(password) <= 256:
            raise APIError(400, 'Пароль должен содержать 12–256 символов.')
        salt = secrets.token_hex(16)
        user_id = str(uuid.uuid4())
        try:
            with self.connect() as db:
                db.execute('INSERT INTO users(id,username,salt,password) VALUES(?,?,?,?)',
                           (user_id, username.lower(), salt, self.password_hash(password, salt)))
        except sqlite3.IntegrityError:
            raise APIError(409, 'Этот логин уже существует.') from None
        return user_id

    def login(self, username, password):
        if not isinstance(username, str) or not isinstance(password, str) or len(username) > 40 or len(password) > 256:
            raise APIError(401, 'Неверный логин или пароль.')
        with self.connect() as db:
            user = db.execute('SELECT * FROM users WHERE username=?', (username.lower(),)).fetchone()
            salt = user['salt'] if user else '00' * 16
            hashed = self.password_hash(password, salt)
            if not user or not hmac.compare_digest(user['password'], hashed):
                raise APIError(401, 'Неверный логин или пароль.')
            token = secrets.token_urlsafe(32)
            db.execute('DELETE FROM sessions WHERE expires<?', (time.time(),))
            db.execute('INSERT INTO sessions VALUES(?,?,?)',
                       (hashlib.sha256(token.encode()).hexdigest(), user['id'], time.time() + 30 * 86400))
            return {'token': token, 'user': {'id': user['id'], 'username': user['username']}}

    def authenticate(self, token):
        if not isinstance(token, str) or not 20 <= len(token) <= 256:
            raise APIError(401, 'Войди в аккаунт.')
        with self.connect() as db:
            user = db.execute('SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id '
                              'WHERE s.token_hash=? AND s.expires>?',
                              (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
            if not user:
                raise APIError(401, 'Сессия закончилась. Войди снова.')
            return dict(user)

    def logout(self, token):
        with self.connect() as db:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))

    @staticmethod
    def record(row):
        return {'id': row['id'], 'revision': row['revision'], 'task': json.loads(row['body']) if row['body'] else None}

    def sync(self, user_id, payload):
        if not isinstance(payload, dict) or type(payload.get('version')) is not int or payload['version'] != 1 or not integer(payload.get('cursor')):
            raise APIError(400, 'Некорректная версия синхронизации.')
        operations = payload.get('operations')
        if not isinstance(operations, list) or len(operations) > 100:
            raise APIError(400, 'За один запрос можно отправить до 100 изменений.')
        for op in operations:
            if not isinstance(op, dict) or set(op) != {'id', 'taskId', 'baseRevision', 'task'} or not identifier(op['id']) or not identifier(op['taskId']) or not integer(op['baseRevision']):
                raise APIError(400, 'Некорректная операция.')
            if op['task'] is not None:
                validate_task(op['task'])
                if op['task']['id'] != op['taskId']:
                    raise APIError(400, 'Идентификаторы задания не совпадают.')
        if len({op['id'] for op in operations}) != len(operations):
            raise APIError(400, 'Повтор идентификатора операции.')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            sequence = db.execute('SELECT sequence FROM users WHERE id=?', (user_id,)).fetchone()[0]
            if payload['cursor'] > sequence:
                raise APIError(409, 'Серверная копия старше устройства. Необходима проверка восстановления базы.')
            accepted, conflicts = [], []
            for op in operations:
                request = encode(op)
                old = db.execute('SELECT request,result FROM operations WHERE user_id=? AND id=?', (user_id, op['id'])).fetchone()
                row = db.execute('SELECT * FROM tasks WHERE user_id=? AND id=?', (user_id, op['taskId'])).fetchone()
                current = self.record(row) if row else {'id': op['taskId'], 'revision': 0, 'task': None}
                if old:
                    if old['request'] != request:
                        raise APIError(409, 'Идентификатор операции уже использован с другими данными.')
                    result = json.loads(old['result'])
                elif op['baseRevision'] != current['revision'] and encode(op['task']) != encode(current['task']):
                    result = {'conflict': True}
                else:
                    if not row or encode(op['task']) != encode(current['task']):
                        sequence += 1
                        db.execute('INSERT INTO tasks VALUES(?,?,?,?) ON CONFLICT(user_id,id) '
                                   'DO UPDATE SET revision=excluded.revision,body=excluded.body',
                                   (user_id, op['taskId'], sequence, encode(op['task']) if op['task'] is not None else None))
                        current = {'id': op['taskId'], 'revision': sequence, 'task': op['task']}
                    result = {'revision': current['revision']}
                if not old:
                    db.execute('INSERT INTO operations VALUES(?,?,?,?)', (user_id, op['id'], request, encode(result)))
                if result.get('conflict'):
                    conflicts.append({'operationId': op['id'], 'record': current})
                else:
                    accepted.append({'operationId': op['id'], 'taskId': op['taskId'], 'revision': result['revision']})
            db.execute('UPDATE users SET sequence=? WHERE id=?', (sequence, user_id))
            records = [self.record(row) for row in db.execute('SELECT * FROM tasks WHERE user_id=? AND revision>? ORDER BY revision', (user_id, payload['cursor']))]
            return {'version': 1, 'cursor': sequence, 'accepted': accepted, 'conflicts': conflicts, 'records': records}

    def backup(self, target):
        with self.connect() as source:
            destination = sqlite3.connect(str(target))
            try:
                source.backup(destination)
            finally:
                destination.close()
