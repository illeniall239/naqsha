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
function readLog(file, agent) {
  const out = [];
  const seen = new Set();
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return out; }
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const m = e.message;
    if (e.type !== 'assistant' || !m || !m.usage || seen.has(m.id) || m.model === '<synthetic>') continue;
    seen.add(m.id);
    out.push({ at: Date.parse(e.timestamp), model: m.model || 'unknown', weight: weigh(m.usage), agent });
  }
  return out;
}

function readAll(dir) {
  const records = [];
  for (const f of safeDir(dir)) {
    if (f.endsWith('.jsonl')) records.push(...readLog(path.join(dir, f), null));
    const sub = path.join(dir, f, 'subagents');
    for (const a of safeDir(sub).filter(x => x.endsWith('.jsonl'))) {
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(path.join(sub, a.replace(/\.jsonl$/, '.meta.json')), 'utf8')); } catch { /* no description */ }
      records.push(...readLog(path.join(sub, a), meta.description || a));
    }
  }
  return records;
}

function safeDir(d) {
  try { return fs.readdirSync(d); } catch { return []; }
}

const bucket = () => ({ weight: 0, byModel: {} });
function add(b, r) {
  b.weight += r.weight;
  b.byModel[r.model] = (b.byModel[r.model] || 0) + r.weight;
}

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
  const result = { planning: bucket(), steps: {}, between: bucket(), byModel: {}, agents: {}, total: 0 };
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
      const a = (result.agents[r.agent] ||= { name: r.agent, where, model: r.model, weight: 0, calls: 0 });
      a.weight += r.weight;
      a.calls += 1;
    }
  }
  return result;
}

function costOf(plan, planFile) {
  const dir = logsDir(projectRoot(planFile));
  const r = measure(plan, readAll(dir));
  const round = n => Math.round(n);
  const tidy = b => ({ weight: round(b.weight), byModel: Object.fromEntries(Object.entries(b.byModel).map(([k, v]) => [k, round(v)])) });
  return {
    at: new Date().toISOString(),
    unit: 'weighted tokens',
    weights: WEIGHTS,
    total: round(r.total),
    planning: tidy(r.planning),
    steps: Object.fromEntries(Object.entries(r.steps).map(([k, v]) => [k, tidy(v)])),
    between: tidy(r.between),
    byModel: Object.fromEntries(Object.entries(r.byModel).map(([k, v]) => [k, round(v)])),
    agents: Object.values(r.agents).sort((a, b) => b.weight - a.weight).slice(0, 20)
      .map(a => ({ name: a.name, where: a.where, model: a.model, weight: round(a.weight), calls: a.calls })),
    logs: dir,
  };
}

module.exports = { costOf, measure, weigh, logsDir, WEIGHTS };
