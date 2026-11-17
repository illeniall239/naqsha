// naqsha's progress row: above the prompt, a bar for everything Claude and its
// agents are doing, with all that's known about each, under a line that sums
// it up. Real numbers wherever something reports them; a running bar with the
// time taken where nothing does.
//
// - Tool calls: every one past two seconds (a command, a web fetch, a search,
//   an MCP tool). A command's output is read every second for the progress it
//   printed (`@naqsha-progress {...}` from naqsha's own scripts, a `45%` bar,
//   `412/1200 frames`, a checklist) and its last line; with progress come the
//   rate and the time left. A foreground command's bar otherwise runs to the
//   point where Claude Code moves it to the background.
// - Monitors and workflows: each one Claude started, until its end notice. A
//   monitor shows its events and the last one, and runs to its time limit.
// - Agents: each running subagent, what it's doing now and how many tools it
//   has used, with its own commands under its name.
// - Claude's task list: how many are done and what it's on.
// - Scheduled wake-ups and cron jobs: a countdown to the next one.
// - Compaction, while it runs.
// - The context window, and any usage limit past half used, while Claude works.
// - naqsha: the build's step, or the plan's answered questions and decisions.
//
// Everything here only watches: every hook passes its event on unchanged, and
// one that fails hands the event on as it was (its .catch).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { NaqshaBackgroundJob, NaqshaExtras, NaqshaProgressRow, NaqshaTask } from '../types'
import {
  buildStep, clock, endedTasks, figure, fill, lastLine, monitorEvents, outputPathOf, paceOf, parsePlan,
  planProgress, readProgress, sampleOf, shorten, taskFigure, tokens,
} from './progress-read.mjs'
import type { Progress, Sample } from './progress-read.mjs'

const rows = atom({ plugin: 'naqsha', key: 'progress' } as const, [] as NaqshaProgressRow[])
const background = atom({ plugin: 'naqsha', key: 'background' } as const, [] as NaqshaBackgroundJob[])
const extras = atom({ plugin: 'naqsha', key: 'extras' } as const, { tasks: {}, wakeup: null, crons: [] } as NaqshaExtras)

type Job = NaqshaBackgroundJob & {
  tool: string;
  isBackground: boolean;
  asked?: boolean;
  size?: number;
  progress?: Progress | null;
  first?: Sample;
};

type Agent = { firstSeen: number; label: string; doing: string; tools: number };

const SHOW_AFTER_MS = 2000;
const MAX_READ = 4 * 1024 * 1024;
// The Bash tool's own default: past it, a foreground command moves to the background.
const BASH_LIMIT_MS = 120_000;
// Kinds that count as running in the summary line.
const RUNNING = ['command', 'tool call', 'monitor', 'workflow', 'agent'];
// Tools that wait on the person, that other rows already show, or that are
// over in an instant and only feed those rows.
const NOT_SHOWN = new Set([
  'Agent', 'Task', 'AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TodoWrite', 'ScheduleWakeup', 'CronCreate', 'CronDelete', 'CronList',
]);

