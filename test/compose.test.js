'use strict';
// The demo composer: it validates a whole storyboard at once, notes where a film falls into
// generated defaults, and writes a composition with the rules learned from real renders
// built in.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const COMPOSE = path.join(__dirname, '..', 'assets', 'demo', 'compose.cjs');
const { timeline, palette, contrast } = require(COMPOSE);
const run = (...args) => spawnSync('node', [COMPOSE, ...args], { encoding: 'utf8' });

function demo(t, scenes, look, extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naqsha-demo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const plan = { meta: { title: 'Launch', kind: 'demo', status: 'storyboard' }, look, scenes, ...extra };
  fs.writeFileSync(path.join(dir, 'plan.js'), `window.NAQSHA = ${JSON.stringify(plan)};\n`);
  return dir;
}
const readPlan = dir => JSON.parse(fs.readFileSync(path.join(dir, 'plan.js'), 'utf8').replace(/^window\.NAQSHA = /, '').replace(/;\s*$/, ''));
const LOOK = {
  source: "the product's tokens in src/theme.css",
  colors: { ground: '#f6f4ee', ink: '#1c1b18', accent: '#2447c9' },
  grounds: { night: { ground: '#0f1a3a', ink: '#f3f1ea' } },
  fonts: { display: { family: 'IBM Plex Sans', file: 'fonts/D.woff2' }, mono: { family: 'IBM Plex Mono', file: 'fonts/M.woff2' } },
};
const SCENES = [
  { id: 'SC1', seconds: 4, caption: 'Put the human back in.', make: { type: 'title', lines: ['Put the human', 'back in.'], sub: 'AI codes. <em>You call the shots.</em>' } },
  { id: 'SC2', caption: 'Every decision is yours.', transition: { type: 'zoom-through', via: '#SC1-l-1' }, make: { type: 'recording', rec: 'sc2', segments: [[1, 4], [5, 7]], frame: 'window', caption: ['Every decision', 'is <em>yours</em>.'] } },
  { id: 'SC3', seconds: 4, caption: 'Locked until you sign.', transition: 'grow', make: { type: 'custom', src: 'scenes/SC3.html', sfx: [{ at: 1, sound: 'pop' }] } },
  { id: 'SC4', seconds: 4, caption: 'naqsha', transition: 'iris', ground: 'night', make: { type: 'end', name: 'naqsha', tagline: 'Human-first <em>AI coding.</em>', command: '/plugin marketplace add x/naqsha' } },
];
const CUSTOM = `<div id="SC3-card" style="position:absolute;left:400px;top:200px">
  <div id="SC3-btn">Approve</div>
</div>
<script>
function scene(tl, at, d, k, c) {
  k.enter('#SC3-btn', at + 0.3, 'snap');
  const cur = k.cursor(c.stage, { size: 64 });
  cur.enter(at + 0.5, 500, 260);
  cur.click(at + 1);
}
</script>`;
function ready(dir) {
  fs.mkdirSync(path.join(dir, 'fonts'));
  fs.writeFileSync(path.join(dir, 'fonts', 'D.woff2'), 'x');
  fs.writeFileSync(path.join(dir, 'fonts', 'M.woff2'), 'x');
  fs.mkdirSync(path.join(dir, 'video'));
  fs.writeFileSync(path.join(dir, 'video', 'hyperframes.json'), '{}');
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.writeFileSync(path.join(dir, 'scenes', 'SC3.html'), CUSTOM);
  fs.mkdirSync(path.join(dir, 'sfx'));
  fs.writeFileSync(path.join(dir, 'sfx', 'manifest.json'), JSON.stringify({ 'click-soft': { duration: 0.37 }, pop: { duration: 0.72 }, whoosh: { duration: 1.2 }, 'whoosh-short': { duration: 0.5 }, 'impact-bass-1': { duration: 2.1 }, typing: { duration: 1.5 } }));
  for (const s of ['click-soft', 'pop', 'whoosh', 'whoosh-short', 'impact-bass-1', 'typing']) fs.writeFileSync(path.join(dir, 'sfx', `${s}.mp3`), 'x');
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
    { id: 'SC2', transition: 'spin', make: { type: 'recording', rec: 'nope', segments: [[0, 3]], caption: ['x'] } },
    { id: 'SC3', make: { type: 'carousel' } },
    { id: 'SC4', seconds: 4, transition: { type: 'zoom-through' }, make: { type: 'terminal' } },
    { id: 'SC5', seconds: 4, transition: 'iris', make: { type: 'statement', lines: ['Same ground'] } },
    { id: 'SC6', seconds: 4, transition: { type: 'grow', via: '#SC1-l-0' }, make: { type: 'custom', src: 'scenes/SC6.html' } },
  ];
  const dir = demo(t, scenes, { colors: { ground: '#fff', ink: '#eee', accent: '#00f' }, grounds: { dark: { ground: 'navy' } }, fonts: {} });
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.writeFileSync(path.join(dir, 'scenes', 'SC6.html'), '<div id="card" data-start="1"><img src="https://x.test/a.png"></div><script>function scene(tl, at) { tl.set("#card", { x: Math.random() }, at); }</script>');
  const r = run(dir, '--check');
  assert.equal(r.status, 1);
  for (const want of [/look\.grounds\.dark needs ground and ink hex colors/, /look\.source must say where the look comes from/, /ink on ground is 1\.\d:1; text needs at least 4\.5:1/,
    /look\.fonts\.display needs/, /no HyperFrames project at video\//, /SC1: its text needs \d\.\d s to read/, /SC2: transition must be one of/,
    /SC2: no recording at capture\/nope\//, /SC3: make\.type must be one of/, /SC4: zoom-through needs transition\.via/, /SC4: a terminal needs make\.command/,
    /SC5: an iris opens onto another world/, /SC6: transition\.via must be an element of the scene before it, #SC5-/, /SC6: scenes\/SC6\.html uses Math\.random/,
    /SC6: scenes\/SC6\.html loads something from the web/, /SC6: scenes\/SC6\.html: no data-start/, /SC6: scenes\/SC6\.html: id "card" must start with SC6-/]) {
    assert.match(r.stderr, want);
  }
  assert.equal(fs.existsSync(path.join(dir, 'video', 'index.html')), false);
});

