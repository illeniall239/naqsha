#!/usr/bin/env node
// naqsha hook: keeps project files unchanged while a plan is drafted, until
// the user approves it with /naqsha:approve.
//
// State lives in <project>/.naqsha/state.json and is written only by this
// script, from commands the user typed. Claude's tools may never touch it.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { readPlan, tryReadPlan, writePlan } = require('./plan-file.js');

const DEFAULT_PLANS_DIR = path.join('docs', 'plans');
const CONFIG_FILE = path.join('.claude', 'naqsha.json');
// Any of these suggests docs/ is built into a public website, plans included.
const PUBLISHED_DOCS = [
  'docs/_config.yml', 'docs/CNAME', 'docs/.nojekyll', 'docs/index.html', 'docs/index.md', 'docs/.vitepress',
  'mkdocs.yml', 'mkdocs.yaml', 'docusaurus.config.js', 'docusaurus.config.ts', 'docusaurus.config.mjs',
].map(f => path.join(...f.split('/')));
const STATE_DIR = '.naqsha';
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const WALK_SKIP = new Set(['.git', 'node_modules', STATE_DIR]);
const WALK_LIMIT = 20000;
// Claude Code writes this when the user allows a command, mid-turn.
const CLAUDE_LOCAL_SETTINGS = path.join('.claude', 'settings.local.json');
// What a plan folder holds: the page, the plan, and the page server's files.
const PLAN_FILES = new Set(['index.html', 'plan.js', '.gitignore', 'server.json', 'inbox']);

function main(input) {
  const root = realish(path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd));
  const ctx = { input, root, stateFile: path.join(root, STATE_DIR, 'state.json') };
  ctx.state = readJson(ctx.stateFile);
  ctx.plansDir = (ctx.state && ctx.state.plansDir) || DEFAULT_PLANS_DIR;

  switch (input.hook_event_name) {
    case 'UserPromptExpansion': return onCommand(ctx);
    case 'UserPromptSubmit': return onPrompt(ctx);
    case 'PreToolUse': return onPreTool(ctx);
    case 'PostToolUse': return onPostTool(ctx);
    case 'SessionStart': return onSessionStart(ctx);
    case 'Stop': return onStop(ctx);
  }
}

// ---- commands the user typed -------------------------------------------

function onCommand(ctx) {
  const name = String(ctx.input.command_name || '').replace(/^naqsha:/, '');
  const args = String(ctx.input.command_args || '').trim();
  if (name === 'plan') return startDrafting(ctx);
  if (name === 'approve') return approve(ctx, args);
  if (name === 'build') return startBuild(ctx, args);
}

function startDrafting(ctx) {
  const s = ctx.state;
  const where = choosePlansDir(ctx.root);
  const problem = checkPlansDir(ctx.root, where.dir);
  if (problem) {
    return block(`Can't start planning: the plans folder ${where.dir} ${problem}. It is the one folder Claude may write to while ` +
      `planning, so it may hold only plans and Markdown notes. Set "plansDir" in ${CONFIG_FILE} to a folder just for plans, ` +
      'for example { "plansDir": "plans" }, then run /naqsha:plan again.');
  }
  const plansDir = path.normalize(where.dir);
  const paused = s && s.phase === 'approved' && unfinished(ctx, s.plan) ? s.plan
    : s && s.phase === 'drafting' ? s.paused : undefined;
  const baseline = snapshot(ctx.root, plansDir);
  clearPreSnapshots(ctx);
  writeState(ctx, {
    phase: 'drafting',
    startedAt: new Date().toISOString(),
    plansDir,
    paused,
    baseline,
    blamed: {},
  });
  let msg = `Naqsha: planning phase. Plans go in ${plansDir}/<slug>/${where.why ? ` (${where.why})` : ''}. ` +
    `Files outside ${plansDir}/ are locked until the user runs /naqsha:approve.`;
  if (paused) msg += ` ${resumeHint(paused)}`;
  if (baseline.truncated) msg += ` This project has no git and more than ${WALK_LIMIT} files, so Bash changes past the first ${WALK_LIMIT} files go unnoticed. Keep Bash read-only.`;
  return context('UserPromptExpansion', msg);
}

