# Operability: code someone can run, watch and fix at 3 a.m.

The plan's system design decides what to observe and how to deploy. This makes the code do
it. The usual slop: print statements, errors swallowed or logged five times, no way to tell
why one request failed, a deploy that drops requests in flight, and a missing setting
discovered the first time a user hits that path.

## Configuration

- Read once at startup in one config module (`modularity.md`), validated against a schema.
  A missing or invalid value stops startup with a message that names the variable. Fail
  at boot, not on the first request that needs it.
- Secrets come from the environment or a secret manager (`secure-coding.md`). Every
  variable is listed in `.env.example` with a one-line description and a safe placeholder.
- No `if production` branches in the code; behavior that differs by environment is
  configuration.

## Logs

- Structured (the stack's structured logger, one event per line), with levels that mean
  something:
  - **error:** someone needs to act
  - **warn:** degraded but working
  - **info:** lifecycle and business events
  - **debug:** off in production
- Every line written while handling a request carries its request or trace id.
- Log what explains a decision (the ids involved, the branch taken), never secrets,
  tokens or personal data that isn't needed.
- An error is logged once, where it's handled, with its stack trace; layers in between
  add context and pass it on.

## Traces and correlation

- Create a request id at the edge, and accept and pass on W3C Trace Context
  (`traceparent`) across HTTP calls and queue messages. Use OpenTelemetry where the project
  or the plan does.

## Metrics

- The indicators behind the plan's `slos`: request rate, errors and latency per route as
  histograms. Saturation for pools and queues. Any business counters the plan names.
- Labels have bounded values: never a user id or a raw URL as a label.

## Health and lifecycle

- **Liveness** says the process is alive and checks no dependencies (otherwise one slow
  database restarts everything). **Readiness** says it can serve: database reachable,
  migrations applied. Add a **startup** check if boot is slow. Health endpoints don't leak
  internals publicly.
- **Graceful shutdown** on `SIGTERM`: stop accepting work, finish what's in flight within a
  timeout, close pools, flush logs and telemetry. A worker finishes or requeues its current
  job.
- Every outbound call has a timeout, every pool a bound.

## Background work

- Jobs scheduled in users' local time ("9:00 every day") are stored as the local time
  and the zone name, and computed with a time-zone library, so daylight saving changes
  neither skip nor double them. Jobs that run once and on one server: `reliability.md`.
- Jobs are idempotent, so a retry after a crash is safe. Retries use backoff and have a
  maximum; poison messages go to a dead-letter queue. Queue depth and the age of the oldest
  message are metrics.

## Releasing

- Risky changes the plan marks go behind a feature flag, so release is separate from deploy
  and there's a kill switch. Each flag has an owner and a later step that removes it.
- Code rolls back without data loss, because migrations are expand-and-contract
  (`data-and-apis.md`).
- Alerts fire on symptoms users feel (the objectives), not on every metric, and on how
  fast the error budget burns (the failures each objective allows in its window): page on
  a fast burn, ticket on a slow one. Each alert has a runbook entry (`docs-and-setup.md`).
- A spent error budget is a signal to the user: slow down risky releases and spend the
  time on reliability. Say so when you report a step that would ship while it's spent.

## Review

- If this fails in production, can someone tell why from the logs, metrics and traces alone?
- Does a bad or missing setting stop startup with a clear message?
- What happens to work in flight when the process gets `SIGTERM`?
- Is anything logged that shouldn't be, or anything important logged nowhere?
