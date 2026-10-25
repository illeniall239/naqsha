// naqsha demo capture: drives the real app with Playwright at a human pace and
// logs every cursor move, click and keystroke with its time, so the composition
// can zoom, draw the cursor and place ripples exactly, with no screen logger.
//
//   node capture.mjs <shot.json> --rehearse   run every step for real, screenshot each, record nothing
//   node capture.mjs <shot.json>              record: <out>/recording.webm and <out>/events.json
//
// Frames come from Chrome's screencast at device pixels (Playwright's own video recorder
// captures at the window's CSS size and pads the rest), then FFmpeg assembles them into a
// constant 30 fps video using each frame's real timestamp.
//
// shot.json:
//   { "url": "http://localhost:3000", "out": "<folder>", "viewport": { "width": 1920, "height": 1080 },
//     "scale": 1.5,                           // pixel density: a 1280x720 window recorded at 1920x1080, sharp when zoomed
//     "colorScheme": "light", "seed": 7, "holdMs": 900,
//     "masks": ["[data-sensitive]"],          // blurred in the composition, located at each step
//     "steps": [
//       { "do": "goto", "url": "/login" },
//       { "do": "click", "selector": "text=Sign in", "label": "Sign in" },
//       { "do": "type", "selector": "#email", "text": "demo@example.com" },
//       { "do": "press", "key": "Enter" },
//       { "do": "hover", "selector": ".card" },
//       { "do": "scroll", "selector": "#pricing" },   // or { "do": "scroll", "y": 600 }
//       { "do": "waitFor", "selector": ".toast" },
//       { "do": "wait", "ms": 1200 },
//       { "do": "mark", "name": "aha" }               // a named moment the storyboard can cut to
//     ] }
// Playwright is loaded from the project being recorded (or installed with `npx playwright`).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [file, flag] = process.argv.slice(2);
if (!file) { console.error('usage: node capture.mjs <shot.json> [--rehearse]'); process.exit(2); }
const shot = JSON.parse(fs.readFileSync(file, 'utf8'));
const rehearse = flag === '--rehearse';
const out = path.resolve(path.dirname(file), shot.out || '.');
const viewport = shot.viewport || { width: 1920, height: 1080 };
const holdMs = shot.holdMs ?? 900;
const scale = shot.scale || 1;
const videoSize = { width: Math.round(viewport.width * scale), height: Math.round(viewport.height * scale) };

let playwright;
try {
  playwright = createRequire(path.join(process.cwd(), 'package.json'))('playwright');
} catch {
  console.error('Playwright not found in this project. Install it (npm i -D playwright && npx playwright install chromium) or run from a project that has it.');
  process.exit(2);
}

