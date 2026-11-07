// What a plan cost, read from Claude Code's session logs: planning, each step,
// and each agent, in weighted tokens. Used by `plan-tool.js cost`.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Relative to one fresh input token: a cached read costs a tenth, a cache write
// a quarter more (five-minute cache) or double (one-hour cache), output five times.
const WEIGHTS = { input: 1, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2, output: 5 };

// Claude Code keeps each project's logs in a folder named after its path.
function logsDir(root) {
  if (process.env.NAQSHA_TRANSCRIPTS) return process.env.NAQSHA_TRANSCRIPTS;
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'projects', root.replace(/[^A-Za-z0-9]/g, '-'));
}

// The project root is the nearest folder above the plan with .naqsha or .git.
function projectRoot(planFile) {
  for (let d = path.dirname(planFile); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.naqsha')) || fs.existsSync(path.join(d, '.git'))) return d;
    if (path.dirname(d) === d) return path.dirname(path.dirname(planFile));
  }
}

function weigh(u) {
  const write = u.cache_creation_input_tokens || 0;
  const oneHour = (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0;
  return (u.input_tokens || 0) * WEIGHTS.input + (u.cache_read_input_tokens || 0) * WEIGHTS.cacheRead +
    (write - oneHour) * WEIGHTS.cacheWrite5m + oneHour * WEIGHTS.cacheWrite1h + (u.output_tokens || 0) * WEIGHTS.output;
}

// One record per model reply. A reply spans several log lines that repeat its
// usage, so count each message id once.
function readLog(file, agent, suite) {
  const out = [];
  const seen = new Set();
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return out; }
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const m = e.message;
    if (e.type !== 'assistant' || !m || !m.usage || m.model === '<synthetic>') continue;
    // A reply spans several lines; each holds its own tool calls, so count those per line.
    const runs = suite ? (m.content || []).filter(c => c && c.type === 'tool_use' && c.name === 'Bash' && isWholeSuite(String((c.input || {}).command || ''), suite)).length : 0;
    if (seen.has(m.id)) { if (runs && out.length) out[out.length - 1].suiteRuns += runs; continue; }
    seen.add(m.id);
    const u = m.usage;
    const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    out.push({ at: Date.parse(e.timestamp), model: m.model || 'unknown', weight: weigh(u), ctx, agent, suiteRuns: runs });
  }
  return out;
}

function readAll(dir, suite) {
  const records = [];
  for (const f of safeDir(dir)) {
    if (f.endsWith('.jsonl')) records.push(...readLog(path.join(dir, f), null, suite));
    const sub = path.join(dir, f, 'subagents');
    for (const a of safeDir(sub).filter(x => x.endsWith('.jsonl'))) {
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(path.join(sub, a.replace(/\.jsonl$/, '.meta.json')), 'utf8')); } catch { /* no description */ }
      records.push(...readLog(path.join(sub, a), meta.description || a, suite));
    }
  }
  return records;
}

function safeDir(d) {
  try { return fs.readdirSync(d); } catch { return []; }
}

const bucket = () => ({ weight: 0, byModel: {}, records: [] });
function add(b, r) {
  b.weight += r.weight;
  b.byModel[r.model] = (b.byModel[r.model] || 0) + r.weight;
  b.records.push(r);
}

// Who spent it: the session itself (in crew mode, the lead that coordinates), the agents
// that build, and the ones that review.
const roleOf = r => (!r.agent ? 'lead' : /review/i.test(r.agent) ? 'review' : /build|fix|resume|worker/i.test(r.agent) ? 'build' : 'other');
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
// Minutes someone was working: gaps over three minutes are waiting (on the user, a
// worker, a limit), not work.
function activeMinutes(records) {
  const ts = records.map(r => r.at).sort((a, b) => a - b);
  let ms = 0;
  for (let i = 1; i < ts.length; i++) ms += Math.min(ts[i] - ts[i - 1], 180000);
  return Math.round(ms / 60000);
}

