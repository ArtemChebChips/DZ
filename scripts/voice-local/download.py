"""Скачать выбранную ревизию в игнорируемую локальную папку проекта."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / '.voice-test.local'
os.environ['HF_HOME'] = str(LOCAL / 'huggingface')
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'

from huggingface_hub import snapshot_download

path = snapshot_download(
    'mlx-community/parakeet-tdt-0.6b-v3',
    revision='ed2b7e8c15f9aaa0b5772e2efb986255eaef7e15',
    allow_patterns=['model.safetensors', 'config.json'],
    max_workers=2,
)
(LOCAL / 'model-path.txt').write_text(path)
print('Модель сохранена:', path)