test('a segment outside its recording is caught, not rendered as a frozen frame', t => {
  const dir = demo(t, [{ ...SCENES[1], transition: undefined, make: { ...SCENES[1].make, segments: [[6, 9.5]] } }], LOOK);
  ready(dir);
  assert.match(run(dir, '--check').stderr, /SC2: segment \[6, 9\.5\] is outside the recording \(0 to 8\.00 s\)/);
});

test('the notes name where a film falls into generated defaults', t => {
  const line = (id, text, tr) => ({ id, seconds: 3, caption: text, transition: tr, make: { type: 'title', lines: [text], enter: 'blur' } });
  const scenes = [line('A', 'Introducing Flow'), line('B', 'Seamless sync', 'cut'), line('C', 'Every device', 'cut'), line('D', 'Always on', 'cut'), line('E', 'Try it', 'blur'), line('F', 'Today', 'cut')];
  const dir = demo(t, scenes, { ...LOOK, fonts: { ...LOOK.fonts, display: { family: 'Inter', file: 'fonts/D.woff2' } } });
  ready(dir);
  const r = run(dir, '--check');
  assert.equal(r.status, 0, r.stderr);
  for (const want of [/4 of 5 seams are hard cuts; at most a third should be/, /only 2 kinds of transition across 5 seams/, /every title enters the same way \(blur\)/,
    /look\.fonts\.display is Inter, where generated design lands/, /"seamless" is hype/, /the first line is "Introducing…"/, /the film is 18 s and silent/]) {
    assert.match(r.stdout, want);
  }
});

test('an iris overlaps the scene before it; every other transition starts on the seam', () => {
  const { items, end } = timeline([{ id: 'A', seconds: 4, make: { type: 'title' } }, { id: 'B', seconds: 3, transition: 'whip', make: { type: 'title' } }, { id: 'C', seconds: 3, transition: 'iris', make: { type: 'title' } }]);
  assert.deepEqual(items.map(x => x.at), [0, 4, 6.6]);
  assert.equal(end, 9.6);
});

