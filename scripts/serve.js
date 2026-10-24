#!/usr/bin/env node
// naqsha page server: serves a plan's page on localhost so the user can
// answer its questions and comment on it, and hands what they send to Claude.
// Approval never goes through here. It stays the /naqsha:approve command,
// which Claude can't send; anything this server accepts, Claude could fake.
//
//   serve.js start <plan-dir> [--open]   start (or reuse) the server, print its URL
//   serve.js wait <plan-dir> [--minutes N] block until the user sends; print it
//   serve.js stop <plan-dir>
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const SERVER_FILE = 'server.json';
const INBOX = 'inbox';
const PAGES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/plan.js': ['plan.js', 'text/javascript; charset=utf-8'],
};
const MAX_BODY = 512 * 1024;
const MAX_TEXT = 20000;
const MAX_ITEMS = 200;
// The open page polls every 3 s, so a quiet hour means nobody is looking.
const IDLE_MS = 60 * 60 * 1000;
const WAIT_MINUTES = 110;
const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
  "style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'";

// ---- the server ----------------------------------------------------------

function run(dir, port, key) {
  let lastRequest = Date.now();
  const server = http.createServer((req, res) => {
    lastRequest = Date.now();
    handle(req, res, dir, key, server.address().port);
  });
  // Reuse the old port so an open tab reconnects; take any port if it's gone.
  server.on('error', e => {
    if (e.code === 'EADDRINUSE' && port) { port = 0; server.listen(0, '127.0.0.1'); } else throw e;
  });
  server.on('listening', () => {
    writeJson(path.join(dir, SERVER_FILE), { pid: process.pid, port: server.address().port, key, dir });
  });
  server.listen(port, '127.0.0.1');
  setInterval(() => { if (Date.now() - lastRequest > IDLE_MS) process.exit(0); }, 60000).unref();
}

function handle(req, res, dir, key, port) {
  const url = new URL(req.url, 'http://localhost');
  // The Host check stops DNS rebinding; the key stops other sites and pages.
  const origins = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!origins.includes(req.headers.host) || !sameSecret(url.searchParams.get('key'), key)) {
    return send(res, 403, 'Forbidden');
  }
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, JSON.stringify({ dir }), 'application/json');
  if (req.method === 'GET' && PAGES[url.pathname]) {
    const [file, type] = PAGES[url.pathname];
    let body;
    try { body = fs.readFileSync(path.join(dir, file)); } catch { return send(res, 404, 'Not found'); }
    return send(res, 200, body, type);
  }
  if (req.method === 'POST' && url.pathname === '/submit') {
    if (req.headers.origin && !origins.some(o => req.headers.origin === `http://${o}`)) return send(res, 403, 'Forbidden');
    return receive(req, res, dir);
  }
  return send(res, 404, 'Not found');
}

function receive(req, res, dir) {
  const chunks = [];
  let size = 0;
  req.on('data', c => {
    size += c.length;
    if (size > MAX_BODY) { send(res, 413, 'Too much to send at once'); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (size > MAX_BODY) return;
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, 'Not JSON'); }
    const problem = checkSubmission(body);
    if (problem) return send(res, 400, problem);
    const entry = {
      submittedAt: new Date().toISOString(),
      answers: list(body.answers).map(a => ({ id: a.id, choice: list(a.choice), text: a.text || '', note: a.note || '' })),
      comments: list(body.comments).map(c => ({ section: c.section, text: c.text })),
      message: body.message || '',
    };
    const inbox = path.join(dir, INBOX);
    fs.mkdirSync(inbox, { recursive: true });
    writeJson(path.join(inbox, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`), entry);
    send(res, 200, JSON.stringify({ ok: true }), 'application/json');
  });
}

// What the page sends is the user's own words. It's checked for shape and
// size only; Claude reads it as their answer, never as instructions to run.
function checkSubmission(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'Expected a JSON object';
  const answers = b.answers ?? [];
  const comments = b.comments ?? [];
  if (!Array.isArray(answers) || !Array.isArray(comments) || answers.length > MAX_ITEMS || comments.length > MAX_ITEMS) {
    return `answers and comments must be lists of at most ${MAX_ITEMS}`;
  }
  for (const a of answers) {
    if (!a || typeof a !== 'object' || !/^[A-Z]{1,2}\d{1,4}$/.test(a.id)) return 'Every answer needs an id like Q1 or D2';
    const choice = a.choice ?? [];
    if (!Array.isArray(choice) || choice.length > 20 || ![...choice, a.text ?? '', a.note ?? ''].every(isText)) {
      return `Answer ${a.id} has a field that isn't text or is longer than ${MAX_TEXT} characters`;
    }
  }
  for (const c of comments) {
    if (!c || typeof c !== 'object' || !/^[A-Za-z]{1,40}$/.test(c.section) || !isText(c.text) || !c.text.trim()) {
      return 'Every comment needs a section and some text';
    }
  }
  if (!isText(b.message ?? '')) return `The message is longer than ${MAX_TEXT} characters`;
  if (!answers.length && !comments.length && !(b.message || '').trim()) return 'Nothing to send';
  return null;
}

const isText = s => typeof s === 'string' && s.length <= MAX_TEXT;

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...(type.startsWith('text/html') ? { 'Content-Security-Policy': CSP } : {}),
  });
  res.end(body);
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---- commands ------------------------------------------------------------

