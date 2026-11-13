// naqsha's progress row: above the prompt, one bar for each thing Claude and its
// agents have been doing for more than two seconds, with everything known about
// it, and a line saying how much is running.
//
// - Tool calls: every one (a command, a web fetch, a search, an MCP tool). A
//   command's output is read every second for the progress it printed
//   (`@naqsha-progress {...}` from naqsha's own scripts, a tool's `45%` bar or
//   `412/1200 frames`) and the last line it printed; with progress come the
//   rate and the time left. A background command's output file comes with its
//   start; a foreground one's is matched when that can be told for sure.
// - Agents: each running subagent, what it's doing now, how many tools it has
//   used, and its own commands under its name.
// - The build: the plan's step, while Claude is working.
//
// Everything here only watches: every hook passes its event on unchanged, and
// one that fails hands the event on as it was (its .catch).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { NaqshaBackgroundJob, NaqshaProgressRow } from '../types'
import {
  buildStep, clock, endedTasks, figure, fill, lastLine, outputPathOf, paceOf, parsePlan,
  readProgress, sampleOf, shorten,
} from './progress-read.mjs'
import type { Progress, Sample } from './progress-read.mjs'

const rows = atom({ plugin: 'naqsha', key: 'progress' } as const, [] as NaqshaProgressRow[])
const background = atom({ plugin: 'naqsha', key: 'background' } as const, [] as NaqshaBackgroundJob[])

type Job = NaqshaBackgroundJob & {
  tool: string;
  isBackground: boolean;
  asked?: boolean;
  size?: number;
  progress?: Progress | null;
  line?: string;
  first?: Sample;
};

type Agent = { firstSeen: number; label: string; doing: string; tools: number };

const SHOW_AFTER_MS = 2000;
const MAX_READ = 4 * 1024 * 1024;
// Tools that wait on the person, or that the agent rows already show.
const NOT_SHOWN = new Set(['Agent', 'Task', 'AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode']);

// What is running, kept for this module's life; background commands are also
// kept in the session's state, so a reload finds them again.
const jobs = new Map<string, Job>();
const agents = new Map<string, Agent>();
const agentTools = new Map<string, { doing: string; count: number }>();
const claimed = new Set<string>();
let tasksDir = '';
let serial = 0;
let idleTicks = 0;
let showing = false;
let restored = false;
let build: { at: number; text: string } | null = null;

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    let job: Job | null = null;
    try {
      if (e.agentId) {
        const t = agentTools.get(e.agentId) || { doing: '', count: 0 };
        agentTools.set(e.agentId, { doing: describe(e), count: t.count + 1 });
      }
      if (!NOT_SHOWN.has(e.tool)) {
        const isBash = e.tool === 'Bash';
        job = {
          key: e.tool_use_id || `call-${++serial}`,
          tool: e.tool,
          label: e.tool === 'Bash' ? (e.description ? String(e.description) : shorten(e.command)) : describe(e),
          agentId: e.agentId,
          startedAt: await $.clock.now(),
          isBackground: e.tool === 'Bash' && Boolean(e.run_in_background),
          toolUseId: e.tool_use_id,
        };
        if (!isBash) job.isBackground = false;
        jobs.set(job.key, job);
      }
    } catch { job = null; }

    const r = await next(e);
    if (!job) return r;

    try {
      const result = (r as { result?: { backgroundTaskId?: string } }).result;
      if (!('deny' in r && r.deny) && result && result.backgroundTaskId) {
        job.isBackground = true;
        job.asked = false;
        job.taskId = result.backgroundTaskId;
        const out = outputPathOf((r as { text?: string }).text);
        if (out) {
          if (job.output && job.output !== out) claimed.delete(job.output);
          job.output = out;
          claimed.add(out);
          tasksDir = out.slice(0, Math.max(out.lastIndexOf('/'), out.lastIndexOf('\\')));
        }
        await keep($);
      } else {
        drop(job);
      }
    } catch { drop(job); }
    return r;
  }).catch(($, e, next) => next(e));

  // A call put to the person (or the mode's classifier) waits for an answer
  // before it runs: its row says so, since the two can't be told apart here.
  on('tool.check', async ($, e, next) => {
    const r = await next(e);
    try {
      const job = e.tool_use_id ? jobs.get(e.tool_use_id) : undefined;
      if (job && r.decision === 'ask') job.asked = true;
    } catch { /* only watching */ }
    return r;
  }).catch(($, e, next) => next(e));

  // A background task's notification: its row goes.
  on('session.append', async ($, e, next) => {
    try {
      let changed = false;
      for (const block of e.message.content) {
        const text = block.type === 'text' && typeof block.text === 'string' ? block.text : '';
        if (!text.includes('<task-notification>')) continue;
        for (const t of endedTasks(text)) {
          for (const job of jobs.values()) {
            if ((t.taskId && job.taskId === t.taskId) || (t.toolUseId && job.toolUseId === t.toolUseId)) { drop(job); changed = true; }
          }
        }
      }
      if (changed) await keep($);
    } catch { /* only watching */ }
    return next(e);
  }).catch(($, e, next) => next(e));

  // At the end of each turn Claude Code lists what's still running in the
  // background: anything not on that list has ended.
  on('classic.Stop', async ($, e, next) => {
    try {
      const live = (e as { background_tasks?: { id: string }[] }).background_tasks;
      if (Array.isArray(live)) {
        const ids = new Set(live.map(t => t.id));
        let changed = false;
        for (const job of jobs.values()) if (job.taskId && !ids.has(job.taskId)) { drop(job); changed = true; }
        if (changed) await keep($);
      }
    } catch { /* only watching */ }
    return next(e);
  }).catch(($, e, next) => next(e));

  on('session.start', async ($, e, next) => {
    const r = await next(e);
    $.clock.every(1000, () => tick($).catch(() => {}));
    return r;
  });

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const all = (await read($, rows)).filter(row => !row.isBuild || e.props.isWorking);
    if (!all.length) return next(e);
    const { Box, Progress, Text } = $.ui.resolve(e);
    // Each bar takes two rows on the terminal (its words, then the bar), and
    // the summary one.
    const room = Math.max(1, Math.min(10, Math.floor((e.props.maxRows - 2) / 2)));
    const shown = all.slice(0, room);
    return (
      <Box flexDirection="column">
        <Text dimColor>{summary(all)}</Text>
        {shown.map(row => (
          <Progress label={row.label} value={row.value} max={row.max} valueText={row.valueText} />
        ))}
        {all.length > shown.length ? <Text dimColor>and {all.length - shown.length} more running</Text> : null}
      </Box>
    );
  });
};

