'use strict';
// The build's view of one step, and safe updates to plan.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readPlan } = require('../scripts/hook.js');

const TOOL = path.join(__dirname, '..', 'scripts', 'plan-tool.js');

function planFile(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naqsha-tool-'));
  const step = (id, extra) => ({ id, title: `Do ${id}`, doneWhen: 'tests pass', status: 'todo', tests: [{ test: `${id} works`, kind: 'unit' }], ...extra });
  const plan = {
    meta: { title: 'Export', slug: 'export', status: 'approved' },
    architecture: {
      hotPaths: [{ flow: 'Monthly export', size: '20,000 rows', budget: '5 s', approach: 'cursor', provedBy: 'S2' }],
      components: [{ name: 'export module', location: 'src/export/', responsibility: 'Build CSV exports', interface: 'exportMonth(store, month)' },
        { name: 'mailer', location: 'src/mail/', responsibility: 'Send email', interface: 'send()' }],
    },
    security: { threats: [{ id: 'T1', threat: 'Another store reads exports', mitigation: 'Scope by store', step: 'S2' }, { id: 'T2', threat: 'x', mitigation: 'y', step: 'S3' }] },
    requirements: { nonFunctional: [{ id: 'N1', text: 'Export at peak', measure: 'within 5 s', verifiedBy: ['S2'] }] },
    decisions: [{ id: 'D1', question: 'Stream or job?', status: 'decided', choice: 'Stream' }],
    testing: { runIt: { start: 'npm run dev', drive: 'browser' }, securityChecks: [{ check: 'Semgrep', command: 'semgrep scan' }], acceptance: [{ id: 'A1', text: 'Manager downloads a month' }] },
    steps: [
      step('S1', { files: ['db/migrations/0003_orders_index.sql'] }),
      step('S2', { files: ['src/export/stream.ts'], standards: [] }),
      step('S3', { files: ['README.md'] }),
    ],
    ...overrides,
  };
  const file = path.join(dir, 'plan.js');
  fs.writeFileSync(file, `window.NAQSHA = ${JSON.stringify(plan, null, 2)};\n`);
  return file;
}

const tool = (args, input) => spawnSync('node', [TOOL, ...args], { input, encoding: 'utf8' });

