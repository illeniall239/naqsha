#!/usr/bin/env node
// naqsha demo composer: turns a demo's storyboard (plan.js scenes, each with a `make` block)
// into one HyperFrames composition. Claude directs the film (the storyline, the look, a
// transition with a cause at every seam, hand-made scenes where the kit stops); the composer
// does the plumbing that has to be exact and was learned from real renders: videos with ids
// and their own timing, recordings at their natural size with the camera, cursor, masks and
// hit boxes from the event log, text entrances that seek right, transitions measured on the
// real element, sound cues on the frame of the action, fonts loaded before anything is
// measured, captions given their reading time.
//
//   node compose.cjs --env                     check the tools: Node 22+, FFmpeg, ffprobe
//   node compose.cjs <demo> --fetch-sfx        download the UI sound pack into <demo>/sfx/
//   node compose.cjs <demo> --check            validate everything, write nothing
//   node compose.cjs <demo> --storyline S2     a storyline's hook clip, into index.html
//                                              (a copy kept in <demo>/samples/)
//   node compose.cjs <demo>                    the full film, into index.html; writes each
//                                              scene's start and length back to plan.js
//
// <demo> is the demo folder (plan.js, capture/, fonts/, scenes/, media/, audio/, sfx/,
// video/). The HyperFrames project is <demo>/video, created once with
// `npx hyperframes init video --example blank ...`.
'use strict';

const fs = require('fs');
const path = require('path');

const W = 1920, H = 1080;
const TYPES = ['title', 'statement', 'number', 'terminal', 'recording', 'end', 'custom'];
// How a scene arrives from the one before. Each is caused by something on screen; `match`
// is a hard cut on frames the hand-made scenes on both sides were built to match.
const TRANSITIONS = {
  cut: { overlap: 0 }, dip: { overlap: 0 }, whip: { overlap: 0, sfx: 'whoosh-short' }, blur: { overlap: 0 },
  iris: { overlap: 0.4, sfx: 'whoosh-short' }, 'zoom-through': { overlap: 0, sfx: 'whoosh' }, grow: { overlap: 0, sfx: 'whoosh' }, match: { overlap: 0 },
};
const ENTRANCES = ['mask', 'blur', 'ink', 'line', 'letters', 'snap', 'cut'];
const ROTATION = ['blur', 'ink', 'mask', 'line'];
// Where generated design lands. Fine when the product uses them, never as a default.
const DEFAULT_FACES = ['inter', 'inter tight', 'space grotesk', 'instrument serif', 'geist', 'jetbrains mono'];
const HYPE = ['unlock', 'seamless', 'supercharge', 'game-changer', 'game changer', 'revolutionize', 'effortless'];
// The UI sound pack HyperFrames ships (Pixabay Content License: free for commercial use,
// no attribution needed), pinned to one commit so a re-render months later sounds the same.
const SFX_BASE = 'https://raw.githubusercontent.com/heygen-com/hyperframes/a058cde725be173c8782cdb50f6aac3d1698b073/skills/media-use/audio/assets/sfx/';
const SFX_FILES = ['chime', 'click', 'click-soft', 'error', 'glitch-1', 'glitch-2', 'glitch-3', 'impact-bass-1', 'impact-bass-2', 'key-press',
  'notification', 'ping', 'pop', 'riser', 'sparkle', 'typing', 'whoosh', 'whoosh-short', 'whoosh-cinematic'];
const SFX_LEVEL = { 'click-soft': 0.5, click: 0.45, 'key-press': 0.4, typing: 0.32, whoosh: 0.35, 'whoosh-short': 0.35, 'whoosh-cinematic': 0.35, 'impact-bass-1': 0.5, 'impact-bass-2': 0.5, ping: 0.35, pop: 0.4 };