// Seeded jitter, so a re-record paces the same way.
let s = shot.seed ?? 7;
const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await playwright.chromium.launch();
const context = await browser.newContext({
  viewport, deviceScaleFactor: scale, colorScheme: shot.colorScheme || 'light', reducedMotion: 'no-preference',
});
// Masks are tracked on every animation frame inside the page, so a layout shift
// or a scroll never leaves sensitive text uncovered between steps.
await context.addInitScript(selectors => {
  window.__naqshaMasks = [];
  const last = {};
  const tick = () => {
    for (const sel of selectors) {
      const boxes = [...document.querySelectorAll(sel)].map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; });
      const key = JSON.stringify(boxes);
      if (last[sel] !== key) { last[sel] = key; window.__naqshaMasks.push({ at: performance.timeOrigin + performance.now(), selector: sel, boxes }); }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, shot.masks || []);
const page = await context.newPage();
const t0 = Date.now();
const raw = path.join(out, 'raw');
const frames = [];
let cdp;
if (!rehearse) {
  fs.rmSync(raw, { recursive: true, force: true });
  fs.mkdirSync(raw, { recursive: true });
  cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', async f => {
    const file = path.join(raw, `${String(frames.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, at: f.metadata.timestamp * 1000 });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
}
const now = () => Date.now() - t0;
const events = [];
const masks = [];
const failures = [];
let cursor = { x: viewport.width / 2, y: viewport.height / 2 };
const base = shot.url || '';

async function target(selector) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 8000 });
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  if (!box) throw new Error(`${selector} has no box`);
  // Covered by something else (a cookie banner, an overlay)? A click would land on that instead.
  const covered = await el.evaluate((node, p) => {
    const hit = document.elementFromPoint(p.x, p.y);
    return !(hit && (hit === node || node.contains(hit)));
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  if (covered) throw new Error(`${selector} is covered by another element at its center`);
  return box;
}

// An eased path at a human speed: longer moves take longer, never instant.
async function moveTo(x, y) {
  const from = { ...cursor };
  const dist = Math.hypot(x - from.x, y - from.y);
  const ms = Math.round(Math.min(950, 320 + dist * 0.45) * (0.9 + rand() * 0.2));
  const steps = Math.max(8, Math.round(ms / 16));
  const start = now();
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
    await sleep(ms / steps);
  }
  cursor = { x, y };
  events.push({ t: start, type: 'move', from, to: { x, y }, ms: now() - start });
}

// Collected before each navigation (which clears the page) and at the end.
async function collectMasks() {
  const got = await page.evaluate(() => { const m = window.__naqshaMasks || []; window.__naqshaMasks = []; return m; }).catch(() => []);
  for (const m of got) masks.push({ t: Math.max(0, Math.round(m.at - t0)), selector: m.selector, boxes: m.boxes });
}

for (const [i, step] of (shot.steps || []).entries()) {
  const n = String(i + 1).padStart(2, '0');
  try {
    if (step.do === 'goto') {
      await collectMasks();
      await page.goto(new URL(step.url || '/', base || undefined).toString(), { waitUntil: 'networkidle' });
      events.push({ t: now(), type: 'goto', url: page.url(), label: step.label });
    } else if (step.do === 'click' || step.do === 'hover') {
      const box = await target(step.selector);
      await moveTo(box.x + box.width / 2, box.y + box.height / 2);
      if (step.do === 'click') {
        await sleep(120);
        events.push({ t: now(), type: 'click', x: cursor.x, y: cursor.y, box, label: step.label || step.selector });
        await page.mouse.click(cursor.x, cursor.y);
      } else events.push({ t: now(), type: 'hover', box, label: step.label || step.selector });
    } else if (step.do === 'type') {
      const box = await target(step.selector);
      await moveTo(box.x + Math.min(40, box.width / 2), box.y + box.height / 2);
      events.push({ t: now(), type: 'click', x: cursor.x, y: cursor.y, box, label: step.label || step.selector });
      await page.mouse.click(cursor.x, cursor.y);
      const start = now();
      for (const ch of step.text) { await page.keyboard.type(ch); await sleep(45 + rand() * 45); }
      events.push({ t: start, type: 'type', text: step.text, box, ms: now() - start });
    } else if (step.do === 'press') {
      events.push({ t: now(), type: 'key', key: step.key, label: step.label });
      await page.keyboard.press(step.key);
    } else if (step.do === 'scroll') {
      const y = step.selector ? (await page.locator(step.selector).first().evaluate(e => e.getBoundingClientRect().top + window.scrollY)) - 80 : step.y;
      const start = now();
      await page.evaluate(top => window.scrollTo({ top, behavior: 'smooth' }), y);
      await sleep(900);
      events.push({ t: start, type: 'scroll', y, ms: now() - start });
    } else if (step.do === 'waitFor') {
      await page.locator(step.selector).first().waitFor({ state: 'visible', timeout: 15000 });
    } else if (step.do === 'wait') {
      await sleep(step.ms || 1000);
    } else if (step.do === 'mark') {
      events.push({ t: now(), type: 'mark', name: step.name });
    } else throw new Error(`unknown step "${step.do}"`);
    if (rehearse) await page.screenshot({ path: path.join(out, 'rehearse', `${n}.png`) }).catch(async () => {
      fs.mkdirSync(path.join(out, 'rehearse'), { recursive: true });
      await page.screenshot({ path: path.join(out, 'rehearse', `${n}.png`) });
    });
    if (step.do !== 'wait' && step.do !== 'mark') await sleep(step.holdMs ?? holdMs);
  } catch (e) {
    failures.push(`step ${i + 1} (${step.do}${step.selector ? ` ${step.selector}` : ''}): ${e.message.split('\n')[0]}`);
    if (!rehearse) break;
  }
}

await collectMasks();
const duration = now();
if (cdp) { await cdp.send('Page.stopScreencast').catch(() => {}); await sleep(200); }
await context.close();
await browser.close();

if (rehearse) {
  console.log(failures.length ? `Rehearsal failed:\n- ${failures.join('\n- ')}` : `Rehearsal passed: ${(shot.steps || []).length} steps, screenshots in ${path.join(out, 'rehearse')}`);
  process.exit(failures.length ? 1 : 0);
}
// The screencast sends a frame only when the page changes. For every 1/30 s of the
// session, link the frame that was on screen then, and encode that exact sequence at
// 30 fps, so the video's time is the event log's time with no drift.
if (!frames.length) { console.error('No frames were captured.'); process.exit(1); }
const FPS = 30;
const total = Math.ceil((duration / 1000) * FPS);
let j = 0;
for (let k = 0; k < total; k++) {
  const t = t0 + (k * 1000) / FPS;
  while (j + 1 < frames.length && frames[j + 1].at <= t) j++;
  fs.linkSync(frames[j].file, path.join(raw, `seq-${String(k).padStart(6, '0')}.jpg`));
}
const enc = spawnSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', 'seq-%06d.jpg',
  '-vf', `scale=${videoSize.width}:${videoSize.height}:flags=lanczos,format=yuv420p`,
  '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '20', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', path.join(out, 'recording.webm')], { cwd: raw, encoding: 'utf8' });
if (enc.status !== 0) { console.error(`FFmpeg could not assemble the frames: ${enc.stderr}`); process.exit(1); }
fs.rmSync(raw, { recursive: true, force: true });
// Events are in the window's CSS pixels; the video is viewport x scale.
const span = frames.length ? { first: Math.round(frames[0].at - t0), last: Math.round(frames[frames.length - 1].at - t0), count: frames.length } : null;
fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify({ viewport, scale, video: videoSize, duration, frames: span, events, masks, failures }, null, 2));
console.log(failures.length ? `Recorded with a failure, stopped at: ${failures[0]}` : `Recorded ${(duration / 1000).toFixed(1)} s: ${path.join(out, 'recording.webm')}, ${events.length} events in events.json`);
process.exit(failures.length ? 1 : 0);
