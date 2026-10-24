'use strict';
// Runs the page server as Claude does: start, the user sends, wait collects.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { checkSubmission } = require('../scripts/serve.js');

const SERVE = path.join(__dirname, '..', 'scripts', 'serve.js');

function planDir(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'naqsha-serve-')));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>page</title>');
  fs.writeFileSync(path.join(dir, 'plan.js'), 'window.NAQSHA = {"meta":{}};\n');
  t.after(() => execFileSync('node', [SERVE, 'stop', dir]));
  return dir;
}

const start = dir => JSON.parse(execFileSync('node', [SERVE, 'start', dir], { encoding: 'utf8' }));

function post(base, body, headers = {}) {
  return fetch(new URL('submit' + base.search, base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base.origin, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('the page and plan are served only with the key, from localhost', async t => {
  const dir = planDir(t);
  const { url, started } = start(dir);
  assert.equal(started, true);
  const base = new URL(url);
  assert.equal(base.hostname, '127.0.0.1');

  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.match(await (await fetch(new URL('plan.js' + base.search, base))).text(), /NAQSHA/);

  assert.equal((await fetch(base.origin + '/')).status, 403, 'no key');
  assert.equal((await fetch(base.origin + '/?key=wrong')).status, 403, 'wrong key');
  assert.equal((await fetch(new URL('server.json' + base.search, base))).status, 404, 'only the page and plan');
  assert.equal((await fetch(new URL('..%2fetc%2fpasswd' + base.search, base))).status, 404);
  // A rebinding attack arrives with the attacker's host name.
  const rebound = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-H', 'Host: evil.example', url], { encoding: 'utf8' });
  assert.equal(rebound, '403');
});

test('a restarted server keeps its port and key, so the open tab reconnects', async t => {
  const dir = planDir(t);
  const first = start(dir);
  assert.equal(start(dir).started, false, 'reused while running');
  execFileSync('node', [SERVE, 'stop', dir]);
  await new Promise(r => setTimeout(r, 200));
  const second = start(dir);
  assert.equal(second.started, true);
  assert.equal(second.url, first.url);
  assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /server\.json/);
  assert.equal((fs.statSync(path.join(dir, 'server.json')).mode & 0o077), 0, 'key file is private');
});

test('what the user sends reaches wait, oldest first, once', async t => {
  const dir = planDir(t);
  const base = new URL(start(dir).url);

  const waiter = spawn('node', [SERVE, 'wait', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  waiter.stdout.on('data', c => { out += c; });
  const exited = new Promise(r => waiter.on('exit', r));

  const r = await post(base, {
    answers: [{ id: 'Q1', choice: ['Under 100'], text: '', note: 'mostly at month end' }],
    comments: [{ section: 'architecture', text: 'Why a queue?' }],
    message: 'looks close',
  });
  assert.equal(r.status, 200);
  assert.equal(await exited, 0);
  const sent = JSON.parse(out);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].answers, [{ id: 'Q1', choice: ['Under 100'], text: '', note: 'mostly at month end' }]);
  assert.equal(sent[0].comments[0].text, 'Why a queue?');
  assert.equal(sent[0].message, 'looks close');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'inbox')), [], 'collected once');

  // Sent while nobody waits: kept for the next wait.
  await post(base, { message: 'first' });
  await post(base, { message: 'second' });
  const later = JSON.parse(execFileSync('node', [SERVE, 'wait', dir], { encoding: 'utf8' }));
  assert.deepEqual(later.map(s => s.message), ['first', 'second']);
});

test('wait gives up after its time limit and says so', t => {
  const dir = planDir(t);
  start(dir);
  let err;
  try { execFileSync('node', [SERVE, 'wait', dir, '--minutes', '0.01'], { encoding: 'utf8' }); } catch (e) { err = e; }
  assert.equal(err.status, 2);
  assert.match(err.stdout, /Nothing sent yet/);
});

test('bad submissions are refused', async t => {
  const dir = planDir(t);
  const base = new URL(start(dir).url);
  assert.equal((await post(base, '{nope')).status, 400);
  assert.equal((await post(base, {})).status, 400, 'nothing to send');
  assert.equal((await post(base, { message: 'hi' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(base, { message: 'x'.repeat(600 * 1024) })).status, 413);

  assert.match(checkSubmission([]), /JSON object/);
  assert.match(checkSubmission({ answers: [{ id: 'q1' }] }), /id like Q1/);
  assert.match(checkSubmission({ answers: [{ id: 'Q1', choice: 'A' }] }), /isn't text/);
  assert.match(checkSubmission({ answers: [{ id: 'Q1', note: 'x'.repeat(20001) }] }), /longer than/);
  assert.match(checkSubmission({ comments: [{ section: '../x', text: 'hi' }] }), /section/);
  assert.match(checkSubmission({ comments: [{ section: 'risks', text: '  ' }] }), /some text/);
  assert.equal(checkSubmission({ answers: [{ id: 'D12', choice: ['A'] }] }), null);
  assert.deepEqual(fs.readdirSync(dir).filter(f => f === 'inbox'), [], 'nothing refused was stored');
});
