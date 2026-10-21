'use strict';
// Runs the hook as Claude Code does: JSON on stdin, decision on stdout.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const HOOK = path.join(__dirname, '..', 'scripts', 'hook.js');

function project({ git = true } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'naqsha-test-')));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'console.log(1);\n');
  if (git) {
    const g = (...a) => execFileSync('git', ['-C', root, ...a], { stdio: 'ignore' });
    g('init', '-q');
    g('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.');
    g('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
  }
  const run = (input) => {
    const r = spawnSync('node', [HOOK], {
      input: JSON.stringify({ cwd: root, ...input }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout ? JSON.parse(r.stdout) : null;
  };
  const cmd = (name, args = '') => run({ hook_event_name: 'UserPromptExpansion', command_name: `naqsha:${name}`, command_args: args });
  const write = (file) => run({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.resolve(root, file), content: 'x' } });
  const bash = (command) => run({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
  const afterBash = () => run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'x' } });
  const prompt = () => run({ hook_event_name: 'UserPromptSubmit', prompt: 'hi' });
  const state = () => JSON.parse(fs.readFileSync(path.join(root, '.naqsha', 'state.json'), 'utf8'));
  return { root, run, cmd, write, bash, afterBash, prompt, state };
}

const denied = out => out && out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision === 'deny';

function writePlan(root, slug, overrides = {}) {
  const plan = {
    meta: { title: 'Test plan', slug, kind: 'feature', status: 'draft' },
    priorArt: [{ name: 'Django password reset', verdict: 'learn from' }],
    decisions: [{ id: 'D1', question: 'Q?', status: 'decided', choice: 'A' }],
    steps: [{ id: 'S1', title: 'Do it', doneWhen: 'tests pass', estimate: { low: 1, likely: 2, high: 4 } }],
    ...overrides,
  };
  fs.mkdirSync(path.join(root, 'docs', 'plans', slug), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'plans', slug, 'plan.js'), `window.NAQSHA = ${JSON.stringify(plan, null, 2)};\n`);
}

test('without a plan in progress nothing is blocked', () => {
  const p = project();
  assert.equal(p.write('src/app.js'), null);
  assert.equal(p.afterBash(), null);
});

test('drafting locks project files but not the plans folder or scratch space', () => {
  const p = project();
  const out = p.cmd('plan', 'add login');
  assert.match(out.hookSpecificOutput.additionalContext, /planning phase/);
  assert.equal(p.state().phase, 'drafting');
  assert.equal(fs.readFileSync(path.join(p.root, '.naqsha', '.gitignore'), 'utf8'), '*\n');

  assert.ok(denied(p.write('src/app.js')));
  assert.ok(denied(p.write('package.json')));
  assert.ok(denied(p.write('.claude/settings.json')));
  assert.equal(p.write('docs/plans/login/plan.js'), null);
  assert.equal(p.write(path.join(os.tmpdir(), 'scratch.txt')), null);
});

test('a symlink inside the plans folder cannot reach locked files', () => {
  const p = project();
  p.cmd('plan');
  fs.mkdirSync(path.join(p.root, 'docs', 'plans'), { recursive: true });
  fs.symlinkSync(path.join(p.root, 'src'), path.join(p.root, 'docs', 'plans', 'src'));
  assert.ok(denied(p.write('docs/plans/src/app.js')));
});

test('Claude cannot touch the gate state or approve', () => {
  const p = project();
  p.cmd('plan');
  assert.ok(denied(p.write('.naqsha/state.json')));
  assert.ok(denied(p.bash('cat .naqsha/state.json')));
  assert.ok(denied(p.bash('claude -p "/naqsha:approve"')));
  assert.ok(denied(p.run({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'naqsha:approve' } })));
  assert.equal(p.bash('git log --oneline'), null);
});

test('Bash changes to project files during drafting are caught', () => {
  const p = project();
  p.cmd('plan');
  p.prompt();
  assert.equal(p.afterBash(), null);

  fs.mkdirSync(path.join(p.root, 'docs', 'plans', 'x'), { recursive: true });
  fs.writeFileSync(path.join(p.root, 'docs', 'plans', 'x', 'index.html'), '<p>');
  assert.equal(p.afterBash(), null, 'writes to the plans folder are fine');

  fs.writeFileSync(path.join(p.root, 'src', 'app.js'), 'changed\n');
  fs.writeFileSync(path.join(p.root, 'src', 'new.js'), 'new\n');
  const out = p.afterBash();
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /src\/app\.js/);
  assert.match(out.reason, /src\/new\.js/);

  // Restoring the files clears it.
  execFileSync('git', ['-C', p.root, 'checkout', '--', 'src/app.js']);
  fs.rmSync(path.join(p.root, 'src', 'new.js'));
  assert.equal(p.afterBash(), null);
});