type Engine = EngineInterface;

// "naqsha · 2 commands, 1 tool call, 1 agent running · building: 2 of 4 steps done"
function summary(all: NaqshaProgressRow[]): string {
  const counts = new Map<string, number>();
  let buildText = '';
  for (const row of all) {
    if (row.isBuild) { buildText = row.valueText.split(' · ')[0] ?? ''; continue; }
    const kind = row.key.startsWith('agent-') ? 'agent' : (jobs.get(row.key)?.tool === 'Bash' ? 'command' : 'tool call');
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  const parts = [...counts].map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`);
  const running = parts.length ? `${parts.join(', ')} running` : '';
  return ['naqsha', running, buildText && `building: ${buildText}`].filter(Boolean).join(' · ');
}

function drop(job: Job) {
  jobs.delete(job.key);
  if (job.output) claimed.delete(job.output);
}

// Background commands, saved so a reload of this module picks them up again.
async function keep($: Engine) {
  const list: NaqshaBackgroundJob[] = [...jobs.values()].filter(j => j.isBackground && j.taskId).map(j => ({
    key: j.key, label: j.label, agentId: j.agentId, startedAt: j.startedAt, taskId: j.taskId, toolUseId: j.toolUseId, output: j.output,
  }));
  await update($, background, () => list);
}

async function restore($: Engine) {
  restored = true;
  for (const j of await read($, background)) {
    if (jobs.has(j.key)) continue;
    jobs.set(j.key, { ...j, tool: 'Bash', isBackground: true });
    if (j.output) {
      claimed.add(j.output);
      tasksDir = tasksDir || j.output.slice(0, Math.max(j.output.lastIndexOf('/'), j.output.lastIndexOf('\\')));
    }
  }
}

async function tick($: Engine) {
  if (!restored) await restore($);
  const now = await $.clock.now();
  // Nothing running or shown: look for new agents and the build every few seconds only.
  const quiet = !jobs.size && !agents.size && !showing;
  if (quiet && ++idleTicks % 5 !== 0) return;
  if (!quiet) idleTicks = 0;

  await findAgents($, now);
  await matchForeground($, now);
  for (const job of jobs.values()) await readOutput($, job, now);

  const next: NaqshaProgressRow[] = [];
  const b = await readBuild($);
  if (b) {
    next.push({
      key: 'build',
      label: `Building ${b.title}`,
      value: b.done,
      max: b.total,
      valueText: `${b.done} of ${b.total} steps done${b.step ? ' · now ' + b.step : ''}`,
      isBuild: true,
    });
  }
  for (const [id, a] of agents) {
    const ran = now - a.firstSeen;
    if (ran < SHOW_AFTER_MS) continue;
    const used = a.tools ? `${a.tools} tool${a.tools === 1 ? '' : 's'} used` : '';
    next.push({ key: `agent-${id}`, label: a.label, valueText: [a.doing ? `now ${a.doing}` : 'thinking', used, clock(ran)].filter(Boolean).join(' · ') });
  }
  for (const job of jobs.values()) {
    const ran = now - job.startedAt;
    if (ran < SHOW_AFTER_MS) continue;
    const who = job.agentId ? agents.get(job.agentId)?.label.split(':')[0] : '';
    const p = job.progress ?? null;
    const f = fill(p);
    const pace = f && job.first ? paceOf(job.first, f.value, f.max, now) : null;
    const extra = [
      !p && job.line ? job.line : '',
      job.asked ? 'approval was asked' : '',
      job.isBackground ? 'background' : '',
    ].filter(Boolean);
    next.push({
      key: job.key,
      label: `${who ? who + ' › ' : ''}${job.label}`,
      ...(f ? { value: f.value, max: f.max } : {}),
      valueText: [figure(p, ran, pace), ...extra].join(' · '),
    });
  }

  showing = next.some(row => !row.isBuild);
  const before = await read($, rows);
  if (JSON.stringify(before) !== JSON.stringify(next)) await update($, rows, () => next);
}

async function findAgents($: Engine, now: number) {
  let list: { id: string; status: string; type: string; description: string; name?: string }[] = [];
  try { list = await $.agent.list(); } catch { return; }
  const running = new Set<string>();
  for (const a of list) {
    if (a.status !== 'running' && a.status !== 'pending') continue;
    running.add(a.id);
    const known = agents.get(a.id);
    const t = agentTools.get(a.id);
    const label = shorten(`${a.name || a.type}: ${a.description}`, 56);
    agents.set(a.id, { firstSeen: known ? known.firstSeen : now, label, doing: t?.doing || '', tools: t?.count || 0 });
  }
  for (const id of [...agents.keys()]) {
    if (!running.has(id)) { agents.delete(id); agentTools.delete(id); }
  }
}

// A foreground command's output file is named by an id the call never sees,
// so it is matched only when exactly one new file and one unmatched command
// are running: otherwise its bar runs without a number.
async function matchForeground($: Engine, now: number) {
  if (!tasksDir) return;
  const waiting = [...jobs.values()].filter(j => j.tool === 'Bash' && !j.isBackground && !j.output && now - j.startedAt >= 1000);
  if (waiting.length !== 1) return;
  const job = waiting[0]!;
  let names: string[] = [];
  try { names = (await $.fs.list(tasksDir)).map(x => x.name); } catch { return; }
  const fresh: string[] = [];
  for (const name of names) {
    if (!name.endsWith('.output')) continue;
    const file = `${tasksDir}/${name}`;
    if (claimed.has(file)) continue;
    try {
      const st = await $.fs.stat(file);
      if (st.mtimeMs >= job.startedAt - 500) fresh.push(file);
    } catch { /* gone */ }
  }
  if (fresh.length === 1) {
    job.output = fresh[0];
    claimed.add(fresh[0]!);
  }
}

async function readOutput($: Engine, job: Job, now: number) {
  if (!job.output) return;
  try {
    const st = await $.fs.stat(job.output);
    if (st.size === job.size) return;
    job.size = st.size;
    if (st.size > MAX_READ) return;
    const raw = await $.fs.read(job.output);
    const text = typeof raw === 'string' ? raw : '';
    job.line = lastLine(text);
    const got = readProgress(text);
    if (got) {
      job.progress = got;
      const f = fill(got);
      if (f) job.first = sampleOf(job.first, f.value, f.max, now);
    }
  } catch { /* the file may not exist yet */ }
}

async function readBuild($: Engine) {
  try {
    const root = await $.session.cwd();
    const state = JSON.parse(String(await $.fs.read(`${root}/.naqsha/state.json`)));
    if (!state || state.phase !== 'approved' || typeof state.plan !== 'string') return null;
    const file = `${root}/${state.plan}/plan.js`;
    const st = await $.fs.stat(file);
    if (!build || build.at !== st.mtimeMs) build = { at: st.mtimeMs, text: String(await $.fs.read(file)) };
    return buildStep(parsePlan(build.text));
  } catch {
    return null;
  }
}

// A tool call in a few words: "Bash: Run the tests", "Read: plan.js",
// "WebFetch: github.com", "neon: run_sql".
function describe(e: { tool: string } & Record<string, unknown>): string {
  const pick = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : '');
  const mcp = /^mcp__(.+?)__(.+)$/.exec(e.tool);
  const name = mcp ? `${mcp[1]!.replace(/^(plugin_|claude_ai_)/, '').replace(/_/g, ' ')}: ${mcp[2]}` : e.tool;
  let host = '';
  try { host = pick('url') ? new URL(pick('url')).host : ''; } catch { host = pick('url'); }
  const what = pick('description') || pick('file_path').split(/[\\/]/).pop() || pick('notebook_path').split(/[\\/]/).pop() ||
    host || pick('query') || pick('pattern') || pick('skill') || pick('command') || pick('prompt');
  return shorten(what ? `${name}: ${what}` : name, 52);
}
