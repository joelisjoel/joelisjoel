#!/usr/bin/env python3
"""Measure the pequalnp record as a dependency graph, the way Mirza's Riemann map measures a proof.

Usage: graph_stats.py <data dir> [--json out.json]

<data dir> is the pnp data dir (pnp/pipeline/update.sh fills it): it reads prog/*.json and
plan.json. A lemma's links are its depends_on list in the record; the Lean files may import more.
"""
import glob
import json
import os
import sys
from collections import Counter, defaultdict

STATUS = {"c": "checked", "j": "open", "r": "refuted", "w": "in work", "b": "blocked", "x": "retired"}
# From Mirza's page about the Lean proof of the Riemann Hypothesis (read November 26, 2026).
RIEMANN = {"files": 175187, "imports": 753261, "longest_chain": 203, "source": "https://bosnadev.com/lab/riemann"}


def load(data):
    status, deps, program = {}, {}, {}
    for f in sorted(glob.glob(os.path.join(data, "prog", "*.json"))):
        d = json.load(open(f))
        key = d["key"]
        for t in d["nodes"]:
            i = f"L-{key}-{t[0]:03d}"
            status[i] = t[1]
            program[i] = d["program"]
            deps[i] = [x if isinstance(x, str) else f"L-{key}-{x:03d}" for x in t[2]]
    return status, deps, program


def below(i, deps):
    """Every lemma that i rests on, directly or not."""
    seen, stack = set(), [i]
    while stack:
        for x in deps.get(stack.pop(), []):
            if x not in seen:
                seen.add(x)
                stack.append(x)
    return seen


def levels(status, deps):
    """Level above the basics (Mirza's Spire): the longest chain of links beneath each lemma.
    It never changes once a lemma is checked, so the picture stays put as the record grows."""
    level = {}
    for i in sorted(status, key=lambda i: len(below(i, deps))):
        level[i] = max((1 + level.get(x, 0) for x in deps[i] if x in status), default=0)
    return level


def measure(data):
    status, deps, program = load(data)
    users = defaultdict(set)
    for i, ds in deps.items():
        for x in ds:
            users[x].add(i)
    level = levels(status, deps)

    parent = {i: i for i in status}

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for i, ds in deps.items():
        for x in ds:
            if x in status:
                parent[find(i)] = find(x)
    sizes = sorted(Counter(find(i) for i in status).values(), reverse=True)

    checked = [i for i in status if status[i] == "c"]
    plan = json.load(open(os.path.join(data, "plan.json")))
    targets = {}
    for p, v in plan["programs"].items():
        t = (v.get("target") or {}).get("lemma_id")
        if t:
            targets[p] = {"lemma": t, "status": STATUS.get(status.get(t), status.get(t)),
                          "rests_on": len(below(t, deps))}

    return {
        "lemmas": len(status),
        "status": {STATUS.get(k, k): n for k, n in Counter(status.values()).most_common()},
        "links": sum(len(v) for v in deps.values()),
        "checked_resting_on_nothing": sum(1 for i in checked if not deps[i]),
        "checked_nothing_rests_on": sum(1 for i in checked
                                        if not any(status.get(u) == "c" for u in users[i])),
        "longest_chain": max(level.values()),
        "levels_of_checked": dict(sorted(Counter(level[i] for i in checked).items())),
        "pieces": len(sizes),
        "largest_pieces": sizes[:5],
        "lemmas_linked_to_nothing": sum(1 for s in sizes if s == 1),
        "targets": targets,
        "riemann_for_comparison": RIEMANN,
    }


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = measure(sys.argv[1])
    if "--json" in sys.argv:
        json.dump(out, open(sys.argv[sys.argv.index("--json") + 1], "w"), indent=1)
    print(json.dumps(out, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
