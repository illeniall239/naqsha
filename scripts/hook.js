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

const PLANS_DIR = path.join('docs', 'plans');
const STATE_DIR = '.naqsha';
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const WALK_SKIP = new Set(['.git', 'node_modules', STATE_DIR]);
const WALK_LIMIT = 20000;

function main(input) {
  const root = realish(path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd));
  const ctx = { input, root, stateFile: path.join(root, STATE_DIR, 'state.json') };
  ctx.state = readJson(ctx.stateFile);

  switch (input.hook_event_name) {
    case 'UserPromptExpansion': return onCommand(ctx);
    case 'UserPromptSubmit': return onPrompt(ctx);
    case 'PreToolUse': return onPreTool(ctx);
    case 'PostToolUse': return onPostTool(ctx);
    case 'SessionStart': return onSessionStart(ctx);
  }
}

// ---- commands the user typed -------------------------------------------

function onCommand(ctx) {
  const name = String(ctx.input.command_name || '').replace(/^naqsha:/, '');
  const args = String(ctx.input.command_args || '').trim();
  if (name === 'plan') return startDrafting(ctx);
  if (name === 'approve') return approve(ctx, args);
  if (name === 'build') return startBuild(ctx);
}

function startDrafting(ctx) {
  const wasBuilding = ctx.state && ctx.state.phase === 'approved' ? ctx.state.plan : null;
  writeState(ctx, {
    phase: 'drafting',
    startedAt: new Date().toISOString(),
    baseline: snapshot(ctx.root),
  });
  let msg = `Naqsha: planning phase. Files outside ${PLANS_DIR}/ are locked until the user runs /naqsha:approve.`;
  if (wasBuilding) msg += ` The approved plan ${wasBuilding} is paused; its build resumes after this plan is approved or the user deletes ${STATE_DIR}/.`;
  return context('UserPromptExpansion', msg);
}

function approve(ctx, slug) {
  if (!ctx.state || ctx.state.phase !== 'drafting') {
    return block('Nothing to approve: no plan is being drafted. Start one with /naqsha:plan <what to build>.');
  }
  const planFile = findPlan(ctx.root, slug);
  if (!planFile) {
    return block(slug
      ? `No draft plan at ${path.join(PLANS_DIR, slug, 'plan.js')}.`
      : `No draft plan found under ${PLANS_DIR}/. Pass the plan's folder name: /naqsha:approve <slug>.`);
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
  writeState(ctx, {
    phase: 'approved',
    plan: rel,
    approvedAt: now,
    approvedSha256: sha256(fs.readFileSync(planFile)),
  });
  return context('UserPromptExpansion', `Naqsha: the user approved "${plan.meta.title}" (${rel}). Project files are unlocked for building.`);
}

function startBuild(ctx) {
  if (!ctx.state || ctx.state.phase !== 'approved') {
    return block('No approved plan to build. Draft one with /naqsha:plan, then approve it with /naqsha:approve.');
  }
  return context('UserPromptExpansion', `Naqsha: building the approved plan in ${ctx.state.plan}/plan.js.`);
}

// What has to be true before a plan can be approved. Kept to facts a script
// can check; judging the plan's quality is the user's job.
function checkPlan(plan) {
  const problems = [];
  if (!isNa(plan.priorArt) && !list(plan.priorArt).length) problems.push('no prior art (list what exists, or say what was searched as { "na": ... })');
  const open = list(plan.decisions).filter(d => d.status !== 'decided');
  if (open.length) problems.push(`open decisions: ${open.map(d => d.id).join(', ')}`);
  const steps = list(plan.steps);
  if (!steps.length) problems.push('no implementation steps');
  const unestimated = steps.filter(s => !validEstimate(s.estimate));
  if (unestimated.length) problems.push(`steps without a low/likely/high estimate: ${unestimated.map(s => s.id).join(', ')}`);
  const unchecked = steps.filter(s => !s.doneWhen);
  if (unchecked.length) problems.push(`steps without a "done when" check: ${unchecked.map(s => s.id).join(', ')}`);
  return problems;
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
    writeState(ctx, { ...ctx.state, baseline: snapshot(ctx.root) });
  }
}

// ---- Claude's tool calls -------------------------------------------------

function onPreTool(ctx) {
  const { tool_name: tool, tool_input: ti = {} } = ctx.input;

  // The gate's own state and the approval command belong to the user.
  if (tool === 'Bash' && /\.naqsha\b|naqsha:approve/.test(ti.command || '')) {
    return deny(`Naqsha state and approval are the user's. Don't read, change or invoke them from Bash.`);
  }
  if (tool === 'Skill' && ti.skill === 'naqsha:approve') {
    return deny('Only the user can approve a plan, by typing /naqsha:approve.');
  }
  if (!FILE_TOOLS.has(tool)) return;

  const target = ti.file_path || ti.notebook_path;
  if (!target) return;
  const abs = realish(path.resolve(ctx.root, target));
  if (inside(abs, path.join(ctx.root, STATE_DIR))) {
    return deny('Naqsha state is written only by the user\'s commands.');
  }
  if (!ctx.state || ctx.state.phase !== 'drafting') return;
  if (writableWhileDrafting(abs, ctx)) return;
  return deny(`Planning phase: ${path.relative(ctx.root, abs) || abs} is locked until the user approves the plan with /naqsha:approve. ` +
    `Only ${PLANS_DIR}/ and scratch/temp directories are writable now. Put this in the plan instead.`);
}

