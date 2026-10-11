"""Natural-sounding narration with Kokoro (local, Apache-2.0).
Usage: python tts.py <out.wav> <voice> <speed> <text>
"""
import sys
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

models = Path(__file__).resolve().parents[2] / ".tts-models"
out, voice, speed, text = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
kokoro = Kokoro(str(models / "kokoro-v1.0.onnx"), str(models / "voices-v1.0.bin"))
samples, rate = kokoro.create(text, voice=voice, speed=speed, lang="en-us")
sf.write(out, samples, rate)
