# Prediction markets on P vs NP, for the timeline: Manifold "Does P = NP?" (whether it is true, play money),
# Polymarket "Will AI solve P versus NP in 2026?" and Kalshi "resolved before 2030?" (whether it gets settled).
# Writes <data dir>/markets.json with each market's price history over the record (hourly) and its price now.
# Usage: fetch_markets.py <data dir>      (needs api.manifold.markets, gamma-api.polymarket.com,
#                                          clob.polymarket.com and api.elections.kalshi.com reachable)
import json, os, subprocess, sys, time
from datetime import datetime
D = sys.argv[1]
head = json.load(open(os.path.join(D, 'head.json')))
iso = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()
t0, t1 = iso(head['started_at']), iso(head['generated_at'])
get = lambda url: json.loads(subprocess.run(['curl', '-sS', '-f', '-m', '30', url], capture_output=True, check=True).stdout)
mins = lambda ts: round((ts - t0) / 60)
def clip(points):  # keep the record window, plus the last price before it as the starting value
    before = [p for p in points if p[0] < 0]; inside = [p for p in points if 0 <= p[0] <= mins(t1)]
    return ([[0, before[-1][1]]] if before else []) + inside
out = {'asof': head['generated_at'], 'series': []}
start = int(t0) - 7 * 86400
try:
    m = get('https://api.manifold.markets/v0/slug/does-p-np')
    bets = get(f"https://api.manifold.markets/v0/bets?contractId={m['id']}&limit=1000")
    pts = sorted([mins(b['createdTime'] / 1000), b['probAfter']] for b in bets if 'probAfter' in b)
    out['series'].append({'id': 'manifold', 'source': 'Manifold', 'question': 'Does P = NP?', 'kind': 'truth', 'money': 'play money',
                          'url': m['url'], 'now': m['probability'], 'points': clip(pts)})
except Exception as e: print('manifold failed:', e)
try:
    ev = get('https://gamma-api.polymarket.com/events?slug=which-math-problems-will-ai-solve-in-2026')[0]
    mk = [x for x in ev['markets'] if 'P versus NP' in x['question']][0]
    tok = json.loads(mk['clobTokenIds'])[0]
    hist = get(f'https://clob.polymarket.com/prices-history?market={tok}&startTs={start}&endTs={int(t1)}&fidelity=60')['history']
    out['series'].append({'id': 'polymarket', 'source': 'Polymarket', 'question': mk['question'], 'kind': 'settled', 'money': f"${float(mk['volume']):,.0f} traded",
                          'url': f"https://polymarket.com/event/{ev['slug']}", 'now': float(json.loads(mk['outcomePrices'])[0]),
                          'points': clip([[mins(h['t']), h['p']] for h in hist])})
except Exception as e: print('polymarket failed:', e)
try:
    tk = 'KXPNP-32-30JAN01'
    mk = get(f'https://api.elections.kalshi.com/trade-api/v2/markets/{tk}')['market']
    cs = get(f'https://api.elections.kalshi.com/trade-api/v2/series/KXPNP/markets/{tk}/candlesticks?start_ts={start}&end_ts={int(t1)}&period_interval=60')['candlesticks']
    pts = []
    for c in cs:
        pr = c.get('price') or {}
        v = pr.get('close_dollars') or pr.get('close') or pr.get('previous_dollars')
        if v is not None: pts.append([mins(c['end_period_ts']), float(v) if float(v) <= 1 else float(v) / 100])
    out['series'].append({'id': 'kalshi', 'source': 'Kalshi', 'question': mk.get('title', 'Will P vs NP be resolved before 2030?'), 'kind': 'settled',
                          'money': f"${float(mk.get('volume_fp') or 0):,.0f} traded", 'url': 'https://kalshi.com/markets/kxpnp/p-vs-np-resolution',
                          'now': float(mk.get('last_price_dollars') or 0), 'points': clip(sorted(pts))})
except Exception as e: print('kalshi failed:', e)
json.dump(out, open(os.path.join(D, 'markets.json'), 'w'))
for s in out['series']: print(s['source'], '|', s['question'], '| now', round(s['now'], 3), '|', len(s['points']), 'points', s['points'][:1], s['points'][-1:])
