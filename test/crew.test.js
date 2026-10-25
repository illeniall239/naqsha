'use strict';
// Crew mode's git mechanics, on real repositories: worktrees, landing,
// conflicts, and refusing to throw unlanded work away.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const CREW = path.join(__dirname, '..', 'scripts', 'crew.js');
const TOOL = path.join(__dirname, '..', 'scripts', 'plan-tool.js');

function repo(t, steps) {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'naqsha-crew-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'app');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  const g = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim();
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'one\ntwo\nthree\n');
  g('add', '.');
  g('commit', '-qm', 'init');
  const planFile = path.join(root, 'docs', 'plans', 'export', 'plan.js');
  fs.mkdirSync(path.dirname(planFile), { recursive: true });
  const plan = { meta: { title: 'Export', slug: 'export', status: 'building' }, steps: steps || [
    { id: 'S1', title: 'First', status: 'todo', files: ['src/a.js'] },
    { id: 'S2', title: 'Second', status: 'todo', files: ['src/a.js'] },
  ] };
  fs.writeFileSync(planFile, `window.NAQSHA = ${JSON.stringify(plan, null, 2)};\n`);
  const crew = (...args) => spawnSync('node', [CREW, args[0], planFile, ...args.slice(1)], { encoding: 'utf8' });
  const json = r => { assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  const inTree = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim();
  return { parent, root, g, planFile, crew, json, inTree };
}

test('steps are opened in worktrees beside the repository, only from a build branch', t => {
  const r = repo(t);
  assert.match(r.crew('open', 'S1').stderr, /on main; crew mode lands steps as commits.*git switch -c build\/export/);
  r.g('switch', '-q', '-c', 'build/export');

  fs.writeFileSync(path.join(r.root, 'src', 'a.js'), 'unsaved\n');
  assert.match(r.crew('open', 'S1').stderr, /commit or land these first.*src\/a\.js/);
  r.g('checkout', '--', 'src/a.js');

  const opened = r.json(r.crew('open', 'S1'));
  assert.equal(opened.branch, 'crew/export/S1');
  assert.equal(opened.path, path.join(r.parent, 'app-crew', 'export-S1'), 'beside the repo, not inside it');
  assert.equal(r.inTree(opened.path, 'branch', '--show-current'), 'crew/export/S1');
  assert.equal(r.json(r.crew('open', 'S1')).reused, true);
  // The plan folder's own uncommitted changes don't block a worker.
  assert.equal(r.g('status', '--porcelain').includes('docs/'), true);
});

test('a finished step lands as a merge, and its worktree goes away', t => {
  const r = repo(t);
  r.g('switch', '-q', '-c', 'build/export');
  const { path: wt } = r.json(r.crew('open', 'S1'));
  assert.match(r.crew('land', 'S1').stderr, /no commits to land/);

  fs.writeFileSync(path.join(wt, 'src', 'a.js'), 'one\nTWO\nthree\n');
  assert.match(r.crew('land', 'S1').stderr, /left uncommitted changes/);
  r.inTree(wt, 'commit', '-qam', 'S1: uppercase two');

  const landed = r.json(r.crew('land', 'S1'));
  assert.equal(landed.recheck, false, 'nothing else landed: the worker\'s results stand');
  assert.match(landed.why, /the merged code is what the worker tested/);
  assert.equal(r.g('log', '-1', '--format=%s'), 'S1: First');
  assert.equal(landed.commit, r.g('rev-parse', 'HEAD'));
  assert.equal(fs.readFileSync(path.join(r.root, 'src', 'a.js'), 'utf8'), 'one\nTWO\nthree\n');
  assert.equal(fs.existsSync(wt), false);
  assert.equal(r.g('branch', '--list', 'crew/*'), '');
});

test('a conflict lands nothing and says what to do', t => {
  const r = repo(t);
  r.g('switch', '-q', '-c', 'build/export');
  const a = r.json(r.crew('open', 'S1')).path;
  const b = r.json(r.crew('open', 'S2')).path;
  fs.writeFileSync(path.join(a, 'src', 'a.js'), 'one\nfrom S1\nthree\n');
  r.inTree(a, 'commit', '-qam', 'S1');
  fs.writeFileSync(path.join(b, 'src', 'a.js'), 'one\nfrom S2\nthree\n');
  r.inTree(b, 'commit', '-qam', 'S2');
  r.json(r.crew('land', 'S1'));
  const head = r.g('rev-parse', 'HEAD');

  const conflict = r.crew('land', 'S2');
  assert.equal(conflict.status, 2);
  assert.match(conflict.stderr, /conflicts with the build branch in: src\/a\.js\. Nothing was merged/);
  assert.equal(r.g('rev-parse', 'HEAD'), head);
  assert.equal(r.g('status', '--porcelain', '--', 'src'), '', 'the merge was aborted cleanly');
  assert.equal(fs.existsSync(b), true, "the worker's work is still there");

  const listed = r.json(r.crew('list'));
  assert.deepEqual(listed.map(w => [w.step, w.ahead, w.uncommitted]), [['S2', 1, 0]]);
});

