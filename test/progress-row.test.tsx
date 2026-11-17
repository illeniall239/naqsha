// The progress row above the prompt, run against Claude Code's own engine:
// `claude plugin test .` (npm test covers the output reader in progress.test.js).
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'naqsha',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const OUT = '/tmp/tasks/t1.output'

test('a background render shows its frames, and goes when it ends', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  let output = 'Rendering\n@hf-progress {"code":"capture","done":412,"total":1200,"pct":40}\n'
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({
    result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 't1' },
    text: `Command running in background with ID: t1. Output is being written to: ${OUT}`,
  }))
  on('agent.list', () => ({ value: [] }))
  on('session.cwd', () => ({ value: '/project' }))
  on('fs.stat', (_, e) => (e.path === OUT ? { value: { kind: 'file', size: output.length, mtimeMs: clock.now(), isLink: false } } : { deny: 'missing' }))
  on('fs.read', (_, e) => (e.path === OUT ? { value: output } : { deny: 'missing' }))

  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npx hyperframes render', description: 'Render the film', run_in_background: true, tool_use_id: 'u1' })
  await clock.advance(3_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const row = await ui.find({ type: 'Box' })
    expect(row?.text).toContain('Render the film')
    expect(row?.text).toContain('40% · 412 of 1,200')
    if (surface === 'terminal') expect(JSON.stringify(row)).toContain('"width":"40%"')
    await ui.unmount()
  }

  // The task's notification ends the row.
  output += 'done\n'
  await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: '<task-notification>\n<task-id>t1</task-id>\n<status>completed</status>\n</task-notification>' }] },
  } as never)
  await clock.advance(5_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Box' }))?.text ?? '').not.toContain('Render the film')
  await ui.unmount()
})

test('a quick command never shows', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))
  on('agent.list', () => ({ value: [] }))
  on('session.cwd', () => ({ value: '/project' }))
  on('fs.read', () => ({ deny: 'missing' }))
  on('fs.stat', () => ({ deny: 'missing' }))

  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(6_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Box' }))?.text ?? '').not.toContain('ls')
  await ui.unmount()
})

test('a running subagent shows what it is doing', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))
  on('agent.list', () => ({ value: [{ id: 'a1', status: 'running', type: 'general-purpose', description: 'Review step S3', name: 'reviewer' }] }))
  on('session.cwd', () => ({ value: '/project' }))
  on('fs.read', () => ({ deny: 'missing' }))
  on('fs.stat', () => ({ deny: 'missing' }))

  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  await clock.advance(5_000)
  await $.tool.call({ tool: 'Read', file_path: '/project/src/billing/reminders.ts', agentId: 'a1' })
  await clock.advance(3_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const row = await ui.find({ type: 'Box' })
  expect(row?.text).toContain('reviewer: Review step S3')
  expect(row?.text).toContain('now Read: reminders.ts · 1 tool used · 0:0')
  await ui.unmount()
})

test('the build shows its step while Claude works, and not after', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const plan = 'window.NAQSHA = ' + JSON.stringify({
    meta: { title: 'Ledgerly: invoice reminders', status: 'building' },
    steps: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'done' }, { id: 'S3', status: 'doing', title: 'Stop on payment' }, { id: 'S4', status: 'todo' }],
  }) + ';\n'
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.list', () => ({ value: [] }))
  on('session.cwd', () => ({ value: '/project' }))
  on('fs.stat', () => ({ value: { kind: 'file', size: plan.length, mtimeMs: 5, isLink: false } }))
  on('fs.read', (_, e) => ({ value: e.path.endsWith('state.json') ? JSON.stringify({ phase: 'approved', plan: 'docs/plans/reminders' }) : plan }))

  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  await clock.advance(6_000)

  const working = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const row = await working.find({ type: 'Box' })
  expect(row?.text).toContain('Building Ledgerly: invoice reminders')
  expect(row?.text).toContain('2 of 4 steps done · now S3 Stop on payment')
  expect(JSON.stringify(row)).toContain('"width":"50%"')
  await working.unmount()

  const idle = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: false } })
  expect((await idle.find({ type: 'Box' }))?.text ?? '').not.toContain('Building')
  await idle.unmount()
})

test('a slow web fetch has its own bar until it returns', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  let finish: (v: unknown) => void = () => {}
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => new Promise(resolve => { finish = resolve }))
  on('agent.list', () => ({ value: [] }))
  on('session.cwd', () => ({ value: '/project' }))
  on('fs.read', () => ({ deny: 'missing' }))
  on('fs.stat', () => ({ deny: 'missing' }))

  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  const call = $.tool.call({ tool: 'WebFetch', url: 'https://github.com/heygen-com/hyperframes', prompt: 'What does it do?' })
  await clock.advance(3_000)
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const row = await ui.find({ type: 'Box' })
  expect(row?.text).toContain('naqsha · 1 tool call running')
  expect(row?.text).toContain('WebFetch: github.com')
  expect(row?.text).toContain('0:03')
  await ui.unmount()

  finish({ result: { bytes: 10, code: 200, codeText: 'OK', result: 'ok', durationMs: 3000, url: 'https://github.com' }, text: 'ok' })
  await call
  await clock.advance(1_000)
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Box' }))?.text ?? '').not.toContain('WebFetch')
  await ui.unmount()
})

