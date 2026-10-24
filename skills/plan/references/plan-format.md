# plan.js format

`<plans>/<slug>/plan.js` holds the whole plan. `index.html` next to it renders it and
re-reads it every few seconds, so the user watches it fill in. Served by `serve.js`, the
page turns open `questions` and `decisions` into a form the user answers and sends. The
approve hook parses the file, so it must be exactly:

```
window.NAQSHA = { ...strict JSON, 2-space indent... };
```

No comments, trailing commas, or code: it is read as JSON, never executed. Text fields are
plain text (rendered escaped); use `\n` for line breaks and `` `backticks` `` for code.

Any section, or any list inside one, can be `{ "na": "<one line why it doesn't apply>" }`
instead of content. A section left empty without `na` shows as unfinished.

## Fields

```jsonc
{
  "meta": {
    "title": "Password reset by email",
    "slug": "password-reset",
    "kind": "feature",              // "feature" (existing codebase) | "new-app"
    "status": "draft",              // draft -> approved (set by the hook only) -> building -> done
    "created": "2026-10-21", "updated": "2026-10-21",
    "approvedAt": null,             // set by the hook
    "developer": "1 developer, comfortable with TypeScript and Postgres, new to email delivery",
    "research": "full",             // "full" | "limited: <why, e.g. no web access>"
    "buildReview": null              // "pause" (after each step) | "run"; asked at build start
  },

  "questions": [{                    // what only the user can tell you; answered on the page or in chat
    "id": "Q1",
    "question": "How many users reset a password on a busy day?",
    "why": "Decides whether the provider's free tier is enough",   // what the answer changes
    "options": ["Under 100", "100 to 10,000", "More than 10,000"],  // optional; leave out for free text
    "multiple": false,              // true: more than one option can be picked
    "recommendation": "Under 100",  // optional, must be one of the options
    "status": "open",               // open | answered. Approval is refused while any is open.
    "answer": null                  // { "choice": ["..."], "text": "", "note": "" }, the user's words
  }],

  "summary": {
    "problem": "Users locked out of their account have to email support; 40 tickets a week.",
    "outcome": "A locked-out user resets their password in under 2 minutes without support.",
    "users": ["Registered users who forgot their password"],
    "goals": ["..."],
    "nonGoals": ["SMS reset", "Admin-initiated reset"]  // things the user agreed to leave out
  },

  "requirements": {
    "functional": [{ "id": "F1", "text": "...", "source": "user" }],  // source: user | repo | research
    "nonFunctional": [{              // quality scenarios, as system-design.md describes
      "id": "N1",
      "characteristic": "Performance efficiency",   // one of the nine ISO/IEC 25010:2023 characteristics
      "text": "A user who asks for a reset at the expected peak (2 requests/s) gets the email",  // the scenario
      "measure": "95% within 60 s",                  // required: measurable
      "priority": "must",                            // must | should | could, ranked with the user
      "source": "user",                              // required: user | repo | research; never assumed
      "verifiedBy": ["S5", "A2"]                     // required: existing step or acceptance ids
    }],
    "constraints": ["Must use the existing Postgres; no new infrastructure"]
  },

  "context": {                       // existing codebase: what is already there. new-app: "na"
    "stack": ["Next.js 15 app router", "Drizzle ORM", "Postgres 16"],
    "conventions": [{ "text": "Server actions validate input with zod schemas", "ref": "src/lib/actions/signup.ts:14" }],
    "reuse": [{ "what": "Rate limiter used on login", "ref": "src/lib/rate-limit.ts:1" }],
    "touches": [{ "path": "src/app/(auth)/login/page.tsx", "why": "add 'Forgot password' link" }],
    "architecture": [                // the system as it is, from the code
      { "text": "One Next.js app on Vercel; Postgres on Neon; no background workers", "ref": "vercel.json:1" }
    ]
  },

  "priorArt": [{                     // required: a list, or { "na": "<what was searched, found nothing comparable>" }
    "name": "Django password reset (django.contrib.auth)",
    "kind": "open-source",           // open-source | product | write-up | standard
    "url": "https://github.com/django/django/blob/main/django/contrib/auth/tokens.py",
    "howItWorks": "Stateless HMAC token over user id, password hash and last login, so it dies on use or password change ...",
    "evidence": "Runs on thousands of production sites since 2005; security-reviewed; CVE history shows ...",
    "verdict": "learn from",          // adopt | learn from | avoid
    "why": "Different stack, but the invalidate-on-password-change design is what we want",
    "takeaways": ["Token must die when the password changes", "Same response for unknown emails"]
  }],

  "research": [{
    "topic": "Reset token design",
    "finding": "OWASP recommends single-use, time-limited random tokens stored hashed ...",
    "sources": [{ "title": "OWASP Forgot Password Cheat Sheet", "url": "https://...", "accessed": "2026-10-21" }]
  }],

  "decisions": [{
    "id": "D1",
    "question": "How do we send email?",
    "options": [
      { "name": "Transactional provider (Postmark)", "pros": ["..."], "cons": ["..."] },
      { "name": "Own SMTP server", "pros": ["..."], "cons": ["..."] }
    ],
    "recommendation": "Transactional provider (Postmark)",
    "why": "...",
    "drivers": ["N1", "N3"],          // the requirements and constraints this choice serves
    "consequences": "Good: deliverability handled. Bad: a monthly cost and a vendor to depend on.",
    "confirmation": "Delivery-time check in S5 meets N1",  // how we'll know it was right
    "status": "open",               // open | decided. Approval is refused while any is open.
    "choice": null,                 // the option the user picked (may differ from recommendation)
    "decidedBy": null,              // "user" | "user accepted recommendation"
    "note": ""                      // the user's reasoning or conditions, in their words
  }],

  "architecture": {
    "overview": "Two server actions and one table ...",
    "style": { "existing": "Modular monolith: one Next.js app" },   // required: or { "decision": "D2" }, an existing decided decision
    "estimates": [{                  // the arithmetic behind the scale, from sourced numbers
      "what": "Peak reset requests",
      "value": "2 per second",
      "math": "3,000/day (Q2) / 86,400 s x peak factor 50 (Q3) = 1.7/s"
    }],
    "diagrams": [                    // C4 views that add something; Mermaid
      { "view": "container", "title": "Containers", "mermaid": "flowchart LR\n  U[User] --> W[Next.js app]\n  W --> DB[(Postgres)]" }
    ],                               // view: context | container | component | dynamic | deployment
    "diagram": "flowchart LR\n  ...",  // older single diagram; still rendered
    "hotPaths": [{                   // where cost matters; everything else is built for clarity
      "flow": "Monthly order export",
      "size": "20,000 rows (E1)",                     // from the estimates
      "budget": "Download starts within 5 s (N1)",    // from a quality scenario
      "approach": "One query on the (store_id, created_at) index, streamed with a cursor: O(n) time, O(1) memory, 1 query",
      "provedBy": "S3"                                // the step whose benchmark meets the budget
    }],
    "components": [{                 // modules, as modularity.md defines them
      "name": "reset module",
      "responsibility": "Issue and redeem password reset tokens",   // one sentence, no "and" joining two jobs
      "interface": "requestReset(email) -> void; redeem(token, newPassword) -> Result",  // what callers use
      "hides": "token format, hashing, expiry rules, storage",       // decisions only this module knows
      "uses": ["users module", "mailer module"],                      // dependencies, pointing inward
      "location": "src/auth/reset/",
      "new": true                     // new modules must have responsibility and interface
    }],
    "dataModel": [{ "entity": "password_reset_tokens", "fields": "id, user_id FK, token_hash, expires_at, used_at", "notes": "index on token_hash" }],
    "interfaces": [{ "name": "POST /reset", "contract": "{ email } -> 202 always (no account enumeration)", "notes": "" }]
  },

  "security": {
    "assets": ["User accounts", "Reset tokens"],
    "boundaries": ["Browser -> server action", "Server -> email provider"],
    "threats": [{
      "id": "T1",
      "threat": "Attacker enumerates registered emails via different responses",
      "category": "Information disclosure",     // STRIDE category
      "mitigation": "Same 202 response and timing whether or not the email exists",
      "step": "S2",                             // the step that builds the mitigation; must exist
      "ref": "ASVS V6 / OWASP Forgot Password Cheat Sheet",
      "acceptedBy": null,                       // "user" only when the user accepted the risk instead
      "acceptedReason": ""                      // their reason, in their words
    }]
  },                                 // or { "na": "<why no flow here crosses a trust boundary>" }; required

  "quality": {                       // each list item is one concrete, checkable line
    "errors": ["Email provider down: queue nothing, show generic 'check your email', log at error"],
    "observability": ["..."],
    "performance": ["..."],
    "accessibility": { "na": "No UI changes" },   // any sub-list can be replaced by na too
    "migration": ["Additive migration; rollback = drop table, no data loss"],
    "failureModes": [{               // one row per dependency
      "dependency": "Postmark", "failure": "API down or slow",
      "effect": "Reset email delayed", "handling": "5 s timeout; show 'check your email'; retry from a job, idempotency key per token"
    }],
    "slos": [{ "sli": "Reset emails delivered within 60 s", "target": "95% over 28 days", "from": "N1" }],
    "operations": ["Deploy by Vercel preview then promote; rollback = promote previous build"],
    "cost": ["Postmark: 10,000 emails/month plan, $15 (pricing page, accessed 2026-10-24)"]
  },

  "dependencies": [{
    "name": "postmark", "version": "4.0.5", "why": "...", "license": "MIT",
    "health": "Released 2026-09, 2 maintainers, no open advisories (OSV checked 2026-10-21)",
    "insteadOf": "Hand-rolled SMTP client"
  }],                                // new dependencies only; [] when none

  "testing": {
    "strategy": ["Unit: token hashing and expiry", "Integration: full reset flow against test DB", "..."],
    "seams": [{                      // required: where tests go, agreed with the plan
      "seam": "reset module: requestReset(), redeem()",
      "catches": "token expiry, single use, hashing, enumeration-safe responses",
      "misses": "email delivery; covered by the mailer contract test"
    }],
    "acceptance": [{ "id": "A1", "text": "Given an expired token, reset is refused and the user is offered a new email" }],
    "runIt": {                       // required: how the build runs the real app like a user
      "data": "docker compose up -d db && npm run db:migrate && npm run db:seed",  // test data only
      "start": "npm run dev",
      "ready": "curl -fsS http://localhost:3000/api/health",
      "drive": "browser",            // browser | http | cli | job
      "stop": "Ctrl-C, then docker compose down",
      "notes": "Uses the Postmark sandbox token from .env.example; never production"
    },                               // or { "na": "<why nothing runs, e.g. a library: its examples run instead>" }
    "securityChecks": [              // required: what the build runs on every step
      { "check": "Security tests", "command": "npm test -- --grep security", "when": "every step" },
      { "check": "Static analysis (Semgrep, OWASP rules)", "command": "semgrep scan --config p/owasp-top-ten --error", "when": "every step" },
      { "check": "Dependency audit", "command": "npm audit --audit-level=moderate", "when": "when dependencies change, and at the end" },
      { "check": "Secret scan", "command": "gitleaks git --log-opts=main..HEAD", "when": "every step" }
    ]
  },

  "steps": [{
    "id": "S1",
    "title": "Token table and migration",
    "detail": "...",
    "files": ["drizzle/0012_reset_tokens.sql", "src/db/schema.ts"],
    "tests": [                      // required: the failing tests this step starts from, in order
      { "test": "Migration applies and rolls back on an empty database", "kind": "integration", "seam": "migrations" },
      { "test": "Two tokens with the same hash can't both be stored", "kind": "integration", "seam": "reset module" }
    ],                              // kind: acceptance | security | regression | characterization | unit | integration | property | contract
                                    // or { "na": "<why no test can come first>" }, with doneWhen naming the replacement check
    "standards": ["data-and-apis"],  // build references this step needs beyond the always-loaded ones:
                                    // performance | data-and-apis | operability | docs-and-setup | run-like-a-user
    "doneWhen": "Migration applies and rolls back cleanly on a copy of prod schema; schema test passes",
    "estimate": { "low": 1, "likely": 2, "high": 4 },    // human developer hours, required
    "dependsOn": [],
    "status": "todo",               // todo | doing | done | blocked
    "notes": ""                     // build evidence: commands run, results, commit
  }],

  "risks": [{ "risk": "...", "likelihood": "medium", "impact": "high", "mitigation": "..." }],

  "rejected": [{ "option": "Magic-link login instead of reset", "why": "User wants passwords kept (D3)" }],

  "changelog": [{ "date": "2026-10-21", "change": "Plan drafted", "by": "claude" }]  // by: claude | user
}
```

