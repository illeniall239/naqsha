'use strict';
// The progress row's output reader (hooks/progress-read.mjs). The row itself is
// tested against Claude Code's engine in progress-row.test.tsx (claude plugin test .).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'hooks', 'progress-read.mjs')).href);

test('reads naqsha\'s own progress lines', async () => {
  const { readProgress } = await load();
  assert.deepEqual(
    readProgress('Rehearsing\n@naqsha-progress {"done":3,"total":12,"unit":"steps","stage":"Recording"}\n'),
    { done: 3, total: 12, stage: 'Recording', unit: 'steps' });
});

test('reads the video renderer\'s progress, newest line first', async () => {
  const { readProgress } = await load();
  const log = [
    '  ██████░░░░░░░░░░░░░░░░░░░  25%  Starting frame capture',
    '@hf-progress {"code":"start_browsers","done":1,"total":5,"pct":25}',
    '\r  █████████░░░░░░░░░░░░░░░░  38%  Capturing frames',
    '@hf-progress {"code":"capture","done":52,"total":177,"pct":38}',
    '',
  ].join('\n');
  assert.deepEqual(readProgress(log), { pct: 38, done: 52, total: 177, stage: 'capture' });
  assert.deepEqual(readProgress('  \x1b[32m███░░\x1b[0m  45%  Extracting frames\n'), { pct: 45, stage: 'Extracting frames' });
});

test('reads counts with units, and ignores dates, paths and versions', async () => {
  const { readProgress } = await load();
  assert.deepEqual(readProgress('Downloading torch ━━━━━━ 2.1/5.0 MB 3.2 MB/s'), { done: 2.1, total: 5, unit: 'MB', stage: 'Downloading torch' });
  assert.deepEqual(readProgress('step 3 of 12 done'), { done: 3, total: 12, unit: 'done', stage: 'step' });
  assert.equal(readProgress('Built on 2026/11/13 at /srv/app/1/2'), null);
  assert.equal(readProgress('node v22.1/24'), null);
  assert.equal(readProgress('12/11 tests'), null);
  assert.equal(readProgress('done 140%'), null);
  assert.equal(readProgress(''), null);
});

test('finds the ended tasks in a notification', async () => {
  const { endedTasks } = await load();
  const text = 'x <task-notification>\n<task-id>bz1</task-id>\n<tool-use-id>toolu_1</tool-use-id>\n<status>completed</status>\n</task-notification>' +
    '<task-notification><task-id>bz2</task-id><status>running</status></task-notification>';
  assert.deepEqual(endedTasks(text), [{ taskId: 'bz1', toolUseId: 'toolu_1', status: 'completed' }]);
  assert.deepEqual(endedTasks('no notification here'), []);
});

test('finds where a background command writes, on every platform', async () => {
  const { outputPathOf } = await load();
  assert.equal(outputPathOf('Command running in background with ID: b1. Output is being written to: /tmp/claude-1000/p/s/tasks/b1.output. You will be notified'), '/tmp/claude-1000/p/s/tasks/b1.output');
  assert.equal(outputPathOf('Output is being written to: C:\\Users\\Jo Smith\\AppData\\Local\\Temp\\tasks\\b1.output'), 'C:\\Users\\Jo Smith\\AppData\\Local\\Temp\\tasks\\b1.output');
  assert.equal(outputPathOf(undefined), '');
});

test('says the figure a person reads beside the bar', async () => {
  const { figure, fill, clock } = await load();
  assert.equal(clock(75_000), '1:15');
  assert.equal(clock(3_725_000), '1:02:05');
  assert.equal(figure({ pct: 38, done: 412, total: 1200, stage: 'capture' }, 40_000), '38% · 412 of 1,200 · capture · 0:40');
  assert.equal(figure({ pct: 90, done: 0, total: 5.9, stage: 'assemble' }, 5_000), '90% · assemble · 0:05');
  assert.equal(figure(null, 9_000), '0:09');
  assert.deepEqual(fill({ done: 3, total: 12 }), { value: 3, max: 12 });
  assert.deepEqual(fill({ pct: 38, done: 1, total: 5 }), { value: 38, max: 100 });
  assert.equal(fill(null), null);
});

test('finds the build\'s step in its plan', async () => {
  const { buildStep, parsePlan } = await load();
  const plan = parsePlan('window.NAQSHA = ' + JSON.stringify({
    meta: { title: 'Ledgerly', status: 'building' },
    steps: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'doing', title: 'Send job' }, { id: 'S3', status: 'todo' }],
  }) + ';\n');
  assert.deepEqual(buildStep(plan), { title: 'Ledgerly', done: 1, total: 3, step: 'S2 Send job' });
  assert.equal(buildStep({ meta: { status: 'approved' }, steps: [{}] }), null);
  assert.equal(parsePlan('not a plan'), null);
});

test('takes a percent or a count only from a line about progress', async () => {
  const { readProgress } = await load();
  assert.equal(readProgress('All files | 87% coverage'), null);
  assert.equal(readProgress('Coverage: 87.5%'), null);
  assert.equal(readProgress('3 of 12 files skipped'), null);
  assert.equal(readProgress('CPU 45% · memory 2/16'), null);
  assert.deepEqual(readProgress('Receiving objects:  45% (450/1000), 1.2 MiB'), { pct: 45, stage: 'Receiving objects' });
  assert.deepEqual(readProgress('[3/12] Compiling src/app.ts'), { done: 3, total: 12 });
  assert.deepEqual(readProgress('  62%'), { pct: 62 });
});

test('says what a command printed last, without bars or progress lines', async () => {
  const { lastLine } = await load();
  assert.equal(lastLine('Installing deps\nCompiling src/app.ts\n@naqsha-progress {"done":1,"total":2}\n'), 'Compiling src/app.ts');
  assert.equal(lastLine('Building\n███████░░░\n\n'), 'Building');
  assert.equal(lastLine('x'.repeat(80)).length, 60);
  assert.equal(lastLine(''), '');
});

test('says the rate and the time left once a bar has moved for 4 seconds', async () => {
  const { paceOf, sampleOf, figure } = await load();
  let first = sampleOf(null, 10, 100, 0);
  assert.equal(paceOf(first, 20, 100, 2000), null);
  first = sampleOf(first, 60, 100, 5000);
  assert.deepEqual(first, { value: 10, max: 100, at: 0 });
  assert.deepEqual(paceOf(first, 60, 100, 5000), { rate: 10, leftMs: 4000 });
  // A new stage (another total) or a bar going back starts again.
  assert.deepEqual(sampleOf(first, 5, 100, 6000), { value: 5, max: 100, at: 6000 });
  assert.deepEqual(sampleOf(first, 70, 200, 6000), { value: 70, max: 200, at: 6000 });
  assert.equal(figure({ done: 1.2, total: 5, unit: 'MB' }, 3000, { rate: 0.4, leftMs: 9500 }), '1.2 of 5 MB · 0.40 MB/s · ~0:09 left · 0:03');
  assert.equal(figure({ done: 3, total: 12, unit: 'steps' }, 3000, { rate: 1, leftMs: 9000 }), '3 of 12 steps · ~0:09 left · 0:03');
});
