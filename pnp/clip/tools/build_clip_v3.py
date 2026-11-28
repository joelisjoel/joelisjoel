"""Build a 16:9 clip.html (1920x1080) from the v3 game page (pages/game.html, live at joelisjoel.org/pnp):
the same drawing code with only the field showing (stands, truth zones, ropes, knot, lasers, target lines),
and overlays for the title, clock, tallies, captions, the date tag, a markets or X-posts panel and the end card.
The knot moves only on a proof, as on the page; the page's toy odds draw nothing here.
The field is drawn at half size and scaled up 2x, so labels, dots and lasers read on a phone held landscape.
Usage: python3 tools/build_clip_v3.py <game.html> <out clip.html>
"""
import sys

src, out = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()

def sub(old, new, count=1):
    global s
    if s.count(old) != count:
        sys.exit(f"pattern found {s.count(old)} times, expected {count}: {old[:70]}")
    s = s.replace(old, new)

HDR, CAP, FIELD_H, SC = 156, 156, 768, 2      # header, caption band, field height (px in the frame), field scale

# the field: a fixed 1920 x FIELD_H box, drawn at 1/SC size and scaled up (every label, dot and laser SC times larger)
sub("const TZ = 'America/Los_Angeles',", f"const CLIP = {{ w: 1920, h: {FIELD_H}, sc: {SC} }}, TZ = 'America/Los_Angeles',")
sub("const W = stage.clientWidth, portrait = false, small = W < 600;", "const W = CLIP.w / CLIP.sc, portrait = false, small = false;")
sub("const H = small ? Math.round(Math.max(380, Math.min(560, W * 1.2))) : Math.round(Math.max(480, Math.min(640, W * 0.56)));",
    "const H = CLIP.h / CLIP.sc;")
sub("const dpr = window.devicePixelRatio || 1;", "const dpr = (window.devicePixelRatio || 1) * CLIP.sc;")
sub("canvas.style.height = `${H}px`;", "canvas.style.width = `${CLIP.w}px`; canvas.style.height = `${CLIP.h}px`;")

# labels a little larger again for a phone screen (on top of the 2x)
sub("'500 9.5px \"IBM Plex Mono\", ui-monospace, monospace', c.muted", "'500 11.5px \"IBM Plex Mono\", ui-monospace, monospace', c.muted")   # likelier true
sub("`600 ${geo.small ? 8.5 : 10}px \"IBM Plex Mono\"", "`600 10px \"IBM Plex Mono\"")                                                # truth zone (fills its zone)
sub("`600 ${geo.small ? 9.5 : 10.5}px \"Inter\"", "`600 12.5px \"Inter\"")                                                             # rope names
# what each target line is missing: the page's short phone wording, drawn over the lemmas and lasers so it stays readable
sub("const [bx, by] = toXY(ballU, 0.5);\n", "const [bx, by] = toXY(ballU, 0.5), later = [];\n")
sub("label(proves ? '≡ P = NP' : (geo.small ? GAPSHORT : GAPTXT)[id], mx, my, `600 ${geo.small ? 9 : 10.5}px \"Inter\", system-ui, sans-serif`, colr, 'center');",
    "later.push([proves ? '≡ P = NP' : GAPSHORT[id], mx, my, colr]);")
sub("    // the knot: the claim, tied into every rope\n",
    "    for (const [txt, x, y, colr] of later) label(txt, x, y, '600 12px \"Inter\", system-ui, sans-serif', colr, 'center');\n    // the knot: the claim, tied into every rope\n")
# "No checked evidence for P = NP" sits just below the P = NP rope instead of on it
sub("{ const [x, y] = toXY(-0.55, 0.5), f =", "{ const [x, y] = toXY(-0.55, 0.62), f =")
# rope names drawn after the ropes, so a thin row's rope doesn't strike through its name
ropes = next(l for l in s.split("\n") if "label(cl.name," in l) + "\n"
sub(ropes, "")
sub("    // links\n", ropes + "    // links\n")
# kills in the stands: a ring that reads at phone size (the page draws it 2-7 px, 1 px thick)
sub("ctx.globalAlpha = 0.6 * k; ctx.strokeStyle = c.nl; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X[at.v], Y[at.v], 2 + 5 * (1 - k), 0, 7);",
    "ctx.globalAlpha = 0.85 * k; ctx.strokeStyle = c.nl; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(X[at.v], Y[at.v], 2.5 + 7 * (1 - k), 0, 7);")
