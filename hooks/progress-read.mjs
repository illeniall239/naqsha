// Reads progress out of a command's output, for the progress row above the prompt.
// Plain functions with no Node or engine calls, so the hooks module and the
// tests share them.

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;
const BAR = /[█▉▊▋▌▍▎▏░▒▓■□━─═#=>\-|[\]]+/g;
// A line that draws a bar: three or more bar glyphs in a row.
const DRAWN = /[█▉▊▋▌▍▎▏░▒▓■□━═#=]{3,}/;
// Words that say a count is progress, and words that say it's something else.
const PROGRESS = /\b(step|frame|file|test|item|page|batch|epoch|chunk|part|task|scene|shot|object|package|module|record|row|request|done|complete|completed|processed|downloaded|uploaded|rendered|captured|written|copied|received|resolved|compiled|installed|[KMGT]i?B|kB|B)s?\b/i;
const NOT_PROGRESS = /\b(coverage|skipped|skip|failed|failing|fail|errors?|warnings?|cpu|mem|memory|disk|battery|load|score|rating|accuracy|confidence|discount|off)\b/i;

// The last progress a command printed, or null. Looks at its last lines, newest
// first, for one of:
//   @naqsha-progress {"done":3,"total":12,"unit":"steps","stage":"Recording"}
//     (or any tool's @<name>-progress line with pct, done and total)
//   45%  Extracting frames
//   412/1200 frames · 2.1/5.0 MB · 3 of 12
// or a checklist that marks items done and pending (see checklist), whichever
// was printed last.
export function readProgress(text) {
  if (typeof text !== 'string' || !text) return null;
  const lines = text.slice(-16000).replace(ANSI, '').split(/\r\n|\r|\n/);
  let line = null;
  let seen = 0;
  for (let i = lines.length - 1; i >= 0 && seen < 60; i--) {
    const l = lines[i].trim();
    if (!l) continue;
    seen++;
    const got = tagged(l) || percent(l) || ratio(l);
    if (got) { line = { got, at: i }; break; }
  }
  const list = checklist(lines);
  if (list && (!line || list.at > line.at)) return list.got;
  return line ? line.got : null;
}

// A list of items each marked done, failed or still to come, as a CI watcher,
// a build or a task runner prints it, often printed again on every refresh:
//   JOBS
//   ✓ test (ubuntu-latest, 22) in 58s (ID 1)
//   ✓ test (windows-latest, 22) in 1m23s (ID 2)
//   * test (macos-latest, 22) (ID 3)
// Counts the newest mark of each item at the outermost level, back to where
// the list was last printed: { done, total, unit, stage? }. Only a list that
// still has something to come, or that is printed again, counts: a test run's
// stream of ticks has no total.
const DONE = /^(?:[✓✔√☑]|\[[xX✓✔]\])\s+/;
// gh marks a failed job with a plain X.
const FAILED = /^(?:[✗✘×✖X]|\[[!✗✘]\])\s+/;
const TO_COME = /^(?:[*•○◯◌⏳…]|\[ \]|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏])\s+/;
export function checklist(lines) {
  const items = new Map();
  let indent = Infinity;
  let at = -1;
  let repeated = false;
  let header = '';
  let ended = false;
  for (let i = lines.length - 1, n = 0; i >= 0 && n < 400; i--, n++) {
    const raw = lines[i].replace(/\t/g, '  ');
    const text = raw.trim();
    if (!text) continue;
    const mark = DONE.test(text) ? 'done' : FAILED.test(text) ? 'failed' : TO_COME.test(text) ? 'to come' : '';
    if (!mark) {
      // The list ends at the first other line above it; a heading there names
      // what it counts ("JOBS"). Further up, only look for it printed before.
      if (items.size && !ended) {
        ended = true;
        if (/^[A-Z][A-Z ]{1,20}$/.test(text)) header = text.toLowerCase();
      }
      continue;
    }
    const lead = raw.length - raw.trimStart().length;
    const name = text.replace(DONE, '').replace(FAILED, '').replace(TO_COME, '')
      .replace(/\s*\(ID \d+\)\s*$/i, '').replace(/\s+in\s+[\dhms.]+\s*$/i, '').trim();
    if (ended) {
      if (items.has(name)) { repeated = true; break; }
      continue;
    }
    if (lead > indent) continue;
    if (lead < indent) { items.clear(); indent = lead; at = -1; }
    if (items.has(name)) { repeated = true; break; }
    items.set(name, mark);
    if (at < 0) at = i;
  }
  if (items.size < 2) return null;
  const marks = [...items.values()];
  const toCome = marks.filter(m => m === 'to come').length;
  if (!toCome && !repeated) return null;
  const failed = marks.filter(m => m === 'failed').length;
  const got = { done: items.size - toCome, total: items.size, unit: header || 'items' };
  if (failed) got.stage = `${failed} failed`;
  return { got, at };
}

function tagged(line) {
  const m = /^@[\w-]*progress\s+(\{.*\})$/.exec(line);
  if (!m) return null;
  let o;
  try { o = JSON.parse(m[1]); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const out = {};
  const pct = num(o.pct ?? o.percent);
  if (pct !== null && pct >= 0 && pct <= 100) out.pct = pct;
  const done = num(o.done), total = num(o.total);
  if (done !== null && total !== null && total > 0 && done >= 0 && done <= total) { out.done = done; out.total = total; }
  const stage = words(o.stage ?? o.label ?? o.message ?? o.code);
  if (stage) out.stage = stage;
  const unit = words(o.unit);
  if (unit) out.unit = unit;
  return 'pct' in out || 'done' in out ? out : null;
}

function percent(line) {
  const m = /(^|[^\d.])(\d{1,3}(?:\.\d+)?)\s?%/.exec(line);
  if (!m) return null;
  // "45%" counts when the line draws a bar, starts with the percent, or names
  // progress; never on a line about coverage, errors or load.
  if (NOT_PROGRESS.test(line)) return null;
  const leads = /^[\s\[(]*\d{1,3}(?:\.\d+)?\s?%/.test(line);
  if (!DRAWN.test(line) && !leads && !PROGRESS.test(line) && !/\b(\w+ing)\b/i.test(line)) return null;
  const pct = Number(m[2]);
  if (!(pct >= 0 && pct <= 100)) return null;
  const after = words(line.slice(m.index + m[0].length).replace(BAR, ' '));
  const before = words(line.slice(0, m.index + m[1].length).replace(BAR, ' '));
  // The words before a percent name it ("Receiving objects: 45%"), unless a bar
  // stands there ("███░░ 45%  Extracting frames").
  const stage = /[A-Za-z]{3,}/.test(before) ? before : after;
  return stage ? { pct, stage } : { pct };
}

function ratio(line) {
  if (NOT_PROGRESS.test(line)) return null;
  const bracketed = /\[\s*\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*\]/.test(line);
  if (!bracketed && !DRAWN.test(line) && !PROGRESS.test(line)) return null;
  const re = /(?<![\w/.:-])(\d+(?:\.\d+)?)\s*(?:\/|\bof\b)\s*(\d+(?:\.\d+)?)(?![\w/.:-])/g;
  for (const m of line.matchAll(re)) {
    const done = Number(m[1]), total = Number(m[2]);
    if (!(total > 0 && done >= 0 && done <= total && total < 1e12)) continue;
    const out = { done, total };
    const unit = /^\s*([A-Za-z]{1,12})\b/.exec(line.slice(m.index + m[0].length));
    if (unit) out.unit = unit[1];
    const stage = words(line.slice(0, m.index).replace(BAR, ' '));
    if (stage) out.stage = stage;
    return out;
  }
  return null;
}

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

// Short words a person reads: no brackets, separators or trailing punctuation.
function words(v) {
  if (typeof v !== 'string') return '';
  const s = v.replace(/[[\](){}<>·:|_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[-–—,.;]+|[-–—,.;]+$/g, '').trim();
  return s.length > 40 ? s.slice(0, 39) + '…' : s;
}

// Background tasks a notification says have ended: [{ taskId, toolUseId, status }].
export function endedTasks(text) {
  if (typeof text !== 'string' || !text.includes('<task-notification>')) return [];
  const out = [];
  for (const block of text.split('<task-notification>').slice(1)) {
    const field = name => (new RegExp(`<${name}>([^<]*)</${name}>`).exec(block) || [])[1]?.trim() || '';
    const status = field('status');
    if (!status || status === 'running') continue;
    out.push({ taskId: field('task-id'), toolUseId: field('tool-use-id'), status });
  }
  return out;
}

// Where a background command's output goes, from the Bash tool's reply.
export function outputPathOf(text) {
  const m = /written to:\s*(.+?\.output)\b/.exec(typeof text === 'string' ? text : '');
  return m ? m[1].trim() : '';
}

// 75 s → "1:15"; 3725 s → "1:02:05".
export function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

// The figure beside a bar: "45% · Extracting frames · ~0:20 left · 0:12",
// "1.2 of 5 MB · 0.4 MB/s · ~0:09 left · 0:03". `pace` is from paceOf.
export function figure(p, elapsedMs, pace) {
  const parts = [];
  if (p && 'pct' in p) parts.push(`${Math.round(p.pct)}%`);
  // A count without a unit reads only when it counts whole things (412 of 1,200).
  if (p && 'done' in p && (p.unit || (Number.isInteger(p.done) && Number.isInteger(p.total)))) {
    const n = v => (Number.isInteger(v) ? v.toLocaleString('en-US') : String(v));
    parts.push(`${n(p.done)} of ${n(p.total)}${p.unit ? ' ' + p.unit : ''}`);
  }
  if (p && p.stage) parts.push(p.stage);
  if (pace && pace.rate && p && p.unit && !/^(steps?|tests?|files?|frames?)$/i.test(p.unit)) parts.push(`${round(pace.rate)} ${p.unit}/s`);
  if (pace && pace.leftMs !== undefined) parts.push(`~${clock(pace.leftMs)} left`);
  parts.push(clock(elapsedMs));
  return parts.join(' · ');
}

const round = v => (v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2));

// How fast a bar moves, from the first reading on this stretch of it to now:
// { rate (per second), leftMs }. Only after 4 s of movement; a bar that
// changes stage or goes back starts a new stretch (see sampleOf).
export function paceOf(first, value, max, nowMs) {
  if (!first || first.max !== max || value <= first.value) return null;
  const secs = (nowMs - first.at) / 1000;
  if (secs < 4) return null;
  const rate = (value - first.value) / secs;
  return rate > 0 ? { rate, leftMs: Math.round(((max - value) / rate) * 1000) } : null;
}

// The reading a stretch starts from: kept while the bar only moves forward
// under the same total, replaced when it doesn't.
export function sampleOf(first, value, max, nowMs) {
  if (first && first.max === max && value >= first.value) return first;
  return { value, max, at: nowMs };
}

// The last line a command printed that a person can read (no progress JSON, no
// bare bar), shortened: what it's doing now.
export function lastLine(text) {
  if (typeof text !== 'string' || !text) return '';
  const lines = text.slice(-8000).replace(ANSI, '').split(/\r\n|\r|\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line || /^@[\w-]*progress\s/.test(line) || /^\[exited with code/.test(line)) continue;
    const plain = line.replace(BAR, ' ').replace(/\s+/g, ' ').trim();
    if (plain.length < 2) continue;
    return plain.length > 60 ? plain.slice(0, 59) + '…' : plain;
  }
  return '';
}

// The bar's fill: an overall percent wins over a stage's own count.
export function fill(p) {
  if (!p) return null;
  if ('pct' in p) return { value: p.pct, max: 100 };
  if ('done' in p) return { value: p.done, max: p.total };
  return null;
}

// A command as a label, when Claude gave it no description.
export function shorten(text, max = 48) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s || 'A command';
}

// The build's place in its plan: { title, done, total, step } or null.
export function buildStep(plan) {
  if (!plan || !plan.meta || plan.meta.status !== 'building' || !Array.isArray(plan.steps) || !plan.steps.length) return null;
  const doing = plan.steps.find(s => s && s.status === 'doing');
  return {
    title: String(plan.meta.title || 'the plan'),
    done: plan.steps.filter(s => s && s.status === 'done').length,
    total: plan.steps.length,
    step: doing ? `${doing.id || ''} ${doing.title || ''}`.trim() : '',
  };
}

// plan.js is `window.NAQSHA = <JSON>;`: the JSON, parsed, or null.
export function parsePlan(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}
