#!/usr/bin/env bash
# Refresh the pequalnp.com record and rebuild the three pages' data files.
# Usage: pipeline/update.sh <data dir>   (keeps the previous head.json as head_prev.json)
# Gentle on the site: one request at a time with a pause. Run the fetches only against data.pequalnp.com.
set -euo pipefail
D=${1:?data dir}; HERE=$(cd "$(dirname "$0")" && pwd); BASE=https://data.pequalnp.com
mkdir -p "$D"/{prog,prev,search,ref}; cd "$D"
get() { curl -sS -f -m 60 -o "$1" "$BASE/$2"; sleep 0.3; }
[ -f head.json ] && cp head.json head_prev.json
get head.json head.json
file() { python3 -I -c "import json,sys;print(json.load(open('head.json'))['files'][sys.argv[1]])" "$1"; }
for k in map plan news papers contributors search; do get $k.json "$(file $k)"; done
[ -n "$(ls prog/*.json 2>/dev/null)" ] && cp prog/*.json prev/
for id in $(python3 -I -c "import json;print(' '.join(p['id'] for p in json.load(open('map.json'))['programs']))"); do
  get prog/$id.json "$(python3 -I -c "import json,sys;print([p['file'] for p in json.load(open('map.json'))['programs'] if p['id']==sys.argv[1]][0])" $id)"; done
python3 -I -c "import json;[print(k,v) for k,v in json.load(open('search.json'))['shards'].items()]" > search/list.txt
while read -r k f || [ -n "$k" ]; do get search/$k.json "$f"; done < search/list.txt
python3 -I -c "
import json,glob
tok={}
for f in glob.glob('search/*.json'):
    for t,v in json.load(open(f)).items():
        if isinstance(v,dict): tok[t]=v
json.dump(tok,open('tokens.json','w'))"
# side lemmas whose record changed are fetched again; refuted ones also get their record for the killer
python3 -I - <<'PY'
import json, os
side = json.load(open('side_lemmas.json')) if os.path.exists('side_lemmas.json') else {}
todo = []
for pid, key in [('gct','gct'),('circuit_lower_bounds','clb'),('proof_complexity','pcx'),('p_eq_np_search','alg'),('library','lib')]:
    old = {n[0]: n for n in json.load(open(f'prev/{pid}.json'))['nodes']} if os.path.exists(f'prev/{pid}.json') else {}
    for n in json.load(open(f'prog/{pid}.json'))['nodes']:
        lid, o = f'L-{key}-{n[0]:03d}', old.get(n[0])
        if not o or o[3] != n[3]:
            side.pop(lid, None)
            if n[1] in 'rb' and not os.path.exists(f'ref/{lid}.json'): todo.append(f'{lid} {n[3]}')
json.dump(side, open('side_lemmas.json', 'w'))
open('ref/todo.txt', 'w').write('\n'.join(todo) + '\n')
PY
while read -r id ref || [ -n "$id" ]; do [ -n "$id" ] && get ref/$id.json data/lemma/$id.$ref.json; done < ref/todo.txt
python3 -I "$HERE/fetch_side.py" "$D" | tail -1
mkdir -p out/field out/roots out/tug
python3 -I "$HERE/build_viz_data.py" "$D" out/field/data.json
python3 -I "$HERE/build_roots_data.py" "$D" out/roots/data.json | tail -1
python3 -I "$HERE/build_tug_data.py" "$D" out/roots/data.json out/tug/data.json
mkdir -p out/game
python3 -I "$HERE/build_game_data.py" "$D" out/tug/data.json out/game/data.json
echo "data files in $D/out/{field,roots,tug,game}/data.json"
