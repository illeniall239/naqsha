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
  // The hook keeps a copy of its state under the home folder; never the real one.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'naqsha-home-'));
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
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, HOME: home },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout ? JSON.parse(r.stdout) : null;
  };
  const cmd = (name, args = '') => run({ hook_event_name: 'UserPromptExpansion', command_name: `naqsha:${name}`, command_args: args });
  const write = (file) => run({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.resolve(root, file), content: 'x' } });
  const bash = (command) => run({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
  const afterBash = () => run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'x' } });
  // A whole Bash call: the hook before it, what it does, the hook after it.
  let calls = 0;
  const command = (does = () => {}) => {
    const tool_use_id = `toolu_${++calls}`;
    run({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id, tool_input: { command: 'x' } });
    does();
    return run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id, tool_input: { command: 'x' } });
  };
  const prompt = () => run({ hook_event_name: 'UserPromptSubmit', prompt: 'hi' });
  const state = () => JSON.parse(fs.readFileSync(path.join(root, '.naqsha', 'state.json'), 'utf8'));
  return { root, home, run, cmd, write, bash, afterBash, command, prompt, state };
}

const denied = out => out && out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision === 'deny';

function writePlan(root, slug, overrides = {}, plansDir = path.join('docs', 'plans')) {
  const plan = {
    meta: { title: 'Test plan', slug, kind: 'feature', status: 'draft' },
    priorArt: [{ name: 'Django password reset', verdict: 'learn from' }],
    decisions: [{ id: 'D1', question: 'Q?', status: 'decided', choice: 'A' }],
    steps: [{ id: 'S1', title: 'Do it', tests: [{ test: 'Unknown email gets the same response' }], doneWhen: 'tests pass' }],
    requirements: { nonFunctional: [{ id: 'N1', measure: '95% within 60 s', source: 'user', verifiedBy: ['S1'] }] },
    architecture: {
      style: { existing: 'One Express app and Postgres' },
      components: [{ name: 'reset module', responsibility: 'Issue reset tokens', interface: 'requestReset(email)', new: true }],
    },
    security: { threats: [{ id: 'T1', threat: 'Email enumeration', mitigation: 'Same response either way', step: 'S1' }] },
    testing: { seams: [{ seam: 'reset module' }], runIt: { start: 'npm start', drive: 'http' }, securityChecks: [{ check: 'Secret scan', command: 'gitleaks git' }] },
    ...overrides,
  };
  fs.mkdirSync(path.join(root, plansDir, slug), { recursive: true });
  fs.writeFileSync(path.join(root, plansDir, slug, 'plan.js'), `window.NAQSHA = ${JSON.stringify(plan, null, 2)};\n`);
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
  for (const run of ['claude -p "/naqsha:approve"', 'cd app && claude --print /naqsha:approve', 'env A=1 claude -p "/naqsha:approve x"',
    'echo ok; /usr/local/bin/claude -p /naqsha:approve', 'x=$(claude -p "/naqsha:approve")']) {
    assert.ok(denied(p.bash(run)), run);
  }
  // Mentioning them is not touching them.
  for (const mention of ['cat .naqsha/state.json', 'git commit -m "docs: delete .naqsha to leave; approve with /naqsha:approve"',
    "python3 - <<'EOF'\ntext = 'type /naqsha:approve, or delete the .naqsha folder'\nEOF", 'grep -rn "naqsha:approve" skills/',
    'claude plugin validate . && echo "/naqsha:approve is user-only" > /dev/null']) {
    assert.equal(p.bash(mention), null, mention);
  }
  assert.ok(denied(p.run({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'naqsha:approve' } })));
  assert.equal(p.bash('git log --oneline'), null);
});

