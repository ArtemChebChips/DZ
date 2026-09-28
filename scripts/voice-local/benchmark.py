"""Локальный замер ASR. Не обращается к Claude и не изменяет данные приложения."""
import argparse
import json
import os
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / '.voice-test.local'
os.environ['PATH'] = str(LOCAL / 'bin') + os.pathsep + os.environ.get('PATH', '')
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HOME'] = str(LOCAL / 'huggingface')
os.environ['NUMBA_CACHE_DIR'] = str(LOCAL / 'numba')

parser = argparse.ArgumentParser(description='Распознавание короткого аудио на Mac без сетевых запросов')
parser.add_argument('audio', type=Path)
parser.add_argument('--repeat', type=int, default=2, choices=range(1, 4))
args = parser.parse_args()
if not args.audio.is_file():
    parser.error('Аудиофайл не найден')
model_path = LOCAL / 'model-path.txt'
if not model_path.exists():
    parser.error('Модель ещё не скачана: нет .voice-test.local/model-path.txt')

import mlx.core as mx
from parakeet_mlx import from_pretrained

mx.set_cache_limit(256 * 1024 * 1024)
started = perf_counter()
model = from_pretrained(model_path.read_text().strip())
mx.eval(model.parameters())
print(json.dumps({'load_seconds': round(perf_counter() - started, 3)}, ensure_ascii=False), flush=True)
for attempt in range(args.repeat):
    started = perf_counter()
    result = model.transcribe(args.audio.resolve(), chunk_duration=30, overlap_duration=2)
    print(json.dumps({
        'attempt': attempt + 1,
        'seconds': round(perf_counter() - started, 3),
        'peak_mlx_gib': round(mx.get_peak_memory() / 1024**3, 3),
        'text': result.text,
    }, ensure_ascii=False), flush=True)