// Where a step's tokens look wasted, with the numbers, so the user can tell thorough from
// stuck without reading logs.
function flagsFor(id, step, agents, typical, handoff = 60) {
  const flags = [];
  const lead = step.roles.lead;
  if (lead && lead.weight >= 0.3 * step.weight && step.leadContext >= 200000) {
    flags.push(`The session's own context was ${Math.round(step.leadContext / 1000)}k tokens, so each of its ${lead.calls} actions re-read it: ${compact(lead.weight)} of this step's ${compact(step.weight)}. /compact (or a new session) resets it; the build resumes from plan.js.`);
  }
  // A long worker isn't waste in itself; one whose context grew while it ran long pays
  // for that context on every later call.
  for (const a of agents.filter(x => x.where === id && roleOf({ agent: x.name }) === 'build' && x.calls > 90 && (x.context || 0) >= 120000)) {
    flags.push(`${a.name.split(' · ')[0]} took ${a.calls} calls with a context of ${Math.round(a.context / 1000)}k at the median; a worker hands off at about ${handoff}, before its context makes every call cost more.`);
  }
  // One whole-suite run per commit: a worker needs about one, a reviewer one per round.
  for (const a of agents.filter(x => x.where === id && (x.suiteRuns || 0) > 2)) {
    flags.push(`${a.name.split(' · ')[0]} ran the whole suite ${a.suiteRuns} times; once per commit is enough.`);
  }
  const reviews = agents.filter(x => x.where === id && roleOf({ agent: x.name }) === 'review').length;
  if (reviews >= 3) flags.push(`${reviews} review rounds.`);
  if (typical && step.weight > 2.5 * typical) flags.push(`${(step.weight / typical).toFixed(1)}x a typical step of this plan.`);
  return flags;
}

const compact = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n || 0)));

// Planning is from when drafting began to approval. A step runs from its
// startedAt to its doneAt. An agent whose description names a step belongs to
// it; anything else goes by time.
function measure(plan, records) {
  const m = plan.meta || {};
  const from = Date.parse(m.draftedFrom || m.created || '') || 0;
  const approved = Date.parse(m.approvedAt || '') || Infinity;
  const steps = (Array.isArray(plan.steps) ? plan.steps : []).filter(s => s.startedAt)
    .map(s => ({ id: s.id, start: Date.parse(s.startedAt), end: Date.parse(s.doneAt || '') || Infinity }));
  const ids = new Set((plan.steps || []).map(s => s.id));
  const result = { planning: bucket(), steps: {}, between: bucket(), byModel: {}, agents: {}, total: 0, records };
  for (const r of records) {
    if (!(r.at >= from)) continue;
    const named = r.agent && (/\b(S\d+)\b/.exec(r.agent) || [])[1];
    let where;
    if (named && ids.has(named)) where = named;
    else if (r.at < approved) where = 'planning';
    else {
      const open = steps.filter(s => r.at >= s.start && r.at <= s.end);
      where = open.length === 1 ? open[0].id : 'between';
    }
    const b = where === 'planning' ? result.planning : where === 'between' ? result.between : (result.steps[where] ||= bucket());
    add(b, r);
    result.byModel[r.model] = (result.byModel[r.model] || 0) + r.weight;
    result.total += r.weight;
    if (r.agent) {
      const a = (result.agents[r.agent] ||= { name: r.agent, where, model: r.model, weight: 0, calls: 0, ctxs: [], suiteRuns: 0 });
      a.weight += r.weight;
      a.calls += 1;
      a.suiteRuns += r.suiteRuns || 0;
      a.ctxs.push(r.ctx || 0);
    }
  }
  return result;
}

// The project's whole-suite command, from the baseline the build took, so a rerun can be
// counted: each form it was written in ("make check (uv run pytest)" is two). Without a
// baseline, runs aren't counted.
function suiteCommand(plan) {
  const checks = (plan.baseline && Array.isArray(plan.baseline.checks)) ? plan.baseline.checks : [];
  const t = checks.find(c => /test/i.test(c.check || '') && c.command);
  if (!t) return null;
  const forms = String(t.command).split(/[();]|&&|,/).map(x => x.trim()).filter(x => x.length >= 5);
  return forms.length ? forms : null;
}
// A run of the whole suite, not of one file or test.
const isWholeSuite = (cmd, forms) => forms.some(f => cmd.includes(f)) && !/::|\s-k\s|\s-t\s|--grep|\btests?\/\S+\.\w+|\S+\.(test|spec)\.\w+|test_\w+\.py/.test(cmd);

