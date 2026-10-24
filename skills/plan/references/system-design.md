# System design: derived from this application, never assumed

AI plans fail at system design in two opposite ways: they reach for a stock architecture
(microservices, Kubernetes, a queue, a cache) for a tool twenty people use, or they pile
everything into one file for a system that has to survive a region outage. Both come from
the same mistake: the structure was chosen before the drivers were known. Here the drivers
come first, every one from the user, the repository or a cited source, and every structural
choice traces back to one.

Standards this follows (as of October 2026; check for revisions when you research):
ISO/IEC 25010:2023 (product quality model), the SEI quality attribute scenario and ATAM
(Bass, Clements and Kazman, *Software Architecture in Practice*), the C4 model, MADR 4.0
decision records, the AWS, Azure and Google Cloud Well-Architected frameworks, Google's SRE
book on service level objectives, and Twelve-Factor, an open community project since
November 2024.

## No assumptions

- **Every number comes from somewhere you can name.** Users, requests per second, data
  size and growth, latency, availability, recovery point and time, budget: from the user,
  from the repository (configs, existing metrics, data volumes), or from research with a
  source. A "typical" value is not a source.
- **Every structural premise too.** Cloud or not, which vendor and region, multi-tenant or
  not, real-time or not, offline support, mobile clients, compliance regimes, who operates
  it. If the repo and the user haven't said, it's a question.
- **An unknown is a question, never a default.** Ask it in a round on the page with your
  proposed value as the `recommendation` and the reason, so the user can accept it in
  one click. Then it's their number, recorded with `source: "user"`.
- **If the user doesn't know,** say what the choice depends on, propose the value that keeps
  the most options open for the least cost, and record it as their decision.

## Method

Work in this order. Each step feeds the next; skipping ahead is how a structure gets assumed.

### 1. Context: what exists and what it talks to

- **Existing codebase:** before designing anything, write down the architecture as it is,
  from the code: deployables, data stores, integrations, how it's hosted and deployed, with
  `file:line` references in `context.architecture`. The new design fits into that unless a
  decision says otherwise.
- **Both:** who and what interacts with the system (people, other systems, schedulers,
  webhooks). That's the C4 system context.

### 2. Drivers: what the design must achieve

- **Quality scenarios.** Go through the nine ISO/IEC 25010:2023 characteristics with the
  user and keep the ones that matter: functional suitability, performance efficiency,
  compatibility, interaction capability, reliability, security, maintainability,
  flexibility, safety. Write each as a scenario with a measurable response (SEI): *source*
  (who or what), *stimulus* (what happens), *artifact* (which part), *environment* (normal
  load, peak, a dependency down), *response*, *measure*. "Fast" is not a requirement; "at
  the expected peak of 200 requests per second, 95% of searches return within 300 ms" is.
- **Priority.** Ask the user to rank them. The top three to five drive the architecture;
  the rest are checked against it.
- **Constraints.** What's fixed: stack, hosting, budget, deadline, team size and skills,
  regulation, systems that must stay.
- Record scenarios in `requirements.nonFunctional`, each with its source and how it will
  be verified.

### 3. Estimates: the arithmetic behind the scale

From the user's numbers, work out what the design has to carry: peak requests per second
(daily volume ÷ 86,400 × the peak-to-average ratio the user gave), reads versus writes,
storage after one and three years, bandwidth, the size of the largest batch job. Show the
inputs and the arithmetic in `architecture.estimates`. These numbers either justify scaling
machinery or rule it out.

Constants inside the arithmetic count as numbers too. A row size, a payload size, or a
peak-to-average ratio comes from the user, from measuring the repository's data (the schema,
a sample row, an existing log), or from a cited benchmark. Name which next to it, as in
"~200 bytes per row (measured on a sample of 1,000 rows from `orders`)".

### 4. Decisions: options weighed against the drivers

For each architecturally significant choice, offer two to four real options and weigh each
against the prioritized drivers (MADR 4.0): which `drivers` it serves, its `consequences`
good and bad, and its `confirmation` (how we'll know it was right: a load test, a failover
drill). The user decides. The usual significant choices:

| Choice | Decide from |
|--------|-------------|
| Architecture style: one deployable, modular monolith, a few services, serverless, event-driven | Team size and ownership, independent scaling or deployment needs, isolation or compliance needs, operations skill. Recommend the simplest style that meets the drivers. Fowler's MonolithFirst observes that most successful microservice systems began as a monolith that was split once its boundaries were known. Present the counter-case when a driver really calls for separate services from day one. |
| Data store | Access patterns, consistency needs, data shape, volume from the estimates, what the team already runs. |
| Consistency and transactions | Which operations must never be seen half-done, where users need to read their own writes, what can be eventually consistent. |
| Communication: synchronous or asynchronous | Whether the caller needs the answer now, long-running work, spikes to absorb, failure isolation. |
| API style and versioning | Who the clients are and how they upgrade. |
| Hosting and deployment | Constraints, budget, operations skill, the availability scenario. |
| Identity | Who signs in, single sign-on needs, compliance. |
| Tenancy | Isolation needs per customer, data residency, noisy-neighbor risk. |

### 5. Cross-cutting review: the Well-Architected pillars

Check the design against the pillars the three cloud frameworks share. Write concrete
lines, each tied to a driver, in the `quality` section.

- **Reliability.** For each dependency, fill in `quality.failureModes`: what fails, what
  the user sees, how it's handled (timeout, retry with backoff and jitter only for
  idempotent operations, idempotency keys, a fallback, degraded mode). Backups, and a
  restore that's been tested, against the recovery point and time the user gave. Service
  level objectives (SRE): indicators users notice, targets from the user, never 100%.
- **Performance efficiency.** A latency budget for each key flow, checked against the
  estimates. List the hot paths in `architecture.hotPaths`: the flows whose input size or
  frequency makes cost matter, each with its size, its budget, the approach (queries,
  round trips, memory and complexity at that size, per
  `${CLAUDE_PLUGIN_ROOT}/skills/build/references/performance.md`) and the step whose
  benchmark proves it. Everything not listed is built for clarity. Work moves off the
  request path only when a scenario needs it.
- **Operational excellence.** How it deploys and rolls back, how migrations run,
  configuration in the environment, stateless processes, development close to production
  (Twelve-Factor). Logs, metrics and traces (OpenTelemetry where the stack supports it),
  alerts on the objectives, not on every metric.
- **Security.** `security.md` and `secure-coding.md`.
- **Cost.** A monthly estimate at the expected load, from the vendors' current pricing
  pages (cite and date them), against the user's budget.
- **Sustainability.** No idle capacity the drivers don't need.
- **Maintainability and flexibility.** `modularity.md`. Ask the user what is likely to
  change, and hide each of those behind one module.

### 6. Views: what goes on the page

Mermaid diagrams in `architecture.diagrams`, only the ones that add something (the C4
model's own advice: context and container diagrams are enough for most teams):

- **Context**: for a new system, or when the change adds an outside system.
- **Container**: whenever there is more than one deployable or data store.
- **Component**: only where a module's structure isn't obvious from `components`.
- **Dynamic (sequence)**: the one to three flows the top drivers depend on.
- **Deployment**: when hosting is part of the plan.

### 7. Verification: each scenario gets a check

Every quality scenario names how it will be shown: a test, a load test against the
measure, a failover or restore drill, an alert on the objective. That check is in a step or
an acceptance criterion (`verifiedBy`). A scenario nobody checks is a wish. These are the
architecture's fitness functions (Ford, Parsons and Kua, *Building Evolutionary
Architectures*).

## What needs a driver

Each of these adds operating cost and failure modes. Include one only when you can name the
driver that needs it, and put that driver in the decision.

| Adding | Needs |
|--------|-------|
| A second deployable or service | Independent scaling or deployment, separate team ownership, isolation or compliance, or a different runtime. Not "cleaner code": modules give you that. |
| A message queue or event bus | Work that outlives the request, spikes the estimates say the system must absorb, or consumers that must not block the producer. |
| A cache | A latency or load target the estimates show the store can't meet, plus a plan for invalidation and staleness. |
| A second data store | An access pattern the first one can't serve within a scenario's measure. |
| Kubernetes or another orchestrator | Several services, scaling needs the platform's simpler options can't meet, and people to operate it. |
| Event sourcing or CQRS | An audit or temporal-query requirement, or read and write loads the estimates show diverging sharply. |
| Multi-region | An availability or latency scenario that one region can't meet, or data residency. |

## In an existing codebase

- The as-is architecture from step 1 is the starting point, and the design fits it.
- Changing the architecture (a new store, splitting a service, a new style) is a decision
  with a migration path: incremental, behind the existing interface where possible (the
  strangler fig pattern), each step leaving the system working.
- A feature that changes no driver gets a short section: which parts it touches, and one
  line saying the drivers are unchanged and why.

## Warning signs

- A component no driver asks for.
- Numbers with no source, or "scalable" and "highly available" with no measure.
- Services that share one database, or must deploy together (a distributed monolith).
- Eventual consistency where a user expects to see their own change.
- A dependency with no entry in the failure modes.
- A cost nobody estimated.