// The user's setting wins. Otherwise docs/plans, unless docs/ looks like it
// is published, where a plan and its threat model would go public.
function choosePlansDir(root) {
  const config = readJson(path.join(root, CONFIG_FILE));
  if (config && config.plansDir !== undefined) return { dir: config.plansDir, why: `set in ${CONFIG_FILE}` };
  const sign = PUBLISHED_DOCS.find(f => fs.existsSync(path.join(root, f)));
  if (sign) {
    return { dir: 'plans', why: `not ${DEFAULT_PLANS_DIR}: ${sign} suggests docs/ is published as a website. Tell the user, and that "plansDir" in ${CONFIG_FILE} changes it` };
  }
  return { dir: DEFAULT_PLANS_DIR };
}

// The plans folder is writable while drafting, so a setting that pointed it
// at src/ would unlock the project. It must be a folder for plans only.
function checkPlansDir(root, dir) {
  if (typeof dir !== 'string' || !dir.trim() || path.isAbsolute(dir)) return 'must be a relative path';
  const abs = realish(path.resolve(root, dir));
  if (!inside(abs, root) || abs === root) return 'must be a folder inside the project';
  for (const own of ['.git', STATE_DIR, '.claude']) {
    if (inside(abs, path.join(root, own))) return `can't be inside ${own}/`;
  }
  const stray = strayFile(abs, 0);
  return stray ? `already holds ${path.relative(root, stray)}, which isn't part of a plan` : null;
}

function strayFile(dir, depth) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const d of entries) {
    const abs = path.join(dir, d.name);
    if (d.isFile() && /\.md$/i.test(d.name)) continue;
    if (depth === 0 ? d.name === '.gitignore' : PLAN_FILES.has(d.name)) continue;
    if (d.isDirectory() && depth < 3) {
      const s = strayFile(abs, depth + 1);
      if (s) return s;
      continue;
    }
    return abs;
  }
  return null;
}

function unfinished(ctx, rel) {
  const plan = tryReadPlan(path.join(ctx.root, rel, 'plan.js'));
  return !!plan && plan.meta.status !== 'done';
}

function resumeHint(rel) {
  return `The approved plan ${rel} is paused, not finished. The user resumes it with /naqsha:build ${path.basename(rel)}.`;
}

function approve(ctx, slug) {
  if (!ctx.state || ctx.state.phase !== 'drafting') {
    return block('Nothing to approve: no plan is being drafted. Start one with /naqsha:plan <what to build>.');
  }
  const planFile = findPlan(ctx.root, ctx.plansDir, slug, ['draft']);
  if (!planFile) {
    return block(slug
      ? `No draft plan at ${path.join(ctx.plansDir, slug, 'plan.js')}.`
      : `No draft plan found under ${ctx.plansDir}/. Pass the plan's folder name: /naqsha:approve <slug>.`);
  }
  const rel = path.relative(ctx.root, path.dirname(planFile));
  let plan, problems;
  try {
    plan = readPlan(planFile);
    problems = checkPlan(plan);
  } catch (e) {
    return block(`${rel}/plan.js could not be read (${e.message}). Ask Claude to fix the file, then approve again.`);
  }
  if (problems.length) {
    return block(`Not approved. ${rel} still has:\n- ${problems.join('\n- ')}\nResolve these with Claude, then run /naqsha:approve again.`);
  }

  const now = new Date().toISOString();
  plan.meta.status = 'approved';
  plan.meta.approvedAt = now;
  writePlan(planFile, plan);
  clearPreSnapshots(ctx);
  writeState(ctx, { phase: 'approved', plansDir: ctx.plansDir, plan: rel, approvedAt: now });
  let msg = `Naqsha: the user approved "${plan.meta.title}" (${rel}). Project files are unlocked for building.`;
  if (ctx.state.paused && ctx.state.paused !== rel) msg += ` ${resumeHint(ctx.state.paused)}`;
  return context('UserPromptExpansion', msg);
}

