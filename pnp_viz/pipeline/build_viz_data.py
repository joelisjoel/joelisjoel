# Pack the pequalnp.com export into one compact file for the field view.
import json, os, re, sys
from datetime import datetime
D, OUT = sys.argv[1], sys.argv[2]
J = lambda *p: json.load(open(os.path.join(D, *p)))
head, m, plan = J('head.json'), J('map.json'), J('plan.json')
side = J('side_lemmas.json') if os.path.exists(os.path.join(D, 'side_lemmas.json')) else {}
iso = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()
t0, t1 = iso(head['started_at']), iso(head['generated_at'])
ST = {'c': 0, 'j': 1, 'w': 2, 'r': 3, 'b': 4, 'x': 5}
KIND = {'open': 0, 'helper': 1, 'known': 2}
LABEL = re.compile(r'^\s*(?:(?:(?:OPEN|HARD|NEXT)\s+)?(?:TARGET|LINK|GAP|HARD LINK)(?:\s*\([^)]*\))?|NEW STEP[^:]*|OPEN)\s*:\s*')
clean = lambda t: (LABEL.sub('', t or '').strip() or (t or '')).strip()
progs = m['programs']; pidx = {p['id']: i for i, p in enumerate(progs)}; kidx = {p['key']: i for i, p in enumerate(progs)}
role, titles = {}, {}
for pid, pl in plan['programs'].items():
    for r in pl['chain']:
        if not r.get('lemma_id'): continue
        role.setdefault(r['lemma_id'], 1); titles[r['lemma_id']] = clean(r.get('title'))
    h = pl.get('hard_link') or {}
    if h.get('lemma_id'): role[h['lemma_id']] = max(role.get(h['lemma_id'], 0), 2); titles[h['lemma_id']] = clean(h.get('title'))
    t = pl['target']
    if t.get('lemma_id'): role[t['lemma_id']] = 3; titles[t['lemma_id']] = clean(t.get('title'))
import collections
news = collections.Counter(c for a in J('news.json')['articles'] for c in a.get('covers', []))
paper = {c.get('lemma_id') for pp in J('papers.json')['papers'] for sec in pp.get('sections', []) for c in sec.get('claims', []) if c.get('lemma_id')}
for cb in J('contributors.json')['contributors']:
    for l in cb['lemmas']:
        if l.get('title'): titles.setdefault(l['id'], clean(l['title'])[:200])
rows, index, deps = [], {}, []
for p in progs:
    for n in J('prog', p['id'] + '.json')['nodes']:
        lid = f"L-{p['key']}-{n[0]:03d}"
        index[lid] = len(rows)
        for d in n[2]: deps.append((lid, d if isinstance(d, str) else f"L-{p['key']}-{d:03d}"))
        s = side.get(lid, {})
        kind = KIND.get(s.get('kind'), 2 if p['id'] == 'library' else -1)
        rows.append([pidx[p['id']], n[0], ST[n[1]], round((n[4] - t0) / 60), n[5], len(n[2]), 0, role.get(lid, 0), kind, 1 if len(n) > 7 else 0,
                     news.get(lid, 0), 1 if lid in paper else 0, s.get('attempts', -1), s.get('died', -1)])
        if s.get('title'): titles[lid] = clean(s['title'])
edges = []
for a, b in deps:
    if a in index and b in index:
        edges.append([index[a], index[b]]); rows[index[b]][6] += 1
plain = {k: v['plain'] for k, v in side.items() if v.get('plain')}
out = {
  'source': {'layout': head['layout'], 'version': head['version'], 'generated_at': head['generated_at'], 'started_at': head['started_at']},
  'programs': [{'id': p['id'], 'key': p['key'], 'title': p['title'], 'aims_at': p['aims_at'], 'goal': p['goal'],
                'target': plan['programs'].get(p['id'], {}).get('target', {}).get('lemma_id'),
                'hard': (plan['programs'].get(p['id'], {}).get('hard_link') or {}).get('lemma_id'),
                'why_hard': (plan['programs'].get(p['id'], {}).get('hard_link') or {}).get('plain'),
                'chain': [r.get('lemma_id') for r in plan['programs'].get(p['id'], {}).get('chain', [])]} for p in progs],
  'cols': ['program', 'n', 'status', 'minutes', 'layer', 'deps', 'used_by', 'role', 'kind', 'outside', 'news', 'paper', 'attempts', 'attempts_died'],
  'rows': rows, 'edges': edges, 'titles': titles, 'plain': plain,
}
json.dump(out, open(OUT, 'w'), separators=(',', ':'), ensure_ascii=False)
mins = [r[3] for r in rows]
print('rows', len(rows), 'edges', len(edges), 'titles', len(titles), 'plain', len(plain), 'minutes range', min(mins), max(mins), 'bytes', os.path.getsize(OUT))