sub("label('target', X[i] + radius(i) + 5, Y[i] - (portrait ? 9 : 0), '600 10px \"Inter\"",
    "label('target', X[i] + radius(i) + 5, Y[i] - (portrait ? 9 : 0), '600 12px \"Inter\"")
sub("label('the claim', bx, by + 23, '600 11px \"Inter\"", "label('the claim', bx, by + 24, '600 12.5px \"Inter\"")

# the knot: the page moves it only when a proof settles the claim; no odds model touches it
if s.count("ballU =") != 2 or "odds(" in s.split("ballU = ag")[1].split(";")[0]:
    sys.exit("the knot's rule changed on the page: check it before building the clip")

# a hook for the renderer: set the record minute, draw, and return the clock and the tallies
sub("    if (document.fonts) document.fonts.ready.then(() => draw());\n  }",
    "    if (document.fonts) document.fonts.ready.then(() => draw());\n"
    "    window.__clip = { maxMin, height: () => geo.H * CLIP.sc, setT(t, snap) {\n"
    "      T = Math.max(0, Math.min(maxMin, t)); update(!!snap, 1 / 30); draw();\n"
    "      // tallies, as drawn: checked in each truth zone, open in the grey field, everything in the stands (neutral lemmas and snipers)\n"
    "      const c = { eq: 0, grey: 0, stands: 0, neq: 0 };\n"
    "      for (let i = 0; i < N; i++) { if (!visible[i]) continue; const st = statusAt(i, T);\n"
    "        if (side[i] === 0 || sniper[i]) c.stands++; else if (st === 0) { if (side[i] < 0) c.eq++; else c.neq++; } else if (st === 1 || st === 2) c.grey++; }\n"
    "      return { when: `${whenPT(t0 + T * 60000)} PT`, hour: T / 60, eq: [c.eq], grey: [c.grey], stands: [c.stands], neq: [c.neq], knot: ballU };\n"
    "    } };\n  }")