// Builds the plan approved last, or the approved plan the user names, such
// as one paused when a newer plan was started.
function startBuild(ctx, slug) {
  const s = ctx.state;
  if (s && s.phase === 'drafting') {
    return block(`A plan is being drafted, so project files are locked. Approve it with /naqsha:approve first, or delete ${STATE_DIR}/ to stop planning.`);
  }
  if (!slug) {
    if (s && s.phase === 'approved') return context('UserPromptExpansion', `Naqsha: building the approved plan in ${s.plan}/plan.js.`);
    return block('No approved plan to build. Draft one with /naqsha:plan and approve it with /naqsha:approve, or name an approved plan: /naqsha:build <folder>.');
  }
  const plansDir = s ? ctx.plansDir : path.normalize(String(choosePlansDir(ctx.root).dir));
  const planFile = findPlan(ctx.root, plansDir, slug, ['approved', 'building']);
  const plan = planFile && tryReadPlan(planFile);
  if (!plan) return block(`No approved, unfinished plan at ${path.join(plansDir, slug, 'plan.js')}.`);
  const rel = path.relative(ctx.root, path.dirname(planFile));
  writeState(ctx, { phase: 'approved', plansDir, plan: rel, approvedAt: plan.meta.approvedAt });
  return context('UserPromptExpansion', `Naqsha: building the approved plan in ${rel}/plan.js.`);
}

// What has to be true before a plan can be approved. Kept to facts a script
// can check; judging the plan's quality is the user's job.
function checkPlan(plan) {
  const problems = [];
  if (!isNa(plan.priorArt) && !list(plan.priorArt).length) problems.push('no prior art (list what exists, or say what was searched as { "na": ... })');
  const unanswered = list(plan.questions).filter(q => q.status !== 'answered');
  if (unanswered.length) problems.push(`unanswered questions: ${unanswered.map(q => q.id).join(', ')}`);
  const open = list(plan.decisions).filter(d => d.status !== 'decided');
  if (open.length) problems.push(`open decisions: ${open.map(d => d.id).join(', ')}`);
  const steps = list(plan.steps);
  if (!steps.length) problems.push('no implementation steps');
  const unestimated = steps.filter(s => !validEstimate(s.estimate));
  if (unestimated.length) problems.push(`steps without a low/likely/high estimate: ${unestimated.map(s => s.id).join(', ')}`);
  const unchecked = steps.filter(s => !s.doneWhen);
  if (unchecked.length) problems.push(`steps without a "done when" check: ${unchecked.map(s => s.id).join(', ')}`);
  return [...problems, ...checkDesign(plan, steps), ...checkTests(plan, steps), ...checkSecurity(plan, steps), ...checkModules(plan)];
}

// No assumed architecture: every quality scenario is measurable, sourced and
// checked by the plan, and the style was decided or is the one already there.
function checkDesign(plan, steps) {
  const problems = [];
  const req = plan.requirements;
  if (!isNa(req)) {
    const nf = req && typeof req === 'object' ? req.nonFunctional : undefined;
    if (!isNa(nf) && !(Array.isArray(nf) && nf.length)) {
      problems.push('no quality scenarios (requirements.nonFunctional, or { "na": ... } saying why none apply)');
    }
    const checkIds = new Set([...steps.map(s => s.id), ...(plan.testing && !isNa(plan.testing) ? list(plan.testing.acceptance) : []).map(a => a.id)]);
    const weak = list(nf).filter(n => !String(n.measure || '').trim() || !['user', 'repo', 'research'].includes(n.source) ||
      !(Array.isArray(n.verifiedBy) && n.verifiedBy.length && n.verifiedBy.every(id => checkIds.has(id))));
    if (weak.length) problems.push(`quality scenarios without a measure, a source (user, repo or research) and a check in an existing step or acceptance criterion: ${weak.map(n => n.id).join(', ')}`);
  }
  const arch = plan.architecture;
  if (!isNa(arch)) {
    const style = arch && typeof arch === 'object' ? arch.style : undefined;
    const decided = new Set(list(plan.decisions).filter(d => d.status === 'decided').map(d => d.id));
    const ok = style && (String(style.existing || '').trim() || decided.has(style.decision));
    if (!ok) problems.push('no architecture style (architecture.style: the decided decision that chose it, or the existing style it fits)');
  }
  return problems;
}

