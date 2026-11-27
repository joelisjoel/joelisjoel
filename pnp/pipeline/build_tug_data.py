# v2 data: v1's rows plus who killed each refuted lemma. Side kills come from the fetched records;
# for meta-complexity, the twin is the adjacent lemma checked at the same minute (true for every sampled case).
import glob, json, os, re, sys
D, IN, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(IN)); rows = d['rows']; P = d['programs']; key = [p['key'] for p in P]
idOf = lambda i: f"L-{key[rows[i][0]]}-{rows[i][1]:03d}"
byId = {idOf(i): i for i in range(len(rows))}
known = {}
for f in glob.glob(os.path.join(D, 'ref', 'L-*.json')):
    r = json.load(open(f)); ce = r.get('counterexample') or {}
    desc = ce.get('description') or ''; lf = (ce.get('artifact') or {}).get('lean_file') or ''
    ids = re.findall(r'L-[a-z]+-\d+', desc); m = re.search(r'L_([a-z]+)_(\d+)\.lean', lf)
    t = ids[0] if ids else (f"L-{m.group(1)}-{int(m.group(2)):03d}" if m else None)
    known[r['id']] = t
attack = []; stats = {'known': 0, 'twin': 0, 'anon': 0}
for i, r in enumerate(rows):
    if r[2] not in (3, 4): continue
    lid = idOf(i); a = -1
    if lid in known:
        a = byId.get(known[lid], -1); stats['known' if a >= 0 else 'anon'] += 1
    else:
        for dn in (-1, 1):
            j = byId.get(f"L-{key[r[0]]}-{r[1] + dn:03d}")
            if j is not None and rows[j][2] == 0 and abs(rows[j][3] - r[3]) <= 2: a = j; break
        stats['twin' if a >= 0 else 'anon'] += 1
    attack.append([i, a])
d['attacks'] = attack
json.dump(d, open(OUT, 'w'), separators=(',', ':'), ensure_ascii=False)
print(stats, 'attacks', len(attack), 'bytes', os.path.getsize(OUT))
