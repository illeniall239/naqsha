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
//         "buildMode": "solo" | "crew", "crewParallel": 1-4,
//         "effort": "light" | "standard" | "thorough" }
//   plan-tool.js ready <plan.js>          crew mode: steps that can start now, and which can run together
//   plan-tool.js digest <plan.js>         the plan's whys in compact text, for /naqsha:learn
//   plan-tool.js checkpoint <plan.js> <S#> < checkpoint.json
//       { "did": "...", "next": "...", "red": "...", "files": [...], "open": [...] }
//       where you are inside a step, so a compaction or a new session picks up
//       there. Cleared when the step is set done.
//   plan-tool.js baseline <plan.js> < baseline.json
//       { "commit": "abc1234", "checks": [{ "check": "tests", "command": "npm test",
//         "result": "412 passed, 3 failed", "known": ["auth > refresh keeps the session"] }] }
//       the project's checks as they were before the build changed anything.
//       Only before the first step is done, so it can't be moved to hide a failure.
//   plan-tool.js cost <plan.js> [S#]      what planning, each step and each agent cost, from Claude Code's logs;
//                                         with a step, one line for it (the full breakdown goes on the page)
'use strict';

const fs = require('fs');
const path = require('path');
const { readPlan, writePlan } = require('./plan-file.js');
const { costOf } = require('./cost.js');

// Loaded for every step: security first, test-first, modular, the review
// checklist, and the brief for the independent reviewer.
const ALWAYS = ['secure-coding', 'tdd', 'modularity', 'code-quality', 'independent-review'];
// The rest load when a step needs them. The plan says so in steps[].standards;
// these file patterns are the fallback when it doesn't.
const BY_FILES = {
  'data-and-apis': /migrat|schema|\.sql$|openapi|swagger|\.proto$|\.graphql$|(^|\/)(api|routes?|controllers?|handlers?)\//i,
  operability: /config|\.env|docker|compose|health|worker|jobs?\/|queue|logger|telemetry|otel/i,
  reliability: /outbox|saga|consumer|producer|publisher|subscriber|redis|kafka|rabbit|sqs|pubsub|nats|celery|sidekiq|bullmq|(^|\/)(events?|messaging|queues?|jobs?|workers?|cron|schedul\w*|caches?|locks?)\//i,
  'docs-and-setup': /readme|(^|\/)docs\/|\.md$|package\.json$|makefile$|justfile$|\.env\.example$|compose\.ya?ml$/i,
  'run-like-a-user': /(^|\/)(pages?|app|views?|components?|templates?|routes?|api|cli|cmd|bin)\//i,
  interface: /\.(tsx|jsx|vue|svelte|astro|css|scss|sass|less|html)$|(^|\/)(components?|pages?|views?|screens?|ui|styles?|layouts?|theme)\//i,
};
const KNOWN = new Set([...ALWAYS, 'performance', ...Object.keys(BY_FILES)]);
const STEP_STATUS = new Set(['todo', 'doing', 'done', 'blocked']);
const LEARNINGS = 'LEARNINGS.md';
// Every agent naqsha starts gets a name, so the user can follow who's doing
// what. A step's names come from its position: the same after a handoff or a
// restart, and different for steps running side by side.
const NAMES = ['Atlas', 'Iris', 'Hermes', 'Athena', 'Orion', 'Nyx', 'Helios', 'Selene', 'Theia', 'Eos', 'Rhea', 'Leto',
  'Apollo', 'Artemis', 'Hestia', 'Demeter', 'Castor', 'Pollux', 'Phoebe', 'Themis', 'Hyperion', 'Calypso', 'Ariadne', 'Perseus'];
const namesFor = i => ({ worker: NAMES[i % NAMES.length], reviewer: NAMES[(i + NAMES.length / 2) % NAMES.length] });

const list = x => (Array.isArray(x) ? x : []);
const isNa = x => !!x && typeof x === 'object' && !Array.isArray(x) && typeof x.na === 'string';
const existing = plan => !!plan.context && !isNa(plan.context);
const one = x => String(x ?? '').replace(/\s+/g, ' ').trim();
const minute = iso => one(iso).slice(0, 16).replace('T', ' ');

