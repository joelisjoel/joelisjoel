# v3 (the game) data: the tug-of-war data plus players (the fleet's orchestrators and outside
# contributors, by side) for the scoreboard. Usage: build_game_data.py <data dir> <tug data.json> <out>
import collections, json, os, sys
D, IN, OUT = sys.argv[1:4]
d = json.load(open(IN)); rows, P = d['rows'], d['programs']
key = [p['key'] for p in P]; pid = [p['id'] for p in P]
idOf = lambda i: f"L-{key[rows[i][0]]}-{rows[i][1]:03d}"
byId = {idOf(i): i for i in range(len(rows))}
aim = {'p_eq_np': -1, 'p_neq_np': 1, 'neutral': 0}
alg = pid.index('p_eq_np_search'); algP = P[alg]
side = []
for i, r in enumerate(rows):
    s = aim[P[r[0]]['aims_at']]; lid = idOf(i)
    if r[0] == alg: s = -1 if lid == algP['target'] or d['titles'].get(lid, '').lower().startswith('candidate') else 1
    elif lid in algP['chain']: s = 1
    side.append(s)
twins = {a for v, a in d['attacks'] if a >= 0 and side[v] != 0 and side[a] == side[v]}
seats = json.load(open(os.path.join(D, 'seats.json')))
aimOfProg = {p['id']: aim[p['aims_at']] for p in P}
fleet = {-1: [], 1: []}
for s in seats:
    a = aimOfProg.get(s['program'])
    if a in (-1, 1) and s['counts']['checked'] > 0:
        fleet[a].append({'name': s['id'], 'kind': 'fleet', 'program': s['program'], 'checked': s['counts']['checked'], 'refuted': s['counts']['refuted']})
outside = {-1: collections.Counter(), 1: collections.Counter()}
for cb in json.load(open(os.path.join(D, 'contributors.json')))['contributors']:
    for l in cb['lemmas']:
        i = byId.get(l['id'])
        if i is not None and i not in twins and side[i] in (-1, 1): outside[side[i]][cb['github']] += 1
players = {}
for s in (-1, 1):
    f = sorted(fleet[s], key=lambda x: -x['checked'])[:3]
    o = [{'name': g, 'kind': 'outside', 'checked': n} for g, n in outside[s].most_common(2)]
    players[str(s)] = f + o
d['players'] = players
d['poll'] = {'source': 'William Gasarch, "The Third P =? NP Poll", SIGACT News 50(1), March 2019',
             'url': 'https://www.cs.umd.edu/users/gasarch/papers/poll3.pdf', 'respondents': 124,
             'neq': 109, 'eq': 15, 'experts_neq_pct': 99, 'masses_neq_pct': 87}
json.dump(d, open(OUT, 'w'), separators=(',', ':'), ensure_ascii=False)
print('players', json.dumps(players)[:600]); print('bytes', os.path.getsize(OUT))
