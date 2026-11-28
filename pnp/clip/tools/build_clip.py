"""Build clip.html from the published tug-of-war page: same drawing code, no controls,
the knot fixed at midfield (the toy model stays on the page, not in a public clip),
larger labels, and overlays for the title, clock, tallies and captions.
Usage: python3 tools/build_clip.py <pnp-tug.html> <out clip.html>
"""
import sys

src, out = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()

def sub(old, new, count=1):
    global s
    if s.count(old) < count:
        sys.exit(f"pattern not found: {old[:70]}")
    s = s.replace(old, new)

# the knot stays at midfield: nothing has reached the claim
sub("kx = cx + (conf - 0.5) * 2 * B * half * 0.75", "kx = cx")
# shorter ropes so the field fits a square frame
sub("Math.max(/chain|kill/i.test(l.name) ? 50 : 38, 16 + 6.4 * Math.sqrt(l.members.length))",
    "Math.max(/chain|kill/i.test(l.name) ? 44 : 33, 12 + 5.7 * Math.sqrt(l.members.length))")
sub("Y[i] = l.y0 + 19 + hash(r[0], r[1], 2) * (l.y1 - l.y0 - 26)", "Y[i] = l.y0 + 15 + hash(r[0], r[1], 2) * (l.y1 - l.y0 - 19)")
# bigger labels for a phone screen
s = s.replace("'500 10.5px \"IBM Plex Mono\", ui-monospace, monospace', c.muted", "'500 13px \"IBM Plex Mono\", ui-monospace, monospace', c.muted")
s = s.replace("'500 9.5px \"IBM Plex Mono\", ui-monospace, monospace', c.muted", "'500 11.5px \"IBM Plex Mono\", ui-monospace, monospace', c.muted")
sub("label('every rope ties into the claim at midfield', cx, ry,", "label('', cx, ry,")
sub("const W = stage.clientWidth, top = 64, bottom = 26;", "const W = stage.clientWidth, top = 18, bottom = 8;")
sub("const ry = 30;", "const ry = -40;")
sub("'700 22px \"Big Shoulders Display\"", "'700 30px \"Big Shoulders Display\"")
# kills in the grey middle come by the thousand late on: thin brief flashes there, glowing lasers only on the two sides
# (the published page has carried this fix since Nov 26; older copies get it here)
if "GREY_FLASH" not in s:
    sub("const dt = T - at.t; if (dt < 0 || dt > LASER || T >= maxMin) continue;",
        "const dt = T - at.t, lim = side[at.v] === 0 ? GREY_FLASH : LASER; if (dt < 0 || dt > lim || T >= maxMin) continue;")
    sub("laser(sx, sy, X[at.v], Y[at.v], col, side[at.v] === 0 ? k * 0.5 : k);",
        "if (side[at.v] === 0) { ctx.globalAlpha = 0.4 * (1 - dt / GREY_FLASH); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(X[at.v], Y[at.v]); ctx.stroke(); ctx.globalAlpha = 1; } else laser(sx, sy, X[at.v], Y[at.v], col, k);")
    sub("const TZ = 'America/Los_Angeles',", "const GREY_FLASH = 30, TZ = 'America/Los_Angeles',")
# a hook for the renderer
sub("    if (document.fonts) document.fonts.ready.then(() => draw());\n  }",
    "    if (document.fonts) document.fonts.ready.then(() => draw());\n"
    "    window.__clip = { maxMin, height: () => geo.H, setT(t, snap) { T = Math.max(0, Math.min(maxMin, t)); frameUpdate(!!snap, 1 / 30); draw();"
    " const c = counts(); return { when: whenPT(t0 + T * 60000), hour: T / 60, eq: c[-1], grey: c[0], neq: c[1] }; } };\n  }")

