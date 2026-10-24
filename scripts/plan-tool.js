#!/usr/bin/env node
// naqsha plan tool: lets the build read one step's working set and update a
// step, instead of reading and rewriting the whole plan.js every step.
//
//   plan-tool.js step <plan.js> <S#>      what this step needs, and which references to read
//   plan-tool.js status <plan.js>         progress at a glance
//   plan-tool.js update-step <plan.js> <S#> < patch.json
//       { "status": "done", "notesAppend": "..." }  (status: todo | doing | done | blocked)
//   plan-tool.js set-meta <plan.js> < patch.json
//       { "status": "building" | "done", "buildReview": "pause" | "run",
//         "buildMode": "solo" | "crew", "crewParallel": 1-4 }
//   plan-tool.js ready <plan.js>          crew mode: steps that can start now, and which can run together
//   plan-tool.js checkpoint <plan.js> <S#> < checkpoint.json
//       { "did": "...", "next": "...", "red": "...", "files": [...], "open": [...] }
//       where you are inside a step, so a compaction or a new session picks up
//       there. Cleared when the step is set done.
'use strict';

const fs = require('fs');
const path = require('path');
const { readPlan, writePlan } = require('./plan-file.js');

// Loaded for every step: security first, test-first, modular, the review
// checklist, and the brief for the independent reviewer.
const ALWAYS = ['secure-coding', 'tdd', 'modularity', 'code-quality', 'independent-review'];
// The rest load when a step needs them. The plan says so in steps[].standards;
// these file patterns are the fallback when it doesn't.
const BY_FILES = {
  'data-and-apis': /migrat|schema|\.sql$|openapi|swagger|\.proto$|\.graphql$|(^|\/)(api|routes?|controllers?|handlers?)\//i,
  operability: /config|\.env|docker|compose|health|worker|jobs?\/|queue|logger|telemetry|otel/i,
  'docs-and-setup': /readme|(^|\/)docs\/|\.md$|package\.json$|makefile$|justfile$|\.env\.example$|compose\.ya?ml$/i,
  'run-like-a-user': /(^|\/)(pages?|app|views?|components?|templates?|routes?|api|cli|cmd|bin)\//i,
};
const KNOWN = new Set([...ALWAYS, 'performance', ...Object.keys(BY_FILES)]);
const STEP_STATUS = new Set(['todo', 'doing', 'done', 'blocked']);
const LEARNINGS = 'LEARNINGS.md';

const list = x => (Array.isArray(x) ? x : []);
const isNa = x => !!x && typeof x === 'object' && !Array.isArray(x) && typeof x.na === 'string';
const one = x => String(x ?? '').replace(/\s+/g, ' ').trim();
const minute = iso => one(iso).slice(0, 16).replace('T', ' ');

function referencesFor(plan, step) {
  const why = new Map(ALWAYS.map(r => [r, 'always']));
  const add = (r, reason) => { if (!why.has(r)) why.set(r, reason); };
  for (const r of list(step.standards)) if (KNOWN.has(r)) add(r, 'the plan says so');
  const arch = plan.architecture && !isNa(plan.architecture) ? plan.architecture : {};
  if (list(arch.hotPaths).some(h => h.provedBy === step.id)) add('performance', 'this step proves a hot path');
  if (!Array.isArray(step.standards)) {
    for (const [r, re] of Object.entries(BY_FILES)) {
      const hit = list(step.files).find(f => re.test(f));
      if (hit) add(r, `touches ${hit}`);
    }
  }
  if (list(step.tests).some(t => ['acceptance', 'security'].includes(t.kind))) add('run-like-a-user', 'has acceptance or attack tests');
  const steps = list(plan.steps);
  if (steps[0] && steps[0].id === step.id) add('run-like-a-user', 'first step: take the baseline');
  if (steps.length && steps[steps.length - 1].id === step.id) {
    add('run-like-a-user', 'last step: the finish');
    add('docs-and-setup', 'last step: follow the README from a fresh clone');
  }
  return why;
}