// Test-driven by default: the plan says where tests go and which failing
// tests each step starts from. A step can opt out only with a stated reason.
function checkTests(plan, steps) {
  const problems = [];
  const seams = plan.testing && !isNa(plan.testing) ? plan.testing.seams : undefined;
  if (!isNa(seams) && !(Array.isArray(seams) && seams.length && seams.every(s => s && s.seam))) {
    problems.push('no test seams (testing.seams: where tests go, and what each catches and misses)');
  }
  const runIt = plan.testing && !isNa(plan.testing) ? plan.testing.runIt : undefined;
  if (!isNa(runIt) && !(runIt && typeof runIt === 'object' && String(runIt.start || '').trim() && String(runIt.drive || '').trim())) {
    problems.push('no way to run the app like a user (testing.runIt: start and drive, or { "na": ... } saying why nothing runs)');
  }
  const untested = steps.filter(s => !isNa(s.tests) && !(Array.isArray(s.tests) && s.tests.length && s.tests.every(t => t && t.test)));
  if (untested.length) problems.push(`steps without the failing tests they start from: ${untested.map(s => s.id).join(', ')}`);
  return problems;
}

// Security has no leeway: every threat is built by a step or accepted by the
// user, and the build has checks to run. Whether the mitigations are any good
// is the user's call when they read the plan.
function checkSecurity(plan, steps) {
  const problems = [];
  const sec = plan.security;
  if (!isNa(sec) && (!sec || typeof sec !== 'object' || Array.isArray(sec))) {
    problems.push('no security section (a threat model, or { "na": ... } saying why nothing crosses a trust boundary)');
  }
  const stepIds = new Set(steps.map(s => s.id));
  const threats = sec && !isNa(sec) ? list(sec.threats) : [];
  const loose = threats.filter(t => !(t.mitigation && stepIds.has(t.step)) && !(t.acceptedBy === 'user' && String(t.acceptedReason || '').trim()));
  if (loose.length) problems.push(`threats with no mitigation built by an existing step, and not accepted by the user: ${loose.map(t => t.id).join(', ')}`);
  const checks = plan.testing && !isNa(plan.testing) ? plan.testing.securityChecks : undefined;
  if (!isNa(checks) && !(Array.isArray(checks) && checks.length && checks.every(c => c && c.command))) {
    problems.push('no security checks for the build to run (testing.securityChecks, each with a command)');
  }
  return problems;
}

function checkModules(plan) {
  const arch = plan.architecture;
  const vague = arch && !isNa(arch) ? list(arch.components).filter(c => c.new && !(c.responsibility && c.interface)) : [];
  return vague.length ? [`new modules without a responsibility and an interface: ${vague.map(c => c.name).join(', ')}`] : [];
}

// A section may be { na: "why" } instead of a list.
function list(x) {
  return Array.isArray(x) ? x : [];
}

function isNa(x) {
  return !!x && typeof x === 'object' && typeof x.na === 'string' && x.na.trim() !== '';
}

function validEstimate(e) {
  return e && [e.low, e.likely, e.high].every(n => typeof n === 'number' && n > 0) && e.low <= e.likely && e.likely <= e.high;
}

// ---- every prompt --------------------------------------------------------

// Re-baseline each turn so edits the user makes between prompts are theirs
// and never reported as Claude's.
function onPrompt(ctx) {
  if (ctx.state && ctx.state.phase === 'drafting') {
    clearPreSnapshots(ctx);
    writeState(ctx, { ...ctx.state, baseline: snapshot(ctx.root, ctx.plansDir), blamed: {} });
  }
  // While building, note when the turn began, so the Stop hook can tell
  // whether this turn left a checkpoint.
  if (ctx.state && ctx.state.phase === 'approved') {
    writeState(ctx, { ...ctx.state, turnStartedAt: new Date().toISOString() });
  }
}

