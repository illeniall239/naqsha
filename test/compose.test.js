'use strict';
// The demo composer: it validates a whole storyboard at once, and writes a composition with
// the rules learned from real renders built in.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const COMPOSE = path.join(__dirname, '..', 'assets', 'demo', 'compose.cjs');
const run = (...args) => spawnSync('node', [COMPOSE, ...args], { encoding: 'utf8' });

function demo(t, scenes, look) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naqsha-demo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const plan = { meta: { title: 'Launch', kind: 'demo', status: 'storyboard' }, look, scenes };
  fs.writeFileSync(path.join(dir, 'plan.js'), `window.NAQSHA = ${JSON.stringify(plan)};\n`);
  return dir;
}
const LOOK = { template: 'signal', entrance: 'mask', fonts: { display: { family: 'Inter Tight', file: 'fonts/D.woff2' }, mono: { family: 'Plex Mono', file: 'fonts/M.woff2' } } };
const SCENES = [
  { id: 'SC1', seconds: 4, caption: 'Put the human back in.', make: { type: 'title', lines: ['Put the human', 'back in.'], sub: 'AI codes. <em>You call the shots.</em>' } },
  { id: 'SC2', caption: 'Every decision is yours.', make: { type: 'recording', rec: 'sc2', segments: [[1, 4], [5, 7]], caption: ['Every decision', 'is <em>yours</em>.'] } },
  { id: 'SC3', seconds: 4, caption: 'naqsha', make: { type: 'end', name: 'naqsha', tagline: 'Human-first <em>AI coding.</em>', command: '/plugin marketplace add x/naqsha' } },
];
function ready(dir) {
  fs.mkdirSync(path.join(dir, 'fonts'));
  fs.writeFileSync(path.join(dir, 'fonts', 'D.woff2'), 'x');
  fs.writeFileSync(path.join(dir, 'fonts', 'M.woff2'), 'x');
  fs.mkdirSync(path.join(dir, 'video'));
  fs.writeFileSync(path.join(dir, 'video', 'hyperframes.json'), '{}');
  fs.mkdirSync(path.join(dir, 'capture', 'sc2'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'capture', 'sc2', 'recording.webm'), 'x');
  fs.writeFileSync(path.join(dir, 'capture', 'sc2', 'events.json'), JSON.stringify({
    viewport: { width: 1280, height: 720 }, scale: 1.5, video: { width: 1920, height: 1080 }, duration: 8000,
    events: [{ t: 1500, type: 'move', from: { x: 600, y: 300 }, to: { x: 640, y: 360 }, ms: 400 }, { t: 2000, type: 'click', x: 640, y: 360, box: { x: 600, y: 340, width: 80, height: 40 }, label: 'Go' }], masks: [],
  }));
}

test('the check reports every problem in one pass, before anything is written', t => {
  const scenes = [
    { id: 'SC1', seconds: 2, caption: 'A caption far too long to read in only two seconds of screen time', make: { type: 'title', lines: ['Hi'] } },
    { id: 'SC2', make: { type: 'recording', rec: 'nope', segments: [[0, 3]], caption: ['x'] } },
    { id: 'SC3', make: { type: 'carousel' } },
    { id: 'SC4', seconds: 4, make: { type: 'terminal' } },
  ];
  const dir = demo(t, scenes, { template: 'neon', fonts: {} });
  const r = run(dir, '--check');
  assert.equal(r.status, 1);
  for (const want of [/look\.template must be one of signal, paper, blueprint/, /look\.fonts\.display needs/, /no HyperFrames project at video\//,
    /SC1: its text needs \d\.\d s to read/, /SC2: no recording at capture\/nope\//, /SC3: make\.type must be one of/, /SC4: a terminal needs make\.command/]) {
    assert.match(r.stderr, want);
  }
  assert.equal(fs.existsSync(path.join(dir, 'video', 'index.html')), false);
});

test('a segment outside its recording is caught, not rendered as a frozen frame', t => {
  const dir = demo(t, [{ ...SCENES[1], make: { ...SCENES[1].make, segments: [[6, 9.5]] } }], LOOK);
  ready(dir);
  assert.match(run(dir, '--check').stderr, /SC2: segment \[6, 9\.5\] is outside the recording \(0 to 8\.00 s\)/);
});

test('a composed film has the rules from real renders built in', t => {
  const dir = demo(t, SCENES, LOOK);
  ready(dir);
  assert.match(run(dir, '--check').stdout, /Ready: 3 scenes, 13\.0 s, template signal, entrance mask/);
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(path.join(dir, 'video', 'index.html'), 'utf8');
  assert.match(html, /data-duration="13"/, 'scene lengths add up, recordings by their segments');
  assert.match(html, /<video id="SC2-r0" class="clip" src="assets\/rec\/sc2\.webm" muted data-start="4" data-duration="3" data-media-start="1">/);
  assert.match(html, /<video id="SC2-r1" class="clip" src="assets\/rec\/sc2\.webm" muted data-start="7" data-duration="2" data-media-start="5">/, 'idle time cut by a second segment');
  assert.match(html, /<div id="SC2-frame" class="frame"><div class="fit"/, 'the video\'s wrapper is not timed');
  assert.match(html, /<span id="SC1-t-0" class="ln "><span class="in">Put the human<\/span><\/span>/, 'the first title line is on screen at frame 0, never hidden');
  assert.match(html, /<span id="SC1-t-1" class="ln " data-enter>/);
  assert.doesNotMatch(html, /'#[^']* > [^']*'/, 'no combinator selectors as tween targets');
  assert.match(html, /function segment\(s\)/);
  assert.match(html, /\.accent \{ color: var\(--accent\); \}/, 'lines toned accent are colored');
  assert.match(html, /\.ln \{ display: block; overflow: hidden; padding-bottom: 0\.16em;/, 'the reveal box keeps descenders');
  assert.ok(fs.existsSync(path.join(dir, 'video', 'assets', 'naqsha-demo.js')) && fs.existsSync(path.join(dir, 'video', 'assets', 'rec', 'sc2.webm')));

  // A template sample: hook, one recorded moment (at most 6 s), end card; a copy outside the project.
  const s = run(dir, '--sample', 'paper', '--entrance', 'snap');
  assert.equal(s.status, 0, s.stderr);
  assert.match(s.stdout, /template paper, entrance snap/);
  assert.ok(fs.existsSync(path.join(dir, 'samples', 'sample-paper-snap.html')));
  assert.equal(fs.readdirSync(path.join(dir, 'video')).filter(f => f.endsWith('.html')).length, 1, 'one root composition in the project');
});
