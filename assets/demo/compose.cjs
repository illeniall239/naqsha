#!/usr/bin/env node
// naqsha demo composer: turns a demo's storyboard (plan.js scenes, each with a `make` block)
// into a HyperFrames composition, using a tested look, so a video renders right the first
// time instead of by trial and error. Every lesson from real renders is built in: videos
// with ids and their own timing, layers at the video's natural size, events scaled, no
// element shown before its entrance, captions given their reading time.
//
//   node compose.cjs --env                          check the tools: Node 22+, FFmpeg, ffprobe
//   node compose.cjs <demo> --check                 validate everything, write nothing
//   node compose.cjs <demo> --sample <template> [--entrance mask|snap|cut]
//                                                   a 10 to 15 s template clip, into index.html
//                                                   (a copy kept in <demo>/samples/)
//   node compose.cjs <demo>                         the full film, into index.html
//
// <demo> is the demo folder (plan.js, capture/, fonts/, video/). The HyperFrames project is
// <demo>/video, created once with `npx hyperframes init video --example blank ...`.
'use strict';

const fs = require('fs');
const path = require('path');

const TEMPLATES = {
  // Near-black, heavy uppercase type, one electric accent.
  signal: { bg: '#0d0d0f', ink: '#f4f4f2', dim: '#8e8e95', accent: '#4d7cff', panel: '#141418', line: '#26262b', frame: '#fbfbfa', upper: true, weight: 800, track: '-0.05em', entrance: 'mask', ease: 'power4.out', glow: true },
  // Off-white paper, serif display, calm.
  paper: { bg: '#f6f4ef', ink: '#1b1b19', dim: '#6b6a64', accent: '#2f5bd3', panel: '#ffffff', line: '#e3e0d8', frame: '#ffffff', upper: false, weight: 600, track: '-0.02em', entrance: 'mask', ease: 'expo.out', glow: false },
  // Navy blueprint grid, a line that draws itself.
  blueprint: { bg: '#0b1730', ink: '#e8f0ff', dim: '#8fa6cf', accent: '#6fb1ff', panel: '#0f1f3d', line: '#1d335c', frame: '#fbfbfa', upper: false, weight: 650, track: '-0.03em', entrance: 'mask', ease: 'power3.out', glow: false, grid: true },
};
const ENTRANCES = ['mask', 'snap', 'cut'];
const TYPES = ['title', 'statement', 'terminal', 'recording', 'end'];
const words = s => String(s || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
const readTime = s => Math.max(2, 0.5 + 0.3 * words(s));
const esc = s => String(s ?? '').replace(/&(?!amp;|lt;|gt;|quot;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Only <em> survives in text: it marks the accent.
const rich = s => esc(s).replace(/&lt;em&gt;/g, '<em>').replace(/&lt;\/em&gt;/g, '</em>');

function readPlan(file) {
  const m = /^\s*window\.NAQSHA\s*=\s*([\s\S]*?)\s*;?\s*$/.exec(fs.readFileSync(file, 'utf8'));
  if (!m) throw new Error(`${file} isn't window.NAQSHA = {...};`);
  return JSON.parse(m[1]);
}

// ---- validation: every problem at once, before anything is written ----------

function validate(demo, plan, template, entranceOverride) {
  const problems = [];
  const look = plan.look || {};
  const t = template || look.template;
  if (!TEMPLATES[t]) problems.push(`look.template must be one of ${Object.keys(TEMPLATES).join(', ')} (got "${t}")`);
  const entrance = entranceOverride || look.entrance || (TEMPLATES[t] || {}).entrance;
  if (!ENTRANCES.includes(entrance)) problems.push(`look.entrance must be one of ${ENTRANCES.join(', ')}`);
  const fonts = fontsFor(look, t);
  for (const role of ['display', 'mono']) {
    const f = fonts[role];
    if (!f || !f.family || !f.file) problems.push(`look.fonts.${role} needs { family, file }${t === 'paper' && role === 'display' ? ' (paper wants a serif display face)' : ''}`);
    else if (!fs.existsSync(path.join(demo, f.file))) problems.push(`font file missing: ${f.file} (download it into the demo folder first)`);
  }
  if (!fs.existsSync(path.join(demo, 'video', 'hyperframes.json'))) problems.push('no HyperFrames project at video/ (run: npx hyperframes init video --example blank --non-interactive --resolution landscape)');
  const scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  if (!scenes.length) problems.push('no scenes');
  const recs = {};
  for (const sc of scenes) {
    const m = sc.make || {};
    const where = `${sc.id || '(no id)'}`;
    if (!TYPES.includes(m.type)) { problems.push(`${where}: make.type must be one of ${TYPES.join(', ')}`); continue; }
    if (m.type === 'title' && !(Array.isArray(m.lines) && m.lines.length)) problems.push(`${where}: a title needs make.lines`);
    if (m.type === 'statement' && !(Array.isArray(m.lines) && m.lines.length)) problems.push(`${where}: a statement needs make.lines`);
    if (m.type === 'terminal' && !m.command) problems.push(`${where}: a terminal needs make.command`);
    if (m.type === 'end' && !m.name) problems.push(`${where}: an end card needs make.name`);
    if (m.type === 'recording') {
      const dir = path.join(demo, 'capture', m.rec || '');
      const ev = path.join(dir, 'events.json');
      if (!m.rec || !fs.existsSync(ev) || !fs.existsSync(path.join(dir, 'recording.webm'))) {
        problems.push(`${where}: no recording at capture/${m.rec}/ (rehearse and record the shot first)`);
      } else {
        const log = JSON.parse(fs.readFileSync(ev, 'utf8'));
        recs[m.rec] = log;
        const len = log.duration / 1000;
        for (const [a, b] of m.segments || []) {
          if (!(a >= 0 && b > a && b <= len + 0.05)) problems.push(`${where}: segment [${a}, ${b}] is outside the recording (0 to ${len.toFixed(2)} s)`);
        }
        if (!(m.segments || []).length) problems.push(`${where}: a recording needs make.segments, e.g. [[1.5, 9.3]] (seconds of the recording)`);
      }
      if (!(Array.isArray(m.caption) && m.caption.length)) problems.push(`${where}: a recording needs make.caption (one or two lines)`);
    }
    const secs = sceneSeconds(sc);
    const text = sc.caption || [].concat(m.lines || [], m.caption || []).join(' ');
    if (text && readTime(text) > secs + 0.05) problems.push(`${where}: its text needs ${readTime(text).toFixed(1)} s to read (0.5 s + 0.3 s a word) but the scene is ${secs.toFixed(1)} s`);
  }
  return { problems, recs, fonts, template: t, entrance };
}

function fontsFor(look, t) {
  const base = look.fonts || {};
  const per = (look.templates && look.templates[t] && look.templates[t].fonts) || {};
  return { ...base, ...per };
}

function sceneSeconds(sc) {
  const m = sc.make || {};
  if (m.type === 'recording') return (m.segments || []).reduce((a, [x, y]) => a + (y - x), 0);
  return Number(sc.seconds) || 0;
}

// ---- the sample: title, one recorded moment, the end card ------------------

function sampleScenes(scenes) {
  const title = scenes.find(s => s.make && s.make.type === 'title');
  const rec = scenes.find(s => s.make && s.make.type === 'recording');
  const end = scenes.find(s => s.make && s.make.type === 'end');
  const out = [];
  if (title) out.push({ ...title, seconds: Math.max(3, Math.min(4, title.seconds || 4)) });
  if (rec) {
    const [a, b] = rec.make.segments[0];
    out.push({ ...rec, make: { ...rec.make, segments: [[a, Math.min(b, a + 6)]] } });
  }
  if (end) out.push({ ...end, seconds: Math.max(3, Math.min(4, end.seconds || 4)) });
  return out;
}

// ---- building the composition -----------------------------------------------

function build(scenes, ctx) {
  const T = TEMPLATES[ctx.template];
  const c = { ...T, ...((ctx.look && ctx.look.colors) || {}) };
  let at = 0;
  const parts = [];
  const js = [];
  const segs = [];
  for (const sc of scenes) {
    const d = sceneSeconds(sc);
    const r = SCENES[sc.make.type](sc, at, d, c, segs);
    parts.push(r.html);
    js.push(r.js);
    at += d;
  }
  const END = +at.toFixed(2);
  const recs = [...new Set(segs.map(s => s.rec))];
  const display = ctx.fonts.display, mono = ctx.fonts.mono, text = ctx.fonts.text || display;
  const html = `<!doctype html>
<html lang="en" data-resolution="landscape">
<head>
<meta charset="UTF-8" /><meta name="viewport" content="width=1920, height=1080" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script src="assets/naqsha-demo.js"></script>
<style>
  @font-face { font-family: 'D'; src: url(assets/fonts/${path.basename(display.file)}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: 'T'; src: url(assets/fonts/${path.basename(text.file)}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: 'M'; src: url(assets/fonts/${path.basename(mono.file)}) format('woff2'); font-weight: 100 900; }
  :root { --bg: ${c.bg}; --ink: ${c.ink}; --dim: ${c.dim}; --accent: ${c.accent}; --panel: ${c.panel}; --line: ${c.line}; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1920px; height: 1080px; overflow: hidden; background: var(--bg); }
  #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: var(--bg); color: var(--ink); font-family: 'T', sans-serif; }
  ${c.grid ? '#root { background-image: linear-gradient(rgba(140,180,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(140,180,255,.08) 1px, transparent 1px); background-size: 48px 48px; }' : ''}
  .scene { position: absolute; inset: 0; }
  em { font-style: normal; color: var(--accent); }
  .dim { color: var(--dim); }
  .accent { color: var(--accent); }
  /* The reveal box clips, so it reaches below the baseline (y, g, p) and pulls the next line back. */
  .ln { display: block; overflow: hidden; padding-bottom: 0.16em; margin-bottom: -0.1em; }
  .in { display: block; }
  .big { font-family: 'D', sans-serif; font-weight: ${c.weight}; letter-spacing: ${c.track}; line-height: 0.95; ${c.upper ? 'text-transform: uppercase;' : ''} }
  .say { font-family: 'D', sans-serif; font-weight: ${Math.min(c.weight, 800)}; letter-spacing: -0.03em; line-height: 1.08; }
  .glow { position: absolute; width: 1400px; height: 1400px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--accent) 24%, transparent), transparent 62%); }
  .term { position: absolute; background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 34px 40px; font-family: 'M', monospace; font-size: 34px; line-height: 1.5; color: var(--ink); box-shadow: 0 40px 100px rgba(0,0,0,.35); }
  .term .dots { display: flex; gap: 10px; margin-bottom: 22px; } .term .dots i { width: 14px; height: 14px; border-radius: 50%; background: var(--line); }
  .prompt { color: var(--accent); margin-right: 18px; font-weight: 700; }
  .typed { display: inline-block; overflow: hidden; white-space: nowrap; vertical-align: bottom; width: 0; }
  .out { color: var(--dim); font-size: 28px; margin-top: 16px; opacity: 0; } .out b { color: var(--ink); font-weight: 500; }
  .frame { position: absolute; left: 240px; top: 54px; width: 1440px; height: 810px; border-radius: 18px; overflow: hidden; background: ${c.frame}; box-shadow: 0 40px 110px rgba(0,0,0,${ctx.template === 'paper' ? '.14' : '.55'}), 0 0 0 1px ${ctx.template === 'paper' ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.07)'}; opacity: 0; }
  .fit { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  .layer { position: absolute; left: 0; top: 0; }
  .layer video { position: absolute; left: 0; top: 0; display: block; }
  .cap { position: absolute; left: 0; right: 0; top: 896px; text-align: center; font-family: 'D', sans-serif; font-weight: ${Math.min(c.weight, 800)}; font-size: 46px; letter-spacing: -0.02em; line-height: 1.15; }
  .lock { position: absolute; width: 150px; height: 170px; }
  .lock .body { position: absolute; left: 0; bottom: 0; width: 150px; height: 112px; border-radius: 22px; background: var(--accent); }
  .lock .shackle { position: absolute; left: 30px; top: 0; width: 90px; height: 110px; border: 18px solid var(--accent); border-bottom: 0; border-radius: 48px 48px 0 0; }
  .chip { position: absolute; padding: 24px 34px; border-radius: 14px; background: var(--accent); color: var(--bg); font-family: 'M', monospace; font-weight: 700; font-size: 36px; }
  .draw { position: absolute; height: 4px; background: var(--accent); transform-origin: 0 50%; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${END}" data-width="1920" data-height="1080">
${parts.join('\n')}
</div>
<script>
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });
  const ENTRANCE = ${JSON.stringify(ctx.entrance)}, EASE = ${JSON.stringify(c.ease)};
  // Entrances by role, never one fade-up for everything: a line is revealed from behind its
  // own edge (mask), lands at full strength (snap), or simply appears on the beat (cut).
  function enter(sel, at, kind) {
    const k = kind || ENTRANCE;
    const els = gsap.utils.toArray(sel);
    els.forEach((el, i) => {
      const t = at + i * 0.12;
      const inner = el.querySelector(':scope > .in') || el;
      if (k === 'mask') tl.fromTo(inner, { y: '108%' }, { y: '0%', duration: 0.62, ease: EASE, immediateRender: false }, t);
      else if (k === 'snap') { tl.set(el, { opacity: 1 }, t); tl.fromTo(el, { scale: 1.08 }, { scale: 1, duration: 0.18, ease: 'power4.out', immediateRender: false }, t); }
      tl.set(el, { opacity: 1 }, t);
    });
  }
  // Lines leave in a slight stagger, never two on one beat.
  function leave(sel, at) {
    gsap.utils.toArray(sel).forEach((el, i) => {
      const inner = el.querySelector(':scope > .in');
      if (ENTRANCE === 'mask' && inner) tl.to(inner, { y: '-108%', duration: 0.3, ease: 'power3.in' }, at - 0.1 + i * 0.05);
      else tl.set(el, { opacity: 0 }, at + 0.3);
    });
  }
  function type(sel, n, at, dur) { tl.fromTo(sel, { width: 0 }, { width: n * 0.6 * 34, duration: dur, ease: 'steps(' + n + ')', immediateRender: false }, at); }
  // Everything that enters starts hidden, so nothing shows before its moment.
  gsap.utils.toArray('[data-enter]').forEach(el => { tl.set(el, { opacity: ENTRANCE === 'mask' && el.querySelector(':scope > .in') ? 1 : 0 }, 0); const inner = el.querySelector(':scope > .in'); if (inner && ENTRANCE === 'mask') tl.set(inner, { y: '108%' }, 0); });
  const LOGS = ${JSON.stringify(Object.fromEntries(recs.map(r => [r, ctx.recs[r]])))};
${js.join('\n')}
  window.__timelines["main"] = tl;
  tl.seek(0);
</script>
</body>
</html>
`;
  return { html, END, segs };
}

// A line of text that can be revealed: an outer box that clips, an inner line that moves.
// A line on screen from frame 0 has no data-enter: it is never hidden, so it is never set
// twice at the same moment (HyperFrames keeps the first of two sets at one time).
const line = (id, html, cls = '', enters = true) => `<span id="${id}" class="ln ${cls}"${enters ? ' data-enter' : ''}><span class="in">${html}</span></span>`;
const lines = (prefix, list, firstStatic = false) => list.map((l, i) => {
  const o = typeof l === 'string' ? { text: l } : l;
  return line(`${prefix}-${i}`, rich(o.text), o.tone === 'dim' ? 'dim' : o.tone === 'accent' ? 'accent' : '', !(firstStatic && i === 0));
}).join('');

const SCENES = {
  title(sc, at, d, c) {
    const id = sc.id;
    const m = sc.make;
    return {
      html: `<div id="${id}" class="scene clip" data-start="${at}" data-duration="${d}">${c.glow ? '<div class="glow" style="left:-300px;top:-520px"></div>' : ''}
    <div class="big" style="position:absolute;left:120px;top:${m.sub ? 230 : 300}px;font-size:${m.size || 190}px">${lines(`${id}-t`, m.lines, at === 0)}</div>
    ${c.grid ? `<div id="${id}-draw" class="draw" style="left:124px;top:${m.sub ? 640 : 690}px;width:900px" data-enter></div>` : ''}
    ${m.sub ? `<div style="position:absolute;left:126px;top:${c.grid ? 680 : 690}px;font-size:56px;font-weight:500;color:var(--dim)">${line(`${id}-s`, rich(m.sub))}</div>` : ''}
  </div>`,
      // Frame 0 is the thumbnail on social players: the first title is already on screen at 0 s.
      js: `  ${at === 0 ? `tl.fromTo('#${id}-t-0', { scale: 1.03, transformOrigin: '0% 50%' }, { scale: 1, duration: 1.1, ease: EASE }, 0); enter('#${id} .big [data-enter]', 0.3);` : `enter('#${id} .big .ln', ${at + 0.1});`}
  ${c.grid ? `tl.fromTo('#${id}-draw', { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: 'power2.inOut', immediateRender: false }, ${at + 0.5}); tl.set('#${id}-draw', { opacity: 1 }, ${at + 0.5});` : ''}
  ${m.sub ? `enter('#${id}-s', ${at + 0.95}, ENTRANCE === 'cut' ? 'cut' : 'mask');` : ''}
  leave('#${id} .ln', ${(at + d - 0.35).toFixed(2)});`,
    };
  },
  statement(sc, at, d) {
    const id = sc.id;
    const m = sc.make;
    const code = m.texture === 'code' ? `<div id="${id}-code" data-layout-ignore style="position:absolute;left:120px;top:0;width:640px;font-family:'M',monospace;font-size:24px;line-height:1.7;color:color-mix(in srgb, var(--ink) 18%, transparent)">${Array.from({ length: 60 }, (_, i) => esc(['const db = new Mongo(url)', 'app.use(cors({ origin: "*" }))', 'export async function handler(req) {', '  const user = await getUser(req.query.id)', '  // TODO: auth', 'microservices.deploy("payments")', 'res.json(await db.find({}))', '}'][i % 8])).map(l => `<div>${l}</div>`).join('')}</div>` : '';
    return {
      html: `<div id="${id}" class="scene clip" data-start="${at}" data-duration="${d}">${code}
    <div class="say" style="position:absolute;left:${code ? 820 : 120}px;top:${code ? 320 : 300}px;width:${code ? 1000 : 1680}px;font-size:${m.size || 76}px">${lines(`${id}-l`, m.lines)}</div>
  </div>`,
      js: `  ${code ? `tl.fromTo('#${id}-code', { y: 0 }, { y: -1100, duration: ${d}, ease: 'none', immediateRender: false }, ${at});` : ''}
  ${m.lines.map((_, i) => `enter('#${id}-l-${i}', ${(at + 0.15 + i * Math.max(0.6, (d - 1.2) / m.lines.length)).toFixed(2)});`).join(' ')}
  leave('#${id} [data-enter]', ${(at + d - 0.35).toFixed(2)});`,
    };
  },
  terminal(sc, at, d) {
    const id = sc.id;
    const m = sc.make;
    const above = m.above || [];
    const n = m.command.length;
    const typeAt = at + 0.7, typeDur = Math.min(1.3, 0.04 * n + 0.3);
    return {
      html: `<div id="${id}" class="scene clip" data-start="${at}" data-duration="${d}">
    <div class="say" style="position:absolute;left:120px;top:${above.length > 2 ? 110 : 150}px;width:1680px;font-size:${m.size || (above.length > 2 ? 66 : 84)}px">${lines(`${id}-a`, above)}</div>
    <div id="${id}-term" class="term" style="left:120px;top:560px;width:1340px" data-enter>
      <div class="dots"><i></i><i></i><i></i></div>
      <div><span class="prompt">›</span><span id="${id}-ty" class="typed">${esc(m.command)}</span></div>
      ${m.output ? `<div id="${id}-out" class="out">${rich(m.output).replace(/^([^.:]+[.:])/, '<b>$1</b>')}</div>` : ''}
    </div>
    ${m.lock ? `<div id="${id}-lock" class="lock" style="left:1580px;top:640px" data-enter><div id="${id}-sh" class="shackle"></div><div class="body"></div></div>` : ''}
  </div>`,
      js: `  ${above.map((_, i) => `enter('#${id}-a-${i}', ${(at + 0.1 + i * Math.max(0.7, (d - 1.5) / Math.max(1, above.length))).toFixed(2)});`).join(' ')}
  tl.set('#${id}-term', { opacity: 1 }, ${at + 0.3}); tl.fromTo('#${id}-term', { y: 40 }, { y: 0, duration: 0.5, ease: EASE, immediateRender: false }, ${at + 0.3});
  type('#${id}-ty', ${n}, ${typeAt.toFixed(2)}, ${typeDur.toFixed(2)});
  ${m.output ? `tl.to('#${id}-out', { opacity: 1, duration: 0.25 }, ${(typeAt + typeDur + 0.2).toFixed(2)});` : ''}
  ${m.lock ? `tl.set('#${id}-lock', { opacity: 1 }, ${(typeAt + typeDur + 0.3).toFixed(2)}); tl.fromTo('#${id}-sh', { y: ${m.lock === 'close' ? -36 : 0} }, { y: ${m.lock === 'close' ? 0 : -40}, duration: 0.35, ease: 'back.out(3)', immediateRender: false }, ${(typeAt + typeDur + 0.6).toFixed(2)});` : ''}
  leave('#${id} [data-enter]', ${(at + d - 0.35).toFixed(2)});`,
    };
  },
  recording(sc, at, d, c, segs) {
    const id = sc.id;
    const m = sc.make;
    let t = at;
    const mine = m.segments.map(([a, b], i) => { const s = { id: `${id}-r${i}`, rec: m.rec, at: +t.toFixed(2), dur: +(b - a).toFixed(2), from: a, until: b }; t += b - a; return s; });
    segs.push(...mine);
    return {
      html: `<div id="${id}" class="scene">
    <div id="${id}-frame" class="frame">${mine.map(s => `<div class="fit" data-fit="${s.rec}"><div id="${s.id}-layer" class="layer" data-rec="${s.rec}"><video id="${s.id}" class="clip" src="assets/rec/${s.rec}.webm" muted data-start="${s.at}" data-duration="${s.dur}" data-media-start="${s.from}"></video></div></div>`).join('')}</div>
    <div id="${id}-cap" class="cap clip" data-start="${at}" data-duration="${d.toFixed(2)}">${lines(`${id}-c`, m.caption)}</div>
  </div>`,
      js: `  tl.fromTo('#${id}-frame', { opacity: 0, y: 60, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: EASE, immediateRender: false }, ${at});
  tl.to('#${id}-frame', { opacity: 0, duration: 0.3 }, ${(at + d - 0.3).toFixed(2)});
  ${m.caption.map((_, i) => `enter('#${id}-c-${i}', ${(at + 0.25 + i * 0.4).toFixed(2)}, ENTRANCE === 'cut' ? 'cut' : 'mask');`).join(' ')}
  leave('#${id}-cap [data-enter]', ${(at + d - 0.35).toFixed(2)});
  ${mine.map(s => `segment(${JSON.stringify(s)});`).join('\n  ')}`,
    };
  },
  end(sc, at, d, c) {
    const id = sc.id;
    const m = sc.make;
    return {
      html: `<div id="${id}" class="scene clip" data-start="${at}" data-duration="${d}">${c.glow ? '<div class="glow" style="right:-400px;bottom:-700px"></div>' : ''}
    <div class="big" style="position:absolute;left:120px;top:250px;font-size:${m.size || 230}px;text-transform:none">${line(`${id}-n`, esc(m.name))}</div>
    ${m.tagline ? `<div style="position:absolute;left:128px;top:560px;font-size:64px;font-weight:500;color:var(--dim)">${line(`${id}-g`, rich(m.tagline))}</div>` : ''}
    ${m.command ? `<div id="${id}-c" class="chip" style="left:128px;top:730px" data-enter>${esc(m.command)}</div>` : ''}
    ${m.note ? `<div style="position:absolute;left:130px;top:${m.command ? 870 : 740}px;font-size:30px;font-weight:500;color:var(--dim)">${line(`${id}-x`, rich(m.note))}</div>` : ''}
  </div>`,
      js: `  enter('#${id}-n', ${at + 0.1}); ${m.tagline ? `enter('#${id}-g', ${at + 0.6});` : ''} ${m.command ? `enter('#${id}-c', ${at + 1.0}, 'snap');` : ''} ${m.note ? `enter('#${id}-x', ${at + 1.5}, ENTRANCE === 'cut' ? 'cut' : 'mask');` : ''}`,
    };
  },
};

// Recorded segments: the layer at the video's own pixels, a wrapper scaled to the frame, and
// the camera, cursor, ripples and masks from the event log.
const SEGMENT_JS = `
  function segment(s) {
    const log = LOGS[s.rec];
    const vw = log.video ? log.video.width : log.viewport.width, vh = log.video ? log.video.height : log.viewport.height;
    const layer = document.getElementById(s.id + '-layer');
    const video = document.getElementById(s.id);
    Object.assign(layer.style, { width: vw + 'px', height: vh + 'px' });
    Object.assign(video.style, { width: vw + 'px', height: vh + 'px' });
    const fit = layer.parentNode;
    Object.assign(fit.style, { width: vw + 'px', height: vh + 'px', transform: 'scale(' + (1440 / vw) + ')' });
    tl.set(layer, { opacity: 0 }, 0); tl.set(layer, { opacity: 1 }, s.at); tl.set(layer, { opacity: 0 }, s.at + s.dur);
    naqshaDemo.direct(tl, log, { layer, at: s.at, trim: s.from, until: s.until, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), maxZoom: 1.5 });
  }`;

// ---- main -------------------------------------------------------------------

// The tools, checked before anything starts rather than discovered halfway through.
function env() {
  const { spawnSync } = require('child_process');
  const problems = [];
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) problems.push(`Node ${process.versions.node}: HyperFrames needs Node 22 or later`);
  for (const tool of ['ffmpeg', 'ffprobe']) {
    if (spawnSync(tool, ['-version'], { encoding: 'utf8' }).status !== 0) problems.push(`${tool} isn't installed (apt install ffmpeg, brew install ffmpeg, or winget install ffmpeg)`);
  }
  console.log(problems.length ? `Missing:\n- ${problems.join('\n- ')}` : `Tools ready: Node ${process.versions.node}, FFmpeg, ffprobe. Playwright is checked by the capture script in the project.`);
  process.exit(problems.length ? 1 : 0);
}

function main(argv) {
  if (argv.includes('--env')) return env();
  const demo = path.resolve(argv[0] || '.');
  const check = argv.includes('--check');
  const si = argv.indexOf('--sample');
  const sample = si >= 0 ? argv[si + 1] : null;
  const ei = argv.indexOf('--entrance');
  const entrance = ei >= 0 ? argv[ei + 1] : undefined;
  const plan = readPlan(path.join(demo, 'plan.js'));
  const v = validate(demo, plan, sample || undefined, entrance);
  const scenes = sample ? sampleScenes(plan.scenes || []) : plan.scenes;
  if (v.problems.length) {
    console.error(`Not composed. Fix these first:\n- ${v.problems.join('\n- ')}`);
    process.exit(1);
  }
  const total = scenes.reduce((a, s) => a + sceneSeconds(s), 0);
  if (check) { console.log(`Ready: ${scenes.length} scenes, ${total.toFixed(1)} s, template ${v.template}, entrance ${v.entrance}.`); return; }

  const video = path.join(demo, 'video');
  fs.mkdirSync(path.join(video, 'assets', 'rec'), { recursive: true });
  fs.mkdirSync(path.join(video, 'assets', 'fonts'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'naqsha-demo.js'), path.join(video, 'assets', 'naqsha-demo.js'));
  for (const f of Object.values(v.fonts)) if (f && f.file) fs.copyFileSync(path.join(demo, f.file), path.join(video, 'assets', 'fonts', path.basename(f.file)));
  const { html, END, segs } = build(scenes, { template: v.template, entrance: v.entrance, look: plan.look, fonts: v.fonts, recs: v.recs });
  for (const r of new Set(segs.map(s => s.rec))) fs.copyFileSync(path.join(demo, 'capture', r, 'recording.webm'), path.join(video, 'assets', 'rec', `${r}.webm`));
  // index.html is always the composition being worked on: `hyperframes check` reads only it.
  // A sample also keeps a named copy, so it can be rendered again later.
  const doc = html.replace('const LOGS =', SEGMENT_JS + '\n  const LOGS =');
  fs.writeFileSync(path.join(video, 'index.html'), doc);
  const named = sample ? `sample-${sample}${entrance ? `-${entrance}` : ''}.html` : null;
  // Outside the project: a second root-level composition there would be a second entry point.
  if (named) { fs.mkdirSync(path.join(demo, 'samples'), { recursive: true }); fs.writeFileSync(path.join(demo, 'samples', named), doc); }
  console.log(`Composed video/index.html${named ? ` (a copy in samples/${named})` : ''}: ${scenes.length} scenes, ${END} s, template ${v.template}, entrance ${v.entrance}.`);
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(`compose: ${e.message}`); process.exit(1); }
}
module.exports = { validate, sampleScenes, build, readTime, TEMPLATES };