const words = s => String(s || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
const readTime = s => Math.max(2, 0.5 + 0.3 * words(s));
const esc = s => String(s ?? '').replace(/&(?!amp;|lt;|gt;|quot;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Only <em> survives in text: it marks the accent, and data-roll makes it a slot-machine word.
const rich = s => esc(s).replace(/&lt;em data-roll="([^"<>]*)"&gt;/g, (_, o) => `<em data-roll="${o.replace(/[^\w |.,'-]/g, '')}">`)
  .replace(/&lt;em&gt;/g, '<em>').replace(/&lt;\/em&gt;/g, '</em>');
const textOf = l => (typeof l === 'string' ? l : (l && l.text) || '');
const r2 = n => +(+n).toFixed(2);

// ---- color --------------------------------------------------------------------

const hex6 = h => { let s = String(h || '').trim().replace(/^#/, ''); if (s.length === 3) s = [...s].map(c => c + c).join(''); return /^[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : null; };
const rgb = h => { const s = hex6(h); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v * t + rgb(b)[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// A world's colors: given ones, the rest derived so every role has a value.
function palette(c, base) {
  const p = { ...(base || {}), ...c };
  const ground = '#' + hex6(p.ground), ink = '#' + hex6(p.ink), accent = '#' + hex6(p.accent);
  return {
    ground, ink, accent,
    dim: hex6(c.dim) ? '#' + hex6(c.dim) : mix(ink, ground, 0.55),
    panel: hex6(c.panel) ? '#' + hex6(c.panel) : mix(ink, ground, lum(ground) > 0.5 ? 0.04 : 0.1),
    line: hex6(c.line) ? '#' + hex6(c.line) : mix(ink, ground, 0.16),
    // On caption chips (ink on ground reversed), the accent only where it stays readable.
    chipEm: contrast(accent, ink) >= 3 ? accent : ground,
  };
}

function readPlan(file) {
  const m = /^\s*window\.NAQSHA\s*=\s*([\s\S]*?)\s*;?\s*$/.exec(fs.readFileSync(file, 'utf8'));
  if (!m) throw new Error(`${file} isn't window.NAQSHA = {...};`);
  return JSON.parse(m[1]);
}

// ---- validation: every problem at once, before anything is written ----------

function validate(demo, plan, opts) {
  const o = opts || {};
  const problems = [], notes = [];
  const story = o.storyline ? (plan.storylines || []).find(s => s.id === o.storyline) : null;
  if (o.storyline && !story) problems.push(`no storyline "${o.storyline}" in storylines (ids: ${(plan.storylines || []).map(s => s.id).join(', ') || 'none'})`);
  if (o.storyline && story && !(story.hook && Array.isArray(story.hook.scenes) && story.hook.scenes.length)) problems.push(`${o.storyline}: a storyline needs hook.scenes, the first five seconds or so of its film`);
  const look = (story && story.hook && story.hook.look) || plan.look || {};
  const sound = (story && story.hook && story.hook.sound) || plan.sound || {};
  const scenes = story ? ((story.hook && story.hook.scenes) || []) : Array.isArray(plan.scenes) ? plan.scenes : [];
  const where = story ? `${o.storyline} ` : '';

  // The look: from the product, a brand or the subject, never a fallback.
  const c = look.colors || {};
  if (look.template && !look.colors) problems.push(`${where}look.template ("${look.template}") is from before naqsha 0.13, which dropped the fixed templates: write look.colors (ground, ink, accent) and look.source from the product's design instead`);
  for (const k of ['ground', 'ink', 'accent']) if (!hex6(c[k])) problems.push(`${where}look.colors.${k} must be a hex color (got "${c[k] ?? ''}")`);
  if (!look.source) problems.push(`${where}look.source must say where the look comes from (the product's tokens, its CSS, a brand page), so it isn't a generated default`);
  const base = hex6(c.ground) && hex6(c.ink) && hex6(c.accent) ? palette(c) : null;
  const worlds = {};
  if (base) {
    if (contrast(base.ink, base.ground) < 4.5) problems.push(`${where}look.colors: ink on ground is ${contrast(base.ink, base.ground).toFixed(1)}:1; text needs at least 4.5:1`);
    if (contrast(base.accent, base.ground) < 3) notes.push(`${where}look.colors: the accent on the ground is only ${contrast(base.accent, base.ground).toFixed(1)}:1, so accent words read weakly`);
    for (const [name, g] of Object.entries(look.grounds || {})) {
      if (!hex6(g.ground) || !hex6(g.ink)) { problems.push(`${where}look.grounds.${name} needs ground and ink hex colors`); continue; }
      worlds[name] = palette(g, { accent: c.accent });
      if (contrast(worlds[name].ink, worlds[name].ground) < 4.5) problems.push(`${where}look.grounds.${name}: ink on ground is under 4.5:1`);
    }
  }
  const fonts = look.fonts || {};
  for (const role of ['display', 'mono']) {
    const f = fonts[role];
    if (!f || !f.family || !f.file) problems.push(`${where}look.fonts.${role} needs { family, file }`);
    else if (!fs.existsSync(path.join(demo, f.file))) problems.push(`font file missing: ${f.file} (download it into the demo folder first)`);
    else if (DEFAULT_FACES.includes(String(f.family).toLowerCase())) notes.push(`${where}look.fonts.${role} is ${f.family}, where generated design lands: keep it only if the product uses it (say so in look.source)`);
  }
  if (fonts.text && fonts.text.file && !fs.existsSync(path.join(demo, fonts.text.file))) problems.push(`font file missing: ${fonts.text.file}`);
  for (const s of [].concat(look.titles || [])) if (!ENTRANCES.includes(s)) problems.push(`${where}look.titles: "${s}" isn't an entrance (${ENTRANCES.join(', ')})`);
  if (!fs.existsSync(path.join(demo, 'video', 'hyperframes.json'))) problems.push('no HyperFrames project at video/ (run: npx hyperframes init video --example blank --non-interactive --resolution landscape)');

  // Sound: UI sounds from the pack, music only with its license written down.
  let sfx = null;
  if (sound.sfx) {
    const man = path.join(demo, 'sfx', 'manifest.json');
    if (!fs.existsSync(man)) problems.push('sound.sfx is on but the sound pack is missing: run compose.cjs <demo> --fetch-sfx');
    else sfx = JSON.parse(fs.readFileSync(man, 'utf8'));
  }
  if (sound.music) {
    const m = sound.music;
    if (!m.file || !fs.existsSync(path.join(demo, m.file))) problems.push(`sound.music.file missing: ${m.file || '(none)'}`);
    if (!m.license) problems.push('sound.music.license must say how this track may be used (the user\'s own, CC0, CC BY with its credit, or the license bought)');
  }
  if (sound.voice && (!sound.voice.file || !fs.existsSync(path.join(demo, sound.voice.file)))) problems.push(`sound.voice.file missing: ${sound.voice.file || '(none)'}`);

  if (!scenes.length && !story) problems.push('no scenes');
  const recs = {}, customs = {};
  const ids = new Set();
  scenes.forEach((sc, i) => {
    const m = sc.make || {};
    const at = `${where}${sc.id || `(scene ${i + 1}, no id)`}`;
    if (!/^[A-Za-z][\w-]*$/.test(sc.id || '')) problems.push(`${at}: a scene needs an id of letters, digits, - and _`);
    if (ids.has(sc.id)) problems.push(`${at}: two scenes share this id`);
    ids.add(sc.id);
    if (sc.ground && !worlds[sc.ground]) problems.push(`${at}: ground "${sc.ground}" isn't in look.grounds`);
    if (m.enter && !ENTRANCES.includes(m.enter)) problems.push(`${at}: make.enter must be one of ${ENTRANCES.join(', ')}`);
    const tr = transitionOf(sc);
    if (i > 0 && !TRANSITIONS[tr.type]) problems.push(`${at}: transition must be one of ${Object.keys(TRANSITIONS).join(', ')} (got "${tr.type}")`);
    if (i > 0 && (tr.type === 'zoom-through' || tr.type === 'grow') && !tr.via) {
      const prev = scenes[i - 1].make || {};
      if (prev.type !== 'recording') problems.push(`${at}: ${tr.type} needs transition.via, the element of ${scenes[i - 1].id} it starts from (#${scenes[i - 1].id}-…); after a recording it starts from the last click`);
    }
    if (i > 0 && tr.type === 'iris' && m.type !== 'recording' && (sc.ground || '') === (scenes[i - 1].ground || '')) problems.push(`${at}: an iris opens onto another world, but this scene has the same ground as ${scenes[i - 1].id}, so nothing would show; give it another ground (look.grounds) or use another transition`);
    if (i > 0 && tr.via && !String(tr.via).startsWith(`#${scenes[i - 1].id}-`)) problems.push(`${at}: transition.via must be an element of the scene before it, #${scenes[i - 1].id}-…`);
    if (!TYPES.includes(m.type)) { problems.push(`${at}: make.type must be one of ${TYPES.join(', ')}`); return; }
    if ((m.type === 'title' || m.type === 'statement') && !(Array.isArray(m.lines) && m.lines.length)) problems.push(`${at}: a ${m.type} needs make.lines`);
    if (m.type === 'number' && !/^[\d.,]+$/.test(String(m.value ?? ''))) problems.push(`${at}: a number needs make.value, digits with optional , and . ("400", "1,240")`);
    if (m.type === 'number' && m.label && (Number(sc.seconds) || 0) < 1.45 + readTime(m.label) - 0.05) problems.push(`${at}: the label arrives at 1.45 s and needs ${readTime(m.label).toFixed(1)} s to read, so the scene needs ${(1.45 + readTime(m.label)).toFixed(1)} s`);
    if (m.type === 'terminal' && !m.command) problems.push(`${at}: a terminal needs make.command`);
    if (m.type === 'end' && !m.name) problems.push(`${at}: an end card needs make.name`);
    if (m.type === 'end' && m.mark && !fs.existsSync(path.join(demo, m.mark))) problems.push(`${at}: make.mark missing: ${m.mark}`);
    if (m.type === 'end' && (Number(sc.seconds) || 0) < 3) notes.push(`${at}: the end card holds ${sc.seconds || 0} s; the name and the call to action need 3 s or more to land and be read`);
    if (m.type === 'recording') {
      const dir = path.join(demo, 'capture', m.rec || '');
      const ev = path.join(dir, 'events.json');
      if (!m.rec || !fs.existsSync(ev) || !fs.existsSync(path.join(dir, 'recording.webm'))) {
        problems.push(`${at}: no recording at capture/${m.rec}/ (rehearse and record the shot first)`);
      } else {
        const log = JSON.parse(fs.readFileSync(ev, 'utf8'));
        recs[m.rec] = log;
        const len = log.duration / 1000;
        for (const [a, b] of m.segments || []) {
          if (!(a >= 0 && b > a && b <= len + 0.05)) problems.push(`${at}: segment [${a}, ${b}] is outside the recording (0 to ${len.toFixed(2)} s)`);
        }
        if (!(m.segments || []).length) problems.push(`${at}: a recording needs make.segments, e.g. [[1.5, 9.3]] (seconds of the recording)`);
      }
      if (!(Array.isArray(m.caption) && m.caption.length)) problems.push(`${at}: a recording needs make.caption (one or two lines)`);
      if (m.frame && !['full', 'window'].includes(m.frame)) problems.push(`${at}: make.frame must be full or window`);
    }
    if (m.type === 'custom') {
      const r = checkCustom(demo, sc);
      problems.push(...r.problems.map(p => `${at}: ${p}`));
      if (r.ok) customs[sc.id] = r;
    }
    for (const cue of [].concat(m.sfx || [])) {
      if (!(cue && typeof cue.at === 'number' && cue.sound)) problems.push(`${at}: each make.sfx cue needs { at, sound } (at in seconds from the scene's start)`);
      else if (sfx && !sfx[cue.sound]) problems.push(`${at}: no sound "${cue.sound}" in the pack (${Object.keys(sfx).join(', ')})`);
    }
    const secs = sceneSeconds(sc);
    if (m.type !== 'recording' && !(secs > 0)) problems.push(`${at}: a ${m.type} needs seconds`);
    const text = sc.caption || [].concat(m.lines || [], m.caption || []).map(textOf).join(' ');
    if (text && readTime(text) > secs + 0.05) problems.push(`${at}: its text needs ${readTime(text).toFixed(1)} s to read (0.5 s + 0.3 s a word) but the scene is ${secs.toFixed(1)} s`);
    // Copy: short lines, no hype, never opening on "Introducing".
    for (const l of [].concat(m.lines || [])) if (words(textOf(l)) > 6 && m.type === 'title') notes.push(`${at}: "${textOf(l).replace(/<[^>]+>/g, '')}" is ${words(textOf(l))} words; a title line takes 6 at most`);
    const all = [text, ...[].concat(m.lines || []).map(textOf), m.sub || '', m.tagline || ''].join(' ').toLowerCase();
    for (const h of HYPE) if (all.includes(h)) notes.push(`${at}: "${h}" is hype; say what it does`);
    if (i === 0 && /^(introducing|meet)\b/i.test(textOf((m.lines || [])[0]).replace(/<[^>]+>/g, ''))) notes.push(`${at}: the first line is "Introducing…"; open on the outcome or the need instead`);
  });

  // The film as a whole: varied, caused transitions, and sound when it's long.
  const seams = scenes.slice(1).map(transitionOf).map(t => t.type);
  if (seams.length >= 3) {
    const cuts = seams.filter(t => t === 'cut').length;
    if (cuts > seams.length / 3) notes.push(`${where}${cuts} of ${seams.length} seams are hard cuts; at most a third should be: enter scenes through something on screen`);
    const kinds = new Set(seams).size;
    if (seams.length >= 4 && kinds < 3) notes.push(`${where}only ${kinds} kind${kinds === 1 ? '' : 's'} of transition across ${seams.length} seams; a film uses 3 to 5`);
  }
  const styles = scenes.filter(s => ['title', 'statement'].includes((s.make || {}).type)).map((s, i) => s.make.enter || [].concat(look.titles || ROTATION)[i % [].concat(look.titles || ROTATION).length]);
  if (styles.length >= 3 && new Set(styles).size === 1) notes.push(`${where}every title enters the same way (${styles[0]}); vary them`);
  const total = timeline(scenes).end;
  if (!story && total > 15 && !sound.sfx && !sound.music && !sound.voice) notes.push(`the film is ${total.toFixed(0)} s and silent; UI sounds (sound.sfx) or licensed music make it feel finished`);
  if (sound.music && sound.music.beats) {
    const bf = path.join(demo, sound.music.beats);
    if (!fs.existsSync(bf)) problems.push(`sound.music.beats missing: ${sound.music.beats}`);
    else {
      const beats = beatTimes(JSON.parse(fs.readFileSync(bf, 'utf8')), Number(sound.music.start) || 0);
      const off = timeline(scenes).items.slice(1).filter(x => beats.length && Math.min(...beats.map(b => Math.abs(b - x.at))) > 0.07);
      if (beats.length && off.length) notes.push(`seams off the beat by more than 2 frames: ${off.map(x => `${x.sc.id} at ${x.at.toFixed(2)} s`).join(', ')}`);
    }
  }
  return { problems, notes, recs, customs, look, sound, sfx, scenes, worlds, base };
}

// Beat times in film seconds, from `hyperframes beats` output in any of its shapes.
function beatTimes(j, start) {
  const raw = Array.isArray(j) ? j : j.beats || (j.result && j.result.beats) || [];
  return raw.map(b => (typeof b === 'number' ? b : b.time ?? b.t)).filter(t => typeof t === 'number').map(t => t - start).filter(t => t >= 0);
}

const transitionOf = sc => (typeof sc.transition === 'string' ? { type: sc.transition } : { type: 'cut', ...(sc.transition || {}) });

// A hand-made scene: markup plus one script defining scene(tl, at, d, k, c). Its timing is
// the scene's, its ids are its own, and it's deterministic and local.
function checkCustom(demo, sc) {
  const problems = [];
  const src = (sc.make || {}).src;
  const file = src && path.join(demo, src);
  if (!src || !fs.existsSync(file)) return { problems: [`make.src missing: ${src || '(none)'} (write the scene there first)`] };
  const text = fs.readFileSync(file, 'utf8');
  const scripts = [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1 || /\bsrc=/.test(scripts[0][1])) problems.push(`${src} needs exactly one inline <script>`);
  const js = scripts[0] ? scripts[0][2] : '';
  const markup = text.replace(/<script\b[\s\S]*?<\/script>/gi, '').trim();
  if (!/function\s+scene\s*\(/.test(js)) problems.push(`${src}: its script must define function scene(tl, at, d, k, c)`);
  for (const [re, why] of [[/Math\.random/, 'Math.random (use a seeded value)'], [/Date\.now|new Date|performance\.now/, 'the clock'], [/\bfetch\s*\(|XMLHttpRequest/, 'network fetches'],
    [/requestAnimationFrame|setTimeout|setInterval/, 'timers (everything goes on tl)'], [/__timelines|gsap\.timeline\s*\(/, 'its own timeline (use the tl it is given)'], [/onUpdate|onComplete|onStart/, 'tween callbacks (a seek skips them)']]) {
    if (re.test(js)) problems.push(`${src} uses ${why}`);
  }
  if (/https?:\/\//i.test(text.replace(/xmlns(:\w+)?="[^"]*"/g, ''))) problems.push(`${src} loads something from the web; fonts and images must be local (media/ in the demo folder, as assets/media/…)`);
  if (/\bdata-(start|duration|composition-id|composition-src)=|class="[^"]*\bclip\b/.test(markup)) problems.push(`${src}: no data-start, data-duration, clips or compositions inside a scene; its timing is the scene's`);
  for (const m of markup.matchAll(/\bid="([^"]+)"/g)) if (!m[1].startsWith(`${sc.id}-`)) problems.push(`${src}: id "${m[1]}" must start with ${sc.id}-`);
  for (const m of markup.matchAll(/(?:src|href)="([^"]+)"|url\(['"]?([^'")]+)['"]?\)/g)) {
    const ref = m[1] || m[2];
    if (/^(#|data:)/.test(ref) || /^https?:/i.test(ref)) continue;
    if (!ref.startsWith('assets/media/')) problems.push(`${src}: "${ref}" must be a file in media/, referenced as assets/media/<file>`);
    else if (!fs.existsSync(path.join(demo, 'media', ref.slice('assets/media/'.length)))) problems.push(`${src}: media file missing: media/${ref.slice('assets/media/'.length)}`);
  }
  return { problems, ok: !problems.length, markup, js };
}

function sceneSeconds(sc) {
  const m = sc.make || {};
  if (m.type === 'recording') return (m.segments || []).reduce((a, [x, y]) => a + (y - x), 0);
  return Number(sc.seconds) || 0;
}

// Where each scene starts and ends. A transition that overlaps (an iris opens the next
// scene over the last moments of this one) starts the next scene early.
function timeline(scenes) {
  let prev = 0, end = 0;
  const items = scenes.map((sc, i) => {
    const t = i ? transitionOf(sc) : { type: 'none' };
    const at = r2(Math.max(0, prev - (i ? ((TRANSITIONS[t.type] || {}).overlap || 0) : 0)));
    const d = r2(sceneSeconds(sc));
    prev = at + d;
    end = Math.max(end, prev);
    return { sc, at, d, t };
  });
  return { items, end: r2(end) };
}

// ---- building the composition -----------------------------------------------

function build(v, ctx) {
  const { look, sound, sfx, scenes, worlds, base } = v;
  const { items, end: END } = timeline(scenes);
  const rotation = [].concat(look.titles || ROTATION);
  const typeScale = look.type || {};
  const fonts = look.fonts;
  const text = fonts.text || fonts.display;
  const cues = [];
  const cue = (sound, at, level) => { if (sfx && sfx[sound] && at >= 0 && at < END) cues.push({ sound, at: r2(at), level: level ?? SFX_LEVEL[sound] ?? 0.4 }); };
  const parts = [], js = [], motion = [];
  let titleN = 0;
  items.forEach((it, i) => {
    const { sc, at, d } = it;
    const m = sc.make;
    const next = items[i + 1];
    // Text leaves before a hard cut or a dip; any other transition carries it out.
    const leaveAt = next && ['cut', 'dip'].includes(next.t.type) ? r2(at + d - 0.24) : null;
    const style = m.enter || (['title', 'statement'].includes(m.type) ? rotation[titleN++ % rotation.length] : null);
    const w = sc.ground ? worlds[sc.ground] : base;
    const vars = `--ground:${w.ground};--ink:${w.ink};--dim:${w.dim};--accent:${w.accent};--panel:${w.panel};--line:${w.line};--chip-em:${w.chipEm};`;
    // Frame 0 is the thumbnail, and a whip, blur, iris, zoom or grow lands on the scene's
    // first frame: either way its first line is already there, not still to come.
    const carried = i > 0 && ['whip', 'blur', 'iris', 'zoom-through', 'grow'].includes(it.t.type);
    const r = SCENES[m.type](sc, { at, d, style, leaveAt, cue, recs: v.recs, custom: v.customs[sc.id], first: at === 0 || carried, carried });
    const timed = m.type !== 'recording';
    parts.push(`<div id="${sc.id}" class="scene${timed ? ' clip' : ''}"${timed ? ` data-start="${at}" data-duration="${d}"` : ''} style="${vars}"><div id="${sc.id}-stage" class="stage ${m.type}${r.center || m.align === 'center' ? ' center' : ''}">${r.html}</div></div>`);
    js.push(`  // ${sc.id}: ${m.type}, ${at} s for ${d} s\n${r.js}`);
    if (r.first) motion.push({ kind: 'appearsBy', selector: r.first, bySec: r2(at === 0 ? 0 : at + 1.2) });
    for (const c of [].concat(m.sfx || [])) cue(c.sound, at + c.at, c.volume);
    if (i > 0) { const s = TRANSITIONS[it.t.type] && TRANSITIONS[it.t.type].sfx; if (s) cue(s, at - (it.t.type === 'iris' ? 0 : 0.3)); }
  });

  // Seams: each transition, measured on the real element at its moment.
  const seams = items.slice(1).map((it, j) => ({ type: it.t.type, from: items[j].sc.id, to: it.sc.id, at: it.at, fromRec: items[j].sc.make.type === 'recording',
    via: it.t.via || null, dir: it.t.dir || 'left', point: Array.isArray(it.t.point) ? it.t.point : null,
    color: it.t.color || null }))
    .filter(s => s.type !== 'cut' && s.type !== 'match');

  // Sound: the music bed, a voice, and every cue on its frame (the same sound twice within
  // 80 ms is one).
  cues.sort((a, b) => a.at - b.at);
  const kept = cues.filter((c, i) => !cues.slice(0, i).some(p => p.sound === c.sound && c.at - p.at < 0.08));
  const mul = Number(sound.sfxVolume) || 1;
  const audio = kept.map((c, i) => `<audio id="sfx-${i}" class="clip" src="assets/sfx/${c.sound}.mp3" data-start="${c.at}" data-duration="${r2(Math.min(sfx[c.sound].duration, END - c.at))}" data-volume="${r2(c.level * mul)}"></audio>`);
  if (sound.music) {
    const mu = sound.music;
    audio.push(`<audio id="music" class="clip" src="assets/audio/${path.basename(mu.file)}" data-start="0" data-duration="${END}" data-media-start="${Number(mu.start) || 0}" data-volume="${mu.volume ?? (sound.voice ? 0.35 : 0.7)}" data-fade-in="${mu.fadeIn ?? 0.4}" data-fade-out="${mu.fadeOut ?? 1.5}"></audio>`);
  }
  if (sound.voice) audio.push(`<audio id="voice" class="clip" src="assets/audio/${path.basename(sound.voice.file)}" data-start="${Number(sound.voice.at) || 0}" data-duration="${r2(END - (Number(sound.voice.at) || 0))}" data-volume="${sound.voice.volume ?? 1}"></audio>`);

  const recs = [...new Set(scenes.filter(s => s.make.type === 'recording').map(s => s.make.rec))];
  const display = fonts.display, mono = fonts.mono;
  const blur = look.blur !== false;
  const html = `<!doctype html>
<html lang="en" data-resolution="landscape">
<head>
<meta charset="UTF-8" /><meta name="viewport" content="width=${W}, height=${H}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script src="assets/naqsha-demo.js"></script>
<style>
  @font-face { font-family: 'D'; src: url(assets/fonts/${path.basename(display.file)}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: 'T'; src: url(assets/fonts/${path.basename(text.file)}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: 'M'; src: url(assets/fonts/${path.basename(mono.file)}) format('woff2'); font-weight: 100 900; }
  :root { --ground: ${base.ground}; --ink: ${base.ink}; --dim: ${base.dim}; --accent: ${base.accent}; --panel: ${base.panel}; --line: ${base.line}; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: var(--ground); }
  #root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: var(--ground); color: var(--ink); font-family: 'T', sans-serif; }
  .scene { position: absolute; inset: 0; color: var(--ink); overflow: hidden; }
  /* The stage carries the ground: transitions move, scale and clip it over the scene below. */
  .stage { position: absolute; inset: 0; background: var(--ground); display: flex; flex-direction: column; justify-content: center; align-items: flex-start; padding: 0 140px; transform-origin: 50% 50%; }
  .stage.center { align-items: center; text-align: center; }
  .stage.custom, .stage.recording { display: block; padding: 0; }
  em { font-style: normal; color: var(--accent); }
  .dim { color: var(--dim); } .accent { color: var(--accent); }
  .ln { display: block; padding-bottom: 0.12em; margin-bottom: -0.08em; }
  .in { display: block; }
  .big { font-family: 'D', sans-serif; font-weight: ${typeScale.weight || 700}; letter-spacing: ${typeScale.track || '-0.035em'}; line-height: ${typeScale.lineHeight || 0.98}; ${typeScale.upper ? 'text-transform: uppercase;' : ''} white-space: nowrap; }
  .say { font-family: 'D', sans-serif; font-weight: ${Math.min(typeScale.weight || 700, 800)}; letter-spacing: -0.025em; line-height: 1.1; max-width: 1640px; }
  .sub { font-size: 52px; font-weight: 450; color: var(--dim); letter-spacing: -0.01em; }
  .num { font-family: 'D', sans-serif; font-weight: ${typeScale.weight || 700}; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .term { background: var(--panel); border: 2px solid var(--line); border-radius: 22px; padding: 40px 48px; font-family: 'M', monospace; font-size: 42px; line-height: 1.5; color: var(--ink); width: 1640px; }
  .term .dots { display: flex; gap: 12px; margin-bottom: 26px; } .term .dots i { width: 16px; height: 16px; border-radius: 50%; background: var(--line); }
  .prompt { color: var(--accent); margin-right: 20px; font-weight: 700; }
  .out { color: var(--dim); font-size: 32px; margin-top: 18px; } .out b { color: var(--ink); font-weight: 500; }
  .frame { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #fff; transform-origin: 0 0; }
  .frame.window { transform: translate(134px, 40px) scale(0.86); border-radius: 22px; box-shadow: 0 30px 90px rgba(0,0,0,.22), 0 0 0 2px var(--line); }
  .fit { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  .layer { position: absolute; left: 0; top: 0; }
  .layer video { position: absolute; left: 0; top: 0; display: block; }
  .cap { position: absolute; left: 0; right: 0; bottom: 72px; display: flex; flex-direction: column; align-items: center; gap: 12px; z-index: 10; }
  .cap .ln { background: var(--ink); color: var(--ground); padding: 10px 28px 16px; margin: 0; border-radius: 16px; font-family: 'D', sans-serif; font-weight: 650; font-size: 44px; letter-spacing: -0.015em; line-height: 1.15; }
  .cap em { color: var(--chip-em); }
  .rule { height: 8px; width: 260px; background: var(--accent); transform-origin: 0 50%; border-radius: 4px; }
  .center .rule { transform-origin: 50% 50%; }
  .chip { display: inline-block; padding: 22px 34px; border-radius: 16px; background: var(--ink); color: var(--ground); font-family: 'M', monospace; font-weight: 600; font-size: 38px; }
  .lock { position: absolute; width: 150px; height: 170px; }
  .lock .body { position: absolute; left: 0; bottom: 0; width: 150px; height: 112px; border-radius: 22px; background: var(--accent); }
  .lock .shackle { position: absolute; left: 30px; top: 0; width: 90px; height: 110px; border: 18px solid var(--accent); border-bottom: 0; border-radius: 48px 48px 0 0; }
  .grow { position: absolute; left: 0; top: 0; width: 10px; height: 10px; opacity: 0; z-index: 50; pointer-events: none; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${END}" data-width="${W}" data-height="${H}"${blur ? ' data-motion-blur="on"' : ''}${ctx.fps ? ` data-fps="${ctx.fps}"` : ''}>
${seams.filter(s => s.type === 'grow').map(s => `<div id="grow-${s.to}" class="grow" data-layout-ignore></div>`).join('\n')}
${parts.join('\n')}
${audio.join('\n')}
</div>
<script>
  window.__timelines = window.__timelines || {};
  // Built after the fonts load, because entrances measure text: the runtime waits for
  // hf-timelines-built before it seeks anything.
  window.__hfTimelinesBuilding = true;
  const W = ${W}, H = ${H};
  const tl = gsap.timeline({ paused: true });
  const K = naqshaDemo.kit(tl);
  const root = document.getElementById('root');
  const LOGS = ${JSON.stringify(Object.fromEntries(recs.map(r => [r, ctx.recs[r]])))};
  // The longest line of a block spans a share of the frame's width.
  function fit(id, share) {
    const b = document.getElementById(id);
    const lines = [...b.querySelectorAll('.in')];
    lines.forEach(l => { l.style.display = 'inline-block'; });
    const w = Math.max(...lines.map(l => l.offsetWidth));
    lines.forEach(l => { l.style.display = ''; });
    const fs = parseFloat(getComputedStyle(b).fontSize);
    b.style.fontSize = Math.min(fs * (W * share) / Math.max(1, w), H * 0.36 / Math.max(1, lines.length)) + 'px';
  }
  // Recorded segments: the layer at the video's own pixels, scaled to the frame, and the
  // camera, cursor, masks and hit boxes from the event log.
  function segment(s) {
    const log = LOGS[s.rec];
    const vw = log.video ? log.video.width : log.viewport.width, vh = log.video ? log.video.height : log.viewport.height;
    const layer = document.getElementById(s.id + '-layer');
    const video = document.getElementById(s.id);
    Object.assign(layer.style, { width: vw + 'px', height: vh + 'px' });
    Object.assign(video.style, { width: vw + 'px', height: vh + 'px' });
    const fitBox = layer.parentNode;
    Object.assign(fitBox.style, { width: vw + 'px', height: vh + 'px', transform: 'scale(' + (W / vw) + ')' });
    tl.set(layer, { opacity: 0 }, 0); tl.set(layer, { opacity: 1 }, s.at); tl.set(layer, { opacity: 0 }, s.at + s.dur);
    const css = getComputedStyle(document.getElementById(s.scene));
    naqshaDemo.direct(tl, log, { layer, at: s.at, trim: s.from, until: s.until, scene: s.scene, enterCursor: s.first, maxZoom: s.zoom || 2,
      frame: s.window ? document.getElementById(s.scene + '-frame') : null, window: s.window ? { scale: 0.86, x: 134, y: 40, radius: 22 } : null,
      accent: css.getPropertyValue('--accent').trim(), ink: css.getPropertyValue('--ink').trim(), ground: css.getPropertyValue('--ground').trim(), font: "'M', monospace" });
  }
  // A scene that isn't a clip (a recording, whose videos are) shows only in its own time.
  function window_(id, at, d) {
    const n = document.getElementById(id);
    if (at > 0) tl.set(n, { visibility: 'hidden' }, 0);
    tl.set(n, { visibility: 'visible' }, at || 0.001);
    tl.set(n, { visibility: 'hidden' }, at + d);
  }
  // Where an element is at a moment, in frame pixels.
  function rectAt(node, t) {
    tl.seek(Math.max(0, t), true);
    const R = root.getBoundingClientRect(), k = R.width / W, r = node.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: (r.left - R.left) / k, y: (r.top - R.top) / k, width: r.width / k, height: r.height / k };
  }
  function lastHit(scene, t) {
    const l = (naqshaDemo.hits[scene] || []).filter(h => h.t <= t + 0.01);
    return l.length ? l[l.length - 1].el : null;
  }
  function source(s, t) {
    const node = s.via ? document.querySelector(s.via) : s.fromRec ? lastHit(s.from, t) : null;
    return (node && rectAt(node, t)) || { x: W / 2 - 120, y: H / 2 - 70, width: 240, height: 140 };
  }
  const TR = {
    // The outgoing frame darkens for three frames, so the cut reads as meant.
    dip(A, B, s) { tl.to(A, { filter: 'brightness(0.6)', duration: 0.1, ease: 'none' }, s.at - 0.1); },
    // A sideways smear out; the next scene lands blurred and sharpens.
    whip(A, B, s) {
      const dx = (s.dir === 'right' ? 1 : -1) * W;
      tl.to(A, { x: dx * 0.45, filter: 'blur(14px)', duration: 0.16, ease: 'power3.in' }, s.at - 0.16);
      tl.fromTo(B, { x: -dx * 0.3, filter: 'blur(12px)' }, { x: 0, filter: 'blur(0px)', duration: 0.26, ease: 'power3.out', immediateRender: false }, s.at);
    },
    // The ground stays; one blurs out, the other blurs in.
    blur(A, B, s) {
      tl.to(A, { opacity: 0, filter: 'blur(8px)', duration: 0.16, ease: 'power2.in' }, s.at - 0.16);
      tl.fromTo(B, { opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.16, ease: 'power2.out', immediateRender: false }, s.at);
    },
    // The next scene opens from the clicked point.
    iris(A, B, s) {
      const r = s.point ? { x: s.point[0], y: s.point[1], width: 0, height: 0 } : source(s, s.at);
      const p = (r.x + r.width / 2).toFixed(0) + 'px ' + (r.y + r.height / 2).toFixed(0) + 'px';
      tl.fromTo(B, { clipPath: 'circle(0px at ' + p + ')' }, { clipPath: 'circle(2300px at ' + p + ')', duration: 0.4, ease: 'power2.in', immediateRender: false }, s.at);
    },
    // The camera tracks to the element, then dives through it; its fill becomes the next frame.
    'zoom-through'(A, B, s) {
      const r = source(s, s.at - 0.8);
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const z1 = 1.3, z2 = Math.min(60, Math.max(2.5 * W / r.width, 2.5 * H / r.height));
      // The stage scales about its center, so the target's center lands on the frame's center.
      tl.to(A, { scale: z1, x: -z1 * (cx - W / 2), y: -z1 * (cy - H / 2), duration: 0.45, ease: 'power2.inOut' }, s.at - 0.8);
      tl.to(A, { scale: z2, x: -z2 * (cx - W / 2), y: -z2 * (cy - H / 2), duration: 0.35, ease: 'power3.in' }, s.at - 0.35);
      tl.fromTo(B, { scale: 1.12, filter: 'blur(6px)' }, { scale: 1, filter: 'blur(0px)', duration: 0.5, ease: 'power3.out', immediateRender: false }, s.at);
    },
    // The element (its own fill, or the accent) grows past the frame while what's around it
    // blurs; the next scene fades in inside it.
    grow(A, B, s) {
      const node = s.via && document.querySelector(s.via);
      const bg = node && getComputedStyle(node).backgroundColor;
      const fill = s.color || (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)' ? bg : getComputedStyle(A).getPropertyValue('--accent').trim());
      const r = source(s, s.at - 0.65);
      const g = document.getElementById('grow-' + s.to);
      g.style.background = fill;
      tl.set(g, { opacity: 1, x: r.x, y: r.y, width: r.width, height: r.height, borderRadius: Math.min(28, r.height / 2) }, s.at - 0.65);
      tl.to(g, { x: -60, y: -60, width: W + 120, height: H + 120, borderRadius: 0, duration: 0.65, ease: 'power2.inOut' }, s.at - 0.65);
      tl.to(A, { filter: 'blur(15px)', duration: 0.3, ease: 'power2.in' }, s.at - 0.3);
      // Once it fills the frame it drops below the scenes (it comes first in the page), so the
      // next scene fades in over it.
      tl.set(g, { zIndex: 0 }, s.at);
      tl.fromTo(B, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out', immediateRender: false }, s.at);
      tl.set(g, { opacity: 0 }, s.at + 0.32);
    },
  };
${SCENE_HELPERS}
  function build() {
${js.join('\n')}
    const SEAMS = ${JSON.stringify(seams)};
    for (const s of SEAMS) TR[s.type](document.getElementById(s.from + '-stage'), document.getElementById(s.to + '-stage'), s);
    window.__timelines["main"] = tl;
    tl.seek(0);
    window.__hfTimelinesBuilding = false;
    window.dispatchEvent(new Event('hf-timelines-built'));
  }
  Promise.all([document.fonts.load("700 100px D"), document.fonts.load("400 100px T"), document.fonts.load("500 100px M")])
    .catch(() => {}).then(() => document.fonts.ready).then(build);
</script>
</body>
</html>
`;
  return { html, END, items, motion, cues: kept };
}

// Shared by the scene builders in the page.
const SCENE_HELPERS = `  // Lines enter one after another, the next starting when the last is under half done.
  function lines(ids, at, style, gap) { let t = at; ids.forEach(id => { const took = K.enter('#' + id, t, style); t += Math.max(gap || 0.3, Math.min(0.5, took * 0.45)); }); return t; }
  function leaveAll(ids, at) { ids.forEach((id, i) => K.leave('#' + id, at + i * 0.03)); }`;

// A line of text: an outer box and an inner line, which the mask entrance moves.
const line = (id, l, cls) => { const o = typeof l === 'string' ? { text: l } : l || {}; return `<div id="${id}" class="ln${o.tone === 'dim' ? ' dim' : o.tone === 'accent' ? ' accent' : ''}${cls ? ` ${cls}` : ''}"><span class="in">${rich(o.text)}</span></div>`; };
const q = s => JSON.stringify(s);

const SCENES = {
  title(sc, x) {
    const m = sc.make, id = sc.id;
    const ids = m.lines.map((_, i) => `${id}-l-${i}`);
    const live = x.first ? ids.slice(1) : ids;   // frame 0 is the thumbnail: the first line is already there
    return {
      first: `#${ids[0]}`,
      html: `<div id="${id}-big" class="big" style="font-size:${m.size || 168}px">${m.lines.map((l, i) => line(ids[i], l)).join('')}</div>${m.sub ? `<div class="sub" style="margin-top:40px">${line(`${id}-s`, m.sub)}</div>` : ''}`,
      js: `    ${m.fit ? `fit(${q(`${id}-big`)}, ${m.fit === true ? 0.84 : Number(m.fit)});` : ''}
    { const t = lines(${q(live)}, ${r2(x.at + (x.first ? 0.45 : 0.12))}, ${q(x.style)});
      ${m.sub ? `K.enter('#${id}-s', t + 0.2, ${q(x.style === 'line' ? 'blur' : 'line')});` : ''} }
    ${x.leaveAt != null ? `leaveAll(${q([...ids, ...(m.sub ? [`${id}-s`] : [])])}, ${x.leaveAt});` : ''}`,
    };
  },
  statement(sc, x) {
    const m = sc.make, id = sc.id;
    const ids = m.lines.map((_, i) => `${id}-l-${i}`);
    const live = x.first ? ids.slice(1) : ids;
    // Lines spread over the front of the scene, so each is read before the next arrives.
    const gap = r2(Math.max(0.5, Math.min(1.4, (x.d - 1.4) / Math.max(1, m.lines.length))));
    return {
      first: `#${ids[0]}`,
      html: `<div class="say" style="font-size:${m.size || 84}px">${m.lines.map((l, i) => line(ids[i], l)).join('')}</div>`,
      js: `    lines(${q(live)}, ${r2(x.at + (x.first ? gap : 0.15))}, ${q(x.style)}, ${gap});
    ${x.leaveAt != null ? `leaveAll(${q(ids)}, ${x.leaveAt});` : ''}`,
    };
  },
  // A number lands: it rolls in on digit columns, holds, and its label follows.
  number(sc, x) {
    const m = sc.make, id = sc.id;
    x.cue('ping', x.at + 1.4);
    return {
      first: `#${id}-n`,
      html: `${m.above ? `<div class="sub" style="margin-bottom:24px">${line(`${id}-a`, m.above)}</div>` : ''}
    <div id="${id}-n" class="num" style="font-size:${m.size || 300}px">${m.prefix ? `<span>${esc(m.prefix)}</span>` : ''}<span id="${id}-v">${esc(m.value)}</span>${m.suffix ? `<span style="font-size:.42em;letter-spacing:-0.02em;margin-left:.2em">${esc(m.suffix)}</span>` : ''}</div>
    ${m.label ? `<div class="sub" style="margin-top:28px;color:var(--ink)">${line(`${id}-lab`, m.label)}</div>` : ''}`,
      js: `    ${m.above && !x.first ? `K.enter('#${id}-a', ${r2(x.at + 0.1)}, 'line');` : ''}
    ${x.first ? '' : `K.enter('#${id}-n', ${r2(x.at + (m.above ? 0.35 : 0.1))}, 'line');`} K.odometer('#${id}-v', ${r2(x.at + (x.first ? 0 : m.above ? 0.35 : 0.1))}, 1.4);
    ${m.label ? `K.enter('#${id}-lab', ${r2(x.at + 1.45)}, 'blur');` : ''}
    ${x.leaveAt != null ? `leaveAll(${q([`${id}-n`, ...(m.above ? [`${id}-a`] : []), ...(m.label ? [`${id}-lab`] : [])])}, ${x.leaveAt});` : ''}`,
    };
  },
  terminal(sc, x) {
    const m = sc.make, id = sc.id;
    const above = m.above || [];
    const ids = above.map((_, i) => `${id}-a-${i}`);
    const n = m.command.length;
    const typeAt = r2(x.at + 0.35 + Math.min(1.2, above.length * 0.45)), typeDur = r2(Math.min(1.4, 0.045 * n + 0.25));
    for (let t = 0; t < typeDur; t += 1.5) x.cue('typing', typeAt + t);
    if (m.output) x.cue('click-soft', typeAt + typeDur + 0.15);
    return {
      first: ids.length ? `#${ids[0]}` : `#${id}-term`,
      html: `${above.length ? `<div class="say" style="font-size:${m.size || (above.length > 2 ? 64 : 80)}px;margin-bottom:56px">${above.map((l, i) => line(ids[i], l)).join('')}</div>` : ''}
    <div id="${id}-term" class="term">
      <div class="dots"><i></i><i></i><i></i></div>
      <div><span class="prompt">›</span><span id="${id}-ty">${esc(m.command)}</span></div>
      ${m.output ? `<div id="${id}-out" class="out">${rich(m.output).replace(/^([^.:]+[.:])/, '<b>$1</b>')}</div>` : ''}
    </div>
    ${m.lock ? `<div id="${id}-lock" class="lock" style="right:140px;bottom:120px"><div id="${id}-sh" class="shackle"></div><div class="body"></div></div>` : ''}`,
      js: `    ${ids.length ? `lines(${q(x.first ? ids.slice(1) : ids)}, ${r2(x.at + 0.1)}, ${q(x.style || 'blur')}, 0.45);` : ''}
    ${x.first && !ids.length ? '' : `K.enter('#${id}-term', ${r2(x.at + 0.25)}, 'line');`}
    K.type('#${id}-ty', ${typeAt}, ${typeDur});
    ${m.output ? `K.enter('#${id}-out', ${r2(typeAt + typeDur + 0.15)}, 'line');` : ''}
    ${m.lock ? `K.enter('#${id}-lock', ${r2(typeAt + typeDur + 0.3)}, 'snap'); tl.fromTo('#${id}-sh', { y: ${m.lock === 'close' ? -36 : 0} }, { y: ${m.lock === 'close' ? 0 : -40}, duration: 0.4, ease: naqshaDemo.spring(0.55), immediateRender: false }, ${r2(typeAt + typeDur + 0.6)});` : ''}
    ${x.leaveAt != null ? `leaveAll(${q([...ids, `${id}-term`])}, ${x.leaveAt});` : ''}`,
    };
  },
  recording(sc, x) {
    const m = sc.make, id = sc.id;
    let t = x.at;
    const mine = m.segments.map(([a, b], i) => { const s = { id: `${id}-r${i}`, scene: id, rec: m.rec, at: r2(t), dur: r2(b - a), from: a, until: b, first: i === 0, window: m.frame === 'window', zoom: m.zoom }; t += b - a; return s; });
    // UI sounds on the frames of the clicks, keys and typing in the log.
    const log = x.recs[m.rec];
    for (const s of mine) {
      const T = ms => s.at + ms / 1000 - s.from;
      for (const e of log.events.filter(e => e.t / 1000 >= s.from && e.t / 1000 < s.until)) {
        if (e.type === 'click') x.cue('click-soft', T(e.t));
        if (e.type === 'key') x.cue('key-press', T(e.t));
        if (e.type === 'type') for (let k = 0; k < (e.ms || 0) / 1000; k += 1.5) x.cue('typing', T(e.t) + k);
      }
    }
    const caps = m.caption.map((_, i) => `${id}-c-${i}`);
    return {
      first: `#${caps[0]}`,
      html: `<div id="${id}-frame" class="frame${m.frame === 'window' ? ' window' : ''}">${mine.map(s => `<div class="fit"><div id="${s.id}-layer" class="layer" data-layout-allow-overflow><video id="${s.id}" class="clip" src="assets/rec/${s.rec}.webm" muted data-start="${s.at}" data-duration="${s.dur}" data-media-start="${s.from}"></video></div></div>`).join('')}</div>
    <div id="${id}-cap" class="cap clip" data-start="${x.at}" data-duration="${x.d}">${m.caption.map((l, i) => line(caps[i], l)).join('')}</div>`,
      js: `    window_(${q(id)}, ${x.at}, ${x.d});
    ${mine.map(s => `segment(${q(s)});`).join(' ')}
    lines(${q(x.carried ? caps.slice(1) : caps)}, ${r2(x.at + 0.3)}, 'line', 0.35);
    ${x.leaveAt != null ? `leaveAll(${q(caps)}, ${x.leaveAt});` : ''}`,
    };
  },
  // The end card is performed, not faded in: the mark lands, the name arrives letter by
  // letter, a rule draws, the call to action is typed, and it all holds.
  end(sc, x) {
    const m = sc.make, id = sc.id;
    const land = x.at + (m.mark ? 0.5 : 0.15);
    x.cue('impact-bass-1', land + 0.25);
    const cmdAt = land + 1.15, cmdDur = m.command ? Math.min(1.2, 0.035 * m.command.length + 0.2) : 0;
    if (m.command) x.cue('typing', cmdAt + 0.1);
    return {
      first: `#${id}-${m.mark ? 'mark' : 'n'}`,
      center: m.align !== 'left',
      html: `${m.mark ? `<img id="${id}-mark" src="assets/media/${path.basename(m.mark)}" alt="" style="height:${m.markSize || 150}px;margin-bottom:36px">` : ''}
    <div id="${id}-n" class="big" style="font-size:${m.size || 220}px;text-transform:none">${esc(m.name)}</div>
    <div id="${id}-rule" class="rule" style="margin:34px 0 30px"></div>
    ${m.tagline ? `<div class="sub" style="font-size:60px;color:var(--ink)">${line(`${id}-g`, m.tagline)}</div>` : ''}
    ${m.command ? `<div id="${id}-c" class="chip" style="margin-top:44px"><span id="${id}-ct">${esc(m.command)}</span></div>` : ''}
    ${m.note ? `<div class="sub" style="font-size:30px;margin-top:30px">${line(`${id}-x`, m.note)}</div>` : ''}`,
      js: `    ${m.mark && !x.first ? `K.enter('#${id}-mark', ${r2(x.at + 0.1)}, 'snap');` : ''}
    ${m.mark || !x.first ? `K.enter('#${id}-n', ${r2(land)}, 'letters');` : ''}
    K.enter('#${id}-rule', ${r2(land + 0.55)}, 'cut'); tl.fromTo('#${id}-rule', { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power3.inOut', immediateRender: false }, ${r2(land + 0.55)});
    ${m.tagline ? `K.enter('#${id}-g', ${r2(land + 0.75)}, 'blur');` : ''}
    ${m.command ? `K.enter('#${id}-c', ${r2(cmdAt)}, 'snap'); K.type('#${id}-ct', ${r2(cmdAt + 0.1)}, ${r2(cmdDur)});` : ''}
    ${m.note ? `K.enter('#${id}-x', ${r2(cmdAt + cmdDur + 0.4)}, 'line');` : ''}`,
    };
  },
  // A hand-made scene: its markup in the stage, its script given the timeline, its start,
  // its length, the kit and the colors.
  custom(sc, x) {
    const c = x.custom;
    return {
      first: null,
      html: c.markup,
      js: `    (function () {\n${c.js}\n      const st = getComputedStyle(document.getElementById(${q(sc.id)}));
      scene(tl, ${x.at}, ${x.d}, K, { W, H, stage: document.getElementById(${q(`${sc.id}-stage`)}), ground: st.getPropertyValue('--ground').trim(), ink: st.getPropertyValue('--ink').trim(), dim: st.getPropertyValue('--dim').trim(), accent: st.getPropertyValue('--accent').trim(), spring: naqshaDemo.spring });
    })();`,
    };
  },
};

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

async function fetchSfx(demo) {
  const dir = path.join(demo, 'sfx');
  fs.mkdirSync(dir, { recursive: true });
  const failed = [];
  for (const f of ['manifest.json', 'CREDITS.md', ...SFX_FILES.map(n => `${n}.mp3`)]) {
    try {
      const r = await fetch(SFX_BASE + f);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.writeFileSync(path.join(dir, f), Buffer.from(await r.arrayBuffer()));
    } catch (e) { failed.push(`${f}: ${e.message}`); }
  }
  if (failed.length) { console.error(`Some sounds didn't download:\n- ${failed.join('\n- ')}`); process.exit(1); }
  console.log(`Sound pack in ${dir}: ${SFX_FILES.length} sounds, Pixabay Content License (CREDITS.md).`);
}

function report(v) {
  if (v.notes.length) console.log(`Notes (fix them, or keep one on purpose and say why):\n- ${v.notes.join('\n- ')}`);
}

function main(argv) {
  if (argv.includes('--env')) return env();
  const demo = path.resolve(argv[0] || '.');
  if (argv.includes('--fetch-sfx')) return fetchSfx(demo);
  const check = argv.includes('--check');
  const si = argv.indexOf('--storyline');
  const storyline = si >= 0 ? argv[si + 1] : null;
  const planFile = path.join(demo, 'plan.js');
  const plan = readPlan(planFile);
  const v = validate(demo, plan, { storyline });
  if (v.problems.length) {
    console.error(`Not composed. Fix these first:\n- ${v.problems.join('\n- ')}`);
    report(v);
    process.exit(1);
  }
  const { items, end } = timeline(v.scenes);
  const seams = items.slice(1).map(x => x.t.type);
  const summary = `${v.scenes.length} scenes, ${end.toFixed(1)} s, transitions: ${seams.join(', ') || 'none'}`;
  if (check) { console.log(`Ready: ${summary}.`); report(v); return; }

  const video = path.join(demo, 'video');
  for (const d of ['rec', 'fonts', 'sfx', 'audio', 'media']) fs.mkdirSync(path.join(video, 'assets', d), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'naqsha-demo.js'), path.join(video, 'assets', 'naqsha-demo.js'));
  for (const f of Object.values(v.look.fonts)) if (f && f.file) fs.copyFileSync(path.join(demo, f.file), path.join(video, 'assets', 'fonts', path.basename(f.file)));
  const { html, END, motion, cues } = build(v, { recs: v.recs, fps: plan.meta && plan.meta.fps });
  for (const r of new Set(v.scenes.filter(s => s.make.type === 'recording').map(s => s.make.rec))) fs.copyFileSync(path.join(demo, 'capture', r, 'recording.webm'), path.join(video, 'assets', 'rec', `${r}.webm`));
  for (const s of new Set(cues.map(c => c.sound))) fs.copyFileSync(path.join(demo, 'sfx', `${s}.mp3`), path.join(video, 'assets', 'sfx', `${s}.mp3`));
  for (const a of [v.sound.music, v.sound.voice].filter(Boolean)) fs.copyFileSync(path.join(demo, a.file), path.join(video, 'assets', 'audio', path.basename(a.file)));
  if (fs.existsSync(path.join(demo, 'media'))) for (const f of fs.readdirSync(path.join(demo, 'media'))) fs.copyFileSync(path.join(demo, 'media', f), path.join(video, 'assets', 'media', f));
  for (const s of v.scenes) if (s.make.type === 'end' && s.make.mark) fs.copyFileSync(path.join(demo, s.make.mark), path.join(video, 'assets', 'media', path.basename(s.make.mark)));
  // index.html is always the composition being worked on: `hyperframes check` reads only it,
  // and checks the motion assertions next to it.
  fs.writeFileSync(path.join(video, 'index.html'), html);
  fs.writeFileSync(path.join(video, 'index.motion.json'), JSON.stringify({ assertions: motion }, null, 2) + '\n');
  if (storyline) {
    // Outside the project: a second root-level composition there would be a second entry point.
    fs.mkdirSync(path.join(demo, 'samples'), { recursive: true });
    fs.writeFileSync(path.join(demo, 'samples', `storyline-${storyline}.html`), html);
  } else {
    // The page lists scenes by their real start and length.
    for (const it of items) { const sc = plan.scenes.find(s => s.id === it.sc.id); sc.at = it.at; sc.seconds = it.d; }
    fs.writeFileSync(planFile, `window.NAQSHA = ${JSON.stringify(plan, null, 2)};\n`);
  }
  console.log(`Composed video/index.html${storyline ? ` (a copy in samples/storyline-${storyline}.html)` : ''}: ${summary}, ${cues.length} sound cues${v.sound.music ? ', music' : ''}.`);
  report(v);
  return END;
}

if (require.main === module) {
  Promise.resolve().then(() => main(process.argv.slice(2))).catch(e => { console.error(`compose: ${e.message}`); process.exit(1); });
}
module.exports = { validate, timeline, build, readTime, palette, contrast, TRANSITIONS };