// ---- Claude's tool calls -------------------------------------------------

function onPreTool(ctx) {
  const { tool_name: tool, tool_input: ti = {} } = ctx.input;
  const drafting = ctx.state && ctx.state.phase === 'drafting';

  // The gate's own state and the approval command belong to the user.
  if (tool === 'Bash' && /\.naqsha\b|naqsha:approve/.test(ti.command || '')) {
    return deny(`Naqsha state and approval are the user's. Don't read, change or invoke them from Bash.`);
  }
  if (tool === 'Skill' && ti.skill === 'naqsha:approve') {
    return deny('Only the user can approve a plan, by typing /naqsha:approve.');
  }
  // While building, note the first piece of work in each turn (one write a turn).
  if (ctx.state && ctx.state.phase === 'approved' && (tool === 'Bash' || FILE_TOOLS.has(tool)) &&
      !(ctx.state.workedAt >= ctx.state.turnStartedAt)) {
    writeState(ctx, { ...ctx.state, workedAt: new Date().toISOString() });
  }
  // Remember the project as it is right before the command, so afterwards
  // only what changed while it ran is put down to it.
  if (tool === 'Bash' && drafting) {
    writeFileAtomic(preSnapshotFile(ctx), JSON.stringify(snapshot(ctx.root, ctx.plansDir)));
    return;
  }
  if (!FILE_TOOLS.has(tool)) return;

  const target = ti.file_path || ti.notebook_path;
  if (!target) return;
  const abs = realish(path.resolve(ctx.root, target));
  if (inside(abs, path.join(ctx.root, STATE_DIR))) {
    return deny('Naqsha state is written only by the user\'s commands.');
  }
  if (!drafting) return;
  if (writableWhileDrafting(abs, ctx)) return;
  return deny(`Planning phase: ${path.relative(ctx.root, abs) || abs} is locked until the user approves the plan with /naqsha:approve. ` +
    `Only ${ctx.plansDir}/ and scratch/temp directories are writable now. Put this in the plan instead.`);
}

// Inside the project only the plans folder is writable, even when the project
// itself sits in a temp directory.
function writableWhileDrafting(abs, ctx) {
  if (inside(abs, ctx.root)) return inside(abs, path.join(ctx.root, ctx.plansDir));
  const allowed = [
    ctx.input.scratchpad_dir,
    os.tmpdir(),
    path.join(os.homedir(), '.claude', 'projects'), // Claude's memory files
  ].filter(Boolean).map(p => realish(path.resolve(p)));
  return allowed.some(dir => inside(abs, dir));
}

// Bash can write anywhere, so after each command the project is compared
// with how it was right before it. What changed while the command ran is
// Claude's to undo, and stays reported until it is. What changed between
// commands (the user's editor, a dev server, a watcher) is reported once as
// not Claude's, so Claude never "restores" someone else's work.
function onPostTool(ctx) {
  if (ctx.input.tool_name !== 'Bash' || !ctx.state || ctx.state.phase !== 'drafting') return;
  const s = ctx.state;
  const preFile = preSnapshotFile(ctx);
  const pre = readJson(preFile) || s.baseline;
  fs.rmSync(preFile, { force: true });
  const post = snapshot(ctx.root, ctx.plansDir);
  const blamed = { ...(s.blamed || {}) };

  const during = changedPaths(pre, post);
  const between = changedPaths(s.baseline, pre).filter(p => !(p in blamed));
  for (const p of during) if (!(p in blamed)) blamed[p] = valueIn(pre, p);
  for (const [p, was] of Object.entries(blamed)) if (valueIn(post, p) === was) delete blamed[p];
  writeState(ctx, { ...s, baseline: post, blamed });

  const notes = [];
  const yours = Object.keys(blamed);
  if (yours.length || pre.head !== post.head) notes.push(undoAdvice(ctx, yours, blamed, post, pre.head !== post.head));
  if (between.length || s.baseline.head !== pre.head) {
    const what = [...between, ...(s.baseline.head !== pre.head ? ['git HEAD'] : [])];
    notes.push(`These changed while none of your commands was running, so the user, a dev server or watcher, or a ` +
      `background command you started changed them: ${names(what)}. Don't undo them. If a background command of yours did ` +
      'it, stop it and tell the user.');
  }
  if (!notes.length) return;
  const text = `Naqsha planning phase: ${notes.join('\n\n')}`;
  return yours.length || pre.head !== post.head ? { decision: 'block', reason: text } : context('PostToolUse', text);
}