// Inside the project only the plans folder is writable, even when the project
// itself sits in a temp directory.
function writableWhileDrafting(abs, ctx) {
  if (inside(abs, ctx.root)) return inside(abs, path.join(ctx.root, PLANS_DIR));
  const allowed = [
    ctx.input.scratchpad_dir,
    os.tmpdir(),
    path.join(os.homedir(), '.claude', 'projects'), // Claude's memory files
  ].filter(Boolean).map(p => realish(path.resolve(p)));
  return allowed.some(dir => inside(abs, dir));
}

// Bash can write anywhere, so after each command compare the project against
// the snapshot taken at the start of the turn.
function onPostTool(ctx) {
  if (ctx.input.tool_name !== 'Bash' || !ctx.state || ctx.state.phase !== 'drafting') return;
  const changed = diffSnapshots(ctx.state.baseline, snapshot(ctx.root));
  if (!changed.length) return;
  const list = changed.slice(0, 20).join(', ') + (changed.length > 20 ? `, and ${changed.length - 20} more` : '');
  return {
    decision: 'block',
    reason: `Planning phase: that command changed project files outside ${PLANS_DIR}/: ${list}. ` +
      'Restore them to how they were before the command (for tracked files, git restore; delete files the command created), ' +
      'and keep Bash read-only until the user approves the plan. Experiments belong in the scratchpad.',
  };
}

function onSessionStart(ctx) {
  const s = ctx.state;
  if (!s) return;
  if (s.phase === 'drafting') {
    return context('SessionStart', `Naqsha: a plan is being drafted (since ${s.startedAt}). Files outside ${PLANS_DIR}/ are locked until the user runs /naqsha:approve. The user continues it with /naqsha:plan.`);
  }
  if (s.phase === 'approved') {
    const plan = tryReadPlan(path.join(ctx.root, s.plan, 'plan.js'));
    if (plan && plan.meta.status === 'done') return;
    return context('SessionStart', `Naqsha: the approved plan ${s.plan} is being built. The user resumes it with /naqsha:build.`);
  }
}

// ---- snapshots -----------------------------------------------------------

// A map of path -> fingerprint for everything that differs from HEAD (git) or
// for every file (no git). Plans and naqsha state are left out.
function snapshot(root) {
  const files = {};
  const keep = rel => !inside(path.join(root, rel), path.join(root, PLANS_DIR)) && !inside(path.join(root, rel), path.join(root, STATE_DIR));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 64 << 20 });

  let head = null;
  try {
    git('rev-parse', '--is-inside-work-tree');
    try { head = git('rev-parse', 'HEAD').trim(); } catch { head = 'none'; }
  } catch { /* not a git repository */ }

  if (head) {
    // Paths are relative to the repository top, which can sit above root.
    const top = git('rev-parse', '--show-toplevel').trim();
    const entries = git('status', '--porcelain=v1', '-z', '--untracked-files=all').split('\0');
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e) continue;
      if (e[0] === 'R' || e[0] === 'C') i++; // next entry is the source path
      const rel = path.relative(root, path.join(top, e.slice(3)));
      if (!rel.startsWith('..') && keep(rel)) files[rel] = fingerprint(path.join(root, rel));
    }
    return { head, files };
  }

  let count = 0;
  (function walk(dir) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (count >= WALK_LIMIT) return;
      const abs = path.join(dir, d.name);
      const rel = path.relative(root, abs);
      if (!keep(rel) || (d.isDirectory() && WALK_SKIP.has(d.name))) continue;
      if (d.isDirectory()) walk(abs);
      else { files[rel] = fingerprint(abs); count++; }
    }
  })(root);
  return { head: null, files };
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

function diffSnapshots(before, after) {
  if (!before) return [];
  const changed = [];
  if (before.head !== after.head) changed.push('git HEAD (commit, reset or branch switch)');
  for (const p of new Set([...Object.keys(before.files), ...Object.keys(after.files)])) {
    const a = before.files[p] || 'missing';
    const b = after.files[p] || 'missing';
    if (a !== b) changed.push(p);
  }
  return changed;
}

// ---- plan file -----------------------------------------------------------

// plan.js is `window.NAQSHA = <JSON>;` so the page can load it from file://
// and this script can parse it without executing it.
const PLAN_RE = /^\s*window\.NAQSHA\s*=\s*([\s\S]*?)\s*;?\s*$/;

function readPlan(file) {
  const m = PLAN_RE.exec(fs.readFileSync(file, 'utf8'));
  if (!m) throw new Error('expected `window.NAQSHA = {...};`');
  const plan = JSON.parse(m[1]);
  if (!plan || typeof plan.meta !== 'object') throw new Error('missing "meta"');
  return plan;
}

function tryReadPlan(file) {
  try { return readPlan(file); } catch { return null; }
}

function writePlan(file, plan) {
  fs.writeFileSync(file, `window.NAQSHA = ${JSON.stringify(plan, null, 2)};\n`);
}

// The named plan, or else the most recently changed draft.
function findPlan(root, slug) {
  const base = path.join(root, PLANS_DIR);
  if (slug) {
    const f = path.join(base, slug, 'plan.js');
    return inside(f, base) && fs.existsSync(f) ? f : null;
  }
  let best = null;
  let bestTime = -1;
  for (const d of safeReaddir(base)) {
    const f = path.join(base, d, 'plan.js');
    const plan = tryReadPlan(f);
    if (!plan || plan.meta.status !== 'draft') continue;
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
  const tmp = ctx.stateFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, ctx.stateFile);
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

module.exports = { main, checkPlan, readPlan, snapshot, diffSnapshots };
