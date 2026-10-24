#!/usr/bin/env node
// naqsha plan tool: lets the build read one step's working set and update a
// step, instead of reading and rewriting the whole plan.js every step.
//
//   plan-tool.js step <plan.js> <S#>      what this step needs, and which references to read
//   plan-tool.js status <plan.js>         progress at a glance
//   plan-tool.js update-step <plan.js> <S#> < patch.json
//       { "status": "done", "notesAppend": "..." }  (status: todo | doing | done | blocked)
//   plan-tool.js set-meta <plan.js> < patch.json
//       { "status": "building" | "done", "buildReview": "pause" | "run" }
'use strict';

const fs = require('fs');
const path = require('path');
const { readPlan, writePlan } = require('./hook.js');

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

const list = x => (Array.isArray(x) ? x : []);
const isNa = x => !!x && typeof x === 'object' && !Array.isArray(x) && typeof x.na === 'string';
const one = x => String(x ?? '').replace(/\s+/g, ' ').trim();

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
function stepView(plan, id) {
  const steps = list(plan.steps);
  const step = steps.find(s => s.id === id);
  if (!step) throw new Error(`no step ${id}; steps are ${steps.map(s => s.id).join(', ') || 'none'}`);
  const out = [];
  const section = (title, lines) => { if (lines.length) out.push(`## ${title}`, ...lines, ''); };
  const m = plan.meta || {};
  const done = steps.filter(s => s.status === 'done').length;

  out.push(`# ${one(m.title)} · ${step.id} of ${steps.length} (${done} done) · plan ${one(m.status)} · review: ${one(m.buildReview) || 'not set'}`, '');
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
  return out.join('\n');
}

function statusView(plan) {
  const steps = list(plan.steps);
  const m = plan.meta || {};
  const next = steps.find(s => s.status !== 'done');
  return [
    `# ${one(m.title)} · plan ${one(m.status)} · ${steps.filter(s => s.status === 'done').length}/${steps.length} steps done`,
    ...steps.map(s => `- ${s.id} [${one(s.status) || 'todo'}] ${one(s.title)}`),
    next ? `Next: ${next.id}` : 'All steps done.',
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
  if (typeof patch.notesAppend === 'string' && patch.notesAppend.trim()) {
    step.notes = step.notes ? `${step.notes}\n${patch.notesAppend.trim()}` : patch.notesAppend.trim();
  }
}

// Approval belongs to the user's /naqsha:approve; this never sets it.
function setMeta(plan, patch) {
  const rules = { status: ['building', 'done'], buildReview: ['pause', 'run'] };
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
  if (!file || !['step', 'status', 'update-step', 'set-meta'].includes(cmd)) {
    throw new Error('usage: plan-tool.js step|status|update-step|set-meta <plan.js> [S#]');
  }
  const planFile = path.resolve(file);
  const plan = readPlan(planFile);
  if (cmd === 'step') return console.log(stepView(plan, id));
  if (cmd === 'status') return console.log(statusView(plan));
  if (cmd === 'update-step') updateStep(plan, id, readPatch());
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