// How to undo each change safely. git restore puts back the last commit, so
// on a file that had changes nobody committed it would throw those away too.
function undoAdvice(ctx, paths, blamed, post, headMoved) {
  const tracked = post.head ? gitTracked(ctx.root, paths.filter(p => blamed[p] === null)) : new Set();
  const restore = paths.filter(p => blamed[p] === null && tracked.has(p));
  const created = paths.filter(p => blamed[p] === null && !tracked.has(p));
  const careful = paths.filter(p => blamed[p] !== null);
  const lines = [`your Bash commands changed project files outside ${ctx.plansDir}/. Undo that first:`];
  if (restore.length) lines.push(`- Unchanged since the last commit before your command, so \`git restore --staged --worktree -- <file>\` is safe: ${names(restore)}`);
  if (created.length) lines.push(`- Created by your command; delete: ${names(created)}`);
  if (careful.length) {
    lines.push(`- ${post.head ? 'Already had changes nobody has committed, so git restore would also throw away the user\'s work'
      : 'Existed before your command, and there is no git to restore from'}. Undo exactly what your command did if you ` +
      `can; otherwise leave the file and tell the user what changed: ${names(careful)}`);
  }
  if (headMoved) lines.push('- git HEAD moved (commit, reset or checkout). Don\'t reset it yourself; tell the user what you ran.');
  lines.push('Keep Bash read-only until the user approves the plan. Experiments belong in the scratchpad.');
  return lines.join('\n');
}

function names(paths) {
  return paths.slice(0, 20).join(', ') + (paths.length > 20 ? `, and ${paths.length - 20} more` : '');
}

function gitTracked(root, paths) {
  if (!paths.length) return new Set();
  try {
    const out = git(root, '--literal-pathspecs', 'ls-files', '-z', '--', ...paths);
    return new Set(out.split('\0').filter(Boolean).map(p => path.normalize(p)));
  } catch {
    return new Set();
  }
}

// One file per command, named by its tool call, so parallel commands each
// keep their own.
function preSnapshotFile(ctx) {
  const id = String(ctx.input.tool_use_id || 'last');
  const name = /^[\w-]{1,100}$/.test(id) ? id : sha256(id).slice(0, 32);
  return path.join(ctx.root, STATE_DIR, `pre-${name}.json`);
}

