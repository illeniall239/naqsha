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
