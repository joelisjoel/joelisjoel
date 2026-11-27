# v1 data: v0's rows plus theme, birth time and grounding signals. Themes come from keyword rules over the site's search index.
import json, os, re, subprocess, sys
from datetime import datetime
D, OUT = sys.argv[1], sys.argv[2]
subprocess.run([sys.executable, '-I', os.path.join(os.path.dirname(__file__), 'build_viz_data.py'), D, OUT], check=True)
out = json.load(open(OUT))
tok = json.load(open(os.path.join(D, 'tokens.json')))
side = json.load(open(os.path.join(D, 'side_lemmas.json')))
head = json.load(open(os.path.join(D, 'head.json')))
t0 = datetime.fromisoformat(head['started_at'].replace('Z', '+00:00')).timestamp()
# Themes per program key, in priority order: a lemma takes the first theme whose words its text contains.
THEMES = {
  'meta': [('Finite planes', 'plane planes fano projective incidence incident heawood'), ('Petersen graph', 'petersen'),
           ('Cycles and crowns', 'cycle cycles crown crowns'), ('Covers and rectangles', 'cover rectangle rectangles biclique'),
           ('Other bipartite graphs', 'bipartite triangle triangles star path paths tree trees matching'), ('Symmetric functions', 'symmetric'), ('Truth tables and MCSP', 'table truth mcsp tables')],
  'gct': [('Permanent', 'permanent subpermanents perm'), ('Determinant', 'determinant determinantal border'),
          ('Matrix spaces', 'matrices dimension rank space spaces'), ('Polynomials', 'polynomials polynomial roots vanish vanishes')],
  'pcx': [('Pigeonhole', 'pigeonhole pigeons pigeon holes php'), ('Resolution', 'resolution res weakening resolvent clause clauses'),
          ('Equations and degree', 'equations equation calculus degree parities field'), ('CNF formulas', 'cnf formula formulas')],
  'clb': [('Threshold circuits', 'threshold majority inner weights'), ('SAT algorithms', 'sat satisfiability williams nexp'),
          ('Depth and AC0', 'ac0 depth parity')],
  'lib': [('Sanity checks', 'sanity'), ('Proof systems', 'resolution res cnf clause pigeonhole php'),
          ('Complexity classes', 'language oracle np time complete'), ('Graphs and planes', 'graph plane incidence cycle edge bipartite'),
          ('Circuit basics', 'circuit gate gates fan wire')],
  'alg': [('Candidate algorithms', 'sat polynomial refutation')],
}
P = out['programs']; keyOf = [p['key'] for p in P]
assign = {}
for pi, key in enumerate(keyOf):
    for ti, (name, words) in enumerate(THEMES[key]):
        for w in words.split():
            for n in tok.get(w, {}).get(key, []):
                assign.setdefault((pi, n), ti)
iso = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()
for r in out['rows']:
    pi, n = r[0], r[1]
    lid = f"L-{keyOf[pi]}-{n:03d}"
    s = side.get(lid, {})
    born = round((iso(s['proposed_at']) - t0) / 60) if s.get('proposed_at') else -1
    r += [assign.get((pi, n), len(THEMES[keyOf[pi]])), born, 1 if s.get('cited') else 0, s.get('corrections', 0)]
out['cols'] += ['theme', 'born', 'cited', 'corrections']
out['themes'] = {k: [{'name': nm, 'words': w.split()} for nm, w in v] + [{'name': 'Other', 'words': []}] for k, v in THEMES.items()}
json.dump(out, open(OUT, 'w'), separators=(',', ':'), ensure_ascii=False)
import collections
for pi, key in enumerate(keyOf):
    c = collections.Counter(r[14] for r in out['rows'] if r[0] == pi)
    print(key, [(out['themes'][key][t]['name'], c[t]) for t in sorted(c)])
print('bytes', os.path.getsize(OUT))