// Starts the server in its own process so it outlives this command, keeping
// the port and key it had before so an open tab picks up where it left off.
async function start(dir, { open = false } = {}) {
  const file = path.join(dir, SERVER_FILE);
  let info = readJson(file);
  let started = false;
  if (!info || !(await alive(info, dir))) {
    ignoreServerFiles(dir);
    const key = (info && info.key) || crypto.randomBytes(24).toString('base64url');
    const child = spawn(process.execPath, [__filename, 'run', dir, String((info && info.port) || 0)], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, NAQSHA_PAGE_KEY: key }, // not argv: other users can list that
    });
    child.unref();
    info = await until(() => { const i = readJson(file); return i && i.pid === child.pid ? i : null; }, 5000);
    if (!info) throw new Error('the page server did not start within 5 s');
    started = true;
  }
  const url = `http://127.0.0.1:${info.port}/?key=${info.key}`;
  if (open) openBrowser(url);
  return { url, started };
}

// Prints everything the user sent, oldest first, and clears the inbox.
async function wait(dir, minutes) {
  await start(dir);
  const inbox = path.join(dir, INBOX);
  const deadline = Date.now() + minutes * 60000;
  let checked = Date.now();
  for (;;) {
    const files = safeReaddir(inbox).filter(f => f.endsWith('.json')).sort();
    if (files.length) {
      const sent = files.map(f => readJson(path.join(inbox, f))).filter(Boolean);
      for (const f of files) fs.rmSync(path.join(inbox, f), { force: true });
      return sent;
    }
    if (Date.now() > deadline) return null;
    // A closed tab lets the server idle out; bring it back for when they return.
    if (Date.now() - checked > 30000) { checked = Date.now(); await start(dir); }
    await sleep(500);
  }
}

function stop(dir) {
  const info = readJson(path.join(dir, SERVER_FILE));
  if (!info) return false;
  try { process.kill(info.pid); return true; } catch { return false; }
}

function alive(info, dir) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: info.port, path: `/health?key=${encodeURIComponent(info.key)}`, timeout: 1000 }, res => {
      let body = '';
      res.on('data', c => { body += c; }).on('end', () => {
        try { resolve(res.statusCode === 200 && JSON.parse(body).dir === dir); } catch { resolve(false); }
      });
    });
    req.on('timeout', () => req.destroy()).on('error', () => resolve(false));
  });
}

// The plan folder is committed; the server's key and the inbox are not.
function ignoreServerFiles(dir) {
  const f = path.join(dir, '.gitignore');
  if (!fs.existsSync(f)) fs.writeFileSync(f, `${SERVER_FILE}\n${INBOX}/\n`);
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); } catch { /* the URL is printed anyway */ }
}

// ---- helpers -------------------------------------------------------------

function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function safeReaddir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function list(x) {
  return Array.isArray(x) ? x : [];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function until(f, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) {
    const v = f();
    if (v) return v;
  }
  return null;
}

async function main(argv) {
  const [cmd, target, ...rest] = argv;
  if (!['start', 'wait', 'stop', 'run'].includes(cmd) || !target) {
    throw new Error('usage: serve.js start|wait|stop <plan-dir> [--open] [--minutes N]');
  }
  const dir = fs.realpathSync(path.resolve(target));
  if (cmd === 'run') {
    if (!process.env.NAQSHA_PAGE_KEY) throw new Error('run is started by start, which passes the key');
    return run(dir, Number(rest[0]) || 0, process.env.NAQSHA_PAGE_KEY);
  }
  if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error(`${dir} has no index.html`);

  if (cmd === 'start') {
    console.log(JSON.stringify(await start(dir, { open: rest.includes('--open') })));
  } else if (cmd === 'stop') {
    console.log(stop(dir) ? 'stopped' : 'not running');
  } else {
    const i = rest.indexOf('--minutes');
    const sent = await wait(dir, i >= 0 ? Number(rest[i + 1]) || WAIT_MINUTES : WAIT_MINUTES);
    if (!sent) {
      console.log('Nothing sent yet. The page keeps anything the user sends; run wait again to collect it.');
      process.exitCode = 2;
    } else {
      console.log(JSON.stringify(sent, null, 2));
    }
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(e => {
    process.stderr.write(`naqsha page: ${e.message}\n`);
    process.exit(1);
  });
}

module.exports = { checkSubmission };