## Rules the page and hook rely on

- `meta.status` is `draft` while planning. Never set it to `approved`; the hook does that
  when the user runs `/naqsha:approve`. During the build set `building`, then `done`.
- Approval is refused while a non-functional requirement lacks a `measure`, a `source` of
  `user`, `repo` or `research`, or a `verifiedBy` naming existing steps or acceptance
  criteria, or while `architecture.style` is missing (it must name an existing decided
  decision, or describe the existing style).
- Approval is refused while `security` is missing, while a threat has neither a
  mitigation with an existing `step` nor `acceptedBy: "user"` with a reason, while
  `testing.securityChecks` is empty, while `testing.runIt` has no `start` and `drive`
  (or `na` with a reason), while `testing.seams` is empty, while a step has no
  `tests` (a list, or `na` with a reason), or while a new component lacks a
  `responsibility` or `interface`.
- Approval is refused while `priorArt` is empty (a list with entries, or `na` naming what was
  searched), while any question is not `answered` or any decision is not `decided`, or any step lacks an estimate
  (`low <= likely <= high`, hours, all > 0) or a `doneWhen`.
- Ids are stable: `Q` questions, `F`/`N` requirements, `D` decisions, `T` threats, `S` steps, `A`
  acceptance. Refer to them across sections ("see D2") instead of repeating text.
- After approval, changes go in `changelog` with `by` naming who decided.