overlay = """
<style>
html, body { width: 1080px; height: 1080px; overflow: hidden; background: var(--bg); }
.wrap { max-width: none; padding: 0 !important; gap: 0; display: block; }
.wrap > *:not(.scroll) { display: none !important; }
.scroll { position: absolute; left: 0; top: 168px; width: 1080px; border: 0; border-radius: 0; overflow: hidden; }
.stage { min-width: 0; width: 1080px; }
#clipHdr { position: absolute; left: 0; top: 0; width: 1080px; height: 168px; padding: 22px 30px 0; display: grid; gap: 8px; z-index: 3; }
#clipHdr .eb { font: 500 15px/1.2 var(--f-mono); letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); }
#clipHdr .row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
#clipHdr h1 { font: 800 50px/0.95 var(--f-display); margin: 0; }
#clipHdr .clock { text-align: right; font: 600 22px/1.15 var(--f-mono); font-variant-numeric: tabular-nums; }
#clipHdr .clock small { display: block; font: 500 15px/1.3 var(--f-mono); color: var(--muted); }
#clipHdr .tal { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; font: 600 19px/1.2 var(--f-display); letter-spacing: 0.03em; }
#clipHdr .tal span:nth-child(2) { text-align: center; color: var(--muted); }
#clipHdr .tal span:nth-child(3) { text-align: right; }
#clipHdr .tal b { font-size: 28px; font-variant-numeric: tabular-nums; }
#clipCap { position: absolute; left: 0; bottom: 0; width: 1080px; height: 128px; display: grid; place-items: center; padding: 0 60px; z-index: 3;
  background: linear-gradient(to top, rgba(9, 12, 11, 0.96) 62%, rgba(9, 12, 11, 0)); }
#clipCap p { margin: 0; font: 600 30px/1.25 var(--f-body); text-align: center; text-wrap: balance; transition: none; }
#clipCard { position: absolute; inset: 0; z-index: 4; display: grid; place-items: center; text-align: center; padding: 0 90px; background: rgba(9, 12, 11, 0.86); }
#clipCard h2 { font: 800 74px/1 var(--f-display); margin: 0 0 22px; text-wrap: balance; }
#clipCard p { font: 500 31px/1.35 var(--f-body); margin: 0 0 16px; color: var(--fg); text-wrap: balance; }
#clipCard .src { font: 500 17px/1.4 var(--f-mono); color: var(--muted); margin-top: 18px; }
#clipTag { position: absolute; left: 50%; bottom: 132px; transform: translateX(-50%); z-index: 3; white-space: nowrap;
  font: 700 21px/1 var(--f-mono); letter-spacing: 0.06em; text-transform: uppercase; color: #0b0f0e; background: var(--hot);
  padding: 9px 16px 8px; border-radius: 999px; }
#clipPanel { position: absolute; left: 70px; right: 70px; top: 250px; z-index: 3; padding: 30px 36px 26px; border-radius: 16px;
  background: rgba(9, 12, 11, 0.93); border: 1px solid var(--rule); }
#clipPanel h3 { font: 700 19px/1.2 var(--f-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin: 0 0 14px; }
#clipPanel h3 + .mk { margin-top: 0; }
#clipPanel .mk { display: grid; grid-template-columns: 1fr auto; gap: 4px 20px; align-items: baseline; margin: 0 0 18px; }
#clipPanel .mk .q { font: 600 27px/1.25 var(--f-body); }
#clipPanel .mk .q small { display: block; font: 500 17px/1.4 var(--f-mono); color: var(--muted); }
#clipPanel .mk .v { font: 800 46px/1 var(--f-display); font-variant-numeric: tabular-nums; text-align: right; }
#clipPanel .mk .v small { display: block; font: 600 18px/1.3 var(--f-mono); color: var(--muted); }
#clipPanel .post { margin: 0 0 22px; }
#clipPanel .post b { font: 700 24px/1.3 var(--f-body); }
#clipPanel .post span { font: 500 18px/1.3 var(--f-mono); color: var(--muted); margin-left: 10px; }
#clipPanel .post p { font: 500 27px/1.35 var(--f-body); margin: 6px 0 0; }
</style>
<div id="clipHdr">
  <div class="eb">An AI agent fleet is attacking P vs NP in public · pequalnp.com record</div>
  <div class="row"><h1><span style="color:var(--eq)">P = NP</span> vs <span style="color:var(--neq)">P ≠ NP</span></h1><div class="clock" id="clipClock"></div></div>
  <div class="tal"><span style="color:var(--eq)">◀ toward P = NP <b id="tEq">0</b></span><span>grey middle <b id="tGrey">0</b></span><span style="color:var(--neq)"><b id="tNeq">0</b> toward P ≠ NP ▶</span></div>
</div>
<div id="clipCap"><p id="clipCapText"></p></div>
<div id="clipTag" hidden></div>
<div id="clipPanel" hidden></div>
<div id="clipCard" hidden></div>
"""
s = s.replace("<div class=\"wrap\">", overlay + "\n<div class=\"wrap\">", 1)
open(out, "w", encoding="utf-8").write(s)
print("wrote", out, len(s))