test('a background download shows its rate and time left', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  let output = 'Downloading model ━━━━━━━━━ 1.0/9.0 MB\n'
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({
    result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'd1' },
    text: `Command running in background with ID: d1. Output is being written to: ${OUT}`,
  }))
  on('agent.list', () => ({ value: [] }))
  on('session.cwd', () => ({ value: '/project' }))
  on('fs.stat', (_, e) => (e.path === OUT ? { value: { kind: 'file', size: output.length, mtimeMs: clock.now(), isLink: false } } : { deny: 'missing' }))
  on('fs.read', (_, e) => (e.path === OUT ? { value: output } : { deny: 'missing' }))

  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'curl -O model.bin', description: 'Download the model', run_in_background: true, tool_use_id: 'u2' })
  await clock.advance(1_000)
  output += 'Downloading model ━━━━━━━━━ 5.0/9.0 MB\n'
  await clock.advance(4_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const text = (await ui.find({ type: 'Box' }))?.text ?? ''
  expect(text).toContain('Download the model')
  expect(text).toContain('5 of 9 MB · Downloading model · 1.00 MB/s · ~0:04 left')
  expect(text).toContain('background')
  await ui.unmount()
})

test('after a reload, a background command still running comes back', async ($, on) => {
  const clock = mock.clock(on, { now: 10_000 })
  const output = '@naqsha-progress {"done":4,"total":12,"unit":"steps","stage":"Recording"}\n'
  // What the module saved before the reload stays in the session's state.
  on('state.get', (_, e, next) => (e.key === 'background'
    ? { value: { value: [{ key: 'u3', label: 'Record the plan page', startedAt: 1_000, taskId: 'r1', toolUseId: 'u3', output: OUT }], version: 1 } }
    : next(e)))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.list', () => ({ value: [] }))
  on('session.cwd', () => ({ value: '/project' }))
  on('fs.stat', (_, e) => (e.path === OUT ? { value: { kind: 'file', size: output.length, mtimeMs: 9_000, isLink: false } } : { deny: 'missing' }))
  on('fs.read', (_, e) => (e.path === OUT ? { value: output } : { deny: 'missing' }))

  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  await clock.advance(1_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const text = (await ui.find({ type: 'Box' }))?.text ?? ''
  expect(text).toContain('Record the plan page')
  expect(text).toContain('4 of 12 steps · Recording · 0:10 · background')
  await ui.unmount()
})

const notice = (id: string, inner: string) => ({
  message: { type: 'user', role: 'user', content: [{ type: 'text', text: `<task-notification>\n<task-id>${id}</task-id>\n${inner}\n</task-notification>` }] },
}) as never

test('a monitor shows its events, then a real bar once they count', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { taskId: 'm1', timeoutMs: 300_000 }, text: 'Monitor started (task m1, expires in 5m)' }))
  on('agent.list', () => ({ value: [] }))
  on('session.cwd', () => ({ value: '/project' }))
  on('fs.read', () => ({ deny: 'missing' }))
  on('fs.stat', () => ({ deny: 'missing' }))

  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Monitor', description: 'new text messages', timeout_ms: 300_000, command: 'node read-inbox.js', tool_use_id: 'u9' })
  await $.session.append(notice('m1', '<summary>Monitor event: "new text messages"</summary>\n<event>From Sara: running late</event>'))
  await clock.advance(60_000)
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  let text = (await ui.find({ type: 'Box' }))?.text ?? ''
  expect(text).toContain('naqsha · 1 monitor running')
  expect(text).toContain('Monitor: new text messages')
  expect(text).toContain('1 event · last: From Sara: running late · 1:00 of 5:00 time limit')
  await ui.unmount()

  // Events that count give the real bar instead.
  for (const n of [10, 20]) await $.session.append(notice('m1', `<summary>Monitor event: "new text messages"</summary>\n<event>read ${n} of 40 messages</event>`))
  await clock.advance(5_000)
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  text = (await ui.find({ type: 'Box' }))?.text ?? ''
  expect(text).toContain('20 of 40 messages')
  await ui.unmount()

  // The end notice removes it.
  await $.session.append(notice('m1', '<output-file>/tmp/t/tasks/m1.output</output-file>\n<status>completed</status>\n<summary>Monitor "new text messages" stream ended</summary>'))
  await clock.advance(1_000)
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Box' }))?.text ?? '').not.toContain('Monitor')
  await ui.unmount()
})

// The engine beneath, answering the calls the row makes, for the tests below.
function quietEngine(on: Parameters<Parameters<typeof test>[1]>[1], extra: { files?: Record<string, string> } = {}) {
  const files = extra.files || {}
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.list', () => ({ value: [] }))
  on('session.cwd', () => ({ value: '/project' }))
  on('fs.stat', (_, e) => (e.path in files ? { value: { kind: 'file', size: files[e.path]!.length, mtimeMs: 5, isLink: false } } : { deny: 'missing' }))
  on('fs.read', (_, e) => (e.path in files ? { value: files[e.path]! } : { deny: 'missing' }))
}

