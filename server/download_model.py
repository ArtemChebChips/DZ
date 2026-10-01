"""Загрузка готовой Parakeet v3 INT8 без изменения окружения приложения."""
import argparse
import hashlib
import shutil
import tarfile
import tempfile
from pathlib import Path
from urllib.request import urlopen

URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2'
NAME = 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8'


def main():
    parser = argparse.ArgumentParser(description='Скачать Parakeet v3 INT8 для CPU')
    parser.add_argument('--destination', default='server-data.local/parakeet')
    args = parser.parse_args()
    destination = Path(args.destination).resolve()
    if destination.exists():
        parser.error('Каталог уже существует; модель не перезаписана.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent, prefix='dz-model-') as folder:
        archive = Path(folder) / 'model.tar.bz2'
        print('Загружаю Parakeet v3 INT8…', flush=True)
        with urlopen(URL, timeout=60) as response, archive.open('wb') as output:
            shutil.copyfileobj(response, output)
        with archive.open('rb') as downloaded:
            digest = hashlib.file_digest(downloaded, 'sha256').hexdigest()
        with tarfile.open(archive) as model:
            model.extractall(folder, filter='data')
        extracted = Path(folder) / NAME
        required = ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt']
        if not all((extracted / name).is_file() for name in required):
            raise RuntimeError('Архив не содержит ожидаемой модели.')
        (extracted / 'archive-sha256.txt').write_text(digest + '\n')
        extracted.rename(destination)
        print(f'Модель установлена. SHA-256 архива: {digest}')


if __name__ == '__main__':
    main()
