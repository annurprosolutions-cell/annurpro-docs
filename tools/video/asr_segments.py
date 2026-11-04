"""Pecah audio pada jeda, transkripsi setiap bahagian dengan Whisper (sherpa-onnx) dan tulis JSON { start, end, text }.
Guna: python3 asr_segments.py <audio.wav> <model-dir> <out.json>"""
import json, re, subprocess, sys, wave
import numpy as np, sherpa_onnx

wav, model, out = sys.argv[1:4]
log = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', 'silencedetect=noise=-38dB:d=0.28', '-f', 'null', '-'], capture_output=True, text=True).stderr
starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]
ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
w = wave.open(wav); sr = w.getframerate(); n = w.getnframes()
x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
dur = n / sr
# bahagian bercakap = antara jeda
segs, t = [], 0.0
for s, e in zip(starts, ends):
    if s - t > 0.15: segs.append([t, s])
    t = e
if dur - t > 0.15: segs.append([t, dur])
# gabung bahagian pendek supaya setiap satu 2.5-14s
merged = []
for a, b in segs:
    if merged and (b - merged[-1][0] < 14) and (merged[-1][1] - merged[-1][0] < 2.5 or b - a < 1.2):
        merged[-1][1] = b
    else: merged.append([a, b])
rec = sherpa_onnx.OfflineRecognizer.from_whisper(
    encoder=f'{model}/base-encoder.int8.onnx', decoder=f'{model}/base-decoder.int8.onnx', tokens=f'{model}/base-tokens.txt',
    language='ms', task='transcribe', num_threads=4)
res = []
for a, b in merged:
    st = rec.create_stream(); st.accept_waveform(sr, x[int(max(0, a - 0.1) * sr):int(min(dur, b + 0.1) * sr)]); rec.decode_stream(st)
    res.append({'start': round(a, 2), 'end': round(b, 2), 'text': st.result.text.strip()})
json.dump({'duration': dur, 'segments': res}, open(out, 'w'), ensure_ascii=False, indent=1)
for r in res: print(f"{r['start']:6.1f}-{r['end']:6.1f}  {r['text']}")