async function band($: Parameters<Parameters<typeof test>[1]>[0], working = true) {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: working } })
  const text = (await ui.find({ type: 'Box' }))?.text ?? ''
  await ui.unmount()
  return text
}

test("Claude's task list shows how many are done and what's next", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  quietEngine(on)
  let n = 0
  on('tool.call', (_, e) => (e.tool === 'TaskCreate' ? { result: { task: { id: String(++n), subject: (e as { subject: string }).subject } }, text: '' } : { result: { success: true }, text: '' }))
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  for (const subject of ['Write the tests', 'Build the send job', 'Review']) await $.tool.call({ tool: 'TaskCreate', subject, description: subject })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress', activeForm: 'Building the send job' })
  await clock.advance(5_000)
  const text = await band($)
  expect(text).toContain("Claude's task list")
  expect(text).toContain('1 of 3 done · now: Building the send job')
  expect(await band($, false)).not.toContain('task list')
})

test('a scheduled wake-up counts down, even while Claude is idle', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  quietEngine(on)
  on('tool.call', () => ({ result: { scheduledFor: 1_000_000 + 600_000, clampedDelaySeconds: 600, wasClamped: false }, text: '' }))
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'ScheduleWakeup', delaySeconds: 600, reason: 'watching CI', prompt: '/loop check CI' })
  await clock.advance(60_000)
  const text = await band($, false)
  expect(text).toContain('wakes in 9:00')
  expect(text).toContain('Next wake-up')
  expect(text).toContain('in 9:00 · watching CI')
})

test('the context window and a usage limit past half show while Claude works', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-11-17T10:00:00Z') })
  quietEngine(on)
  on('session.usage', () => ({ value: {
    startedAt: 0,
    context: { tokens: 182_000, window: 1_000_000, percent: 18 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 62, resetsAt: '2026-11-17T11:40:00Z' }, { kind: 'seven_day', percentUsed: 20 }],
  } }))
  on('tool.call', () => new Promise(() => {}))
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  void $.tool.call({ tool: 'WebSearch', query: 'hyperframes' })
  await clock.advance(5_000)
  const text = await band($)
  expect(text).toContain('Context window')
  expect(text).toContain('182k of 1M tokens · 18%')
  expect(text).toContain('5-hour usage limit')
  expect(text).toContain('62% used · resets in 1:39:55')
  expect(text).not.toContain('7-day')
})

test('a foreground command runs to where it moves to the background', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  quietEngine(on)
  on('tool.call', () => new Promise(() => {}))
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  void $.tool.call({ tool: 'Bash', command: 'npm ci', description: 'Install dependencies' })
  await clock.advance(30_000)
  const text = await band($)
  expect(text).toContain('Install dependencies')
  expect(text).toContain('0:30 · moves to the background at 2:00')
})

test('compaction shows while it runs', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  quietEngine(on)
  let done: (v: unknown) => void = () => {}
  on('session.compact', () => new Promise(resolve => { done = resolve }))
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  const compact = $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'hello', toolUses: [] }] } as never)
  await clock.advance(4_000)
  expect(await band($, false)).toContain('Compacting the conversation')
  done({ messages: [{ role: 'user', text: 'Summary of the conversation', toolUses: [] }] })
  await compact.catch(() => {})
  await clock.advance(1_000)
  expect(await band($, false)).not.toContain('Compacting')
})

test('a plan being drafted shows its answered questions and decisions', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const plan = 'window.NAQSHA = ' + JSON.stringify({
    meta: { title: 'Ledgerly: invoice reminders', status: 'draft' },
    questions: [{ status: 'answered' }, { status: 'answered' }, { status: 'open' }],
    decisions: [{ status: 'open' }],
  }) + ';\n'
  quietEngine(on, { files: {
    '/project/.naqsha/state.json': JSON.stringify({ phase: 'drafting', plansDir: 'docs/plans' }),
    '/project/docs/plans/reminders/plan.js': plan,
  } })
  on('fs.list', () => ({ value: [{ name: 'reminders', kind: 'dir', size: 0, mtimeMs: 5, isLink: false }] }))
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  await clock.advance(5_000)
  const text = await band($)
  expect(text).toContain('planning: 2 of 3 questions answered')
  expect(text).toContain('Planning Ledgerly: invoice reminders')
  expect(text).toContain('2 of 3 questions answered · 0 of 1 decisions made')
})

test("waiting on naqsha's page runs to its deadline", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const output = '@naqsha-progress {"stage":"Waiting for your answers on the page","deadline":600000}\n'
  quietEngine(on, { files: { [OUT]: output } })
  on('tool.call', () => ({
    result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'w1' },
    text: `Command running in background with ID: w1. Output is being written to: ${OUT}`,
  }))
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'node serve.js wait docs/plans/x --minutes 10', description: 'Wait for answers from the page', run_in_background: true })
  await clock.advance(120_000)
  const text = await band($, false)
  expect(text).toContain('Wait for answers from the page')
  expect(text).toContain('Waiting for your answers on the page · 8:00 left · 2:00 · background')
})