test('the palette derives the missing roles and keeps caption accents readable', () => {
  const p = palette({ ground: '#f6f4ee', ink: '#1c1b18', accent: '#2447c9' });
  assert.match(p.dim, /^#[0-9a-f]{6}$/);
  assert.ok(contrast(p.ink, p.ground) > 12);
  assert.equal(palette({ ground: '#ffffff', ink: '#111111', accent: '#222222' }).chipEm, '#ffffff', 'an accent unreadable on an ink chip falls back to the ground');
});

test('a composed film has the rules from real renders built in', t => {
  const dir = demo(t, SCENES, LOOK, { sound: { sfx: true } });
  ready(dir);
  const c = run(dir, '--check');
  assert.equal(c.status, 0, c.stderr);
  assert.match(c.stdout, /Ready: 4 scenes, 16\.6 s, transitions: zoom-through, grow, iris/);
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(path.join(dir, 'video', 'index.html'), 'utf8');
  assert.match(html, /data-duration="16\.6"/, 'recordings last as long as their segments; the iris overlaps by 0.4 s');
  assert.match(html, /<video id="SC2-r0" class="clip" src="assets\/rec\/sc2\.webm" muted data-start="4" data-duration="3" data-media-start="1">/);
  assert.match(html, /<video id="SC2-r1" class="clip" src="assets\/rec\/sc2\.webm" muted data-start="7" data-duration="2" data-media-start="5">/, 'idle time cut by a second segment');
  assert.match(html, /<div id="SC2" class="scene" style=/, 'a recording scene is not a clip: its videos are');
  assert.match(html, /<div id="SC2-frame" class="frame window"><div class="fit">/, 'the window on its ground, which the camera opens');
  assert.match(html, /<div id="SC4" class="scene clip" data-start="12\.6" data-duration="4" style="--ground:#0f1a3a;--ink:#f3f1ea;/, 'a scene in another world carries its colors');
  assert.doesNotMatch(html, /K\.enter\('#SC1-l-0'/, 'the first title line is on screen at frame 0, never hidden');
  assert.doesNotMatch(html, /K\.enter\('#SC4-n'/, 'an iris lands on the end card\'s first frame, so its name is already there');
  assert.match(html, /K\.enter\('#SC4-c', [\d.]+, 'snap'\); K\.type\('#SC4-ct'/, 'the call to action is typed in');
  assert.match(html, /window\.__hfTimelinesBuilding = true;[\s\S]*function build\(\) \{[\s\S]*window\.dispatchEvent\(new Event\('hf-timelines-built'\)\);[\s\S]*document\.fonts\.load\("700 100px D"\)[\s\S]*\.then\(build\)/, 'built after the fonts load, and the runtime told');
  assert.match(html, /"type":"zoom-through","from":"SC1","to":"SC2"[^}]*"via":"#SC1-l-1"/);
  assert.match(html, /"type":"grow","from":"SC2","to":"SC3","at":9,"fromRec":true/, 'a grow after a recording starts from its last click');
  assert.match(html, /<div id="grow-SC3" class="grow"[^>]*><\/div>\n<div id="SC1"/, 'the grow shape comes before the scenes, so the next scene can fade in over it');
  assert.match(html, /function scene\(tl, at, d, k, c\)[\s\S]*scene\(tl, 9, 4, K,/, 'the hand-made scene runs on the film\'s timeline at its start');
  assert.match(html, /<audio id="sfx-\d+" class="clip" src="assets\/sfx\/click-soft\.mp3" data-start="5"/, 'the recording\'s click at 2 s sounds at 4 + 2 - 1');
  assert.match(html, /src="assets\/sfx\/pop\.mp3" data-start="10"/, 'a hand-made scene\'s cue, from its start');
  assert.match(html, /data-motion-blur="on"/);
  assert.doesNotMatch(html, /'#[^']* > [^']*'/, 'no combinator selectors as tween targets');
  const motion = JSON.parse(fs.readFileSync(path.join(dir, 'video', 'index.motion.json'), 'utf8'));
  assert.deepEqual(motion.assertions[0], { kind: 'appearsBy', selector: '#SC1-l-0', bySec: 0 }, 'frame 0 is never empty');
  assert.ok(['naqsha-demo.js', 'rec/sc2.webm', 'sfx/click-soft.mp3', 'fonts/D.woff2'].every(f => fs.existsSync(path.join(dir, 'video', 'assets', f))));
  assert.deepEqual(readPlan(dir).scenes.map(s => [s.at, s.seconds]), [[0, 4], [4, 5], [9, 4], [12.6, 4]], 'each scene\'s real start and length, for the page');
});

test('a storyline\'s hook composes from its own look and scenes, outside the project, leaving the plan alone', t => {
  const hook = { look: { ...LOOK, colors: { ground: '#0f1a3a', ink: '#f3f1ea', accent: '#8fb0ff' } }, scenes: [{ id: 'H1', seconds: 4, caption: '58 tests', make: { type: 'number', value: '58', label: 'tests' } }] };
  const dir = demo(t, SCENES, LOOK, { storylines: [{ id: 'S2', name: 'A number lands', hook }, { id: 'S3', name: 'Words' }] });
  ready(dir);
  const before = fs.readFileSync(path.join(dir, 'plan.js'), 'utf8');
  const r = run(dir, '--storyline', 'S2');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /samples\/storyline-S2\.html/);
  assert.match(fs.readFileSync(path.join(dir, 'video', 'index.html'), 'utf8'), /--ground: #0f1a3a/);
  assert.equal(fs.readdirSync(path.join(dir, 'video')).filter(f => f.endsWith('.html')).length, 1, 'one root composition in the project');
  assert.equal(fs.readFileSync(path.join(dir, 'plan.js'), 'utf8'), before);
  assert.match(run(dir, '--storyline', 'S3').stderr, /S3: a storyline needs hook\.scenes/);
});
