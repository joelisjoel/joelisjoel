"""Write clip.json: the clip's timeline, captions and words, from the voiceover timing and the record.
Usage: python3 tools/clip_text.py <head.json> <previous head.json> <data.json> [markets.json]

Each voiceover line (timing.json, from tools/tts.py) gets a stretch of record time:
  o1  cold open at the busiest moment for lasers on the two sides (the first frame is the thumbnail)
  r1  the story so far: hour 0 to the previous post
  n1  overnight, up to the first new kill on the two sides
  n3  the new kills on the two sides
  n2  the rest of the new hours
  m1  optional: the prediction markets since the last post, over a panel (needs markets.json)
  x1  optional: top posts on X, over a panel (needs posts.json beside clip.json, copied from the version folder)
  e1  the end card
Captions are the voiceover lines, word for word. A tag above the captions names the date or the stretch shown.
"""
import bisect, json, os, sys
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
head, prev, data = (json.load(open(p)) for p in sys.argv[1:4])
markets = json.load(open(sys.argv[4])) if len(sys.argv) > 4 and os.path.exists(sys.argv[4]) else None
posts_path = os.path.join(ROOT, "posts.json")
posts = json.load(open(posts_path)) if os.path.exists(posts_path) else []
# prices read at the last post (make_version.sh copies the previous version's markets.json here)
prev_path = os.path.join(ROOT, "markets_prev.json")
prev_now = {s["id"]: s["now"] for s in json.load(open(prev_path))["series"]} if os.path.exists(prev_path) else {}
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
# on a side as the pages draw it: a program aiming at an answer, or a step of the P = NP search's kill chain
alg_chain = {x for p in P if p["id"] == "p_eq_np_search" for x in p.get("chain", []) if x}
on_side = lambda v: aim[P[rows[v][0]]["aims_at"]] != 0 or f"L-{P[rows[v][0]]['key']}-{rows[v][1]:03d}" in alg_chain
side_kills = sorted(rows[v][3] / 60 for v, a_ in data["attacks"] if on_side(v))
live = lambda h: bisect.bisect_right(side_kills, h) - bisect.bisect_left(side_kills, h - 110 / 60)
peak = max((k / 6 for k in range(int(H * 6))), key=live)      # busiest moment, to a tenth of an hour
new_kills = [k for k in side_kills if k > Hprev]
k_first = (new_kills[0] - 0.3) if new_kills else Hprev + (H - Hprev) / 3
k_last = (new_kills[-1] + 0.6) if new_kills else Hprev + 2 * (H - Hprev) / 3

span = {"o1": (peak - 0.2, peak + 2.2, True), "r1": (0, Hprev, True), "n1": (Hprev, k_first, False),
        "n3": (k_first, k_last, False), "n2": (k_last, H, False), "m1": (H, H, False), "x1": (H, H, False), "e1": (H, H, False)}

# the tag above the captions: the date for what's new, the stretch for the story so far
pp = pt(iso(prev["generated_at"]))
clock = lambda d: f"{d:%a} {d.hour % 12 or 12}{f':{d.minute:02d}' if d.minute else ''}{'am' if d.hour < 12 else 'pm'}"
today = f"{b:%a}, {b:%b} {b.day}"
TAG = {"o1": f"New today · {today}", "r1": f"The story so far · since {a:%a}, {a:%b} {a.day}",
       "n1": f"New since {clock(pp)} PT", "n3": f"New since {clock(pp)} PT", "n2": f"New since {clock(pp)} PT",
       "m1": f"The markets · {today}", "x1": f"On X · {today}"}

# market moves since the last post: value then (last point at or before it) and now
def at_minute(points, m):
    v = None
    for t, p in points:
        if t <= m: v = p
        else: break
    return v
market_rows = []
if markets:
    for s in sorted(markets["series"], key=lambda s: s["kind"] != "truth"):
        then = prev_now.get(s["id"], at_minute(s["points"], Hprev * 60))
        market_rows.append({"source": s["source"], "question": s["question"], "kind": s["kind"], "money": s.get("money", ""),
                            "then": then, "now": s["now"]})

segments, captions, tags, panels, end_start = [], [], [], [], None
for ch in timing["chapters"]:
    for ln in ch["lines"]:
        if ln["id"] == "m1" and not market_rows: sys.exit("line m1 needs markets.json")
        if ln["id"] == "x1" and not posts: sys.exit("line x1 needs posts.json in the version folder")
        h0, h1, snap = span[ln["id"]]
        v0, v1 = ln["start"], ln["start"] + ln["dur"]
        segments.append({"v0": v0, "v1": v1, "h0": h0, "h1": h1, "snap": snap})
        captions.append([v0, v1 - 0.15, ln["text"]])
        if ln["id"] in TAG:
            if tags and tags[-1][2] == TAG[ln["id"]] and abs(tags[-1][1] - v0) < 0.01: tags[-1][1] = v1   # one tag across lines
            else: tags.append([v0, v1, TAG[ln["id"]]])
        if ln["id"] == "m1": panels.append([v0, v1, "markets"])
        if ln["id"] == "x1": panels.append([v0, v1, "posts"])
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
    "tags": tags, "panels": panels, "markets": market_rows, "since": f"{clock(pp)} PT", "posts": posts,
}
json.dump(out, open(os.path.join(ROOT, "clip.json"), "w"), ensure_ascii=False, indent=1)
print(f"peak {peak:.1f}h ({live(peak)} lasers) · previous post at {Hprev:.1f}h · now {H:.1f}h · new side kills {[round(k, 1) for k in new_kills]}")
for s in segments: print(f"  {s['v0']:5.1f}-{s['v1']:5.1f}s  hours {s['h0']:6.1f} -> {s['h1']:6.1f}{'  (cut)' if s['snap'] else ''}")
