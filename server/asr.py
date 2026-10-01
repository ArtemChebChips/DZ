"""Parakeet v3 для Linux/CPU. Модель остаётся в памяти, записи временные."""
import os
import subprocess
import tempfile
import wave
from pathlib import Path


class Parakeet:
    def __init__(self):
        self.model = None

    def transcribe(self, audio):
        import sherpa_onnx
        folder = Path(os.environ.get('DZ_ASR_MODEL', 'server-data.local/parakeet'))
        if self.model is None:
            required = ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt']
            if not all((folder / name).is_file() for name in required):
                raise ValueError('Модель распознавания ещё не установлена на сервере.')
            self.model = sherpa_onnx.OfflineRecognizer.from_transducer(
                encoder=str(folder / required[0]), decoder=str(folder / required[1]),
                joiner=str(folder / required[2]), tokens=str(folder / required[3]),
                model_type='nemo_transducer', provider='cpu', decoding_method='greedy_search',
                num_threads=int(os.environ.get('DZ_ASR_THREADS', '2')),
            )
        with tempfile.TemporaryDirectory(prefix='dz-audio-') as directory:
            source, target = Path(directory) / 'input', Path(directory) / 'audio.wav'
            source.write_bytes(audio)
            ffmpeg = os.environ.get('DZ_FFMPEG', 'ffmpeg')
            result = subprocess.run([ffmpeg, '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', str(source), '-t', '61', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', str(target)], capture_output=True, timeout=20)
            if result.returncode:
                raise ValueError('Не удалось прочитать запись.')
            with wave.open(str(target)) as wav:
                if wav.getnframes() / wav.getframerate() > 60:
                    raise ValueError('Запись длиннее минуты.')
                import numpy as np
                samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16).astype(np.float32) / 32768
            if samples.size < 1600 or float(np.sqrt(np.mean(samples ** 2))) < 0.001:
                raise ValueError('Речь не слышна. Попробуй ещё раз.')
            stream = self.model.create_stream()
            stream.accept_waveform(16000, samples)
            self.model.decode_stream(stream)
            text = stream.result.text.strip()
            if not text:
                raise ValueError('Не удалось разобрать речь.')
            return {'text': text}
