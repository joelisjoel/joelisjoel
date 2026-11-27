"""Step 1: narration.json -> audio/vo/<lineId>.wav (raw Kokoro, cached) + timing.json.

Each line's slot is its speech length plus a gap, rounded UP to a whole beat
so every hard cut lands on the music grid. Re-run is cheap: existing wavs are
reused unless their text changed (hash stored alongside).
"""
import json, os, math, hashlib, sys, re
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = json.load(open(os.path.join(ROOT, "narration.json")))
vo_dir = os.path.join(ROOT, "audio", "vo")
os.makedirs(vo_dir, exist_ok=True)
beat = 60.0 / cfg["bpm"]
kokoro = None

def synth(text):
    global kokoro
    if kokoro is None:
        from kokoro_onnx import Kokoro
        m = os.path.expanduser(os.environ.get("KOKORO_DIR", "~/models"))
        kokoro = Kokoro(os.path.join(m, "kokoro-v1.0.onnx"), os.path.join(m, "voices-v1.0.bin"))
    # Inline phoneme overrides: "[SaaSpocalypse](/sˈæs pˈɑːkɐlˌɪps/)" — the
    # bracketed word is replaced by the given IPA; everything else is phonemized.
    parts = re.split(r"\[[^\]]*\]\(/([^/]*)/\)", text)
    if len(parts) == 1:
        return kokoro.create(text, voice=cfg["voice"], speed=cfg["speed"], lang="en-us")
    ph = "".join(p if i % 2 else kokoro.tokenizer.phonemize(p, "en-us") if p.strip() else p for i, p in enumerate(parts))
    return kokoro.create(ph, voice=cfg["voice"], speed=cfg["speed"], lang="en-us", is_phonemes=True)

timing = {"fps": 30, "bpm": cfg["bpm"], "beat": beat, "chapters": []}
t = 0.0
for ch in cfg["chapters"]:
    cht = {"id": ch["id"], "title": ch["title"], "start": t, "lines": []}
    for ln in ch["lines"]:
        if "silent" in ln:  # music-only slot (e.g. a title card): no wav, no caption
            slot = math.ceil(ln["silent"] / beat) * beat
            cht["lines"].append({"id": ln["id"], "text": "", "start": t, "speech": 0.0, "dur": slot})
            t += slot; continue
        wav = os.path.join(vo_dir, ln["id"] + ".wav")
        say = ln.get("say", ln["text"])  # optional phonetic override; captions still use "text"
        h = hashlib.sha1((cfg["voice"] + str(cfg["speed"]) + say).encode()).hexdigest()
        hf = wav + ".sha1"
        if not (os.path.exists(wav) and os.path.exists(hf) and open(hf).read() == h):
            samples, sr = synth(say)
            sf.write(wav, samples, sr)
            open(hf, "w").write(h)
            print("tts", ln["id"], file=sys.stderr)
        speech = sf.info(wav).duration
        slot = math.ceil((speech + cfg["gapSeconds"]) / beat) * beat
        cht["lines"].append({"id": ln["id"], "text": ln["text"], "start": t, "speech": speech, "dur": slot})
        t += slot
    cht["dur"] = t - cht["start"]
    timing["chapters"].append(cht)
timing["total"] = t
json.dump(timing, open(os.path.join(ROOT, "timing.json"), "w"), indent=1)
for c in timing["chapters"]:
    print(f'{c["id"]:4} {c["start"]:7.2f}s  {c["dur"]:6.2f}s  {c["title"]}')
print(f"total {t:.2f}s")
