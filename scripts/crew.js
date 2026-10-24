#!/usr/bin/env node
// naqsha crew: the git mechanics of crew mode, where each step is built by a
// worker agent in its own worktree and the coordinator lands it. Judgment
// stays with the agents; this only does what can be done exactly.
//
//   crew.js open <plan.js> <S#>          create (or reuse) the step's worktree and branch
//   crew.js land <plan.js> <S#>          merge the step's branch into the build branch, then clean up
//   crew.js list <plan.js>               the plan's worktrees: branch, commits ahead, uncommitted files
//   crew.js drop <plan.js> <S#> [--force] remove a worktree; refuses unlanded work without --force
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { readPlan } = require('./plan-file.js');

// trimEnd, not trim: a leading space in `status --porcelain` is the status column.
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
const tryGit = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

function context(planFile, id) {
  const plan = readPlan(planFile);
  const plansDir = path.dirname(path.dirname(planFile));
  const root = git(plansDir, 'rev-parse', '--show-toplevel');
  const slug = String(plan.meta.slug || path.basename(path.dirname(planFile)));
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) throw new Error(`plan slug "${slug}" can't name a branch`);
  const step = id ? (plan.steps || []).find(s => s.id === id) : null;
  if (id && !step) throw new Error(`no step ${id}`);
  if (id && !/^[A-Z]\d{1,4}$/.test(id)) throw new Error(`step id "${id}" can't name a branch`);
  return {
    plan, step, root, slug,
    plansRel: path.relative(root, plansDir).split(path.sep).join('/'), // git reports paths with /
    branch: id && `crew/${slug}/${id}`,
    // Next to the repository, not inside it, so the project's own test runner
    // and linters never pick up a second copy of the code.
    dir: id && path.join(path.dirname(root), `${path.basename(root)}-crew`, `${slug}-${id}`),
  };
}

// Uncommitted changes outside the plans folder (the coordinator's plan.js
// updates are expected there).
function dirtyOutsidePlans(c, cwd = c.root) {
  return git(cwd, 'status', '--porcelain=v1', '--untracked-files=all').split('\n').filter(Boolean)
    .map(l => l.slice(3)).filter(f => !(c.plansRel && (f === c.plansRel || f.startsWith(c.plansRel + '/'))));
}

function currentBranch(root) {
  return tryGit(root, 'symbolic-ref', '--quiet', '--short', 'HEAD').stdout.trim();
}

function open(c) {
  if (fs.existsSync(c.dir)) return { path: c.dir, branch: c.branch, reused: true };
  const branch = currentBranch(c.root);
  if (!branch) throw new Error('the main checkout is not on a branch; switch to the build branch first');
  if (['main', 'master', 'trunk', 'develop'].includes(branch)) {
    throw new Error(`the main checkout is on ${branch}; crew mode lands steps as commits, so build on a branch of its own (for example: git switch -c build/${c.slug})`);
  }
  const dirty = dirtyOutsidePlans(c);
  if (dirty.length) throw new Error(`commit or land these first, or the worker starts without them: ${dirty.slice(0, 10).join(', ')}`);
  fs.mkdirSync(path.dirname(c.dir), { recursive: true });
  git(c.root, 'worktree', 'prune'); // forget worktrees whose folders were deleted by hand
  const exists = tryGit(c.root, 'rev-parse', '--verify', '--quiet', c.branch).status === 0;
  if (exists) git(c.root, 'worktree', 'add', c.dir, c.branch);
  else git(c.root, 'worktree', 'add', '-b', c.branch, c.dir, 'HEAD');
  return { path: c.dir, branch: c.branch, base: git(c.root, 'rev-parse', 'HEAD'), reused: false };
}

function ahead(c, branch) {
  return Number(git(c.root, 'rev-list', '--count', `HEAD..${branch}`));
}

function land(c) {
  if (!fs.existsSync(c.dir)) throw new Error(`no worktree for ${c.step.id} at ${c.dir}`);
  const left = git(c.dir, 'status', '--porcelain=v1', '--untracked-files=all');
  if (left) throw new Error(`the worker left uncommitted changes in ${c.dir}; they must be committed or discarded by decision first:\n${left}`);
  if (!ahead(c, c.branch)) throw new Error(`${c.branch} has no commits to land`);
  const dirty = dirtyOutsidePlans(c);
  if (dirty.length) throw new Error(`the main checkout has uncommitted changes outside the plans folder: ${dirty.slice(0, 10).join(', ')}`);
  const merge = tryGit(c.root, 'merge', '--no-ff', '-m', `${c.step.id}: ${c.step.title || 'step'}`, c.branch);
  if (merge.status !== 0) {
    const conflicts = git(c.root, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    tryGit(c.root, 'merge', '--abort');
    const err = new Error(`${c.branch} conflicts with the build branch in: ${conflicts.join(', ') || 'unknown files'}. ` +
      'Nothing was merged. Have the worker merge the build branch into its branch, resolve, rerun its checks and commit; then land again.');
    err.code = 2;
    throw err;
  }
  const commit = git(c.root, 'rev-parse', 'HEAD');
  git(c.root, 'worktree', 'remove', c.dir);
  git(c.root, 'branch', '-d', c.branch); // -d: refuses unless merged, which it now is
  return { landed: c.branch, commit };
}

function list(c) {
  const out = git(c.root, 'worktree', 'list', '--porcelain');
  const rows = [];
  for (const block of out.split('\n\n')) {
    const wt = /^worktree (.+)$/m.exec(block);
    const br = /^branch refs\/heads\/(.+)$/m.exec(block);
    if (!wt || !br || !br[1].startsWith(`crew/${c.slug}/`)) continue;
    const dirty = git(wt[1], 'status', '--porcelain=v1', '--untracked-files=all').split('\n').filter(Boolean).length;
    rows.push({ step: br[1].split('/').pop(), branch: br[1], path: wt[1], ahead: ahead(c, br[1]), uncommitted: dirty });
  }
  return rows;
}

// Unlanded work is never torn down by accident: removing commits or
// uncommitted changes takes --force, which the coordinator passes only on the
// user's word.
function drop(c, force) {
  if (!fs.existsSync(c.dir)) return { dropped: false, reason: 'no worktree' };
  const left = git(c.dir, 'status', '--porcelain=v1', '--untracked-files=all');
  const commits = ahead(c, c.branch);
  if ((left || commits) && !force) {
    throw new Error(`${c.branch} has ${commits} unlanded commit(s)${left ? ' and uncommitted changes' : ''}. ` +
      'Land it, or remove it with --force only if the user agrees to discard that work.');
  }
  git(c.root, 'worktree', 'remove', ...(force ? ['--force'] : []), c.dir);
  git(c.root, 'branch', force ? '-D' : '-d', c.branch);
  return { dropped: true, discardedCommits: commits };
}

function main(argv) {
  const [cmd, file, id, flag] = argv;
  if (!['open', 'land', 'list', 'drop'].includes(cmd) || !file || (cmd !== 'list' && !id)) {
    throw new Error('usage: crew.js open|land|drop <plan.js> <S#> | crew.js list <plan.js>');
  }
  const c = context(path.resolve(file), cmd === 'list' ? null : id);
  const result = cmd === 'open' ? open(c) : cmd === 'land' ? land(c) : cmd === 'list' ? list(c) : drop(c, flag === '--force');
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`crew: ${e.message}\n`);
    process.exit(e.code === 2 ? 2 : 1);
  }
}
