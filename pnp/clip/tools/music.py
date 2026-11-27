"""Step 2: synthesize the score (audio/music.wav) and assemble the voice track
(audio/vo_track.wav) from timing.json. Pure numpy — no samples, no services.

Score: 120 bpm driving electronic pulse in A minor. Kick on every beat, offbeat
hats, a 16th-note sawtooth bass arpeggio, and a pad. Each chapter changes the
chord loop / adds layers so energy builds toward the record reveal; chapter
starts get a riser + crash so the music "cuts" with the picture.
"""
import json, os
import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = json.load(open(os.path.join(ROOT, "timing.json")))
SR = 48000
BEAT = T["beat"]
TAIL = 3.0
N = int((T["total"] + TAIL) * SR)
rs = np.random.RandomState(7)

def midi(m): return 440.0 * 2 ** ((m - 69) / 12)

def env_ad(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)

def saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    return 2 * ((f * t + phase) % 1) - 1

def lowpass(x, cutoff):
    # one-pole lowpass, vectorized enough for our short notes
    a = np.broadcast_to(np.exp(-2 * np.pi * np.asarray(cutoff, float) / SR), x.shape)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc; y[i] = acc
    return y

def add(buf, x, start):
    i = int(start * SR)
    if i >= len(buf): return
    x = x[: len(buf) - i]
    buf[i:i + len(x)] += x

L = np.zeros(N); R = np.zeros(N)
def addst(x, start, pan=0.0):
    add(L, x * (1 - max(0, pan)), start); add(R, x * (1 + min(0, pan)), start)

# --- instruments -----------------------------------------------------------
def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 0.9
KICK = kick()

def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    x = rs.randn(n); x = x - lowpass(x, 7000)
    return x * env_ad(n, 0.001, 0.06 if open_ else 0.012) * 0.22
HAT, OHAT = hat(), hat(True)

def clap():
    n = int(0.2 * SR); x = rs.randn(n); x = x - lowpass(x, 1200)
    e = env_ad(n, 0.001, 0.05)
    return x * e * 0.3

def bass_note(m, dur):
    n = int(dur * SR)
    f = midi(m)
    x = 0.6 * saw(f, n) + 0.4 * saw(f * 1.005, n, 0.3)
    x = lowpass(x, 900) * env_ad(n, 0.003, dur * 0.7)
    return x * 0.33

_cache = {}
def bass(m, dur):
    k = (m, round(dur, 4))
    if k not in _cache: _cache[k] = bass_note(m, dur)
    return _cache[k]

def pad(chord, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    x = np.zeros(n)
    for m in chord:
        for det in (-0.12, 0.0, 0.12):
            x += saw(midi(m + det / 1.0), n, rs.rand())
    x = lowpass(x / (3 * len(chord)), 1400)
    e = np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.4)
    return x * e * 0.16

def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    x = rs.randn(n); x = x - lowpass(x, 500 + 5000 * (t / dur))
    return x * (t / dur) ** 2 * 0.18

def crash():
    n = int(1.6 * SR); x = rs.randn(n); x = x - lowpass(x, 4000)
    return x * env_ad(n, 0.002, 0.45) * 0.22

def blip(m):
    n = int(0.12 * SR); t = np.arange(n) / SR
    return np.sign(np.sin(2 * np.pi * midi(m) * t)) * env_ad(n, 0.001, 0.04) * 0.05

# --- arrangement -------------------------------------------------------------
# chord roots per bar (4 beats) for each chapter, A minor-ish.
LOOPS = {
    "ch0": [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]],   # Am F G Em
    "ch1": [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    "ch2": [[50, 53, 57], [53, 57, 60], [57, 60, 64], [55, 59, 62]],   # Dm F Am G
    "ch3": [[57, 60, 64], [55, 59, 62], [53, 57, 60], [55, 59, 62]],
    "ch4": [[53, 57, 60], [55, 59, 62], [57, 60, 64], [57, 60, 64]],
    "ch5": [[53, 57, 60], [55, 59, 62], [52, 56, 59], [57, 61, 64]],   # F G E A(major lift)
}
ARP = [0, 12, 7, 12, 0, 12, 7, 15]   # 16th-note pattern offsets from chord root
LEVEL = {"ch0": 0.8, "ch1": 0.85, "ch2": 0.85, "ch3": 0.9, "ch4": 0.95, "ch5": 1.0}

for ci, ch in enumerate(T["chapters"]):
    start, end = ch["start"], ch["start"] + ch["dur"]
    # unknown chapter ids (new videos) cycle through the loops and ramp energy
    loop = LOOPS.get(ch["id"]) or list(LOOPS.values())[ci % len(LOOPS)]
    lvl = LEVEL.get(ch["id"], min(1.0, 0.8 + 0.05 * ci))
    nbeats = int(round(ch["dur"] / BEAT))
    for b in range(nbeats):
        tb = start + b * BEAT
        bar = (b // 4) % len(loop); chord = loop[bar]
        intro = ch["id"] == "ch0" and b < 4       # first bar: pad + blips only
        if not intro:
            addst(KICK * lvl, tb)
            addst(HAT * lvl, tb + BEAT / 2, 0.3)
            if ci >= 2: addst(HAT * 0.6 * lvl, tb + BEAT / 4, -0.3); addst(HAT * 0.6 * lvl, tb + 3 * BEAT / 4, -0.3)
            if b % 2 == 1: addst(clap() * lvl, tb, -0.1)
            for k in range(4):
                m = chord[0] - 24 + ARP[(b * 4 + k) % len(ARP)]
                addst(bass(m, BEAT / 4) * lvl, tb + k * BEAT / 4)
        if b % 4 == 0:
            addst(pad(chord, 4 * BEAT) * (1.2 if intro else 1.0), tb, 0.0)
        if b % 2 == 0: addst(blip(chord[2] + 24) * lvl, tb + 3 * BEAT / 4, 0.6 if b % 4 else -0.6)
    # chapter transitions: riser into, crash on the downbeat
    if ci > 0:
        addst(riser(2 * BEAT), start - 2 * BEAT)
        addst(crash(), start)

# ending: final chord ring-out + crash
endt = T["total"]
addst(crash() * 1.2, endt - 1.5)
addst(pad([57, 64, 69, 72], TAIL + 1.5) * 1.4, endt - 1.5)
addst(KICK, endt - 1.5)

mix = np.stack([L, R], 1)
mix *= 0.85 / np.max(np.abs(mix))
fade = int(1.2 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
os.makedirs(os.path.join(ROOT, "audio"), exist_ok=True)
sf.write(os.path.join(ROOT, "audio", "music.wav"), mix.astype(np.float32), SR)

# --- voice track: each line placed at its slot start (+ small lead-in) -------
vo = np.zeros(N)
for ch in T["chapters"]:
    for ln in ch["lines"]:
        x, sr = sf.read(os.path.join(ROOT, "audio", "vo", ln["id"] + ".wav"))
        if x.ndim > 1: x = x.mean(1)
        if sr != SR: x = np.interp(np.arange(int(len(x) * SR / sr)) * sr / SR, np.arange(len(x)), x)
        add(vo, x, ln["start"] + 0.08)
sf.write(os.path.join(ROOT, "audio", "vo_track.wav"), (vo / max(1e-9, np.max(np.abs(vo))) * 0.9).astype(np.float32), SR)
print(f"music + vo_track: {N / SR:.1f}s")
