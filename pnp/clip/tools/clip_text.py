"""Write clip.json: the clip's timeline, captions and words, from the voiceover timing and the record.
Usage: python3 tools/clip_text.py <head.json> <previous head.json> <data.json>

Each voiceover line (timing.json, from tools/tts.py) gets a stretch of record time:
  o1  cold open at the busiest moment for lasers on the two sides (the first frame is the thumbnail)
  r1  the story so far: hour 0 to the previous post
  n1  overnight, up to the first new kill on the two sides
  n3  the new kills on the two sides
  n2  the rest of the new hours
  e1  the end card
Captions are the voiceover lines, word for word.
"""
import bisect, json, os, sys
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
head, prev, data = (json.load(open(p)) for p in sys.argv[1:4])
timing = json.load(open(os.path.join(ROOT, "timing.json")))
iso = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))
t0 = iso(head["started_at"])
hrs = lambda s: (iso(s) - t0).total_seconds() / 3600
H, Hprev = hrs(head["generated_at"]), hrs(prev["generated_at"])
pt = lambda d: d.astimezone(ZoneInfo("America/Los_Angeles"))
a, b = pt(t0), pt(iso(head["generated_at"]))
rng = f"{a:%b} {a.day}–{b.day}, {b.year}" if a.month == b.month else f"{a:%b} {a.day} – {b:%b} {b.day}, {b.year}"

# kills of lemmas on the two sides, in record hours
rows, P = data["rows"], data["programs"]
aim = {"p_eq_np": -1, "p_neq_np": 1, "neutral": 0}
side_kills = sorted(rows[v][3] / 60 for v, a_ in data["attacks"] if aim[P[rows[v][0]]["aims_at"]] != 0)
live = lambda h: bisect.bisect_right(side_kills, h) - bisect.bisect_left(side_kills, h - 110 / 60)
peak = max((k / 6 for k in range(int(H * 6))), key=live)      # busiest moment, to a tenth of an hour
new_kills = [k for k in side_kills if k > Hprev]
k_first = (new_kills[0] - 0.3) if new_kills else Hprev + (H - Hprev) / 3
k_last = (new_kills[-1] + 0.6) if new_kills else Hprev + 2 * (H - Hprev) / 3

span = {"o1": (peak - 0.2, peak + 2.2, True), "r1": (0, Hprev, True), "n1": (Hprev, k_first, False),
        "n3": (k_first, k_last, False), "n2": (k_last, H, False), "e1": (H, H, False)}
segments, captions, end_start = [], [], None
for ch in timing["chapters"]:
    for ln in ch["lines"]:
        h0, h1, snap = span[ln["id"]]
        segments.append({"v0": ln["start"], "v1": ln["start"] + ln["dur"], "h0": h0, "h1": h1, "snap": snap})
        captions.append([ln["start"], ln["start"] + ln["dur"] - 0.15, ln["text"]])
        if ln["id"] == "e1": end_start = ln["start"]
captions = [c for c in captions if c[0] != end_start]          # the end card carries its own words

checked, d = head["counters"]["checked"], head["counters"]["checked"] - prev["counters"]["checked"]
out = {
    "hours": round(H), "total": timing["total"], "segments": segments, "captions": captions, "endStart": end_start,
    "eyebrow": f"Daily update · {b:%a}, {b:%b} {b.day} · an AI agent fleet attacking P vs NP in public · pequalnp.com",
    "endTitle": f"{round(H)} hours in",
    "endLines": [f"{checked:,} lemmas checked by Lean, {d:,} of them since yesterday's post.",
                 "None pulls toward P = NP.", "None has reached the claim: no lemma even states P ≠ NP."],
    "source": f"Data: pequalnp.com public record, {rng} · independent visualization",
}
json.dump(out, open(os.path.join(ROOT, "clip.json"), "w"), ensure_ascii=False, indent=1)
print(f"peak {peak:.1f}h ({live(peak)} lasers) · previous post at {Hprev:.1f}h · now {H:.1f}h · new side kills {[round(k, 1) for k in new_kills]}")
for s in segments: print(f"  {s['v0']:5.1f}-{s['v1']:5.1f}s  hours {s['h0']:6.1f} -> {s['h1']:6.1f}{'  (cut)' if s['snap'] else ''}")