// What is running, kept for this module's life; background work, the task
// lists and what's scheduled are also kept in the session's state, so a reload
// finds them again.
const jobs = new Map<string, Job>();
const agents = new Map<string, Agent>();
const agentTools = new Map<string, { doing: string; count: number }>();
const claimed = new Set<string>();
let more: NaqshaExtras = { tasks: {}, wakeup: null, crons: [] };
let compacting: { at: number; trigger: string; agentId?: string } | null = null;
let agentLimit = 0;
let tasksDir = '';
let serial = 0;
let idleTicks = 0;
let showing = false;
let restored = false;
let stateFile: { at: number; state: { phase?: string; plan?: string; plansDir?: string } | null } | null = null;
let planFile: { file: string; at: number; text: string } | null = null;
let planScan = 0;

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    let job: Job | null = null;
    const loop = e.agentId || 'main';
    try {
      if (e.agentId) {
        const t = agentTools.get(e.agentId) || { doing: '', count: 0 };
        agentTools.set(e.agentId, { doing: describe(e), count: t.count + 1 });
      }
      if (e.tool === 'TodoWrite' && Array.isArray(e.todos)) {
        setTasks(loop, e.todos.map((t, i) => ({ id: String(i), subject: String(t.content), status: String(t.status), activeForm: String(t.activeForm || '') })));
      }
      if (e.tool === 'CronDelete') {
        const id = String((e as { id?: unknown }).id ?? '');
        more = { ...more, crons: more.crons.filter(c => c.id !== id) };
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
        if (e.tool === 'Bash' && !e.run_in_background) job.timeoutMs = Number(e.timeout) || BASH_LIMIT_MS;
        if (!isBash) job.isBackground = false;
        jobs.set(job.key, job);
      }
    } catch { job = null; }

    const r = await next(e);

    try {
      const denied = 'deny' in r && Boolean(r.deny);
      const result = (r as { result?: Record<string, unknown> }).result || {};
      if (!denied) await afterCall($, e as unknown as Record<string, unknown> & { tool: string }, result, loop);
      if (!job) return r;
      const taskId = typeof result.taskId === 'string' ? result.taskId : '';
      if (!denied && job.tool === 'Monitor' && taskId) {
        // A monitor runs on in the background: one event per line it prints.
        job.isBackground = true;
        job.asked = false;
        job.taskId = taskId;
        job.timeoutMs = result.persistent ? 0 : Number(result.timeoutMs) || 0;
        job.events = 0;
        if (tasksDir) {
          job.output = `${tasksDir}/${taskId}.output`;
          claimed.add(job.output);
        }
        await keep($);
      } else if (!denied && job.tool === 'Workflow' && taskId) {
        // A workflow runs on in the background until its end notice.
        job.isBackground = true;
        job.asked = false;
        job.taskId = taskId;
        job.timeoutMs = 0;
        const name = String(result.workflowName || (e as { title?: unknown }).title || (e as { name?: unknown }).name || '');
        if (name) job.label = shorten(`Workflow: ${name}`, 52);
        await keep($);
      } else if (!denied && typeof result.backgroundTaskId === 'string') {
        job.isBackground = true;
        job.asked = false;
        job.timeoutMs = 0;
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
    } catch { if (job) drop(job); }
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

  // Notifications: a monitor's events, and the end of a background task.
  on('session.append', async ($, e, next) => {
    try {
      let changed = false;
      for (const block of e.message.content) {
        const text = block.type === 'text' && typeof block.text === 'string' ? block.text : '';
        if (!text.includes('<task-notification>')) continue;
        for (const ev of monitorEvents(text)) {
          const job = [...jobs.values()].find(j => j.taskId === ev.taskId);
          if (!job) continue;
          job.events = (job.events || 0) + 1;
          job.line = lastLine(ev.event) || job.line;
          const got = readProgress(ev.event);
          if (got) {
            job.progress = got;
            const f = fill(got);
            if (f) job.first = sampleOf(job.first, f.value, f.max, await $.clock.now());
          }
          changed = true;
        }
        for (const t of endedTasks(text)) {
          // An ended task's notice says where task output goes: the folder
          // every later background command and monitor writes to.
          if (!tasksDir && t.output) tasksDir = t.output.slice(0, Math.max(t.output.lastIndexOf('/'), t.output.lastIndexOf('\\')));
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

  // Compaction: a bar while the conversation is being summarised.
  on('session.compact', async ($, e, next) => {
    try { compacting = { at: await $.clock.now(), trigger: String(e.trigger || ''), agentId: e.agentId }; } catch { /* only watching */ }
    try {
      return await next(e);
    } finally {
      compacting = null;
    }
  }).catch(($, e, next) => next(e));

  on('session.start', async ($, e, next) => {
    const r = await next(e);
    try { agentLimit = (await $.agent.limits()).concurrent; } catch { agentLimit = 0; }
    $.clock.every(1000, () => tick($).catch(() => {}));
    return r;
  });

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const all = (await read($, rows)).filter(row => !row.whileWorking || e.props.isWorking);
    if (!all.length) return next(e);
    const { Box, Progress, Text } = $.ui.resolve(e);
    // Each bar takes two rows on the terminal (its words, then the bar), and
    // the summary one.
    const room = Math.max(1, Math.min(12, Math.floor((e.props.maxRows - 2) / 2)));
    const shown = all.slice(0, room);
    return (
      <Box flexDirection="column">
        <Text dimColor>{summary(all)}</Text>
        {shown.map(row => (
          <Progress label={row.label} value={row.value} max={row.max} valueText={row.valueText} />
        ))}
        {all.length > shown.length ? <Text dimColor>and {all.length - shown.length} more</Text> : null}
      </Box>
    );
  });
};

type Engine = EngineInterface;

// What a finished call says about the task list and what's scheduled.
async function afterCall($: Engine, e: Record<string, unknown> & { tool: string }, result: Record<string, unknown>, loop: string) {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  let changed = false;
  if (e.tool === 'TaskCreate') {
    const task = result.task as { id?: unknown; subject?: unknown } | undefined;
    if (task && str(task.id)) {
      setTasks(loop, [...(more.tasks[loop] || []), { id: str(task.id), subject: str(task.subject) || str(e.subject), status: 'pending', activeForm: str(e.activeForm) }]);
      changed = true;
    }
  } else if (e.tool === 'TaskUpdate' && result.success !== false && str(e.taskId)) {
    const list = (more.tasks[loop] || []).map(t => (t.id === str(e.taskId) ? {
      ...t,
      status: str(e.status) || t.status,
      subject: str(e.subject) || t.subject,
      activeForm: str(e.activeForm) || t.activeForm,
    } : t));
    setTasks(loop, list.filter(t => t.status !== 'deleted'));
    changed = true;
  } else if (e.tool === 'TodoWrite') {
    changed = true;
  } else if (e.tool === 'ScheduleWakeup') {
    const at = Number(result.scheduledFor);
    more = { ...more, wakeup: e.stop || result.stopped || !(at > 0) ? null : { setAt: await $.clock.now(), at, reason: str(e.reason) } };
    changed = true;
  } else if (e.tool === 'CronCreate' && str(result.id)) {
    const at = Number(result.nextFireAt);
    more = {
      ...more,
      crons: [...more.crons.filter(c => c.id !== str(result.id)), {
        id: str(result.id), schedule: str(result.humanSchedule) || str(e.cron), setAt: await $.clock.now(), at: at > 0 ? at : 0, recurring: Boolean(result.recurring),
      }],
    };
    changed = true;
  } else if (e.tool === 'CronDelete') {
    changed = true;
  }
  if (changed) await update($, extras, () => more);
}

function setTasks(loop: string, list: NaqshaTask[]) {
  more = { ...more, tasks: { ...more.tasks, [loop]: list } };
}

// "naqsha · 2 commands, 1 monitor, 1 agent running (10 at most) · building: 2 of 4 steps done"
function summary(all: NaqshaProgressRow[]): string {
  const counts = new Map<string, number>();
  const notes: string[] = [];
  for (const row of all) {
    if (RUNNING.includes(row.kind)) counts.set(row.kind, (counts.get(row.kind) || 0) + 1);
    else if (row.kind === 'build' || row.kind === 'plan') notes.push(`${row.kind === 'build' ? 'building' : 'planning'}: ${row.valueText.split(' · ')[0]}`);
    else if (row.kind === 'wakeup') notes.push(`wakes ${row.valueText.split(' · ')[0]}`);
  }
  const parts = RUNNING.filter(k => counts.has(k)).map(k => {
    const n = counts.get(k)!;
    return `${n} ${k}${n === 1 ? '' : 's'}${k === 'agent' && agentLimit ? ` (${agentLimit} at most)` : ''}`;
  });
  const running = parts.length ? `${parts.join(', ')} running` : '';
  return ['naqsha', running, ...notes].filter(Boolean).join(' · ');
}

// A monitor whose events don't say how far it has got: its events so far, the
// last one, and the bar runs to its time limit (the end Claude Code gives it),
// or runs on when it has none.
function monitorRow(job: Job, ran: number): NaqshaProgressRow {
  const who = job.agentId ? agents.get(job.agentId)?.label.split(':')[0] : '';
  const n = job.events || 0;
  const parts = [`${n} event${n === 1 ? '' : 's'}`];
  if (job.line) parts.push(`last: ${job.line}`);
  const limit = job.timeoutMs || 0;
  parts.push(limit ? `${clock(Math.min(ran, limit))} of ${clock(limit)} time limit` : `${clock(ran)} · no time limit`);
  return {
    key: job.key,
    kind: 'monitor',
    label: `${who ? who + ' › ' : ''}Monitor: ${job.label}`,
    ...(limit ? { value: Math.min(ran, limit), max: limit } : {}),
    valueText: parts.join(' · '),
  };
}

function jobRow(job: Job, ran: number, now: number): NaqshaProgressRow {
  const who = job.agentId ? agents.get(job.agentId)?.label.split(':')[0] : '';
  const label = `${who ? who + ' › ' : ''}${job.label}`;
  const kind = job.tool === 'Bash' ? 'command' : job.tool === 'Workflow' ? 'workflow' : 'tool call';
  const p = job.progress ?? null;
  const f = fill(p);
  const flags = [job.asked ? 'approval was asked' : '', job.isBackground ? 'background' : ''].filter(Boolean);
  // A wait with a known end (naqsha's page waiting for answers): a bar to it.
  if (!f && p && p.deadline && p.deadline > job.startedAt) {
    const span = p.deadline - job.startedAt;
    return {
      key: job.key, kind, label, value: Math.min(ran, span), max: span,
      valueText: [p.stage || 'waiting', `${clock(Math.max(0, p.deadline - now))} left`, clock(ran), ...flags].join(' · '),
    };
  }
  if (f) {
    const pace = job.first ? paceOf(job.first, f.value, f.max, now) : null;
    return { key: job.key, kind, label, value: f.value, max: f.max, valueText: [figure(p, ran, pace), ...flags].join(' · ') };
  }
  // No progress: what it printed last, and for a foreground command, a bar to
  // the point where Claude Code moves it to the background.
  const words = [figure(p, ran, null), job.line || '', ...flags].filter(Boolean);
  if (job.tool === 'Bash' && !job.isBackground && job.timeoutMs) {
    const limit = job.timeoutMs;
    words.push(`moves to the background at ${clock(limit)}`);
    return { key: job.key, kind, label, value: Math.min(ran, limit), max: limit, valueText: words.join(' · ') };
  }
  return { key: job.key, kind, label, valueText: words.join(' · ') };
}

function drop(job: Job) {
  jobs.delete(job.key);
  if (job.output) claimed.delete(job.output);
}

// Background work, saved so a reload of this module picks it up again.
async function keep($: Engine) {
  const list: NaqshaBackgroundJob[] = [...jobs.values()].filter(j => j.isBackground && j.taskId).map(j => ({
    key: j.key, label: j.label, agentId: j.agentId, startedAt: j.startedAt, taskId: j.taskId, toolUseId: j.toolUseId, output: j.output,
    tool: j.tool, timeoutMs: j.timeoutMs, events: j.events, line: j.line,
  }));
  await update($, background, () => list);
}

async function restore($: Engine) {
  restored = true;
  for (const j of await read($, background)) {
    if (jobs.has(j.key)) continue;
    jobs.set(j.key, { ...j, tool: j.tool || 'Bash', isBackground: true });
    if (j.output) {
      claimed.add(j.output);
      tasksDir = tasksDir || j.output.slice(0, Math.max(j.output.lastIndexOf('/'), j.output.lastIndexOf('\\')));
    }
  }
  const saved = await read($, extras);
  if (saved && typeof saved === 'object') more = { tasks: saved.tasks || {}, wakeup: saved.wakeup || null, crons: saved.crons || [] };
}

async function tick($: Engine) {
  if (!restored) await restore($);
  const now = await $.clock.now();
  // Nothing running, counting down or shown: look again every few seconds only.
  const counting = Boolean(more.wakeup) || more.crons.some(c => c.at > now) || Boolean(compacting);
  const quiet = !jobs.size && !agents.size && !showing && !counting;
  if (quiet && ++idleTicks % 5 !== 0) return;
  if (!quiet) idleTicks = 0;

  await findAgents($, now);
  await matchForeground($, now);
  for (const job of jobs.values()) await readOutput($, job, now);

  const next: NaqshaProgressRow[] = [];
  await naqshaRows($, now, next);
  if (compacting && now - compacting.at >= SHOW_AFTER_MS) {
    const who = compacting.agentId ? agents.get(compacting.agentId)?.label.split(':')[0] : '';
    next.push({
      key: 'compaction', kind: 'compaction',
      label: `${who ? who + ' › ' : ''}Compacting the conversation`,
      valueText: [compacting.trigger, clock(now - compacting.at)].filter(Boolean).join(' · '),
    });
  }
  for (const [loop, list] of Object.entries(more.tasks)) {
    const t = taskFigure(list);
    if (!t) continue;
    const who = loop === 'main' ? '' : agents.get(loop)?.label.split(':')[0];
    if (loop !== 'main' && !who) continue;
    next.push({
      key: `tasks-${loop}`, kind: 'tasks', whileWorking: true,
      label: who ? `${who} › task list` : "Claude's task list",
      value: t.done, max: t.total,
      valueText: [`${t.done} of ${t.total} done`, t.now ? `now: ${t.now}` : ''].filter(Boolean).join(' · '),
    });
  }
  for (const [id, a] of agents) {
    const ran = now - a.firstSeen;
    if (ran < SHOW_AFTER_MS) continue;
    const used = a.tools ? `${a.tools} tool${a.tools === 1 ? '' : 's'} used` : '';
    next.push({ key: `agent-${id}`, kind: 'agent', label: a.label, valueText: [a.doing ? `now ${a.doing}` : 'thinking', used, clock(ran)].filter(Boolean).join(' · ') });
  }
  for (const job of jobs.values()) {
    const ran = now - job.startedAt;
    if (ran < SHOW_AFTER_MS) continue;
    next.push(job.tool === 'Monitor' && !job.progress ? monitorRow(job, ran) : jobRow(job, ran, now));
  }
  if (more.wakeup) {
    const w = more.wakeup;
    if (now > w.at + 5000) {
      more = { ...more, wakeup: null };
      await update($, extras, () => more);
    } else {
      const span = Math.max(1, w.at - w.setAt);
      next.push({
        key: 'wakeup', kind: 'wakeup', label: 'Next wake-up',
        value: Math.min(span, now - w.setAt), max: span,
        valueText: [`in ${clock(Math.max(0, w.at - now))}`, w.reason].filter(Boolean).join(' · '),
      });
    }
  }
  for (const c of more.crons) {
    if (!(c.at > now)) continue;
    const span = Math.max(1, c.at - c.setAt);
    next.push({
      key: `cron-${c.id}`, kind: 'schedule', label: `Scheduled: ${shorten(c.schedule, 40)}`,
      value: Math.min(span, now - c.setAt), max: span,
      valueText: [`next run in ${clock(c.at - now)}`, c.recurring ? 'recurring' : 'once'].join(' · '),
    });
  }
  await usageRows($, now, next);

  showing = next.some(row => !row.whileWorking);
  const before = await read($, rows);
  if (JSON.stringify(before) !== JSON.stringify(next)) await update($, rows, () => next);
}

// The context window, and each usage limit past half used: shown while Claude works.
async function usageRows($: Engine, now: number, next: NaqshaProgressRow[]) {
  let usage: Awaited<ReturnType<Engine['session']['usage']>>;
  try { usage = await $.session.usage(); } catch { return; }
  const ctx = usage.context;
  if (ctx && ctx.window > 0 && typeof ctx.tokens === 'number') {
    const pct = typeof ctx.percent === 'number' ? ctx.percent : Math.round((ctx.tokens / ctx.window) * 100);
    next.push({
      key: 'context', kind: 'context', whileWorking: true, label: 'Context window',
      value: ctx.tokens, max: ctx.window, valueText: `${tokens(ctx.tokens)} of ${tokens(ctx.window)} tokens · ${pct}%`,
    });
  }
  for (const l of usage.rateLimits || []) {
    if (!(l.percentUsed >= 50)) continue;
    const name = l.kind === 'five_hour' ? '5-hour usage limit' : l.kind === 'seven_day' ? '7-day usage limit' : `${l.kind.replace(/_/g, ' ')} limit`;
    const reset = l.resetsAt ? Date.parse(l.resetsAt) : NaN;
    next.push({
      key: `limit-${l.kind}`, kind: 'limit', whileWorking: true, label: name,
      value: l.percentUsed, max: 100,
      valueText: [`${l.percentUsed}% used`, reset > now ? `resets in ${clock(reset - now)}` : ''].filter(Boolean).join(' · '),
    });
  }
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
    if (!running.has(id)) {
      agents.delete(id);
      agentTools.delete(id);
      if (more.tasks[id]) { const { [id]: _gone, ...rest } = more.tasks; more = { ...more, tasks: rest }; }
    }
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

// naqsha's own work in this project: the build's step, or the plan being
// drafted (its questions answered and decisions made). Shown while Claude works.
async function naqshaRows($: Engine, now: number, next: NaqshaProgressRow[]) {
  try {
    const root = await $.session.cwd();
    const sf = `${root}/.naqsha/state.json`;
    const st = await $.fs.stat(sf);
    if (!stateFile || stateFile.at !== st.mtimeMs) {
      let state = null;
      try { state = JSON.parse(String(await $.fs.read(sf))); } catch { state = null; }
      stateFile = { at: st.mtimeMs, state };
    }
    const state = stateFile.state;
    if (!state) return;
    if (state.phase === 'approved' && typeof state.plan === 'string') {
      const b = buildStep(parsePlan(await planText($, `${root}/${state.plan}/plan.js`)));
      if (b) {
        next.push({
          key: 'build', kind: 'build', whileWorking: true, label: `Building ${b.title}`,
          value: b.done, max: b.total,
          valueText: `${b.done} of ${b.total} steps done${b.step ? ' · now ' + b.step : ''}`,
        });
      }
    } else if (state.phase === 'drafting' && typeof state.plansDir === 'string') {
      // The plan being drafted is the newest draft in the plans folder; looked
      // for again every few seconds.
      if (!planFile || now - planScan > 5000) {
        planScan = now;
        const base = `${root}/${state.plansDir}`;
        let best = '', bestAt = -1;
        for (const d of await $.fs.list(base)) {
          if (d.kind !== 'dir') continue;
          try {
            const s = await $.fs.stat(`${base}/${d.name}/plan.js`);
            if (s.mtimeMs > bestAt) { best = `${base}/${d.name}/plan.js`; bestAt = s.mtimeMs; }
          } catch { /* no plan here */ }
        }
        if (best && (!planFile || planFile.file !== best)) planFile = { file: best, at: -1, text: '' };
      }
      const p = planFile ? planProgress(parsePlan(await planText($, planFile.file))) : null;
      if (p) {
        const total = p.questions + p.decisions;
        next.push({
          key: 'plan', kind: 'plan', whileWorking: true, label: `Planning ${p.title}`,
          ...(total ? { value: p.answered + p.decided, max: total } : {}),
          valueText: total
            ? [`${p.answered} of ${p.questions} questions answered`, p.decisions ? `${p.decided} of ${p.decisions} decisions made` : ''].filter(Boolean).join(' · ')
            : 'drafting',
        });
      }
    }
  } catch { /* no naqsha here */ }
}

// A plan file's text, read again only when it changes.
async function planText($: Engine, file: string): Promise<string> {
  const st = await $.fs.stat(file);
  if (!planFile || planFile.file !== file || planFile.at !== st.mtimeMs) planFile = { file, at: st.mtimeMs, text: String(await $.fs.read(file)) };
  return planFile.text;
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
    host || pick('query') || pick('pattern') || pick('skill') || pick('title') || pick('name') || pick('command') || pick('prompt');
  return shorten(what ? `${name}: ${what}` : name, 52);
}