test('a commit during drafting is caught', () => {
  const p = project();
  p.cmd('plan');
  p.prompt();
  execFileSync('git', ['-C', p.root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'sneaky']);
  assert.match(p.afterBash().reason, /HEAD/);
});

test("the user's own edits between prompts are not reported", () => {
  const p = project();
  p.cmd('plan');
  fs.writeFileSync(path.join(p.root, 'src', 'app.js'), 'user edit\n');
  p.prompt();
  assert.equal(p.afterBash(), null);
});

test('Bash changes are caught outside git too', () => {
  const p = project({ git: false });
  p.cmd('plan');
  p.prompt();
  fs.writeFileSync(path.join(p.root, 'src', 'other.js'), 'x');
  assert.match(p.afterBash().reason, /src\/other\.js/);
});

test('approval is refused while the plan is incomplete', () => {
  const p = project();
  assert.equal(p.cmd('approve').decision, 'block', 'nothing drafted yet');
  p.cmd('plan');
  assert.match(p.cmd('approve').reason, /No draft plan/);

  writePlan(p.root, 'login', {
    decisions: [{ id: 'D1', status: 'open' }, { id: 'D2', status: 'decided' }],
    steps: [{ id: 'S1', estimate: { low: 3, likely: 2, high: 4 } }],
  });
  const out = p.cmd('approve');
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /open decisions: D1\b/);
  assert.match(out.reason, /estimate: S1/);
  assert.match(out.reason, /"done when" check: S1/);
  assert.equal(p.state().phase, 'drafting');

  writePlan(p.root, 'empty', { decisions: { na: 'nothing to decide' }, steps: [] });
  assert.match(p.cmd('approve', 'empty').reason, /no implementation steps/);

  writePlan(p.root, 'noprior', { priorArt: [] });
  assert.match(p.cmd('approve', 'noprior').reason, /no prior art/);
  writePlan(p.root, 'blankna', { priorArt: { na: ' ' } });
  assert.match(p.cmd('approve', 'blankna').reason, /no prior art/);

  fs.writeFileSync(path.join(p.root, 'docs', 'plans', 'login', 'plan.js'), 'window.NAQSHA = {oops};');
  assert.match(p.cmd('approve', 'login').reason, /could not be read/);

  // An explicit "searched, found nothing" is accepted (this one approves).
  writePlan(p.root, 'searched', { priorArt: { na: 'Searched GitHub, npm and vendor docs for X; nothing comparable' } });
  assert.equal(p.cmd('approve', 'searched').decision, undefined);
});

test('approval unlocks the project and marks the plan', () => {
  const p = project();
  p.cmd('plan');
  assert.equal(p.cmd('build').decision, 'block', 'no build before approval');
  writePlan(p.root, 'login');

  const out = p.cmd('approve');
  assert.match(out.hookSpecificOutput.additionalContext, /approved "Test plan"/);
  const s = p.state();
  assert.equal(s.phase, 'approved');
  assert.equal(s.plan, path.join('docs', 'plans', 'login'));
  const plan = require(HOOK).readPlan(path.join(p.root, 'docs', 'plans', 'login', 'plan.js'));
  assert.equal(plan.meta.status, 'approved');
  assert.ok(plan.meta.approvedAt);

  assert.equal(p.write('src/app.js'), null);
  assert.ok(denied(p.write('.naqsha/state.json')), 'state stays protected');
  assert.match(p.cmd('build').hookSpecificOutput.additionalContext, /docs\/plans\/login/);

  // A new plan locks the project again.
  p.cmd('plan', 'next thing');
  assert.ok(denied(p.write('src/app.js')));
});

test('session start reminds Claude of the phase', () => {
  const p = project();
  assert.equal(p.run({ hook_event_name: 'SessionStart' }), null);
  p.cmd('plan');
  assert.match(p.run({ hook_event_name: 'SessionStart' }).hookSpecificOutput.additionalContext, /being drafted/);
  writePlan(p.root, 'login');
  p.cmd('approve');
  assert.match(p.run({ hook_event_name: 'SessionStart' }).hookSpecificOutput.additionalContext, /\/naqsha:build/);
});
