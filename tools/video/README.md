# Video TikTok (1080x1920)

Video dilukis bingkai demi bingkai oleh `video.html` (HTML/CSS) pada masa `t`, jadi segerak dengan audio adalah tepat dan boleh diulang.

| Fail | Fungsi |
|---|---|
| `asr_segments.py` | Pecahkan audio pada jeda dan transkripsi setiap bahagian (Whisper melalui sherpa-onnx) untuk mendapat masa sebenar |
| `timelines.js` | Masa setiap sari kata dan adegan (saat). **Ubah di sini** jika audio baharu |
| `video.html` | Enjin adegan dan gaya |
| `render.mjs` | Render still (semakan) atau video penuh |

## Guna

Semakan pantas (PNG pada masa tertentu):

```bash
NODE_PATH=$(npm root -g) node tools/video/render.mjs still intro 5,20,45,70 /tmp/stills
```

Video penuh (audio dalam WAV):

```bash
NODE_PATH=$(npm root -g) node tools/video/render.mjs video intro audio-pengenalan.wav media/video/annur-docs-pengenalan.mp4
```

Audio baharu: jalankan `asr_segments.py <audio.wav> <folder-model-whisper> <out.json>` (model: `sherpa-onnx-whisper-base` dari
github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models), baca masa mula/tamat setiap bahagian, kemudian kemas kini `timelines.js`.
Kawasan selamat TikTok: kandungan y 215–1225, sari kata y 1262–1470; bawah 1470 dibiarkan untuk UI TikTok.
