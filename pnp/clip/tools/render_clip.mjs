// Render the tug-of-war clip to frames/NNNNN.jpg, one frame at a time in order
// (positions ease from frame to frame, so frames are rendered sequentially).
// The timeline, captions and words come from clip.json (tools/clip_text.py), timed to the voiceover.
// Usage: node tools/render_clip.mjs [--only=a,b,c]   (--only writes just those frame numbers, for checks)
import { createRequire } from 'node:module';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean).map(Number);
const TXT = JSON.parse(fs.readFileSync(path.join(ROOT, 'clip.json'), 'utf8'));
const N = Math.round(TXT.total * FPS);

// video seconds -> [record minutes, segment index]
function at(v) {
  const k = Math.max(0, TXT.segments.findIndex((s) => v >= s.v0 && v < s.v1));
  const s = TXT.segments[v >= TXT.segments.at(-1).v1 ? TXT.segments.length - 1 : k];
  const p = Math.min(1, Math.max(0, (v - s.v0) / (s.v1 - s.v0)));
  return [(s.h0 + (s.h1 - s.h0) * p) * 60, TXT.segments.indexOf(s)];
}
const SKELETON = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=1080"><style>:root{color-scheme:dark}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url.split('?')[0].replace(/^\/+/, '') || 'clip.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const b = fs.readFileSync(f);
  if (f.endsWith('.html')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(SKELETON(b.toString())); }
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(b);
}).listen(0);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`http://localhost:${srv.address().port}/clip.html`);
await page.waitForFunction(() => window.__clip, null, { timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
await page.evaluate((eb) => { const e = document.querySelector('#clipHdr .eb'); if (e) e.textContent = eb; }, TXT.eyebrow);
console.log('canvas height', await page.evaluate(() => window.__clip.height()), 'frames', N);
fs.mkdirSync(path.join(ROOT, 'frames'), { recursive: true });
const t0 = Date.now(); let lastSeg = -1;
const last = only.length ? Math.max(...only) : N - 1;
for (let f = 0; f <= last; f++) {
  const v = f / FPS, [T, seg] = at(v), snap = seg !== lastSeg && TXT.segments[seg].snap; lastSeg = seg;
  if (only.length && !only.includes(f)) { await page.evaluate(({ T, snap }) => window.__clip.setT(T, snap), { T, snap: snap || f === 0 }); continue; }
  const cap = TXT.captions.find(([a, b]) => v >= a && v < b);
  // the first caption is fully up on frame 0: that frame is the thumbnail
  const capAlpha = cap ? Math.min(cap[0] === 0 ? 1 : (v - cap[0]) / 0.3, (cap[1] - v) / 0.3, 1) : 0;
  const tag = (TXT.tags || []).find(([a, b]) => v >= a && v < b), panel = (TXT.panels || []).find(([a, b]) => v >= a && v < b);
  const tagAlpha = tag ? Math.min(tag[0] === 0 ? 1 : (v - tag[0]) / 0.3, (tag[1] - v) / 0.3, 1) : 0;
  const panelAlpha = panel ? Math.min((v - panel[0]) / 0.4, (panel[1] - v) / 0.4, 1) : 0;
  await page.evaluate(({ T, snap, cap, capAlpha, tag, tagAlpha, panel, panelAlpha, v, TXT }) => {
    const r = window.__clip.setT(T, snap), n = (x) => x.toLocaleString('en-US');
    const esc = (s) => s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
    document.getElementById('clipClock').innerHTML = `${esc(r.when)}<small>hour ${Math.floor(r.hour)} of ${TXT.hours}</small>`;
    document.getElementById('tEq').textContent = n(r.eq[0]); document.getElementById('tGrey').textContent = n(r.grey[0]); document.getElementById('tNeq').textContent = n(r.neq[0]);
    const p = document.getElementById('clipCapText'); p.textContent = cap || ''; p.style.opacity = String(Math.max(0, capAlpha));
    const tg = document.getElementById('clipTag'); tg.hidden = !tag; tg.textContent = tag || ''; tg.style.opacity = String(Math.max(0, tagAlpha));
    const pn = document.getElementById('clipPanel'); pn.hidden = !panel; pn.style.opacity = String(Math.max(0, panelAlpha));
    if (panel === 'markets') {
      const pc = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
      const row = (m) => { const d = m.then == null ? null : Math.round(m.now * 100) - Math.round(m.then * 100);
        const ch = d == null ? '' : d === 0 ? 'no change' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} from ${pc(m.then)}`;
        return `<div class="mk"><div class="q">${esc(m.source)}: “${esc(m.question)}”<small>${esc(m.money || '')}</small></div><div class="v">${pc(m.now)}<small>${esc(ch)}</small></div></div>`; };
      const truth = TXT.markets.filter((m) => m.kind === 'truth'), settled = TXT.markets.filter((m) => m.kind !== 'truth');
      pn.innerHTML = (truth.length ? `<h3>Chance that P = NP · since ${esc(TXT.since)}</h3>${truth.map(row).join('')}` : '')
        + (settled.length ? `<h3>Chance it gets settled, either way</h3>${settled.map(row).join('')}` : '');
    } else if (panel === 'posts') {
      pn.innerHTML = `<h3>Top posts on X</h3>` + TXT.posts.slice(0, 2).map((q) => `<div class="post"><b>${esc(q.name || q.handle)}</b><span>${esc(q.handle || '')}${q.metric ? ' · ' + esc(q.metric) : ''}</span><p>${esc(q.text)}</p></div>`).join('');
    }
    const card = document.getElementById('clipCard');
    if (v >= TXT.endStart) {
      card.hidden = false; card.style.opacity = String(Math.min(1, (v - TXT.endStart) / 0.6));
      card.innerHTML = `<div><h2>${esc(TXT.endTitle)}</h2>${TXT.endLines.map((l) => `<p>${esc(l)}</p>`).join('')}<div class="src">${esc(TXT.source)}</div></div>`;
    } else card.hidden = true;
  }, { T, snap: snap || f === 0, cap: cap?.[2], capAlpha, tag: tag?.[2], tagAlpha, panel: panel?.[2], panelAlpha, v, TXT });
  await page.screenshot({ path: path.join(ROOT, 'frames', `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
  if (f % 150 === 0) console.log(`frame ${f}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log('errors:', errs.length ? errs : 'none', 'done in', ((Date.now() - t0) / 1000).toFixed(0), 's');
await browser.close(); srv.close();