test('a skill started by mention gets the same gate as a typed command', () => {
  // "…let's build it, use /naqsha:plan": Claude Code hands Claude the skill
  // through the Skill tool, and the typed-command hook never runs.
  const p = project();
  const skill = (name, args = '') => p.run({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: name, args } });

  const planning = skill('naqsha:plan', 'an AI therapist app');
  assert.equal(planning.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(planning.hookSpecificOutput.additionalContext, /planning phase\. Plans go in docs\/plans/);
  assert.equal(planning.hookSpecificOutput.permissionDecision, undefined, 'no say over the permission prompt');
  assert.equal(p.state().phase, 'drafting');
  assert.ok(denied(p.write('src/app.js')), 'the lock is on');

  assert.match(skill('naqsha:build').hookSpecificOutput.permissionDecisionReason, /being drafted/);
  assert.ok(denied(skill('naqsha:approve')), 'approval stays typed-only');

  writePlan(p.root, 'login');
  p.cmd('approve');
  assert.match(skill('naqsha:build').hookSpecificOutput.additionalContext, /building the approved plan in docs\/plans\/login/);
  assert.match(skill('naqsha:build', 'nope please').hookSpecificOutput.permissionDecisionReason, /No approved, unfinished plan at docs\/plans\/nope/);
});

test('/naqsha:learn says where guides go and which plans exist, and changes nothing', () => {
  const p = project();
  let out = p.cmd('learn');
  assert.match(out.hookSpecificOutput.additionalContext, /plans folder is docs\/plans\/\. Plans, newest first: none, so the guide comes from the code/);
  assert.equal(fs.existsSync(path.join(p.root, '.naqsha')), false, 'no state, no lock');

  writePlan(p.root, 'login', { meta: { title: 't', slug: 'login', status: 'done' }, steps: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'done' }] });
  out = p.cmd('learn', 'login');
  assert.match(out.hookSpecificOutput.additionalContext, /login \(done, 2\/2 steps done\)/);
  assert.match(out.hookSpecificOutput.additionalContext, /guide goes in docs\/plans\/<slug>\/learn\//);
  const viaMention = p.run({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'naqsha:learn' } });
  assert.match(viaMention.hookSpecificOutput.additionalContext, /Naqsha learn:/);
  assert.equal(viaMention.hookSpecificOutput.permissionDecision, undefined);

  // A guide in the plans folder doesn't make it look like it holds code.
  fs.mkdirSync(path.join(p.root, 'docs', 'plans', 'login', 'learn'));
  fs.writeFileSync(path.join(p.root, 'docs', 'plans', 'login', 'learn', 'guide.js'), 'window.NAQSHA_GUIDE = {};\n');
  fs.writeFileSync(path.join(p.root, 'docs', 'plans', 'login', 'learn', 'index.html'), '<!doctype html>');
  assert.equal(p.cmd('plan').decision, undefined);
});