function referencesFor(plan, step) {
  const why = new Map(ALWAYS.map(r => [r, 'always']));
  const add = (r, reason) => { if (!why.has(r)) why.set(r, reason); };
  if (plan.meta && plan.meta.kind === 'design') add('interface', 'a design build');
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

// The independent review costs a fresh agent per step, so it goes where a
// second pair of eyes matters most. Security and test-first never scale with
// effort; this does. The finish review always covers the whole change.
function reviewFor(plan, step, refs) {
  const effort = (plan.meta && plan.meta.effort) || 'standard';
  if (effort === 'thorough') return { effort, why: ['effort is thorough: every step'] };
  const why = [];
  const sec = plan.security && !isNa(plan.security) ? plan.security : {};
  if (list(sec.threats).some(t => t.step === step.id)) why.push('it builds a threat mitigation');
  if (effort === 'standard') {
    if (refs.has('data-and-apis')) why.push('it changes data or an API');
    if (refs.has('reliability')) why.push('it writes to several systems, runs concurrently or caches');
    const arch = plan.architecture && !isNa(plan.architecture) ? plan.architecture : {};
    if (list(arch.hotPaths).some(h => h.provedBy === step.id)) why.push('it proves a hot path');
  }
  return { effort, why };
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

  if (m.kind === 'design') {
    section('Screens this step builds (match the approved preview in each state)', list(plan.screens).filter(sc => list(step.screens).includes(sc.id))
      .flatMap(sc => [`- ${sc.id} ${one(sc.name)} [${one(sc.mode)}]: ${one(sc.purpose)}; states: ${list(sc.states).join(', ')}; preview: plan.js screens[id=${sc.id}].previews`,
        ...list(sc.needs).map(n => `  needs ${one(n.what)}: ${n.status === 'contract' ? `contract ${one(n.from)}, faked behind its adapter (owed: ${one(n.owed)})` : `${one(n.status)}, ${one(n.from)}`}`)]));
    const t = plan.tokens || {};
    section('Design tokens (use these, never raw values)', [
      ...(m.approach ? [`Approach: ${m.approach}${m.approach === 'extend' ? ': match the existing system exactly' : m.approach === 'refine' ? ': keep the identity, raise the quality' : ': the new direction, shipped in pieces'}`] : []),
      ...(list(t.color).length ? [`Color: ${list(t.color).map(c => `${one(c.name)} ${one(c.value)} (${one(c.role)})`).join('; ')}`] : []),
      ...(list(t.type && t.type.families).length ? [`Type: ${t.type.families.map(f => `${one(f.name)} for ${one(f.role)}`).join('; ')}; scale ${list(t.type.scale).map(x => `${one(x.name)} ${one(x.size)}`).join(', ')}`] : []),
      ...(list(t.space).length ? [`Space: ${t.space.join(', ')}`] : []),
      ...(list(t.radius).length ? [`Radius: ${t.radius.map(r => typeof r === 'object' ? `${one(r.name)} ${one(r.value)}` : r).join(', ')}`] : []),
      ...(Object.keys(t.motion || {}).length ? [`Motion tokens: ${Object.entries(t.motion).map(([k, v]) => `${k} ${one(v)}`).join(', ')}`] : []),
      ...(plan.direction && plan.direction.motion ? [`Motion language: ${one(plan.direction.motion)}`] : []),
      ...(plan.direction && plan.direction.signature ? [`Signature: ${one(plan.direction.signature)}`] : []),
    ]);
  }

  section('Existing code that relies on what this step changes (update each)', list(plan.impact).flatMap(i =>
    list(i.users).filter(u => u.step === step.id).map(u => `- ${one(u.where)}: ${one(i.change)}${u.what ? ` (${one(u.what)})` : ''}`)));

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
    ...(isNa(t.uiChecks) ? [] : list(t.uiChecks)).map(c => `- ${one(c.check)}: \`${one(c.command)}\``),
    ...(refs.has('run-like-a-user') && t.runIt && !isNa(t.runIt)
      ? [`- Run it: data \`${one(t.runIt.data)}\`; start \`${one(t.runIt.start)}\`; ready \`${one(t.runIt.ready)}\`; drive by ${one(t.runIt.drive)}; stop \`${one(t.runIt.stop)}\``] : []),
  ]);
  section('Seams tests go through', list(t.seams).map(s => `- ${one(s.seam)}`));
  const b = plan.baseline;
  if (b) {
    section(`Baseline before the build (${minute(b.at)}${b.commit ? `, ${one(b.commit)}` : ''}): what was already failing. Don't fix it here and don't add to it`,
      list(b.checks).flatMap(c => [`- ${one(c.check)}: ${one(c.result)}${c.command ? ` (\`${one(c.command)}\`)` : ''}`,
        ...list(c.known).slice(0, 10).map(k => `  - ${one(k)}`), ...(list(c.known).length > 10 ? [`  - and ${c.known.length - 10} more`] : [])]));
  } else if (existing(plan) && !steps.some(s => s.status === 'done')) {
    section('Baseline', ['Not taken yet. Before this step changes anything, run the whole test suite, the linters and type checks, and the security checks, and record what already fails with `plan-tool.js baseline`.']);
  }
  if (steps[steps.length - 1] === step) {
    section('Acceptance criteria (finish)', list(t.acceptance).map(a => `- ${a.id}: ${one(a.text)}`));
  }
  const review = reviewFor(plan, step, refs);
  const names = namesFor(steps.indexOf(step));
  section('Independent review', [review.why.length
    ? `Required: ${review.why.join('; ')}.`
    : `Not needed for this step (effort ${review.effort}: no threat mitigation${review.effort === 'standard' ? ', data or API change, concurrency or caching, or hot path' : ''}). Your own review applies; the finish review covers it.`]);
  // Only a crew build has a worker to name; every build has reviewers.
  const crew = m.buildMode === 'crew';
  const first = crew ? names.worker : names.reviewer;
  section('Names', [
    `${crew ? `Worker: ${names.worker}. ` : ''}Reviewer: ${names.reviewer}.` +
      (steps[steps.length - 1] === step ? ` Finish reviewer: ${namesFor(steps.length).reviewer}.` : ''),
    `Put the name first in the agent's description ("${first} · ${crew ? 'build' : 'review'} ${step.id}"), open its brief with "You are ${first}", and use it when you tell the user who is doing what.`,
  ]);
  section('References to read for this step (skip any already read in this context)',
    [...refs].map(([r, reason]) => `- ${r}.md: ${reason}`));
  const learnings = planFile && path.join(path.dirname(path.dirname(planFile)), LEARNINGS);
  if (learnings && fs.existsSync(learnings)) {
    section('Project learnings', [`- ${learnings}: read once per conversation; add what this step teaches`]);
  }
  return out.join('\n');
}

// Everything a guide needs to explain what was built and why, with the ids
// it cites, and without the bulk (pros and cons tables, evidence logs).
function digestView(plan, planFile) {
  const out = [];
  const m = plan.meta || {};
  const section = (title, lines) => { if (lines.length) out.push(`## ${title}`, ...lines, ''); };
  const obj = x => (x && typeof x === 'object' && !isNa(x) ? x : {});
  const ans = a => !a ? '' : typeof a === 'string' ? a : [list(a.choice).join(', '), a.text, a.note && `(${a.note})`].filter(Boolean).join(' · ');
  const short = (x, n = 300) => { const t = one(x); return t.length > n ? t.slice(0, n) + '…' : t; };

  out.push(`# ${one(m.title)} · ${one(m.kind)} · plan ${one(m.status)} · effort ${one(m.effort) || 'standard'}`,
    `Built for: ${one(m.developer) || 'not recorded'}`, '');
  const sum = obj(plan.summary);
  section('What and who', [
    ...(sum.problem ? [`Problem: ${one(sum.problem)}`] : []),
    ...(sum.outcome ? [`Outcome: ${one(sum.outcome)}`] : []),
    ...list(sum.users).map(u => `User: ${one(u)}`),
    ...list(sum.goals).map(g => `Goal: ${one(g)}`),
    ...list(sum.nonGoals).map(g => `Not a goal: ${one(g)}`),
  ]);
  section("The user's answers (cite as Q#)", list(plan.questions).filter(q => q.status === 'answered')
    .map(q => `- ${q.id}: ${one(q.question)} → ${short(ans(q.answer), 200)}`));
  section('Decisions (cite as D#)', list(plan.decisions).map(d => [
    `- ${d.id}: ${one(d.question)} → ${one(d.choice) || `[${one(d.status)}]`} (${one(d.decidedBy) || 'undecided'})`,
    ...(d.why ? [`  why recommended: ${short(d.why)}`] : []),
    ...(d.note ? [`  the user's note: ${short(d.note)}`] : []),
    ...(list(d.options).length > 1 ? [`  passed over: ${list(d.options).map(o => one(o.name)).filter(n => n !== one(d.choice)).join('; ')}`] : []),
    ...(d.consequences ? [`  consequences: ${short(d.consequences)}`] : []),
  ].join('\n')));
  section('Research (cite the source)', isNa(plan.research) ? [] : list(plan.research).map(r =>
    `- ${one(r.topic)}: ${short(r.finding)}${list(r.sources).length ? ` [${list(r.sources).map(x => `${one(x.url || x.title)}${x.accessed ? ` ${one(x.accessed)}` : ''}`).join('; ')}]` : ''}`));
  section('Prior art', isNa(plan.priorArt) ? [`Searched, nothing comparable: ${one(plan.priorArt.na)}`] : list(plan.priorArt).map(a =>
    `- ${one(a.name)} (${one(a.verdict)}): ${short(a.why, 200)}${list(a.takeaways).length ? `; takeaways: ${list(a.takeaways).map(one).join('; ')}` : ''}`));
  const arch = obj(plan.architecture);
  section('Architecture', [
    ...(arch.overview ? [short(arch.overview, 600)] : []),
    ...(arch.style ? [`Style: ${arch.style.existing ? one(arch.style.existing) + ' (already there)' : `decided in ${one(arch.style.decision)}`}`] : []),
    ...list(arch.components).map(c => `- module ${one(c.name)}${c.location ? ` (${one(c.location)})` : ''}: ${one(c.responsibility)}${c.interface ? `; interface: ${one(c.interface)}` : ''}${c.hides ? `; hides: ${one(c.hides)}` : ''}${list(c.uses).length ? `; uses: ${c.uses.join(', ')}` : ''}`),
    ...list(arch.dataModel).map(d => `- data ${one(d.entity)}: ${one(d.fields)}${d.notes ? ` (${one(d.notes)})` : ''}`),
    ...list(arch.interfaces).map(i => `- interface ${one(i.name)}: ${one(i.contract)}`),
    ...list(arch.hotPaths).map(h => `- hot path ${one(h.flow)}: ${one(h.size)}, budget ${one(h.budget)}; ${one(h.approach)}`),
  ]);
  const req = obj(plan.requirements);
  section('Quality scenarios (cite as N#)', list(req.nonFunctional).map(n => `- ${n.id}: ${one(n.text)}; measure: ${one(n.measure || n.target)} (${one(n.priority)}, from ${one(n.source)})`));
  section('Constraints', list(req.constraints).map(c => `- ${one(c)}`));
  const sec = obj(plan.security);
  section('Security (cite as T#)', [
    ...list(sec.assets).map(a => `Protects: ${one(a)}`),
    ...list(sec.threats).map(t => `- ${t.id}: ${one(t.threat)} → ${t.acceptedBy === 'user' ? `accepted by the user: ${one(t.acceptedReason)}` : `${one(t.mitigation)} (built in ${one(t.step)})`}`),
  ]);
  section('New dependencies', isNa(plan.dependencies) ? [] : list(plan.dependencies).map(d => `- ${one(d.name)}@${one(d.version)}: ${one(d.why)} (${one(d.license)})${d.insteadOf ? `; instead of ${one(d.insteadOf)}` : ''}`));
  const t = obj(plan.testing);
  section('Testing', [
    ...list(t.strategy).map(x => `- ${one(x)}`),
    ...list(t.seams).map(x => `- seam ${one(x.seam)}: catches ${one(x.catches)}`),
    ...list(t.securityChecks).map(x => `- check ${one(x.check)}: \`${one(x.command)}\``),
    ...(t.runIt && !isNa(t.runIt) ? [`- run it: start \`${one(t.runIt.start)}\`, driven by ${one(t.runIt.drive)}`] : []),
  ]);
  section('What relied on the changed code', isNa(plan.impact) ? [] : list(plan.impact).map(i =>
    `- ${one(i.change)}: ${list(i.users).map(u => one(u.where)).join(', ') || 'no users found'}${i.outside ? `; outside the repo: ${one(i.outside)}` : ''}`));
  if (m.kind === 'design') {
    const d = obj(plan.direction);
    section('Design direction', [
      ...(d.brief ? [`Brief: ${one(d.brief)}`] : []), ...(d.scene ? [`Scene: ${one(d.scene)}`] : []),
      ...list(d.principles).map(x => `Principle: ${one(x)}`), ...(d.signature ? [`Signature: ${one(d.signature)}`] : []),
      ...list(d.references).map(r => `Reference: ${one(r.name)}${r.url ? ` [${one(r.url)}]` : ''}: ${one(r.take)}`),
      ...list(d.defaultsAvoided).map(x => `Avoided: ${one(x.default)} → ${one(x.instead)}`),
    ]);
    section('Screens (cite as SC#)', list(plan.screens).map(sc => `- ${sc.id} ${one(sc.name)} [${one(sc.mode)}]: ${one(sc.purpose)}; states: ${list(sc.states).join(', ')}`));
  }
  section('Steps (what was built, in order)', list(plan.steps).map(st => `- ${st.id} [${one(st.status) || 'todo'}] ${one(st.title)}${list(st.files).length ? ` — ${st.files.join(', ')}` : ''}`));
  section('Deliberately not done', list(plan.rejected).map(r => `- ${one(r.option)}: ${one(r.why)}`));
  section('Later milestones (planned separately)', list(plan.later).map(l => `- ${one(l.title)}: ${one(l.adds)} (later because ${one(l.why)})`));
  section('Needs the user', list(plan.needsYou).map(n => `- ${one(n.what)} (${one(n.when)})`));
  section('Risks', list(plan.risks).map(r => `- ${one(r.risk)} (${one(r.likelihood)}/${one(r.impact)}): ${one(r.mitigation)}`));
  const learnings = planFile && path.join(path.dirname(path.dirname(planFile)), LEARNINGS);
  if (learnings && fs.existsSync(learnings)) section('Project learnings', [`Read ${learnings} too: what the build learned the hard way.`]);
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
    // When it ran, so its cost can be told apart from the steps around it.
    if (patch.status === 'doing' && !step.startedAt) step.startedAt = new Date().toISOString();
    if (patch.status === 'done') step.doneAt = new Date().toISOString();
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

// What the project's checks said before the build touched anything, so a step
// is judged by what it adds, and old failures are reported instead of "fixed"
// on the side. Taken once: after a step is done it would only hide failures.
function baseline(plan, patch) {
  if (list(plan.steps).some(s => s.status === 'done')) throw new Error('a step is already done; the baseline is what the checks said before the build, so it is taken once, before then');
  if (!['approved', 'building'].includes(plan.meta.status)) throw new Error(`the plan is ${plan.meta.status}; the baseline is taken when the build starts`);
  for (const k of Object.keys(patch)) if (!['commit', 'checks'].includes(k)) throw new Error(`a baseline has commit and checks, not "${k}"`);
  const text = (v, n = 2000) => typeof v === 'string' && v.length <= n;
  const ok = Array.isArray(patch.checks) && patch.checks.length && patch.checks.length <= 30 && patch.checks.every(c => c && typeof c === 'object' &&
    text(c.check, 200) && c.check.trim() && text(c.result) && c.result.trim() && (c.command === undefined || text(c.command)) &&
    (c.known === undefined || (Array.isArray(c.known) && c.known.length <= 500 && c.known.every(k => text(k, 500)))));
  if (!ok) throw new Error('checks is a list of { check, command, result, known: [what already fails] }, each with its check and result');
  if (patch.commit !== undefined && !text(patch.commit, 64)) throw new Error('commit is a short hash');
  plan.baseline = { at: new Date().toISOString(), ...patch };
}

// Approval belongs to the user's /naqsha:approve; this never sets it.
function setMeta(plan, patch) {
  const rules = {
    status: ['building', 'done'], buildReview: ['pause', 'run'], buildMode: ['solo', 'crew'], crewParallel: [1, 2, 3, 4],
    effort: ['light', 'standard', 'thorough'],
  };
  for (const [k, v] of Object.entries(patch)) {
    if (!rules[k]) throw new Error(`can't set meta.${k} here`);
    if (!rules[k].includes(v)) throw new Error(`meta.${k} must be one of ${rules[k].join(', ')}`);
    if (k === 'status' && !['approved', 'building'].includes(plan.meta.status)) {
      throw new Error(`the plan is ${plan.meta.status}; only an approved plan can be built`);
    }
    plan.meta[k] = v;
  }
}

const compact = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
function costView(c) {
  const share = n => (c.total ? ` (${Math.round(100 * n / c.total)}%)` : '');
  const models = b => Object.entries(b.byModel).map(([k, v]) => `${k} ${compact(v)}`).join(', ');
  return [
    `# Cost: ${compact(c.total)} ${c.unit} (cached reads x${c.weights.cacheRead}, cache writes x${c.weights.cacheWrite5m} to x${c.weights.cacheWrite1h}, output x${c.weights.output})`,
    `Planning: ${compact(c.planning.weight)}${share(c.planning.weight)}${c.planning.weight ? `: ${models(c.planning)}` : ''}`,
    ...Object.entries(c.steps).map(([id, b]) => `${id}: ${compact(b.weight)}${share(b.weight)}: ${models(b)}`),
    ...(c.between.weight ? [`Between steps: ${compact(c.between.weight)}${share(c.between.weight)}`] : []),
    `By model: ${Object.entries(c.byModel).map(([k, v]) => `${k} ${compact(v)}${share(v)}`).join(', ') || 'nothing yet'}`,
    ...(c.agents.length ? ['Agents, costliest first:', ...c.agents.slice(0, 8).map(a => `- ${a.name} (${a.where}, ${a.model}): ${compact(a.weight)} over ${a.calls} calls`)] : []),
    ...(c.total ? [] : [`No usage found in ${c.logs}.`]),
  ].join('\n');
}

// After each step, one line: the full report would pile up in the context.
function stepCostLine(c, id) {
  const b = c.steps[id];
  const top = c.agents.find(a => a.where === id);
  return `${id}: ${compact(b ? b.weight : 0)} weighted tokens${b && c.total ? ` (${Math.round(100 * b.weight / c.total)}% of ${compact(c.total)} so far)` : ''}` +
    `${top ? `; costliest agent ${top.name}, ${compact(top.weight)}` : ''}. Full breakdown on the plan page.`;
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
  if (!file || !['step', 'status', 'ready', 'digest', 'update-step', 'set-meta', 'checkpoint', 'baseline', 'cost'].includes(cmd)) {
    throw new Error('usage: plan-tool.js step|status|ready|digest|update-step|set-meta|checkpoint|baseline|cost <plan.js> [S#]');
  }
  const planFile = path.resolve(file);
  const plan = readPlan(planFile);
  if (cmd === 'step') return console.log(stepView(plan, id, planFile));
  if (cmd === 'status') return console.log(statusView(plan));
  if (cmd === 'ready') return console.log(readyView(plan));
  if (cmd === 'digest') return console.log(digestView(plan, planFile));
  if (cmd === 'cost') {
    plan.cost = costOf(plan, planFile);
    writePlan(planFile, plan);
    return console.log(id ? stepCostLine(plan.cost, id) : costView(plan.cost));
  }
  if (cmd === 'update-step') updateStep(plan, id, readPatch());
  else if (cmd === 'checkpoint') checkpoint(plan, id, readPatch());
  else if (cmd === 'baseline') baseline(plan, readPatch());
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

module.exports = { stepView, statusView, digestView, referencesFor, reviewFor, NAMES };