overlay = f"""
<style>
html, body {{ width: 1920px; height: 1080px; margin: 0; overflow: hidden; background: var(--bg); }}
.wrap {{ max-width: none; margin: 0; padding: 0 !important; gap: 0; display: block; }}
.wrap > *:not(.stage) {{ display: none !important; }}
.stage {{ position: absolute; left: 0; top: {HDR}px; width: 1920px; }}
canvas {{ border-radius: 0; cursor: default; }}
#clipHdr {{ position: absolute; left: 0; top: 0; width: 1920px; height: {HDR}px; padding: 16px 44px 0; display: grid; gap: 4px; align-content: start; z-index: 3; }}
#clipHdr .eb {{ font: 500 19px/1.2 var(--f-mono); letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }}
#clipHdr .row {{ display: flex; justify-content: space-between; align-items: center; gap: 24px; }}
#clipHdr h1 {{ font: 800 64px/0.95 var(--f-display); margin: 0; letter-spacing: 0.01em; }}
#clipHdr .clock {{ text-align: right; font: 600 30px/1.1 var(--f-mono); font-variant-numeric: tabular-nums; }}
#clipHdr .clock small {{ display: block; font: 500 20px/1.3 var(--f-mono); color: var(--muted); }}
#clipHdr .tal {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-items: baseline; font: 600 24px/1.2 var(--f-display); letter-spacing: 0.03em; white-space: nowrap; }}
#clipHdr .tal span:nth-child(2), #clipHdr .tal span:nth-child(3) {{ text-align: center; color: var(--muted); }}
#clipHdr .tal span:nth-child(4) {{ text-align: right; }}
#clipHdr .tal b {{ font-size: 34px; font-variant-numeric: tabular-nums; color: var(--fg); }}
#clipHdr .tal .eq b {{ color: var(--eq); }} #clipHdr .tal .neq b {{ color: var(--neq); }}
#clipCap {{ position: absolute; left: 0; bottom: 0; width: 1920px; height: {CAP}px; display: grid; place-items: center; padding: 0 110px; z-index: 3; background: var(--bg); }}
#clipCap p {{ margin: 0; max-width: 1700px; font: 600 40px/1.22 var(--f-body); text-align: center; text-wrap: balance; }}
#clipTag {{ position: absolute; left: 50%; bottom: {CAP + 12}px; transform: translateX(-50%); z-index: 3; white-space: nowrap;
  font: 700 27px/1 var(--f-mono); letter-spacing: 0.06em; text-transform: uppercase; color: #0b0f0e; background: var(--hot);
  padding: 11px 22px 10px; border-radius: 999px; box-shadow: 0 0 0 4px var(--bg); }}
#clipPanel {{ position: absolute; left: 50%; top: {HDR + FIELD_H // 2}px; transform: translate(-50%, -50%); width: 1300px; z-index: 3;
  padding: 36px 46px 26px; border-radius: 20px; background: rgba(9, 12, 11, 0.94); border: 1px solid var(--rule); }}
#clipPanel h3 {{ font: 700 24px/1.2 var(--f-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin: 0 0 16px; }}
#clipPanel .mk {{ display: grid; grid-template-columns: 1fr auto; gap: 4px 28px; align-items: baseline; margin: 0 0 24px; }}
#clipPanel .mk .q {{ font: 600 36px/1.25 var(--f-body); }}
#clipPanel .mk .q small {{ display: block; font: 500 22px/1.4 var(--f-mono); color: var(--muted); }}
#clipPanel .mk .v {{ font: 800 62px/1 var(--f-display); font-variant-numeric: tabular-nums; text-align: right; }}
#clipPanel .mk .v small {{ display: block; font: 600 23px/1.3 var(--f-mono); color: var(--muted); }}
#clipPanel .post {{ margin: 0 0 26px; }}
#clipPanel .post b {{ font: 700 31px/1.3 var(--f-body); }}
#clipPanel .post span {{ font: 500 23px/1.3 var(--f-mono); color: var(--muted); margin-left: 12px; }}
#clipPanel .post p {{ font: 500 34px/1.35 var(--f-body); margin: 8px 0 0; }}
#clipCard {{ position: absolute; inset: 0; z-index: 4; display: grid; place-items: center; text-align: center; padding: 0 200px; background: rgba(9, 12, 11, 0.86); }}
#clipCard h2 {{ font: 800 104px/1 var(--f-display); margin: 0 0 30px; text-wrap: balance; }}
#clipCard p {{ font: 500 44px/1.35 var(--f-body); margin: 0 0 20px; color: var(--fg); text-wrap: balance; }}
#clipCard .src {{ font: 500 24px/1.4 var(--f-mono); color: var(--muted); margin-top: 26px; }}
</style>
<div id="clipHdr">
  <div class="eb">An AI agent fleet is attacking P vs NP in public · pequalnp.com record</div>
  <div class="row"><h1><span style="color:var(--eq)">P = NP</span> vs <span style="color:var(--neq)">P ≠ NP</span></h1><div class="clock" id="clipClock"></div></div>
  <div class="tal"><span class="eq" style="color:var(--eq)">◀ checked toward P = NP <b id="tEq">0</b></span><span>open in the grey field <b id="tGrey">0</b></span><span>in the stands <b id="tStands">0</b></span><span class="neq" style="color:var(--neq)"><b id="tNeq">0</b> checked toward P ≠ NP ▶</span></div>
</div>
<div id="clipCap"><p id="clipCapText"></p></div>
<div id="clipTag" hidden></div>
<div id="clipPanel" hidden></div>
<div id="clipCard" hidden></div>
"""
sub('<div class="wrap">', overlay + '\n<div class="wrap">')
open(out, "w", encoding="utf-8").write(s)
print("wrote", out, len(s))