// The step and only what it touches, as compact text.
function stepView(plan, id, planFile) {
  const steps = list(plan.steps);
  const step = steps.find(s => s.id === id);
  if (!step) throw new Error(`no step ${id}; steps are ${steps.map(s => s.id).join(', ') || 'none'}`);
  const out = [];
  const section = (title, lines) => { if (lines.length) out.push(`## ${title}`, ...lines, ''); };
  const m = plan.meta || {};
  const done = steps.filter(s => s.status === 'done').length;

  out.push(`# ${one(m.title)} · ${step.id} of ${steps.length} (${done} done) · plan ${one(m.status)} · review: ${one(m.buildReview) || 'not set'}`, '');
  const c = step.checkpoint;
  if (c) {
    section(`Where you left off (${minute(c.at)}); check the files before trusting this`, [
      ...(c.did ? [`Did: ${one(c.did)}`] : []),
      ...(c.red ? [`Red: ${one(c.red)}`] : []),
      ...(c.next ? [`Next: ${one(c.next)}`] : []),
      ...(list(c.files).length ? [`Files in progress: ${c.files.join(', ')}`] : []),
      ...list(c.open).map(q => `Open: ${one(q)}`),
    ]);
  }
  section(`Step ${step.id}: ${one(step.title)} [${one(step.status) || 'todo'}]`, [
    ...(step.detail ? [one(step.detail)] : []),
    ...(list(step.files).length ? [`Files: ${step.files.join(', ')}`] : []),
    ...(list(step.dependsOn).length ? [`After: ${step.dependsOn.join(', ')}`] : []),
    ...(isNa(step.tests) ? [`Tests first: none (${one(step.tests.na)})`]
      : ['Tests first, in order:', ...list(step.tests).map((t, i) => `  ${i + 1}. ${one(t.test)}${t.kind ? ` [${t.kind}]` : ''}${t.seam ? ` at ${one(t.seam)}` : ''}`)]),
    `Done when: ${one(step.doneWhen)}`,
    ...(step.estimate ? [`Estimate: ${step.estimate.low}-${step.estimate.high} h, likely ${step.estimate.likely}`] : []),
    ...(step.notes ? [`Notes so far: ${one(step.notes).slice(0, 600)}${one(step.notes).length > 600 ? '…' : ''}`] : []),
  ]);

  const sec = plan.security && !isNa(plan.security) ? plan.security : {};
  section('Threat mitigations this step builds', list(sec.threats).filter(t => t.step === step.id)
    .map(t => `- ${t.id}: ${one(t.threat)} → ${one(t.mitigation)}${t.ref ? ` (${one(t.ref)})` : ''}`));
  const req = plan.requirements && !isNa(plan.requirements) ? plan.requirements : {};
  section('Quality scenarios this step checks', list(req.nonFunctional).filter(n => list(n.verifiedBy).includes(step.id))
    .map(n => `- ${n.id}: ${one(n.text)}; measure: ${one(n.measure || n.target)}`));
  const arch = plan.architecture && !isNa(plan.architecture) ? plan.architecture : {};
  section('Hot paths this step proves', list(arch.hotPaths).filter(h => h.provedBy === step.id)
    .map(h => `- ${one(h.flow)}: size ${one(h.size)}, budget ${one(h.budget)}; approach: ${one(h.approach)}`));

  const files = list(step.files);
  const touched = list(arch.components).filter(c => c.location && files.some(f => f.startsWith(c.location.replace(/^\.\//, ''))));
  section(touched.length ? 'Modules it touches' : 'Modules', (touched.length ? touched : list(arch.components))
    .map(c => `- ${one(c.name)}${c.location ? ` (${c.location})` : ''}: ${one(c.responsibility)}${c.interface ? `; interface: ${one(c.interface)}` : ''}${c.hides ? `; hides: ${one(c.hides)}` : ''}`));

  const ctx = plan.context && !isNa(plan.context) ? plan.context : {};
  section('Conventions and reuse', [
    ...list(ctx.conventions).map(c => `- ${one(c.text)}${c.ref ? ` (${c.ref})` : ''}`),
    ...list(ctx.reuse).map(r => `- reuse ${one(r.what)}${r.ref ? ` (${r.ref})` : ''}`),
  ]);
  section('Decisions (all, one line each)', list(plan.decisions)
    .map(d => `- ${d.id}: ${one(d.question)} → ${one(d.choice) || `[${one(d.status)}]`}`));
  section('Dependencies the plan allows', isNa(plan.dependencies) ? [] : list(plan.dependencies)
    .map(d => `- ${one(d.name)}@${one(d.version)}`));

  const t = plan.testing && !isNa(plan.testing) ? plan.testing : {};
  const refs = referencesFor(plan, step);
  section('Checks', [
    ...list(t.securityChecks).map(c => `- ${one(c.check)}: \`${one(c.command)}\`${c.when ? ` (${one(c.when)})` : ''}`),
    ...(refs.has('run-like-a-user') && t.runIt && !isNa(t.runIt)
      ? [`- Run it: data \`${one(t.runIt.data)}\`; start \`${one(t.runIt.start)}\`; ready \`${one(t.runIt.ready)}\`; drive by ${one(t.runIt.drive)}; stop \`${one(t.runIt.stop)}\``] : []),
  ]);
  section('Seams tests go through', list(t.seams).map(s => `- ${one(s.seam)}`));
  if (steps[steps.length - 1] === step) {
    section('Acceptance criteria (finish)', list(t.acceptance).map(a => `- ${a.id}: ${one(a.text)}`));
  }
  section('References to read for this step (skip any already read in this context)',
    [...refs].map(([r, reason]) => `- ${r}.md: ${reason}`));
  const learnings = planFile && path.join(path.dirname(path.dirname(planFile)), LEARNINGS);
  if (learnings && fs.existsSync(learnings)) {
    section('Project learnings', [`- ${learnings}: read once per conversation; add what this step teaches`]);
  }
  return out.join('\n');
}

function statusView(plan) {
  const steps = list(plan.steps);
  const m = plan.meta || {};
  const next = steps.find(s => s.status !== 'done');
  return [
    `# ${one(m.title)} · plan ${one(m.status)} · ${steps.filter(s => s.status === 'done').length}/${steps.length} steps done`,
    ...steps.map(s => `- ${s.id} [${one(s.status) || 'todo'}] ${one(s.title)}${s.checkpoint ? ` (checkpoint ${minute(s.checkpoint.at)}: next ${one(s.checkpoint.next)})` : ''}`),
    next ? `Next: ${next.id}` : 'All steps done.',
  ].join('\n');
}

// Steps whose dependencies are done, batched so that steps running at the
// same time never touch the same file (a conflict a merge can't settle well).
function readyView(plan) {
  const steps = list(plan.steps);
  const done = new Set(steps.filter(s => s.status === 'done').map(s => s.id));
  const doing = steps.filter(s => s.status === 'doing');
  const ready = steps.filter(s => (s.status || 'todo') === 'todo' && list(s.dependsOn).every(d => done.has(d)));
  const limit = Number(plan.meta.crewParallel) || 1;
  const busy = new Set(doing.flatMap(s => list(s.files)));
  const batch = [];
  const wait = [];
  for (const s of ready) {
    const shared = list(s.files).filter(f => busy.has(f));
    if (batch.length + doing.length < limit && !shared.length) {
      batch.push(s);
      list(s.files).forEach(f => busy.add(f));
    } else {
      wait.push(`${s.id}${shared.length ? ` (shares ${shared.join(', ')})` : ' (parallel limit)'}`);
    }
  }
  const blocked = steps.filter(s => (s.status || 'todo') === 'todo' && !ready.includes(s))
    .map(s => `${s.id} (after ${list(s.dependsOn).filter(d => !done.has(d)).join(', ')})`);
  return [
    `# Crew: ${doing.length} in progress${doing.length ? ` (${doing.map(s => s.id).join(', ')})` : ''}, parallel limit ${limit}`,
    `Start now: ${batch.map(s => s.id).join(', ') || 'nothing'}`,
    ...(wait.length ? [`Ready but waiting: ${wait.join(', ')}`] : []),
    ...(blocked.length ? [`Not ready: ${blocked.join(', ')}`] : []),
    ...(!batch.length && !doing.length && !ready.length && !blocked.length ? ['All steps done.'] : []),
  ].join('\n');
}

function updateStep(plan, id, patch) {
  const step = list(plan.steps).find(s => s.id === id);
  if (!step) throw new Error(`no step ${id}`);
  const allowed = new Set(['status', 'notes', 'notesAppend']);
  for (const k of Object.keys(patch)) if (!allowed.has(k)) throw new Error(`can't set "${k}" on a step here; edit the plan for that`);
  if ('status' in patch) {
    if (!STEP_STATUS.has(patch.status)) throw new Error(`step status must be one of ${[...STEP_STATUS].join(', ')}`);
    step.status = patch.status;
  }
  if (typeof patch.notes === 'string') step.notes = patch.notes;
  if (step.status === 'done') delete step.checkpoint;
  if (typeof patch.notesAppend === 'string' && patch.notesAppend.trim()) {
    step.notes = step.notes ? `${step.notes}\n${patch.notesAppend.trim()}` : patch.notesAppend.trim();
  }
}

// The latest checkpoint only: where you are now, not a history.
function checkpoint(plan, id, patch) {
  const step = list(plan.steps).find(s => s.id === id);
  if (!step) throw new Error(`no step ${id}`);
  if (step.status === 'done') throw new Error(`${id} is done; checkpoints are for the step in progress`);
  const allowed = new Set(['did', 'next', 'red', 'files', 'open']);
  for (const k of Object.keys(patch)) if (!allowed.has(k)) throw new Error(`a checkpoint has did, next, red, files and open, not "${k}"`);
  if (!String(patch.next || '').trim()) throw new Error('a checkpoint needs "next": what you will do when you pick this up');
  const text = v => typeof v === 'string' && v.length <= 2000;
  if (![patch.did ?? '', patch.next, patch.red ?? ''].every(text)) throw new Error('did, next and red are short text');
  for (const k of ['files', 'open']) {
    if (patch[k] !== undefined && !(Array.isArray(patch[k]) && patch[k].length <= 50 && patch[k].every(text))) throw new Error(`${k} is a short list of text`);
  }
  step.checkpoint = { at: new Date().toISOString(), ...patch };
}

// Approval belongs to the user's /naqsha:approve; this never sets it.
function setMeta(plan, patch) {
  const rules = { status: ['building', 'done'], buildReview: ['pause', 'run'], buildMode: ['solo', 'crew'], crewParallel: [1, 2, 3, 4] };
  for (const [k, v] of Object.entries(patch)) {
    if (!rules[k]) throw new Error(`can't set meta.${k} here`);
    if (!rules[k].includes(v)) throw new Error(`meta.${k} must be one of ${rules[k].join(', ')}`);
    if (k === 'status' && !['approved', 'building'].includes(plan.meta.status)) {
      throw new Error(`the plan is ${plan.meta.status}; only an approved plan can be built`);
    }
    plan.meta[k] = v;
  }
}

function readPatch() {
  const raw = fs.readFileSync(0, 'utf8').trim();
  try {
    const patch = JSON.parse(raw);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error();
    return patch;
  } catch {
    throw new Error('expected a JSON object on stdin');
  }
}

function main(argv) {
  const [cmd, file, id] = argv;
  if (!file || !['step', 'status', 'ready', 'update-step', 'set-meta', 'checkpoint'].includes(cmd)) {
    throw new Error('usage: plan-tool.js step|status|ready|update-step|set-meta|checkpoint <plan.js> [S#]');
  }
  const planFile = path.resolve(file);
  const plan = readPlan(planFile);
  if (cmd === 'step') return console.log(stepView(plan, id, planFile));
  if (cmd === 'status') return console.log(statusView(plan));
  if (cmd === 'ready') return console.log(readyView(plan));
  if (cmd === 'update-step') updateStep(plan, id, readPatch());
  else if (cmd === 'checkpoint') checkpoint(plan, id, readPatch());
  else setMeta(plan, readPatch());
  plan.meta.updated = new Date().toISOString().slice(0, 10);
  writePlan(planFile, plan);
  console.log(statusView(plan));
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`plan-tool: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { stepView, statusView, referencesFor };