test("a step's view holds what it touches and nothing it doesn't", () => {
  const file = planFile();
  const r = tool(['step', file, 'S2']);
  assert.equal(r.status, 0, r.stderr);
  const v = r.stdout;
  assert.match(v, /S2 of 3/);
  assert.match(v, /T1: Another store reads exports → Scope by store/);
  assert.doesNotMatch(v, /T2/, "another step's threat");
  assert.match(v, /N1: Export at peak; measure: within 5 s/);
  assert.match(v, /Monthly export: size 20,000 rows, budget 5 s/);
  assert.match(v, /## Modules it touches\n- export module/);
  assert.doesNotMatch(v, /mailer/, 'only the module whose folder it touches');
  assert.match(v, /D1: Stream or job\? → Stream/);
  assert.match(v, /performance\.md: this step proves a hot path/);
  assert.doesNotMatch(v, /data-and-apis/, 'an explicit standards list turns off file guessing');
  assert.doesNotMatch(v, /Acceptance criteria/, 'only the last step carries the finish');
});

test('references follow the plan, then file patterns, then the step\'s place', () => {
  const file = planFile();
  const s1 = tool(['step', file, 'S1']).stdout;
  assert.match(s1, /data-and-apis\.md: touches db\/migrations/);
  assert.match(s1, /run-like-a-user\.md: first step: take the baseline/);
  assert.match(s1, /Run it: .*start `npm run dev`/);
  for (const always of ['secure-coding', 'tdd', 'modularity', 'code-quality', 'independent-review']) assert.match(s1, new RegExp(`${always}\\.md: always`));
  const s3 = tool(['step', file, 'S3']).stdout;
  assert.match(s3, /docs-and-setup\.md: touches README\.md/);
  assert.match(s3, /Acceptance criteria \(finish\)\n- A1: Manager downloads a month/);
  const jobs = tool(['step', planFile({ steps: [{ id: 'S1', files: ['src/jobs/nightly-export.ts', 'src/cache/reports.ts'] }] }), 'S1']).stdout;
  assert.match(jobs, /reliability\.md: touches src\/jobs\/nightly-export\.ts/);
  assert.match(jobs, /## Independent review\nRequired: it writes to several systems, runs concurrently or caches\./, 'races and caches get a second pair of eyes at standard');
  const named = tool(['step', planFile({ steps: [{ id: 'S1', files: ['x.ts'], standards: ['operability', 'reliability', 'not-a-reference'] }] }), 'S1']).stdout;
  assert.match(named, /reliability\.md: the plan says so/);
  assert.match(named, /operability\.md: the plan says so/);
  assert.doesNotMatch(named, /not-a-reference/);
});

test('steps are updated in place, and approval can never be set', () => {
  const file = planFile();
  assert.equal(tool(['set-meta', file], '{"status":"building","buildReview":"pause"}').status, 0);
  let r = tool(['update-step', file, 'S1'], '{"status":"doing"}');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /S1 \[doing\]/);
  tool(['update-step', file, 'S1'], JSON.stringify({ notesAppend: 'red: expected 1 got 0' }));
  tool(['update-step', file, 'S1'], JSON.stringify({ status: 'done', notesAppend: 'green: 4 passed' }));
  const plan = readPlan(file);
  assert.equal(plan.meta.status, 'building');
  assert.equal(plan.steps[0].status, 'done');
  assert.equal(plan.steps[0].notes, 'red: expected 1 got 0\ngreen: 4 passed');
  assert.match(plan.meta.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(fs.readFileSync(file, 'utf8'), /^window\.NAQSHA = \{\n {2}"meta"/, 'the format the page and hook read');

  for (const [args, input, why] of [
    [['set-meta', file], '{"status":"approved"}', /must be one of building, done/],
    [['update-step', file, 'S1'], '{"status":"finished"}', /todo, doing, done, blocked/],
    [['update-step', file, 'S1'], '{"title":"renamed"}', /can't set "title"/],
    [['update-step', file, 'S9'], '{"status":"done"}', /no step S9/],
    [['update-step', file, 'S1'], 'not json', /JSON object/],
  ]) {
    r = tool(args, input);
    assert.equal(r.status, 1, input);
    assert.match(r.stderr, why);
  }
  const draft = planFile({ meta: { title: 'x', status: 'draft' } });
  assert.match(tool(['set-meta', draft], '{"status":"building"}').stderr, /only an approved plan/);
});

test('a checkpoint keeps your place inside a step until it is done', () => {
  const file = planFile();
  fs.writeFileSync(path.join(path.dirname(path.dirname(file)), 'LEARNINGS.md'), '# Learnings\n');
  tool(['update-step', file, 'S2'], '{"status":"doing"}');
  let r = tool(['checkpoint', file, 'S2'], JSON.stringify({ did: 'wrote the attack test', red: 'store B reads store A export', next: 'scope the query by store', files: ['src/export/stream.ts'], open: ['Should admins see all stores?'] }));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /S2 \[doing\] .*\(checkpoint .*: next scope the query by store\)/);

  const v = tool(['step', file, 'S2']).stdout;
  assert.match(v, /## Where you left off \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}\); check the files before trusting this/);
  assert.match(v, /Did: wrote the attack test\nRed: store B reads store A export\nNext: scope the query by store\nFiles in progress: src\/export\/stream\.ts\nOpen: Should admins see all stores\?/);
  assert.match(v, /## Project learnings\n- \S+LEARNINGS\.md: read once/);

  // A newer checkpoint replaces the old one; done clears it.
  tool(['checkpoint', file, 'S2'], '{"next":"run the suite"}');
  assert.doesNotMatch(tool(['step', file, 'S2']).stdout, /attack test/);
  tool(['update-step', file, 'S2'], '{"status":"done"}');
  assert.equal(readPlan(file).steps[1].checkpoint, undefined);
  assert.doesNotMatch(tool(['step', file, 'S2']).stdout, /Where you left off/);

  for (const [id, input, why] of [
    ['S2', '{"next":"x"}', /S2 is done/],
    ['S3', '{"did":"x"}', /needs "next"/],
    ['S3', '{"next":"x","mood":"good"}', /not "mood"/],
    ['S3', '{"next":"x","files":"a.ts"}', /files is a short list/],
  ]) {
    r = tool(['checkpoint', file, id], input);
    assert.equal(r.status, 1, input);
    assert.match(r.stderr, why);
  }
});

test('the independent review goes where the risk is, scaled by effort', () => {
  // S1 touches a migration (data), S2 builds threat T1 and proves a hot path, S3 is docs.
  const file = planFile({ security: { threats: [{ id: 'T1', threat: 'x', mitigation: 'y', step: 'S2' }] } });
  const review = id => /## Independent review\n(.*)/.exec(tool(['step', file, id]).stdout)[1];

  assert.match(review('S1'), /^Required: it changes data or an API\.$/, 'standard is the default');
  assert.match(review('S2'), /^Required: it builds a threat mitigation; it proves a hot path\.$/);
  assert.match(review('S3'), /^Not needed for this step \(effort standard: no threat mitigation, data or API change, concurrency or caching, or hot path\)\. .*finish review covers it/);

  tool(['set-meta', file], '{"effort":"light"}');
  assert.match(review('S1'), /^Not needed .*effort light: no threat mitigation\)/, 'light reviews only security work');
  assert.match(review('S2'), /^Required: it builds a threat mitigation\.$/, 'security is never scaled down');

  tool(['set-meta', file], '{"effort":"thorough"}');
  for (const id of ['S1', 'S2', 'S3']) assert.match(review(id), /^Required: effort is thorough: every step\.$/);

  assert.match(tool(['set-meta', file], '{"effort":"extreme"}').stderr, /light, standard, thorough/);
});

test("the digest carries the plan's whys with the ids a guide cites", () => {
  const file = planFile({
    questions: [{ id: 'Q1', question: 'Where may data go?', status: 'answered', answer: { choice: ['Nowhere'], text: '', note: 'privacy first' } },
      { id: 'Q2', question: 'Still open?', status: 'open' }],
    decisions: [{ id: 'D1', question: 'Stream or job?', status: 'decided', choice: 'Stream', decidedBy: 'user', note: 'keep it simple',
      why: 'Fits the 5 s budget', options: [{ name: 'Stream' }, { name: 'Background job' }] }],
    research: [{ topic: 'Cursors', finding: 'Server-side cursors keep memory flat', sources: [{ url: 'https://example.org/cursors', accessed: '2026-10-24' }] }],
    rejected: [{ option: 'Kafka', why: 'No driver needs it' }],
    later: [{ title: 'Yearly export', adds: 'A 12-month CSV', why: 'needs the monthly one in use first' }],
  });
  const d = tool(['digest', file]).stdout;
  assert.match(d, /- Q1: Where may data go\? → Nowhere · \(privacy first\)/);
  assert.doesNotMatch(d, /Q2/, 'unanswered questions are not reasons');
  assert.match(d, /- D1: Stream or job\? → Stream \(user\)\n {2}why recommended: Fits the 5 s budget\n {2}the user's note: keep it simple\n {2}passed over: Background job/);
  assert.match(d, /- Cursors: Server-side cursors keep memory flat \[https:\/\/example\.org\/cursors 2026-10-24\]/);
  assert.match(d, /- T1: Another store reads exports → Scope by store \(built in S2\)/);
  assert.match(d, /- module export module \(src\/export\/\): Build CSV exports; interface: exportMonth\(store, month\)/);
  assert.match(d, /- Kafka: No driver needs it/);
  assert.match(d, /## Later milestones \(planned separately\)\n- Yearly export: A 12-month CSV \(later because needs the monthly one in use first\)/);
});

test('the baseline is taken once, before any step is done, and every step sees it', () => {
  const file = planFile({ context: { stack: ['Express'] },
    impact: [{ change: 'exportMonth gains a format argument', searched: 'grep -rn exportMonth', outside: 'none',
      users: [{ where: 'src/reports/monthly.ts:42', step: 'S2', what: 'passes two arguments' }, { where: 'src/cli.ts:9', ok: 'uses the default' }] }] });
  assert.match(tool(['step', file, 'S1']).stdout, /## Baseline\nNot taken yet\. .*plan-tool\.js baseline/, 'an existing codebase is reminded');
  assert.doesNotMatch(tool(['step', planFile(), 'S1']).stdout, /Baseline/, 'a new app has nothing to baseline');

  const taken = { commit: 'abc1234', checks: [
    { check: 'tests', command: 'npm test', result: '412 passed, 2 failed', known: ['auth > refresh keeps the session', 'mail > retries'] },
    { check: 'lint', command: 'npm run lint', result: '37 warnings, 0 errors' }] };
  for (const [input, why] of [
    [{ checks: [] }, /checks is a list/],
    [{ checks: [{ check: 'tests', result: '' }] }, /checks is a list/],
    [{ ...taken, mood: 'ok' }, /not "mood"/],
  ]) {
    const r = tool(['baseline', file], JSON.stringify(input));
    assert.equal(r.status, 1, JSON.stringify(input));
    assert.match(r.stderr, why);
  }
  assert.equal(tool(['baseline', file], JSON.stringify(taken)).status, 0);
  const v = tool(['step', file, 'S2']).stdout;
  assert.match(v, /## Baseline before the build \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}, abc1234\): .*Don't fix it here and don't add to it\n- tests: 412 passed, 2 failed \(`npm test`\)\n {2}- auth > refresh keeps the session\n {2}- mail > retries\n- lint: 37 warnings, 0 errors/);
  assert.match(v, /## Existing code that relies on what this step changes \(update each\)\n- src\/reports\/monthly\.ts:42: exportMonth gains a format argument \(passes two arguments\)\n\n/);
  assert.doesNotMatch(tool(['step', file, 'S1']).stdout, /relies on what this step changes/, "another step's callers");
  assert.match(tool(['digest', file]).stdout, /- exportMonth gains a format argument: src\/reports\/monthly\.ts:42, src\/cli\.ts:9; outside the repo: none/);

  tool(['update-step', file, 'S1'], '{"status":"done"}');
  const late = tool(['baseline', file], JSON.stringify({ checks: [{ check: 'tests', result: '412 passed, 3 failed' }] }));
  assert.equal(late.status, 1);
  assert.match(late.stderr, /a step is already done/, 'a new failure cannot be folded into the baseline');
  assert.match(tool(['baseline', planFile({ meta: { title: 'x', status: 'draft' } })], JSON.stringify(taken)).stderr, /taken when the build starts/);
});

test('every agent has a name: fixed per step, distinct side by side, and the same list everywhere', () => {
  const { NAMES } = require('../scripts/plan-tool.js');
  const file = planFile();
  tool(['set-meta', file], '{"buildMode":"crew"}');
  const names = id => /## Names\n(.*)\n(.*)/.exec(tool(['step', file, id]).stdout);
  assert.match(names('S1')[1], /^Worker: Atlas\. Reviewer: Apollo\.$/);
  assert.match(names('S2')[1], /^Worker: Iris\. Reviewer: Artemis\.$/);
  assert.match(names('S2')[2], /"Iris · build S2".*"You are Iris"/);
  assert.match(names('S3')[1], /^Worker: Hermes\. Reviewer: Hestia\. Finish reviewer: Demeter\.$/, 'the last step names the finish reviewer');
  assert.doesNotMatch(names('S2')[1], /Finish/);
  tool(['set-meta', file], '{"buildMode":"solo"}');
  assert.match(names('S1')[1], /^Reviewer: Apollo\.$/, 'a solo build has no worker to name');
  assert.match(names('S1')[2], /"Apollo · review S1"/);
  assert.equal(new Set(NAMES).size, NAMES.length);
  assert.equal(NAMES.length % 2, 0, 'a reviewer is half the list away from its worker, so never the same name');
  const listed = NAMES.join(', ');
  for (const skill of ['plan', 'build', 'review']) {
    const text = fs.readFileSync(path.join(__dirname, '..', 'skills', skill, 'SKILL.md'), 'utf8').replace(/\s+/g, ' ');
    assert.ok(text.includes(listed), `skills/${skill}/SKILL.md names agents from the same list`);
  }
});

test("a design step's view carries its screens and tokens, and UI work loads the interface rules", () => {
  const file = planFile({
    meta: { title: 'Admin design', slug: 'x', kind: 'design', status: 'approved' },
    direction: { signature: 'a green rail', motion: 'rows expand in place' },
    tokens: { motion: { fast: '120ms' }, color: [{ name: 'bg', value: '#f7f6f2', role: 'background' }], type: { families: [{ name: 'IBM Plex Sans', role: 'body' }], scale: [{ name: 'body', size: '15px' }] }, space: ['4px', '8px'] },
    screens: [{ id: 'SC1', name: 'Orders', mode: 'operate', purpose: 'Act on orders', states: ['default', 'empty'] }, { id: 'SC2', name: 'Settings', mode: 'operate', purpose: 'x', states: ['default'] }],
    testing: { uiChecks: [{ check: 'Accessibility', command: 'npx playwright test a11y' }] },
    steps: [{ id: 'S1', title: 'Orders', screens: ['SC1'], files: ['src/ui/Orders.tsx'], tests: [{ test: 't' }], doneWhen: 'd' }],
  });
  const v = tool(['step', file, 'S1']).stdout;
  assert.match(v, /## Screens this step builds \(match the approved preview in each state\)\n- SC1 Orders \[operate\]: Act on orders; states: default, empty/);
  assert.doesNotMatch(v, /SC2/, "another step's screen");
  assert.match(v, /## Design tokens \(use these, never raw values\)\nColor: bg #f7f6f2 \(background\)\nType: IBM Plex Sans for body; scale body 15px\nSpace: 4px, 8px\nMotion tokens: fast 120ms\nMotion language: rows expand in place\nSignature: a green rail/);
  assert.match(v, /interface\.md: a design build/);
  assert.match(v, /- Accessibility: `npx playwright test a11y`/);
  assert.match(tool(['digest', file]).stdout, /## Screens \(cite as SC#\)\n- SC1 Orders \[operate\]/);

  const ui = tool(['step', planFile({ steps: [{ id: 'S1', files: ['src/components/Button.tsx'] }] }), 'S1']).stdout;
  assert.match(ui, /interface\.md: touches src\/components\/Button\.tsx/, 'a plan step that touches UI code gets the interface rules too');
  assert.doesNotMatch(tool(['step', planFile(), 'S1']).stdout, /interface\.md/, 'backend steps do not');
});

test('status shows progress and the next step', () => {
  const file = planFile();
  tool(['update-step', file, 'S1'], '{"status":"done"}');
  const out = tool(['status', file]).stdout;
  assert.match(out, /1\/3 steps done/);
  assert.match(out, /Next: S2/);
});
