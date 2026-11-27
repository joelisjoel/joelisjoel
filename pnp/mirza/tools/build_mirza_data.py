#!/usr/bin/env python3
"""Pack the pequalnp record into the compact data.json that pnp/mirza/page.html draws.

Usage: build_mirza_data.py <data dir> <out.json>

<data dir> is the pnp data dir (pnp/pipeline/update.sh fills it). Lemmas, links and levels come from
graph_stats.py, so every count the page shows is the one graph_stats.py prints; the build stops if
the packed arrays disagree with it. Titles come from whatever the cache holds (most checked lemmas
have one, few open or refuted lemmas do).
"""
import glob
import json
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from graph_stats import STATUS, levels, load, measure  # noqa: E402

# Floor order, left to right: the P = NP side, the neutral programs, the P != NP side.
ORDER = ["p_eq_np_search", "library", "meta_complexity", "gct", "proof_complexity", "circuit_lower_bounds"]
SHORT = {"p_eq_np_search": "P = NP search", "library": "Library", "meta_complexity": "Meta-complexity",
         "gct": "GCT", "proof_complexity": "Proof complexity", "circuit_lower_bounds": "Circuits"}
# Plan labels such as "OPEN TARGET:" or "HARD LINK:" are dropped from titles (as in pipeline/build_viz_data.py).
LABEL = re.compile(r'^\s*(?:(?:(?:OPEN|HARD|NEXT)\s+)?(?:TARGET|LINK|GAP|HARD LINK)(?:\s*\([^)]*\))?|NEW STEP[^:]*|OPEN)\s*:\s*')
MAX_TITLE = 110


def short(t):
    t = re.sub(r"\s+", " ", LABEL.sub("", t or "")).strip()
    if len(t) <= MAX_TITLE:
        return t
    cut = t[:MAX_TITLE].rsplit(" ", 1)[0].rstrip(",;:")
    return cut + "…"


def titles(data, plan):
    """Every title the cache holds, best source last."""
    t = {}
    J = lambda *p: json.load(open(os.path.join(data, *p)))
    for pl in plan["programs"].values():
        for r in pl.get("chain", []) + [pl.get("hard_link") or {}, pl.get("target") or {}]:
            if r.get("lemma_id") and r.get("title"):
                t[r["lemma_id"]] = r["title"]
    if os.path.exists(os.path.join(data, "contributors.json")):
        for cb in J("contributors.json")["contributors"]:
            for lm in cb["lemmas"]:
                if lm.get("title"):
                    t[lm["id"]] = lm["title"]
    if os.path.exists(os.path.join(data, "side_lemmas.json")):
        for k, v in J("side_lemmas.json").items():
            if v.get("title"):
                t[k] = v["title"]
    for sub in ("np", "ref", "lemma"):
        for f in sorted(glob.glob(os.path.join(data, sub, "L-*.json"))):
            r = json.load(open(f))
            if r.get("title"):
                t[r["id"]] = r["title"]
    return t


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    data, out_path = sys.argv[1], sys.argv[2]
    status, deps, program = load(data)
    level = levels(status, deps)
    stats = measure(data)
    plan = json.load(open(os.path.join(data, "plan.json")))
    head = json.load(open(os.path.join(data, "head.json")))
    meta = {p["id"]: p for p in json.load(open(os.path.join(data, "map.json")))["programs"]}
    title = titles(data, plan)

    key = {}
    for f in glob.glob(os.path.join(data, "prog", "*.json")):
        d = json.load(open(f))
        key[d["program"]] = d["key"]
    assert sorted(key) == sorted(ORDER), sorted(key)

    num = lambda i: int(i.rsplit("-", 1)[1])
    ids, progs = [], []
    for p in ORDER:
        mine = sorted((i for i in status if program[i] == p), key=num)
        t = (plan["programs"].get(p, {}).get("target") or {})
        progs.append({"id": p, "key": key[p], "name": SHORT[p], "title": meta[p]["title"],
                      "aims_at": meta[p]["aims_at"], "first": len(ids), "count": len(mine),
                      "target": t.get("lemma_id"), "target_title": short(t.get("title"))})
        ids += mine
    index = {i: k for k, i in enumerate(ids)}
    links = [[index[a], index[b]] for a in ids for b in deps[a] if b in index]

    out = {
        "source": {"site": "https://pequalnp.com/", "export": head.get("layout"),
                   "generated_at": head["generated_at"], "started_at": head["started_at"]},
        "status_names": STATUS,
        "programs": progs,
        "n": [num(i) for i in ids],
        "s": "".join(status[i] for i in ids),
        "lv": "".join(str(level[i]) for i in ids),
        "links": links,
        "titles": [short(title.get(i)) for i in ids],
        "stats": stats,
    }

    # The packed arrays must say what graph_stats.py says.
    assert len(ids) == stats["lemmas"]
    assert {STATUS[k]: v for k, v in Counter(out["s"]).items()} == stats["status"]
    assert len(links) == stats["links"]
    assert max(int(c) for c in out["lv"]) == stats["longest_chain"] <= 9
    lc = Counter(int(out["lv"][k]) for k in range(len(ids)) if out["s"][k] == "c")
    assert {str(k): v for k, v in sorted(lc.items())} == {str(k): v for k, v in stats["levels_of_checked"].items()}
    touched = {a for ab in links for a in ab}
    assert len(ids) - len(touched) == stats["lemmas_linked_to_nothing"]
    for p in progs:
        assert all(ids[k].startswith(f"L-{p['key']}-") for k in range(p["first"], p["first"] + p["count"]))
        if p["target"]:
            assert p["target"] in index, p["target"]

    json.dump(out, open(out_path, "w"), separators=(",", ":"), ensure_ascii=False)
    print(f"{len(ids)} lemmas, {len(links)} links, {sum(1 for t in out['titles'] if t)} titles, "
          f"longest chain {stats['longest_chain']}, {os.path.getsize(out_path):,} bytes -> {out_path}")


if __name__ == "__main__":
    main()
