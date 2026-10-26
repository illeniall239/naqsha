#!/usr/bin/env node
// naqsha design shots: renders every preview of a design (each screen in each state, and the
// options of its decisions) at real device widths, the way its page renders them, and saves
// screenshots plus contact sheets, so Claude and a reviewer judge the rendered result instead
// of the code that was meant to produce it.
//
//   node design-shots.mjs <design folder> [--widths phone,desktop] [--screens SC1,SC2]
//                         [--options] [--only-options] [--dark] [--out <dir>]
//
// <design folder> holds index.html (the naqsha page) and plan.js. Shots go to
// <folder>/shots/ by default: one full-page PNG per preview and width, and sheet-<width>-<n>.png
// with up to nine first viewports each, labeled. Playwright is loaded from the project, or
// from a global install.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const folder = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : null;
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
if (!folder || !fs.existsSync(path.join(folder, 'index.html')) || !fs.existsSync(path.join(folder, 'plan.js'))) {
  console.error('usage: node design-shots.mjs <design folder with index.html and plan.js> [--widths phone,desktop] [--screens SC1,SC2] [--options] [--dark] [--out dir]');
  process.exit(2);
}
const WIDTHS = { phone: [390, 780], tablet: [820, 1000], desktop: [1440, 900] };
const widths = (opt('--widths') || 'phone,desktop').split(',').filter(w => WIDTHS[w]);
const only = opt('--screens') ? new Set(opt('--screens').split(',')) : null;
const out = path.resolve(opt('--out') || path.join(folder, 'shots'));

function loadPlaywright() {
  const tries = [path.join(process.cwd(), 'package.json'), path.join(folder, 'package.json')];
  try { tries.push(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'noop.js')); } catch {}
  for (const from of tries) { try { return createRequire(from)('playwright'); } catch {} }
  console.error('Playwright not found in this project or globally. Ask the user to install it (npm i -D playwright, or npm i -g playwright), then npx playwright install chromium.');
  process.exit(2);
}

// A browser Playwright already downloaded, for when the project's Playwright expects a
// different build than the one in the cache.
function cachedChromium() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(home, '.cache', 'ms-playwright'), path.join(home, 'Library', 'Caches', 'ms-playwright'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright')].filter(Boolean);
  const bins = ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe', 'chrome-win64/chrome.exe'];
  for (const r of roots) {
    let dirs = [];
    try { dirs = fs.readdirSync(r).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])); } catch { continue; }
    for (const d of dirs) for (const b of bins) if (fs.existsSync(path.join(r, d, b))) return path.join(r, d, b);
  }
  return null;
}

const { chromium } = loadPlaywright();
let browser;
try { browser = await chromium.launch(); } catch (e) {
  const exe = cachedChromium();
  try { if (!exe) throw e; browser = await chromium.launch({ executablePath: exe }); } catch {
    console.error(`Chromium didn't start (${e.message.split('\n')[0]}). Run: npx playwright install chromium`);
    process.exit(2);
  }
}
fs.mkdirSync(out, { recursive: true });

// The page builds each preview's document (tokens as CSS variables, fonts, the HTML), so the
// shots match what the user sees on the page exactly.
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(folder, 'index.html')).href);
await page.waitForFunction(() => typeof frameDoc === 'function' && window.NAQSHA, null, { timeout: 15000 });
const docs = await page.evaluate(({ only, wantOptions, onlyOptions, dark }) => {
  const p = window.NAQSHA;
  const list = [];
  const variants = dark && ((p.tokens || {}).dark || []).length ? [false, true] : [false];
  for (const d of variants) {
    frameDark = d;
    if (!onlyOptions) for (const sc of p.screens || []) {
      if (only && !only.includes(sc.id)) continue;
      for (const [state, html] of Object.entries(sc.previews || {})) list.push({ name: `${sc.id}-${state}${d ? '-dark' : ''}`, label: `${sc.id} ${sc.name || ''} · ${state}${d ? ' · dark' : ''}`, doc: frameDoc(p, html, true) });
    }
    if (wantOptions || onlyOptions) for (const dec of p.decisions || []) (dec.options || []).forEach((o, i) => {
      if (o.preview) list.push({ name: `${dec.id}-option-${i + 1}${d ? '-dark' : ''}`, label: `${dec.id} option ${i + 1}: ${o.name}${d ? ' · dark' : ''}`, doc: frameDoc(p, o.preview, !!p.tokens) });
    });
  }
  frameDark = false;
  return list;
}, { only: only ? [...only] : null, wantOptions: args.includes('--options'), onlyOptions: args.includes('--only-options'), dark: args.includes('--dark') });
if (!docs.length) { console.error('No previews to shoot.'); process.exit(1); }

const shots = [];
for (const w of widths) {
  const [vw, vh] = WIDTHS[w];
  const p = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  for (const d of docs) {
    await p.setContent(d.doc, { waitUntil: 'load' }).catch(() => {});
    await p.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    // Entrance choreography settles before the shot, so nothing reads as missing.
    await p.waitForTimeout(1400);
    const file = path.join(out, `${d.name}-${w}.png`);
    const height = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.screenshot({ path: file, fullPage: height <= 4000, clip: height > 4000 ? { x: 0, y: 0, width: vw, height: 4000 } : undefined });
    shots.push({ ...d, width: w, file });
  }
  await p.close();
}

// Contact sheets: the first viewport of up to nine previews per sheet, per width.
const sheets = [];
for (const w of widths) {
  const [vw, vh] = WIDTHS[w];
  const mine = shots.filter(s => s.width === w);
  const cols = w === 'phone' ? 5 : 3, per = w === 'phone' ? 10 : 9;
  const tileW = w === 'phone' ? 300 : 620, tileH = Math.round(tileW * vh / vw);
  for (let i = 0; i < mine.length; i += per) {
    const group = mine.slice(i, i + per);
    const html = `<!doctype html><body style="margin:0;padding:16px;background:#e9e9e6;font:13px system-ui;display:grid;grid-template-columns:repeat(${cols},${tileW}px);gap:16px">${group.map(s =>
      `<figure style="margin:0"><div style="width:${tileW}px;height:${tileH}px;overflow:hidden;background:#fff;box-shadow:0 0 0 1px #0002"><img src="${pathToFileURL(s.file).href}" style="width:${tileW}px;display:block"></div><figcaption style="margin-top:6px;color:#222">${s.label.replace(/</g, '&lt;')}</figcaption></figure>`).join('')}</body>`;
    const sp = await browser.newPage({ viewport: { width: cols * tileW + (cols + 1) * 16, height: 400 } });
    const tmp = path.join(out, `.sheet-${w}.html`);
    fs.writeFileSync(tmp, html);
    await sp.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
    const file = path.join(out, `sheet-${w}-${i / per + 1}.png`);
    await sp.screenshot({ path: file, fullPage: true });
    fs.rmSync(tmp);
    await sp.close();
    sheets.push(file);
  }
}
await browser.close();
console.log(`Shot ${shots.length} previews (${widths.join(', ')}) into ${out}.\nContact sheets (look at these first):\n${sheets.map(s => `  ${s}`).join('\n')}`);
