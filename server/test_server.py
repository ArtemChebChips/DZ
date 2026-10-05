import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

from app import Server
from store import APIError, Store

TASK = {'id': 'saved', 'title': 'Э-104, стр. 115, №35–38', 'subjectId': 'phys', 'due': '2026-10-05', 'done': False, 'kind': 'lab', 'lessonId': 'pn-3'}


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.db = Path(self.directory.name) / 'dz.sqlite3'
        self.store = Store(self.db)
        self.owner = self.store.create_user('owner', 'test-password-123')
        self.friend = self.store.create_user('friend', 'test-password-456')

    def tearDown(self):
        self.directory.cleanup()

    def sync(self, operations=None, cursor=0, user=None):
        return self.store.sync(user or self.owner, {'version': 1, 'cursor': cursor, 'operations': operations or []})

    def op(self, op_id='first', revision=0, task=TASK):
        return {'id': op_id, 'taskId': TASK['id'], 'baseRevision': revision, 'task': task}

    def test_login_session_hash_expiry_and_logout(self):
        result = self.store.login('OWNER', 'test-password-123')
        token = result['token']
        self.assertEqual(self.store.authenticate(token)['id'], self.owner)
        with self.store.connect() as db:
            row = db.execute('SELECT * FROM sessions').fetchone()
            self.assertEqual(row['token_hash'], hashlib.sha256(token.encode()).hexdigest())
            self.assertNotEqual(row['token_hash'], token)
            self.assertNotEqual(db.execute('SELECT password FROM users WHERE id=?', (self.owner,)).fetchone()[0], 'test-password-123')
        with self.assertRaises(APIError):
            self.store.login('owner', 'wrong-password')
        self.store.logout(token)
        with self.assertRaises(APIError):
            self.store.authenticate(token)
        token = self.store.login('owner', 'test-password-123')['token']
        with self.store.connect() as db:
            db.execute('UPDATE sessions SET expires=?', (time.time() - 1,))
        with self.assertRaises(APIError):
            self.store.authenticate(token)

    def test_two_devices_retry_and_user_isolation(self):
        first = self.sync([self.op()])
        retry = self.sync([self.op()])
        self.assertEqual(first, retry)
        self.assertEqual(len(self.sync()['records']), 1)
        self.assertEqual(self.sync(user=self.friend)['records'], [])
        self.assertEqual(self.sync(cursor=first['cursor'])['records'], [])
        with self.assertRaises(APIError):
            self.sync([self.op(task={**TASK, 'done': True})])

    def test_conflict_keeps_server_until_explicit_resolution(self):
        self.sync([self.op()])
        self.sync([self.op('device-a', 1, {**TASK, 'title': 'Изменение А'})], 1)
        conflict = self.sync([self.op('device-b', 1, {**TASK, 'title': 'Изменение Б'})], 1)
        self.assertEqual(len(conflict['conflicts']), 1)
        self.assertEqual(conflict['conflicts'][0]['record']['task']['title'], 'Изменение А')
        self.assertEqual(self.sync()['records'][0]['task']['title'], 'Изменение А')
        resolved = self.sync([self.op('choose-b', 2, {**TASK, 'title': 'Изменение Б'})], 2)
        self.assertEqual(resolved['records'][0]['task']['title'], 'Изменение Б')

    def test_tombstone_survives_stale_device(self):
        self.sync([self.op()])
        self.sync([self.op('delete', 1, None)], 1)
        stale = self.sync([self.op('stale', 1, {**TASK, 'done': True})], 1)
        self.assertIsNone(stale['conflicts'][0]['record']['task'])
        self.assertIsNone(self.sync()['records'][0]['task'])

    def test_same_task_initial_upload_is_safe(self):
        self.sync([self.op()])
        second = self.sync([self.op('second-device')])
        self.assertEqual(second['conflicts'], [])
        self.assertEqual(second['cursor'], 1)

    def test_bad_batch_is_atomic_and_dates_stay_fixed(self):
        with self.assertRaises(APIError):
            self.sync([self.op(), self.op('bad', task={**TASK, 'due': '2026-02-30'})])
        self.assertEqual(self.sync()['records'], [])
        self.sync([self.op()])
        self.assertEqual(self.sync()['records'][0]['task']['due'], TASK['due'])
        with self.assertRaises(APIError):
            self.sync(cursor=999)
        with self.assertRaises(APIError):
            self.sync([self.op(revision=True)])

    def test_online_backup_and_schema_reopen(self):
        self.sync([self.op()])
        target = Path(self.directory.name) / 'copy.sqlite3'
        self.store.backup(target)
        copied = Store(target)
        self.assertEqual(copied.sync(self.owner, {'version': 1, 'cursor': 0, 'operations': []})['records'][0]['task'], TASK)
        self.assertEqual(Store(self.db).sync(self.owner, {'version': 1, 'cursor': 0, 'operations': []})['cursor'], 1)
        with sqlite3.connect(target) as db:
            db.execute('PRAGMA user_version=999')
        with self.assertRaises(RuntimeError):
            Store(target)


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        store = Store(Path(self.directory.name) / 'http.sqlite3')
        store.create_user('owner', 'test-password-123')
        self.server = Server(('127.0.0.1', 0), store, ['http://127.0.0.1:4185'], parse=lambda _: {'tasks': []}, transcribe=lambda _: {'text': 'Техническая проба'})
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        self.directory.cleanup()

    def request(self, path, data=None, token='', origin='http://127.0.0.1:4185', method='POST'):
        headers = {'Origin': origin, 'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        request = urllib.request.Request(self.base + path, data=json.dumps(data or {}).encode() if method == 'POST' else None, headers=headers, method=method)
        try:
            response = urllib.request.urlopen(request)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read()
            return response.status, json.loads(body) if body else {}, dict(response.headers)

    def test_cors_auth_sync_and_logout(self):
        status, _, headers = self.request('/api/sync')
        self.assertEqual(status, 401)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(self.request('/api/login', {}, origin='https://evil.example')[0], 403)
        self.assertEqual(self.request('/api/login', method='OPTIONS')[0], 204)
        status, auth, _ = self.request('/api/login', {'username': 'owner', 'password': 'test-password-123'})
        self.assertEqual(status, 200)
        token = auth['token']
        payload = {'version': 1, 'cursor': 0, 'operations': [{'id': 'op', 'taskId': TASK['id'], 'baseRevision': 0, 'task': TASK}]}
        status, result, _ = self.request('/api/sync', payload, token)
        self.assertEqual(status, 200)
        self.assertEqual(result['records'][0]['task'], TASK)
        self.assertEqual(self.request('/api/logout', token=token)[0], 200)
        self.assertEqual(self.request('/api/sync', payload, token)[0], 401)

    def test_agent_needs_session_and_busy_is_controlled(self):
        self.assertEqual(self.request('/api/agent/parse', {})[0], 401)
        token = self.request('/api/login', {'username': 'owner', 'password': 'test-password-123'})[1]['token']
        self.server.agent_lock.acquire()
        try:
            self.assertEqual(self.request('/api/agent/parse', {}, token)[0], 409)
        finally:
            self.server.agent_lock.release()
        self.assertEqual(self.request('/api/agent/transcribe', {}, token)[1]['text'], 'Техническая проба')

    def test_login_rate_limit(self):
        for _ in range(8):
            self.assertEqual(self.request('/api/login', {'username': 'owner', 'password': 'wrong'})[0], 401)
        self.assertEqual(self.request('/api/login', {'username': 'owner', 'password': 'wrong'})[0], 429)


if __name__ == '__main__':
    unittest.main()