test('landing says when the checks must run again, and when the worker\'s results stand', t => {
  const r = repo(t, [
    { id: 'S1', title: 'First', status: 'todo', files: ['src/a.js'] },
    { id: 'S2', title: 'Second', status: 'todo', files: ['src/b.js'] },
    { id: 'S3', title: 'Third', status: 'todo', files: ['package-lock.json'] },
  ]);
  r.g('switch', '-q', '-c', 'build/export');
  const a = r.json(r.crew('open', 'S1')).path;
  const b = r.json(r.crew('open', 'S2')).path;
  fs.writeFileSync(path.join(a, 'src', 'a.js'), 'one\nTWO\nthree\n');
  r.inTree(a, 'commit', '-qam', 'S1');
  fs.writeFileSync(path.join(b, 'src', 'b.js'), 'b\n');
  r.inTree(b, 'add', '.');
  r.inTree(b, 'commit', '-qm', 'S2');

  assert.equal(r.json(r.crew('land', 'S1')).recheck, false, 'nothing else had landed');
  const second = r.json(r.crew('land', 'S2'));
  assert.equal(second.recheck, true, 'S2 branched before S1 landed, so the merged code was never tested together');
  assert.match(second.why, /other work landed after this step branched/);

  const c = r.json(r.crew('open', 'S3')).path;
  fs.writeFileSync(path.join(c, 'package-lock.json'), '{}\n');
  r.inTree(c, 'add', '.');
  r.inTree(c, 'commit', '-qm', 'S3');
  const third = r.json(r.crew('land', 'S3'));
  assert.equal(third.recheck, true);
  assert.match(third.why, /changed package-lock\.json/, 'an environment change is checked again even when nothing else landed');
});

test('unlanded work is never dropped without --force', t => {
  const r = repo(t);
  r.g('switch', '-q', '-c', 'build/export');
  const wt = r.json(r.crew('open', 'S1')).path;
  fs.writeFileSync(path.join(wt, 'src', 'a.js'), 'changed\n');
  r.inTree(wt, 'commit', '-qam', 'S1');
  const refused = r.crew('drop', 'S1');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /1 unlanded commit\(s\).*--force only if the user agrees/);
  assert.equal(fs.existsSync(wt), true);
  assert.equal(r.json(r.crew('drop', 'S1', '--force')).discardedCommits, 1);
  assert.equal(fs.existsSync(wt), false);
});

test('ready batches steps that can run together', t => {
  const r = repo(t, [
    { id: 'S1', title: 'a', status: 'done', files: ['src/a.js'] },
    { id: 'S2', title: 'b', status: 'todo', dependsOn: ['S1'], files: ['src/b.js'] },
    { id: 'S3', title: 'c', status: 'todo', dependsOn: ['S1'], files: ['src/b.js', 'src/c.js'] },
    { id: 'S4', title: 'd', status: 'todo', dependsOn: ['S1'], files: ['src/d.js'] },
    { id: 'S5', title: 'e', status: 'todo', dependsOn: ['S2'], files: ['src/e.js'] },
  ]);
  const tool = (...a) => spawnSync('node', [TOOL, a[0], r.planFile, ...a.slice(1)], { encoding: 'utf8', input: a[a.length - 1] });
  let out = tool('ready').stdout;
  assert.match(out, /parallel limit 1/);
  assert.match(out, /Start now: S2\n/);
  assert.match(out, /Ready but waiting: S3 \(shares src\/b\.js\), S4 \(parallel limit\)/);
  assert.match(out, /Not ready: S5 \(after S2\)/);

  assert.equal(spawnSync('node', [TOOL, 'set-meta', r.planFile], { input: '{"buildMode":"crew","crewParallel":3}' }).status, 0);
  out = tool('ready').stdout;
  assert.match(out, /Start now: S2, S4\n/, 'S3 shares a file with S2, so it waits even with room');
  assert.match(spawnSync('node', [TOOL, 'set-meta', r.planFile], { input: '{"crewParallel":9}', encoding: 'utf8' }).stderr, /one of 1, 2, 3, 4/);
});