function costOf(plan, planFile) {
  const dir = logsDir(projectRoot(planFile));
  const r = measure(plan, readAll(dir, suiteCommand(plan)));
  const round = n => Math.round(n);
  const tidy = b => ({ weight: round(b.weight), byModel: Object.fromEntries(Object.entries(b.byModel).map(([k, v]) => [k, round(v)])) });
  const agents = Object.values(r.agents).sort((a, b) => b.weight - a.weight).map(({ ctxs, ...a }) => ({ ...a, context: median(ctxs) }));
  const stepOf = b => {
    const roles = {};
    for (const x of b.records) { const k = roleOf(x); (roles[k] ||= { weight: 0, calls: 0 }); roles[k].weight += x.weight; roles[k].calls += 1; }
    for (const v of Object.values(roles)) v.weight = round(v.weight);
    return { ...tidy(b), roles, minutes: activeMinutes(b.records), leadContext: median(b.records.filter(x => !x.agent).map(x => x.ctx)) };
  };
  const num = id => Number(String(id).replace(/\D/g, '')) || 0;
  const steps = Object.fromEntries(Object.entries(r.steps).sort(([a], [b]) => num(a) - num(b)).map(([k, v]) => [k, stepOf(v)]));
  const typical = median(Object.values(steps).map(s => s.weight));
  for (const [k, v] of Object.entries(steps)) {
    const f = flagsFor(k, v, agents, typical, (plan.tuning && plan.tuning.handoffCalls) || 60);
    if (f.length) v.flags = f;
    // What tuning reads: the step's review rounds, its long workers, its repeated suite runs.
    const own = agents.filter(a => a.where === k);
    v.reviews = own.filter(a => roleOf({ agent: a.name }) === 'review').length;
    const long = own.filter(a => roleOf({ agent: a.name }) === 'build' && a.calls > 90 && (a.context || 0) >= 120000);
    if (long.length) v.longWorkers = long.map(a => ({ name: a.name, calls: a.calls, context: round(a.context) }));
    const runs = role => Math.max(0, ...own.filter(a => roleOf({ agent: a.name }) === role).map(a => a.suiteRuns || 0));
    v.suiteRuns = { build: runs('build'), review: runs('review') };
    v.builders = own.filter(a => roleOf({ agent: a.name }) === 'build').length;
  }
  // The whole build: what the session itself spent coordinating (in crew mode, steps
  // overlap, so much of it falls between steps), and the model mix.
  const between = stepOf(r.between);
  const all = r.records || [];
  const leadAll = all.filter(x => !x.agent && x.at >= (Date.parse((plan.meta || {}).approvedAt || '') || Infinity));
  const leadWeight = leadAll.reduce((a, x) => a + x.weight, 0);
  const flags = [];
  if (r.total && between.weight > 0.2 * r.total) {
    flags.push(`${Math.round(100 * between.weight / r.total)}% (${compact(between.weight)}) fell between steps${between.roles.lead ? `, ${compact(between.roles.lead.weight)} of it this session coordinating over ${between.roles.lead.calls} actions` : ''}.`);
  }
  const leadCtx = median(leadAll.map(x => x.ctx));
  if (leadAll.length >= 20 && leadCtx >= 200000) {
    flags.push(`The session running the build had a median context of ${Math.round(leadCtx / 1000)}k tokens (largest ${Math.round(Math.max(...leadAll.map(x => x.ctx)) / 1000)}k), so each of its ${leadAll.length} actions re-read it: ${compact(leadWeight)} in all. /compact at a step boundary, or a new session per plan, resets it; the build resumes from plan.js.`);
  }
  const opus = Object.entries(r.byModel).filter(([m]) => /opus/.test(m)).reduce((a, [, v]) => a + v, 0);
  if (r.total && opus > 0.95 * r.total && agents.filter(a => roleOf({ agent: a.name }) === 'review').length >= 5) {
    flags.push(`${Math.round(100 * opus / r.total)}% ran on Opus, reviews included.`);
  }
  return {
    at: new Date().toISOString(),
    unit: 'weighted tokens',
    weights: WEIGHTS,
    total: round(r.total),
    planning: tidy(r.planning),
    steps,
    between,
    ...(flags.length ? { flags } : {}),
    byModel: Object.fromEntries(Object.entries(r.byModel).map(([k, v]) => [k, round(v)])),
    agents: agents.slice(0, 40).map(a => ({ name: a.name, where: a.where, model: a.model, weight: round(a.weight), calls: a.calls, context: round(a.context), ...(a.suiteRuns ? { suiteRuns: a.suiteRuns } : {}) })),
    logs: dir,
  };
}

module.exports = { costOf, measure, weigh, logsDir, projectRoot, WEIGHTS, activeMinutes, flagsFor, isWholeSuite };
