"""Запуск серверных процессов без консольных окон; данные находятся вне checkout."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import traceback
from datetime import datetime

config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
root = Path(__file__).resolve().parents[2]
data = Path(config['dataDirectory'])
data.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(root / 'server'))
from store import Store

children, logs = [], []
try:
    for port in (config['apiPort'], config['webPort']):
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', port))
    env = {**os.environ, 'PYTHONUTF8': '1', 'DZ_DATABASE': str(data / 'dz.sqlite3'),
           'DZ_ALLOWED_ORIGINS': ','.join(config['allowedOrigins']), 'DZ_SYNC_ONLY': '1',
           'DZ_ALLOW_REGISTRATION': '1', 'DZ_TRUST_PROXY': '1'}
    store = Store(data / 'dz.sqlite3')
    commands = [
        [config['python'], '-B', str(root / 'server/app.py'), 'serve', '--port', str(config['apiPort'])],
        [config['caddy'], 'run', '--config', config['caddyfile'], '--adapter', 'caddyfile'],
    ]
    for name, command in zip(('api', 'web'), commands):
        output = (data / f'{name}.log').open('ab')
        logs.append(output)
        children.append(subprocess.Popen(command, cwd=root, env=env, stdin=subprocess.DEVNULL,
                                        stdout=output, stderr=output, creationflags=subprocess.CREATE_NO_WINDOW))
    (data / 'processes.json').write_text(json.dumps({'supervisor': os.getpid(), 'api': children[0].pid, 'web': children[1].pid}))
    backup_day = ''
    while True:
        for index, child in enumerate(children):
            if child.poll() is not None:
                children[index] = subprocess.Popen(commands[index], cwd=root, env=env, stdin=subprocess.DEVNULL,
                                                   stdout=logs[index], stderr=logs[index], creationflags=subprocess.CREATE_NO_WINDOW)
                (data / 'processes.json').write_text(json.dumps({'supervisor': os.getpid(), 'api': children[0].pid, 'web': children[1].pid}))
        now = datetime.now()
        if now.strftime('%Y-%m-%d') != backup_day:
            folder = data / 'backups'
            folder.mkdir(exist_ok=True)
            store.backup(folder / f'dz-{now:%Y-%m-%d-%H%M%S-%f}.sqlite3')
            backup_day = now.strftime('%Y-%m-%d')
        time.sleep(5)
except Exception:
    with (data / 'supervisor-error.log').open('a', encoding='utf-8') as output:
        traceback.print_exc(file=output)
    sys.exit(1)
finally:
    for child in children:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
    for output in logs:
        output.close()
