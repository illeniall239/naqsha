# plan.js format

`<plans>/<slug>/plan.js` holds the whole plan. `index.html` next to it renders it and
re-reads it every few seconds, so the user watches it fill in. The approve hook parses it,
so the file must be exactly:

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

  "summary": {
    "problem": "Users locked out of their account have to email support; 40 tickets a week.",
    "outcome": "A locked-out user resets their password in under 2 minutes without support.",
    "users": ["Registered users who forgot their password"],
    "goals": ["..."],
    "nonGoals": ["SMS reset", "Admin-initiated reset"]  // things the user agreed to leave out
  },

  "requirements": {
    "functional": [{ "id": "F1", "text": "...", "source": "user" }],  // source: user | repo | research
    "nonFunctional": [{ "id": "N1", "text": "Reset email arrives", "target": "p95 < 60 s" }],
    "constraints": ["Must use the existing Postgres; no new infrastructure"]
  },

  "context": {                       // existing codebase: what is already there. new-app: "na"
    "stack": ["Next.js 15 app router", "Drizzle ORM", "Postgres 16"],
    "conventions": [{ "text": "Server actions validate input with zod schemas", "ref": "src/lib/actions/signup.ts:14" }],
    "reuse": [{ "what": "Rate limiter used on login", "ref": "src/lib/rate-limit.ts:1" }],
    "touches": [{ "path": "src/app/(auth)/login/page.tsx", "why": "add 'Forgot password' link" }]
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
    "status": "open",               // open | decided. Approval is refused while any is open.
    "choice": null,                 // the option the user picked (may differ from recommendation)
    "decidedBy": null,              // "user" | "user accepted recommendation"
    "note": ""                      // the user's reasoning or conditions, in their words
  }],

  "architecture": {
    "overview": "Two server actions and one table ...",
    "diagram": "flowchart LR\n  U[User] --> A[requestReset action]\n  ...",  // Mermaid; optional
    "components": [{ "name": "requestReset action", "responsibility": "...", "new": true }],
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
      "step": "S2",                             // the step that implements the mitigation
      "ref": "ASVS V6 / OWASP Forgot Password Cheat Sheet"
    }]
  },

  "quality": {                       // each list item is one concrete, checkable line
    "errors": ["Email provider down: queue nothing, show generic 'check your email', log at error"],
    "observability": ["..."],
    "performance": ["..."],
    "accessibility": { "na": "No UI changes" },   // any sub-list can be replaced by na too
    "migration": ["Additive migration; rollback = drop table, no data loss"]
  },

  "dependencies": [{
    "name": "postmark", "version": "4.0.5", "why": "...", "license": "MIT",
    "health": "Released 2026-09, 2 maintainers, no open advisories (OSV checked 2026-10-21)",
    "insteadOf": "Hand-rolled SMTP client"
  }],                                // new dependencies only; [] when none

  "testing": {
    "strategy": ["Unit: token hashing and expiry", "Integration: full reset flow against test DB", "..."],
    "acceptance": [{ "id": "A1", "text": "Given an expired token, reset is refused and the user is offered a new email" }]
  },

  "steps": [{
    "id": "S1",
    "title": "Token table and migration",
    "detail": "...",
    "files": ["drizzle/0012_reset_tokens.sql", "src/db/schema.ts"],
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
- Approval is refused while `priorArt` is empty (a list with entries, or `na` naming what was
  searched), while any decision is not `decided`, or any step lacks an estimate
  (`low <= likely <= high`, hours, all > 0) or a `doneWhen`.
- Ids are stable: `F`/`N` requirements, `D` decisions, `T` threats, `S` steps, `A`
  acceptance. Refer to them across sections ("see D2") instead of repeating text.
- After approval, changes go in `changelog` with `by` naming who decided.