// A denied or interrupted command never reaches PostToolUse; drop its file.
function clearPreSnapshots(ctx) {
  const dir = path.join(ctx.root, STATE_DIR);
  for (const f of safeReaddir(dir)) if (/^pre-.*\.json$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
}

// After a compaction the skill's instructions and references may be gone from
// context while the work goes on, so say what to reload.
function onSessionStart(ctx) {
  const s = ctx.state;
  if (!s) return;
  const compacted = ctx.input.source === 'compact';
  const root = path.resolve(__dirname, '..'); // hook output isn't expanded like skill text
  if (s.phase === 'drafting') {
    let msg = `Naqsha: a plan is being drafted (since ${s.startedAt}). Plans go in ${ctx.plansDir}/. Files outside it are locked until the user runs /naqsha:approve. The user continues it with /naqsha:plan.`;
    if (compacted) msg += ` The context was just compacted: re-read ${root}/skills/plan/SKILL.md and the plan's plan.js before going on.`;
    return context('SessionStart', msg);
  }
  if (s.phase === 'approved') {
    const plan = tryReadPlan(path.join(ctx.root, s.plan, 'plan.js'));
    if (plan && plan.meta.status === 'done') return;
    let msg = `Naqsha: the approved plan ${s.plan} is being built. The user resumes it with /naqsha:build.`;
    if (compacted) {
      msg += ` The context was just compacted: before going on, re-read ${root}/skills/build/SKILL.md and its always-loaded references.`;
    }
    // Losing the context mid-step is where work goes wrong, so hand back the
    // step in progress, checkpoint included, instead of asking for it.
    const current = plan && ['compact', 'resume', 'clear'].includes(ctx.input.source)
      ? (plan.steps || []).find(st => st.status === 'doing') : null;
    if (current) {
      const { stepView } = require('./plan-tool.js');
      msg += `\n\nThe step in progress:\n\n${stepView(plan, current.id, path.join(ctx.root, s.plan, 'plan.js'))}`;
    }
    if (plan && plan.meta.buildMode === 'crew' && ['compact', 'resume', 'clear'].includes(ctx.input.source)) {
      msg += `\n\nThis build runs in crew mode: you coordinate workers (${root}/skills/build/references/crew.md). ` +
        `See every worker's worktree with: node ${root}/scripts/crew.js list ${s.plan}/plan.js, and what can start with plan-tool.js ready.`;
    }
    return context('SessionStart', msg);
  }
}

// No turn ends blind: a turn that worked on a step and ends without a fresh
// checkpoint leaves nothing to resume from if the context goes. Blocks once;
// stop_hook_active means Claude is already answering this, so let it stop.
function onStop(ctx) {
  const s = ctx.state;
  if (!s || s.phase !== 'approved' || ctx.input.stop_hook_active) return;
  if (!s.turnStartedAt || !(s.workedAt >= s.turnStartedAt)) return;
  const plan = tryReadPlan(path.join(ctx.root, s.plan, 'plan.js'));
  if (!plan || plan.meta.status !== 'building') return;
  const step = (plan.steps || []).find(st => st.status === 'doing');
  if (!step) return;
  const at = step.checkpoint ? Date.parse(step.checkpoint.at) : NaN;
  if (at >= Date.parse(s.turnStartedAt)) return;
  const tool = path.join(path.resolve(__dirname, '..'), 'scripts', 'plan-tool.js');
  return block(`Naqsha: ${step.id} is in progress, and this turn did work without leaving a checkpoint. ` +
    'If the context is compacted or the session ends now, nothing says where you are. Write one before you stop: ' +
    `echo '{"did": "...", "red": "...", "next": "...", "open": ["..."]}' | node ${tool} checkpoint ${s.plan}/plan.js ${step.id} ` +
    '(put a question you are waiting on in "open"), then end the turn.');
}

// ---- snapshots -----------------------------------------------------------

// A map of path -> fingerprint for everything that differs from HEAD plus
// everything git ignores (git), or for every file (no git). A path that is
// absent is unchanged since HEAD (git) or doesn't exist. Plans and naqsha
// state are left out. `truncated` says the file limit was hit.
function snapshot(root, plansDir = DEFAULT_PLANS_DIR) {
  const files = {};
  let count = 0;
  let truncated = false;
  const keep = rel => rel !== CLAUDE_LOCAL_SETTINGS &&
    !inside(path.join(root, rel), path.join(root, plansDir)) && !inside(path.join(root, rel), path.join(root, STATE_DIR));
  const add = (rel, fp) => {
    if (count >= WALK_LIMIT) { truncated = true; return; }
    files[rel] = fp;
    count++;
  };

  let head = null;
  try {
    git(root, 'rev-parse', '--is-inside-work-tree');
    try { head = git(root, 'rev-parse', 'HEAD').trim(); } catch { head = 'none'; }
  } catch { /* not a git repository */ }

  if (head) {
    // Paths are relative to the repository top, which can sit above root.
    const top = git(root, 'rev-parse', '--show-toplevel').trim();
    const entries = git(root, 'status', '--porcelain=v1', '-z', '--untracked-files=all').split('\0');
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e) continue;
      if (e[0] === 'R' || e[0] === 'C') i++; // next entry is the source path
      const rel = path.relative(root, path.join(top, e.slice(3)));
      if (!rel.startsWith('..') && keep(rel)) add(rel, fingerprint(path.join(root, rel)));
    }
    // Status never lists ignored files, but a command can still write .env.
    // Ignored folders (node_modules, caches a test run refreshes) are left
    // out, and ignored files are stamped, not hashed, so big ones stay cheap.
    // ls-files paths are relative to root, unlike status paths.
    const ignored = git(root, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z').split('\0');
    for (const rel of ignored) {
      if (rel && !rel.endsWith('/') && keep(rel)) add(rel, stamp(path.join(root, rel)));
    }
    return { head, files, truncated };
  }

  (function walk(dir) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (truncated) return;
      const abs = path.join(dir, d.name);
      const rel = path.relative(root, abs);
      if (!keep(rel) || (d.isDirectory() && WALK_SKIP.has(d.name))) continue;
      if (d.isDirectory()) walk(abs);
      else add(rel, fingerprint(abs));
    }
  })(root);
  return { head: null, files, truncated };
}

