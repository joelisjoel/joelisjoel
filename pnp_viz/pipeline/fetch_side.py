# Fetch full lemma records for the side programs, gently (about 2 per second), keeping only what the viz needs.
import json, os, subprocess, sys, time
D = sys.argv[1]
KEYS = {'gct': 'gct', 'circuit_lower_bounds': 'clb', 'proof_complexity': 'pcx', 'p_eq_np_search': 'alg'}
out_path = os.path.join(D, 'side_lemmas.json')
out = json.load(open(out_path)) if os.path.exists(out_path) else {}
todo = []
for prog, key in KEYS.items():
    for n in json.load(open(os.path.join(D, 'prog', prog + '.json')))['nodes']:
        lid = f'L-{key}-{n[0]:03d}'
        if 'attempts' not in out.get(lid, {}): todo.append((lid, n[3]))
print('to fetch', len(todo), flush=True)
for i, (lid, ref) in enumerate(todo):
    url = f'https://data.pequalnp.com/data/lemma/{lid}.{ref}.json'
    for attempt in range(3):
        try:
            r = subprocess.run(['curl', '-sS', '-f', '-m', '30', url], capture_output=True, check=True)
            d = json.loads(r.stdout); break
        except Exception as e:
            d = None; time.sleep(3)
    if d:
        out[lid] = {k: d.get(k) for k in ('title', 'kind', 'status', 'layer', 'depends_on', 'used_by', 'proposed_at', 'status_at')}
        out[lid]['plain'] = (d.get('plain_statement') or '')[:400]
        out[lid]['outside'] = bool(d.get('contributor'))
        at = d.get('attempts') or []
        out[lid]['attempts'] = len(at)
        out[lid]['died'] = sum(1 for a in at if a.get('outcome') not in ('checked', 'refuted'))
        out[lid]['seats'] = len({a.get('by') for a in at})
        out[lid]['barrier'] = bool(d.get('barrier'))
        out[lid]['cited'] = bool((d.get('known') or {}).get('citation'))
        out[lid]['corrections'] = len(d.get('corrections') or [])
    if i % 50 == 0:
        json.dump(out, open(out_path, 'w')); print(i, lid, flush=True)
    time.sleep(0.45)
json.dump(out, open(out_path, 'w')); print('done', len(out), flush=True)
