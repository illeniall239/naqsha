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
  const named = tool(['step', planFile({ steps: [{ id: 'S1', files: ['x.ts'], standards: ['operability', 'not-a-reference'] }] }), 'S1']).stdout;
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
  assert.match(review('S3'), /^Not needed for this step \(effort standard: no threat mitigation, data or API change, or hot path\)\. .*finish review covers it/);

  tool(['set-meta', file], '{"effort":"light"}');
  assert.match(review('S1'), /^Not needed .*effort light: no threat mitigation\)/, 'light reviews only security work');
  assert.match(review('S2'), /^Required: it builds a threat mitigation\.$/, 'security is never scaled down');

  tool(['set-meta', file], '{"effort":"thorough"}');
  for (const id of ['S1', 'S2', 'S3']) assert.match(review(id), /^Required: effort is thorough: every step\.$/);

  assert.match(tool(['set-meta', file], '{"effort":"extreme"}').stderr, /light, standard, thorough/);
});

test('status shows progress and the next step', () => {
  const file = planFile();
  tool(['update-step', file, 'S1'], '{"status":"done"}');
  const out = tool(['status', file]).stdout;
  assert.match(out, /1\/3 steps done/);
  assert.match(out, /Next: S2/);
});
