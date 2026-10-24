# Reliability: correct when things fail, race and pile up

Code that works when one request runs alone, every dependency answers and nothing crashes
halfway is the easy part. Production runs requests at the same time, loses processes
mid-write, and has dependencies that slow down instead of failing. The usual slop: "save,
then publish" with nothing tying the two together, check-then-act on shared state, a cron
job that runs on every server, retries that turn one outage into three, and a cache that
shows one user another's data.

This applies to a step that writes to more than one system (a database and a queue, an
email, another service), runs concurrent writes, schedules jobs, calls a dependency on a
hot path, or adds a cache. The plan's `quality.failureModes` says how each dependency fails;
this is how the code survives it.

## Writing to two systems

A process can die between any two lines. So a database write followed by a publish, an
email or a call to another service will, some day, do one without the other.

- **Transactional outbox.** Write the event to an `outbox` table in the same transaction as
  the change. A relay sends it afterwards and marks it sent, retrying until it succeeds.
  The change and the intent to tell others commit together or not at all.
- **Delivery is at least once, so consumers are idempotent.** Record each processed
  message id (an inbox table with a unique constraint), or make the effect idempotent by
  its natural key, in the same transaction as the effect. A duplicate is then a no-op.
- **Order only where it's needed,** by a key (all events for one order through one
  partition), not globally.
- **A workflow across services is a saga:** each step has a compensating action (refund
  the payment, release the stock), the saga's state is stored, and every step and every
  compensation is idempotent. There is no distributed transaction to lean on.
- **"Exactly once" isn't a thing you get from a broker.** At-least-once delivery plus
  idempotent handling is.

## Concurrency

Two requests, two workers or two servers will do the same thing at the same moment.

- **Never check, then act.** "Read the balance, then debit if enough" lets two debits
  through. Make it one atomic operation: a conditional update (`UPDATE … SET balance =
  balance - $1 WHERE id = $2 AND balance >= $1`, then check rows affected), a unique
  constraint, or a row lock (`SELECT … FOR UPDATE`) inside the transaction.
- **Counters and totals** are updated in place (`SET n = n + 1`), never read, changed in
  memory and written back.
- **Locks across processes** (Redis, the database, a coordination service) have a lease
  that expires, so a crashed holder doesn't block forever. Where acting after the lease
  ran out would corrupt data, pass a fencing token (a number that increases with each
  lease) and have the storage reject older ones.
- **Scheduled jobs run once,** not once per server: a database advisory lock or a lease
  per run, or a scheduler that guarantees one runner. A run that overlaps the previous one
  skips or waits, on purpose. Each run is idempotent and records how far it got, so a
  crash resumes instead of redoing everything.
- **Shared in-process state** (a module-level cache, a counter, a connection) is either
  immutable or guarded, and the plan says which.
- **Test it.** Each invariant that concurrency can break gets a test that runs the
  operation in parallel (two at once, a few hundred times) and checks the invariant holds.

## Under load and failure

A slow dependency is worse than a dead one: it ties up every request waiting on it.

- **Timeouts everywhere,** from the plan's latency budget, not the library default.
  **Deadlines travel:** a request's remaining time goes to each call it makes, so nothing
  downstream works on a request the user already gave up on.
- **Retry only what's safe, in one place.** Only idempotent operations (or ones with an
  idempotency key), with exponential backoff and jitter, a maximum number of attempts, and
  only on errors that can pass (timeouts, `503`, `429` honoring `Retry-After`), never on
  `400` or `403`. Retry at one layer: retries at every layer multiply into a storm. Cap
  retries as a share of traffic (a retry budget) so a failing dependency gets less load,
  not more.
- **Circuit breaker** on each dependency a hot path calls: after enough failures, stop
  calling it for a while and fail fast (or use the fallback), then let a trial request
  through. Use the stack's maintained library (resilience4j, Polly, opossum, …), not a
  hand-rolled one.
- **Bulkheads:** a separate, bounded pool (connections, workers, concurrency limit) per
  dependency, so one slow service can't take every thread.
- **Shed load instead of falling over.** Queues and concurrency are bounded. When full,
  reject early with `503` or `429` and `Retry-After`, cheapest checks first, instead of
  queueing until memory runs out or every request times out. Background work gets
  backpressure: the producer slows down when the consumer falls behind.
- **Degrade, don't fail whole.** Each failure mode in the plan says what the user still
  gets (cached data marked as stale, the feature hidden, the write queued). Build that
  path and test it with the dependency faked to fail and to hang.

## Caching

A cache trades freshness and memory for speed. The plan says why it's there
(`system-design.md`); this is how it doesn't bite.

- **The key holds everything the value depends on:** the user or tenant, the permissions
  or role when they change the result, the locale, the version of the data. A key missing
  the user is a data leak, not a performance bug.
- **Every entry expires** (a TTL from how stale the plan says it may be), and the code that
  changes the data invalidates or updates what it changed. Say which is the source of
  truth, and never write to the cache in place of it.
- **Stampedes:** when a popular entry expires, one caller recomputes it while the others
  wait or get the stale value (request coalescing, a short lock, or refresh ahead of
  expiry), and TTLs get a little jitter so they don't all expire at once.
- **Bounded:** a size limit and an eviction policy (`performance.md`).
- **Never cache** authorization decisions beyond the request, secrets, or error responses
  as if they were results (cache a miss only on purpose, briefly).
- The service works, slower, with the cache empty or down.

## Review

- If the process dies between these two writes, what's left, and who fixes it?
- What happens when this message is delivered twice, or this job runs on two servers?
- Can two of these requests at once break an invariant? Where's the test?
- What does a user see when this dependency hangs for 30 seconds? Does anything else slow
  down with it?
- Whose data could this cache key return to whom?