test('/naqsha:review gets a folder of its own, earlier findings, and how stale the map is', () => {
  const p = project();
  const g = (...a) => execFileSync('git', ['-C', p.root, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' });
  const ctx = out => out.hookSpecificOutput.additionalContext;
  const today = (d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'))(new Date());
  let out = p.cmd('review');
  assert.match(ctx(out), new RegExp(`this review goes in docs/plans/reviews/${today}/, and the codebase map in docs/plans/CODEBASE\\.md`));
  assert.match(ctx(out), /Earlier reviews, newest first: none\. There is no codebase map yet/);
  assert.equal(fs.existsSync(path.join(p.root, '.naqsha')), false, 'no state, no lock');

  // A map at this commit is current; two commits later it says what moved.
  const head = g('rev-parse', '--short', 'HEAD').trim();
  const plans = path.join(p.root, 'docs', 'plans');
  fs.mkdirSync(path.join(plans, 'reviews', today), { recursive: true });
  fs.writeFileSync(path.join(plans, 'CODEBASE.md'), `# Codebase map\n<!-- naqsha codebase map · commit ${head} · ${today} -->\n`);
  fs.writeFileSync(path.join(plans, 'reviews', today, 'review.js'),
    `window.NAQSHA_REVIEW = ${JSON.stringify({ meta: {}, findings: [{ id: 'F1' }, { id: 'F2', status: 'dismissed' }, { id: 'F3', status: 'open' }] })};\n`);
  assert.match(ctx(p.cmd('review')), /CODEBASE\.md exists, current with HEAD/);
  fs.writeFileSync(path.join(p.root, 'src', 'app.js'), 'console.log(2);\n');
  g('commit', '-qam', 'two');
  fs.writeFileSync(path.join(p.root, 'src', 'b.js'), '1;\n');
  g('add', 'src/b.js'); g('commit', '-qm', 'three');
  out = p.cmd('review');
  assert.match(ctx(out), new RegExp(`2 commits behind HEAD \\(2 files changed since; \`git diff --stat ${head}\\.\\.HEAD\`\\); refresh only the parts those touch`));
  assert.match(ctx(out), new RegExp(`Earlier reviews, newest first: ${today} \\(2 open of 3 findings\\)`));
  assert.match(ctx(out), new RegExp(`reviews/${today}-2/`), 'a second review the same day gets its own folder');

  // Plans and guides start from the map; a review page doesn't make the plans folder look like code.
  fs.writeFileSync(path.join(plans, 'reviews', today, 'index.html'), '<!doctype html>');
  assert.match(ctx(p.cmd('learn')), /CODEBASE\.md exists, 2 commits behind/);
  out = p.cmd('plan');
  assert.equal(out.decision, undefined);
  assert.match(ctx(out), /Naqsha: planning phase\..*CODEBASE\.md exists, 2 commits behind HEAD/);
  assert.match(ctx(p.cmd('review')), /A plan is being drafted, so files outside the plans folder are locked/);
  const viaMention = p.run({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'naqsha:review' } });
  assert.match(viaMention.hookSpecificOutput.additionalContext, /^Naqsha review:/);
  assert.equal(viaMention.hookSpecificOutput.permissionDecision, undefined);
});

test("a command that changes or deletes the gate's state gets it put back", () => {
  const p = project();
  p.cmd('plan');
  const stateFile = path.join(p.root, '.naqsha', 'state.json');
  const before = fs.readFileSync(stateFile, 'utf8');

  fs.writeFileSync(stateFile, JSON.stringify({ phase: 'approved', plan: 'docs/plans/x' }));
  let out = p.afterBash();
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /changed naqsha's state.*put back/);
  assert.equal(fs.readFileSync(stateFile, 'utf8'), before);
  assert.ok(denied(p.write('src/app.js')), 'still locked');

  fs.rmSync(path.join(p.root, '.naqsha'), { recursive: true });
  out = p.afterBash();
  assert.match(out.reason, /deleted naqsha's state.*from a terminal/);
  assert.equal(p.state().phase, 'drafting');

  // The user leaving between prompts is not undone.
  fs.rmSync(path.join(p.root, '.naqsha'), { recursive: true });
  p.prompt();
  assert.equal(p.afterBash(), null);
  assert.equal(fs.existsSync(stateFile), false);
  assert.equal(p.write('src/app.js'), null, 'unlocked');
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

test('only what changed while a command ran is put down to it', () => {
  const p = project();
  p.cmd('plan');
  p.prompt();
  assert.equal(p.command(), null);

  // The user edits a file between two of Claude's commands.
  fs.writeFileSync(path.join(p.root, 'src', 'app.js'), 'user is typing\n');
  const out = p.command();
  assert.equal(out.decision, undefined, 'not blocked: it is not Claude\'s change');
  assert.match(out.hookSpecificOutput.additionalContext, /none of your commands was running.*src\/app\.js.*Don't undo/s);
  assert.equal(p.command(), null, 'reported once');
});

test('undo advice never sends git restore at a file with uncommitted work', () => {
  const p = project();
  fs.writeFileSync(path.join(p.root, 'src', 'other.js'), 'committed\n');
  execFileSync('git', ['-C', p.root, 'add', '.']);
  execFileSync('git', ['-C', p.root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'two']);
  fs.writeFileSync(path.join(p.root, 'src', 'app.js'), 'the user\'s uncommitted work\n');
  p.cmd('plan');
  p.prompt();

  const out = p.command(() => {
    fs.appendFileSync(path.join(p.root, 'src', 'app.js'), 'claude\n');
    fs.rmSync(path.join(p.root, 'src', 'other.js'));
    fs.writeFileSync(path.join(p.root, 'src', 'new.js'), 'new\n');
  });
  assert.equal(out.decision, 'block');
  const [restore] = out.reason.match(/git restore --staged --worktree.*$/m);
  assert.match(restore, /src\/other\.js/, 'a deleted committed file is caught and safe to restore');
  assert.doesNotMatch(restore, /src\/app\.js/);
  assert.match(out.reason, /Created by your command; delete: src\/new\.js/);
  assert.match(out.reason, /throw away the user's work.*: src\/app\.js/);

  // It stays reported until undone, then goes quiet.
  assert.match(p.command().reason, /src\/other\.js/);
  const reason = p.command(() => {
    execFileSync('git', ['-C', p.root, 'restore', '--staged', '--worktree', '--', 'src/other.js']);
    fs.rmSync(path.join(p.root, 'src', 'new.js'));
  }).reason;
  assert.doesNotMatch(reason, /other\.js|new\.js/);
  assert.match(reason, /src\/app\.js/);
  p.command(() => fs.writeFileSync(path.join(p.root, 'src', 'app.js'), 'the user\'s uncommitted work\n'));
  assert.equal(p.command(), null);
});

test("the hook's git calls never rewrite the user's git index", () => {
  const p = project();
  p.cmd('plan');
  const index = path.join(p.root, '.git', 'index');
  const before = fs.statSync(index).mtimeMs;
  const later = new Date(Date.now() + 60000);
  fs.utimesSync(path.join(p.root, 'src', 'app.js'), later, later); // makes git want to refresh the index
  p.prompt();
  p.command();
  assert.equal(fs.statSync(index).mtimeMs, before);
});

test('plans stay out of a docs folder that is published', () => {
  const p = project();
  fs.mkdirSync(path.join(p.root, 'docs'));
  fs.writeFileSync(path.join(p.root, 'docs', '_config.yml'), 'theme: minima\n');
  assert.match(p.cmd('plan').hookSpecificOutput.additionalContext, /Plans go in plans\/<slug>\/.*docs\/_config\.yml/);
  assert.equal(p.write('plans/login/plan.js'), null);
  assert.ok(denied(p.write('docs/plans/login/plan.js')));
  writePlan(p.root, 'login', {}, 'plans');
  assert.match(p.cmd('approve').hookSpecificOutput.additionalContext, /plans\/login/);
});

test('the plans folder can be set, but never to a folder with code in it', () => {
  const p = project();
  fs.mkdirSync(path.join(p.root, '.claude'));
  const setDir = dir => fs.writeFileSync(path.join(p.root, '.claude', 'naqsha.json'), JSON.stringify({ plansDir: dir }));

  setDir('design');
  assert.match(p.cmd('plan').hookSpecificOutput.additionalContext, /Plans go in design\/<slug>\/ \(set in \.claude\/naqsha\.json\)/);
  assert.equal(p.write('design/x/plan.js'), null);

  for (const [dir, why] of [['src', /holds src\/app\.js/], ['.', /inside the project/], ['../elsewhere', /inside the project/], ['/tmp/x', /relative/], ['.git/plans', /\.git/]]) {
    fs.rmSync(path.join(p.root, '.naqsha'), { recursive: true, force: true });
    setDir(dir);
    const out = p.cmd('plan');
    assert.equal(out.decision, 'block', dir);
    assert.match(out.reason, why);
  }
  // Notes and existing plans are fine.
  setDir('docs/plans');
  fs.mkdirSync(path.join(p.root, 'docs', 'plans', 'old', 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(p.root, 'docs', 'plans', 'README.md'), '# Plans\n');
  fs.writeFileSync(path.join(p.root, 'docs', 'plans', 'old', 'plan.js'), 'window.NAQSHA = {};\n');
  assert.equal(p.cmd('plan').decision, undefined);
});

test('Bash changes to git-ignored files are caught, ignored folders are not', () => {
  const p = project();
  fs.writeFileSync(path.join(p.root, '.gitignore'), '.env\ncache/\n.claude/\n');
  fs.writeFileSync(path.join(p.root, '.env'), 'KEY=1\n');
  execFileSync('git', ['-C', p.root, 'add', '.gitignore']);
  execFileSync('git', ['-C', p.root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'ignore']);
  p.cmd('plan');
  p.prompt();

  // Caches a test run refreshes, and Claude Code's own settings, aren't reported.
  fs.mkdirSync(path.join(p.root, 'cache'));
  fs.writeFileSync(path.join(p.root, 'cache', 'x'), 'x');
  fs.mkdirSync(path.join(p.root, '.claude'));
  fs.writeFileSync(path.join(p.root, '.claude', 'settings.local.json'), '{}');
  assert.equal(p.afterBash(), null);

  fs.writeFileSync(path.join(p.root, '.env'), 'KEY=2, longer\n');
  assert.match(p.afterBash().reason, /\.env/);
});

test('a paused build can be resumed by name', () => {
  const p = project();
  p.cmd('plan');
  writePlan(p.root, 'login');
  p.cmd('approve');
  assert.equal(p.cmd('approve', 'login').decision, 'block', 'an approved plan is not approved again');

  const drafting = p.cmd('plan', 'next thing').hookSpecificOutput.additionalContext;
  assert.match(drafting, /docs\/plans\/login is paused/);
  assert.match(drafting, /\/naqsha:build login/);
  assert.match(p.cmd('build', 'login').reason, /being drafted/, 'no build while files are locked');
  p.prompt();
  assert.equal(p.state().paused, path.join('docs', 'plans', 'login'), 'kept across prompts');

  writePlan(p.root, 'search');
  assert.match(p.cmd('approve').hookSpecificOutput.additionalContext, /approved "Test plan" \(docs\/plans\/search\).*\/naqsha:build login/);
  assert.match(p.cmd('build').hookSpecificOutput.additionalContext, /docs\/plans\/search/);

  assert.match(p.cmd('build', 'login').hookSpecificOutput.additionalContext, /docs\/plans\/login/);
  assert.equal(p.state().plan, path.join('docs', 'plans', 'login'));
  assert.match(p.cmd('build', 'nope').reason, /No approved, unfinished plan/);
  assert.match(p.cmd('build', '../../etc').reason, /No approved, unfinished plan/);

  // Deleting the state forgets which plan was last, so it must be named.
  fs.rmSync(path.join(p.root, '.naqsha'), { recursive: true });
  assert.match(p.cmd('build').reason, /name an approved plan/);
  assert.match(p.cmd('build', 'search').hookSpecificOutput.additionalContext, /docs\/plans\/search/);
});

test('a finished build is not reported as paused', () => {
  const p = project();
  p.cmd('plan');
  writePlan(p.root, 'login');
  p.cmd('approve');
  writePlan(p.root, 'login', { meta: { title: 'Test plan', slug: 'login', status: 'done' } });
  assert.doesNotMatch(p.cmd('plan', 'next').hookSpecificOutput.additionalContext, /paused/);
});

test('a project too big to walk says so', () => {
  const p = project({ git: false });
  const dir = path.join(p.root, 'many');
  fs.mkdirSync(dir);
  for (let i = 0; i < 20001; i++) fs.writeFileSync(path.join(dir, String(i)), '');
  assert.match(p.cmd('plan').hookSpecificOutput.additionalContext, /more than 20000 files/);
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
    questions: [{ id: 'Q1', status: 'answered' }, { id: 'Q2', status: 'open' }],
    decisions: [{ id: 'D1', status: 'open' }, { id: 'D2', status: 'decided' }],
    steps: [{ id: 'S1' }],
  });
  const out = p.cmd('approve');
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /unanswered questions: Q2\b/);
  assert.match(out.reason, /open decisions: D1\b/);
  assert.doesNotMatch(out.reason, /estimate/, 'steps carry no time estimates');
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

test('approval is refused until security and modules are pinned down', () => {
  const p = project();
  p.cmd('plan');
  const refused = (overrides, why) => {
    writePlan(p.root, 'x', overrides);
    const out = p.cmd('approve', 'x');
    assert.equal(out.decision, 'block', String(why));
    assert.match(out.reason, why);
  };
  refused({ security: undefined }, /no security section/);
  refused({ security: [] }, /no security section/);
  refused({ security: { threats: [{ id: 'T1', mitigation: 'x', step: 'S9' }] } }, /threats with no mitigation.*: T1/);
  refused({ security: { threats: [{ id: 'T2', step: 'S1' }] } }, /: T2/);
  refused({ security: { threats: [{ id: 'T3', acceptedBy: 'user', acceptedReason: ' ' }] } }, /: T3/);
  refused({ security: { threats: [{ id: 'T4', acceptedBy: 'claude', acceptedReason: 'fine' }] } }, /: T4/);
  refused({ testing: { seams: [{ seam: 'x' }], securityChecks: [] } }, /no security checks/);
  refused({ testing: { seams: [{ seam: 'x' }], securityChecks: [{ check: 'audit' }] } }, /no security checks/);
  refused({ testing: { na: 'no tests' } }, /no security checks/);
  refused({ architecture: { style: { existing: 'x' }, components: [{ name: 'billing', responsibility: 'Charge cards', new: true }] } }, /new modules without.*billing/);

  // What does pass: a risk the user accepted, a design with no trust boundary,
  // and existing modules described loosely.
  writePlan(p.root, 'ok', {
    security: { threats: [{ id: 'T1', acceptedBy: 'user', acceptedReason: 'Internal tool behind VPN; revisit before launch' }] },
    architecture: { style: { existing: 'x' }, components: [{ name: 'existing router' }] },
  });
  assert.equal(p.cmd('approve', 'ok').decision, undefined);
  p.cmd('plan');
  writePlan(p.root, 'local', { security: { na: 'Renames a CLI flag; no new data flows' } });
  assert.equal(p.cmd('approve', 'local').decision, undefined);
});

test('approval is refused until every step says which failing tests it starts from', () => {
  const p = project();
  p.cmd('plan');
  const step = extra => ({ id: 'S1', title: 't', doneWhen: 'd', ...extra });
  const checks = [{ check: 'Secret scan', command: 'gitleaks git' }];
  const refused = (overrides, why) => {
    writePlan(p.root, 'x', overrides);
    const out = p.cmd('approve', 'x');
    assert.equal(out.decision, 'block', String(why));
    assert.match(out.reason, why);
  };
  refused({ steps: [step({})] }, /steps without the failing tests they start from: S1/);
  refused({ steps: [step({ tests: [] })] }, /: S1/);
  refused({ steps: [step({ tests: [{ kind: 'unit' }] })] }, /: S1/);
  refused({ steps: [step({ tests: { na: '' } })] }, /: S1/);
  refused({ testing: { securityChecks: checks } }, /no test seams/);
  refused({ testing: { seams: [{ seam: 'api' }], securityChecks: checks } }, /no way to run the app like a user/);
  refused({ testing: { seams: [{ seam: 'api' }], runIt: { start: 'npm start' }, securityChecks: checks } }, /no way to run the app/);
  refused({ testing: { seams: [{ seam: 'api' }], runIt: { na: ' ' }, securityChecks: checks } }, /no way to run the app/);
  refused({ testing: { seams: [{ catches: 'x' }], securityChecks: checks } }, /no test seams/);

  // A step with nothing a test can state first says why.
  writePlan(p.root, 'ok', { steps: [step({ tests: { na: 'Adds the CI workflow; proven by its first run' } })] });
  assert.equal(p.cmd('approve', 'ok').decision, undefined);
  p.cmd('plan');
  writePlan(p.root, 'lib', { testing: { seams: [{ seam: 'parse()' }], runIt: { na: 'A library: its examples run in CI' }, securityChecks: checks } });
  assert.equal(p.cmd('approve', 'lib').decision, undefined);
  p.cmd('plan');
  writePlan(p.root, 'ok', { steps: [step({ tests: { na: 'Adds the CI workflow; proven by its first run' } })] });
  assert.equal(p.cmd('approve', 'ok').decision, undefined);
});

test('approval is refused while the design rests on assumptions', () => {
  const p = project();
  p.cmd('plan');
  const refused = (overrides, why) => {
    writePlan(p.root, 'x', overrides);
    const out = p.cmd('approve', 'x');
    assert.equal(out.decision, 'block', String(why));
    assert.match(out.reason, why);
  };
  const nf = extra => ({ requirements: { nonFunctional: [{ id: 'N1', measure: 'p95 < 300 ms', source: 'user', verifiedBy: ['S1'], ...extra }] } });
  refused({ requirements: {} }, /no quality scenarios/);
  refused({ requirements: { nonFunctional: [] } }, /no quality scenarios/);
  refused(nf({ measure: '' }), /quality scenarios without.*: N1/);
  refused(nf({ source: 'assumed' }), /: N1/);
  refused(nf({ source: undefined }), /: N1/);
  refused(nf({ verifiedBy: [] }), /: N1/);
  refused(nf({ verifiedBy: ['S9'] }), /: N1/);
  refused({ architecture: { components: [] } }, /no architecture style/);
  refused({ architecture: { style: { decision: 'D7' } } }, /no architecture style/);
  refused({ architecture: { style: { decision: 'D2' } }, decisions: [{ id: 'D1', status: 'decided' }, { id: 'D2', status: 'open' }] }, /no architecture style/);

  // A decided style, a check in an acceptance criterion, and a change with no
  // quality scenario that says why all pass.
  writePlan(p.root, 'ok', {
    ...nf({ verifiedBy: ['A1'], source: 'research' }),
    testing: { seams: [{ seam: 'api' }], runIt: { start: 'npm start', drive: 'http' }, acceptance: [{ id: 'A1', text: 'x' }], securityChecks: [{ check: 'c', command: 'c' }] },
    architecture: { style: { decision: 'D1' } },
  });
  assert.equal(p.cmd('approve', 'ok').decision, undefined);
  p.cmd('plan');
  writePlan(p.root, 'small', { requirements: { nonFunctional: { na: 'Copy change on one page; no quality affected' } }, architecture: { na: 'No structural change' } });
  assert.equal(p.cmd('approve', 'small').decision, undefined);
});

test('in an existing codebase, approval needs who relies on what changes', () => {
  const p = project();
  p.cmd('plan');
  const context = { stack: ['Express'], conventions: [] };
  const change = extra => ({ change: 'requestReset(email) returns a promise', searched: 'grep -rn requestReset src test', outside: 'none: not exported', users: [{ where: 'src/routes/auth.js:40', step: 'S1' }], ...extra });
  const refused = (overrides, why) => {
    writePlan(p.root, 'x', { context, impact: [change()], dependencies: [], ...overrides });
    const out = p.cmd('approve', 'x');
    assert.equal(out.decision, 'block', String(why));
    assert.match(out.reason, why);
  };
  refused({ impact: undefined }, /no impact map/);
  refused({ impact: { na: ' ' } }, /no impact map/);
  refused({ impact: [] }, /no impact map/, 'nothing found is said with na and a reason');
  refused({ impact: [change({ searched: '' })] }, /impact entries without .*requestReset/);
  refused({ impact: [change({ outside: undefined })] }, /impact entries without/);
  refused({ impact: [change({ users: [{ where: 'src/jobs/remind.js:12' }] })] }, /impact entries without/, 'a user nobody updates or vouches for');
  refused({ impact: [change({ users: [{ where: 'src/jobs/remind.js:12', step: 'S9' }] })] }, /impact entries without/);
  refused({ dependencies: [{ name: 'dayjs', version: '1.11.13' }] }, /new dependencies without "overlap".*dayjs/);

  writePlan(p.root, 'ok', { context, dependencies: [{ name: 'dayjs', version: '1.11.13', overlap: 'none: package.json has no date library' }],
    impact: [change({ users: [{ where: 'src/routes/auth.js:40', step: 'S1' }, { where: 'src/jobs/remind.js:12', ok: 'awaits already' }] })] });
  assert.equal(p.cmd('approve', 'ok').decision, undefined);
  p.cmd('plan');
  writePlan(p.root, 'additive', { context, impact: { na: 'Adds a new route and module; changes nothing existing' } });
  assert.equal(p.cmd('approve', 'additive').decision, undefined);
  p.cmd('plan');
  writePlan(p.root, 'newapp', { context: { na: 'new app' } });
  assert.equal(p.cmd('approve', 'newapp').decision, undefined, 'a new app has nothing to break');
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

test('after a compaction, Claude is told what to reload', () => {
  const p = project();
  p.cmd('plan');
  const drafting = p.run({ hook_event_name: 'SessionStart', source: 'compact' }).hookSpecificOutput.additionalContext;
  assert.match(drafting, /just compacted: re-read \/\S+\/skills\/plan\/SKILL\.md/);
  assert.doesNotMatch(p.run({ hook_event_name: 'SessionStart', source: 'resume' }).hookSpecificOutput.additionalContext, /compacted/);
  writePlan(p.root, 'login');
  p.cmd('approve');
  const building = p.run({ hook_event_name: 'SessionStart', source: 'compact' }).hookSpecificOutput.additionalContext;
  assert.match(building, /skills\/build\/SKILL\.md and its always-loaded references/);
  assert.ok(!building.includes('${'), 'paths are real, not unexpanded variables');
  assert.doesNotMatch(building, /step in progress/, 'no step started yet');

  // Mid-step, the step and its checkpoint come back without being asked for.
  const file = path.join(p.root, 'docs', 'plans', 'login', 'plan.js');
  const tool = (args, input) => execFileSync('node', [path.join(__dirname, '..', 'scripts', 'plan-tool.js'), ...args, file], { input, encoding: 'utf8' });
  tool(['set-meta'], '{"status":"building"}');
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'plan-tool.js'), 'update-step', file, 'S1'], { input: '{"status":"doing"}' });
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'plan-tool.js'), 'checkpoint', file, 'S1'],
    { input: JSON.stringify({ did: 'red test for unknown email', red: 'unknown email gets 202', next: 'make requestReset return 202' }) });
  for (const source of ['compact', 'resume', 'clear']) {
    const back = p.run({ hook_event_name: 'SessionStart', source }).hookSpecificOutput.additionalContext;
    assert.match(back, /The step in progress:[\s\S]*Step S1: Do it \[doing\]/, source);
    assert.match(back, /Where you left off[\s\S]*Red: unknown email gets 202[\s\S]*Next: make requestReset return 202/, source);
  }
  assert.doesNotMatch(p.run({ hook_event_name: 'SessionStart', source: 'startup' }).hookSpecificOutput.additionalContext, /step in progress/,
    'a fresh session starts with /naqsha:build, which reads it then');

  assert.doesNotMatch(p.run({ hook_event_name: 'SessionStart', source: 'compact' }).hookSpecificOutput.additionalContext, /crew mode/);
  tool(['set-meta'], '{"buildMode":"crew"}');
  const crew = p.run({ hook_event_name: 'SessionStart', source: 'compact' }).hookSpecificOutput.additionalContext;
  assert.match(crew, /crew mode: you coordinate workers \(\/\S+\/skills\/build\/references\/crew\.md\)/);
  assert.match(crew, /crew\.js list docs\/plans\/login\/plan\.js/);
});

test('no turn that worked on a step ends without a checkpoint', () => {
  const p = project();
  const stop = (extra = {}) => p.run({ hook_event_name: 'Stop', ...extra });
  p.cmd('plan');
  p.prompt();
  p.bash('ls');
  assert.equal(stop(), null, 'not while planning');

  writePlan(p.root, 'login');
  p.cmd('approve');
  const file = path.join(p.root, 'docs', 'plans', 'login', 'plan.js');
  const tool = (args, input) => execFileSync('node', [path.join(__dirname, '..', 'scripts', 'plan-tool.js'), args[0], file, ...args.slice(1)], { input, encoding: 'utf8' });
  tool(['set-meta'], '{"status":"building"}');

  p.prompt();
  p.bash('npm test');
  assert.equal(stop(), null, 'no step in progress');

  tool(['update-step', 'S1'], '{"status":"doing"}');
  p.prompt();
  assert.equal(stop(), null, 'a turn that did no work, such as a question, may end');
  p.bash('npm test');
  const out = stop();
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /S1 is in progress, and this turn did work without leaving a checkpoint/);
  assert.match(out.reason, /plan-tool\.js checkpoint docs\/plans\/login\/plan\.js S1/);
  assert.equal(stop({ stop_hook_active: true }), null, 'never blocks twice in a row');

  tool(['checkpoint', 'S1'], '{"did":"red test","next":"make it pass"}');
  assert.equal(stop(), null, 'a checkpoint from this turn lets it end');

  p.prompt();
  p.run({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(p.root, 'src', 'app.js') } });
  assert.equal(stop().decision, 'block', "last turn's checkpoint isn't enough for this one");

  tool(['update-step', 'S1'], '{"status":"done"}');
  assert.equal(stop(), null, 'the step is done');
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