// No optional locks: git status would otherwise rewrite .git/index and can
// make the user's own git command fail on index.lock.
function git(root, ...args) {
  return execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
}

function stamp(abs) {
  try {
    const st = fs.lstatSync(abs);
    return `stat:${st.size}:${st.mtimeMs}`;
  } catch {
    return 'missing';
  }
}

function fingerprint(abs) {
  try {
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) return 'link:' + fs.readlinkSync(abs);
    return sha256(fs.readFileSync(abs));
  } catch {
    return 'missing';
  }
}

// null: not in the snapshot. In git that means unchanged since HEAD, which
// differs from 'missing' (deleted), so removing a committed file is seen.
function valueIn(snap, p) {
  return Object.prototype.hasOwnProperty.call(snap.files, p) ? snap.files[p] : null;
}

function changedPaths(before, after) {
  if (!before) return [];
  return [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])]
    .filter(p => valueIn(before, p) !== valueIn(after, p));
}

// ---- plan file -----------------------------------------------------------

// The named plan, or else the most recently changed one, with a status in
// `statuses`. A named plan that can't be parsed is returned so the caller
// can say why.
function findPlan(root, plansDir, slug, statuses) {
  const base = path.join(root, plansDir);
  if (slug) {
    const f = path.join(base, slug, 'plan.js');
    if (!inside(f, base) || !fs.existsSync(f)) return null;
    const plan = tryReadPlan(f);
    return !plan || statuses.includes(plan.meta.status) ? f : null;
  }
  let best = null;
  let bestTime = -1;
  for (const d of safeReaddir(base)) {
    const f = path.join(base, d, 'plan.js');
    const plan = tryReadPlan(f);
    if (!plan || !statuses.includes(plan.meta.status)) continue;
    const t = fs.statSync(f).mtimeMs;
    if (t > bestTime) { best = f; bestTime = t; }
  }
  return best;
}

// ---- helpers -------------------------------------------------------------

function writeState(ctx, state) {
  const dir = path.dirname(ctx.stateFile);
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
  writeFileAtomic(ctx.stateFile, JSON.stringify(state, null, 2));
}

function writeFileAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function safeReaddir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function inside(p, dir) {
  const rel = path.relative(dir, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Resolve symlinks through the deepest part of the path that exists, so a
// link inside an allowed folder can't point a write somewhere locked.
function realish(p) {
  let head = p;
  const tail = [];
  while (!fs.existsSync(head)) {
    const parent = path.dirname(head);
    if (parent === head) return p;
    tail.unshift(path.basename(head));
    head = parent;
  }
  return path.join(fs.realpathSync(head), ...tail);
}

function context(event, text) {
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}

function block(reason) {
  return { decision: 'block', reason };
}

function deny(reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', c => { raw += c; }).on('end', () => {
    let out;
    try {
      out = main(JSON.parse(raw));
    } catch (e) {
      // A broken hook must not wedge the session; say why and let the call through.
      process.stderr.write(`naqsha hook error: ${e.message}\n`);
      process.exit(1);
    }
    if (out) process.stdout.write(JSON.stringify(out));
  });
}

module.exports = { main, checkPlan, readPlan, writePlan, snapshot, changedPaths };
