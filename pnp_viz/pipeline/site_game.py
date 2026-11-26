# Make the game page for joelisjoel.org/pnp/: a full HTML document with only the site's own files
# (system fonts instead of Google Fonts), and a trimmed data.json (titles kept only for the two sides).
# Usage: site_game.py <pages/game.html> <game data.json> <out dir>
import json, os, re, sys
page, data, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
html = open(page, encoding='utf-8').read()
html = re.sub(r'<link rel="(preconnect|stylesheet)"[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\n?', '', html)
html = html.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
title = re.search(r'<title>(.*?)</title>', html).group(1)
html = re.sub(r'<title>.*?</title>\n?', '', html, count=1)
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        f'<title>{title} · Joel is Joel</title>\n'
        '<meta name="description" content="An AI agent fleet is attacking P vs NP in public. Its record, as a football game: truth zones, open lemmas, kills and the claim as the ball.">\n'
        '<meta name="theme-color" content="#090c0b">\n'
        '<style>:root{padding-top:env(safe-area-inset-top,0px)}body{margin:0}[hidden]{display:none!important}</style>\n'
        '</head>\n<body>\n')
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(head + html + '\n</body>\n</html>\n')
d = json.load(open(data))
keys = [p['key'] for p in d['programs']]
aim = {p['key']: p['aims_at'] for p in d['programs']}
plan = {i for p in d['programs'] for i in [*p.get('chain', []), p.get('hard'), p.get('target')] if i}
d['titles'] = {k: v for k, v in d['titles'].items() if aim.get(k.split('-')[1]) != 'neutral' or k in plan}
d.pop('plain', None)
json.dump(d, open(os.path.join(out, 'data.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
print('wrote', out, os.path.getsize(os.path.join(out, 'index.html')), os.path.getsize(os.path.join(out, 'data.json')))
