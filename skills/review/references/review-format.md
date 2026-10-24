# review.js

`<review folder>/review.js` is one JavaScript assignment of plain JSON, so the page can load
it and scripts can parse it without running it:

```js
window.NAQSHA_REVIEW = {
  "meta": {
    "title": "Review of shopfront",
    "date": "2026-10-24",
    "commit": "a1b2c3d",
    "depth": "standard",               // quick | standard | thorough
    "purpose": "shipping soon",        // what the user said it's for; sets the ranking
    "scope": "whole repo",             // or the area or path asked for
    "areas": ["security", "tests", "dependencies", "correctness", "modularity", "data", "operability"],
    "map": "docs/plans/CODEBASE.md"
  },

  "summary": {
    "verdict": "A tidy Express app with one serious hole: order lookups aren't scoped to the signed-in user (F1).",
    "topRisks": ["F1", "F2", "F4"],    // up to 5 finding ids
    "planFirst": "F1 and F3 together: both are the missing ownership check in src/orders/",
    "strengths": [
      { "text": "Every route validates input with one zod schema per route", "where": "src/routes/orders.ts:12" }
    ],
    "notChecked": ["Performance (not in scope at standard depth)", "The admin app in admin/, which needs a VPN"]
  },

  "checks": [{
    "check": "tests",
    "command": "npm test",
    "status": "fail",                  // pass | fail | unavailable | blocked
    "result": "212 passed, 3 failed",
    "details": ["cart > applies coupon twice", "..."]   // optional, short
  }],

  "findings": [{
    "id": "F1",
    "title": "Any signed-in user can read any order",
    "area": "security",                // security | tests | dependencies | correctness | modularity | data | operability | performance | docs
    "severity": "critical",            // critical | high | medium | low
    "severityWhy": "Order ids are sequential, so every customer's address is one request away",
    "confidence": "confirmed",         // confirmed (reproduced) | likely (traced in the code, not run)
    "where": [
      { "path": "src/routes/orders.ts", "line": 48, "what": "findOrder(req.params.id) with no owner check" }
    ],
    "pattern": "",                     // when it repeats: "the same in 6 other handlers under src/routes/"
    "problem": "GET /orders/:id loads the order by id alone.",
    "failure": "Signed in as user B, GET /orders/1041 returns user A's order with their address.",
    "evidence": "Reproduced with a scratch test against the test database: 200 with A's order.",
    "rule": "secure-coding.md: authorization on every object access · OWASP A01:2025 · CWE-639",
    "fix": "Scope the lookup by the session's user id in the orders repository, and return 404 otherwise.",
    "status": "open",                  // open | dismissed | planned | fixed
    "statusNote": "",                  // the user's reason when dismissed; the plan's slug when planned
    "history": ""                      // what git blame or log showed, when it matters
  }]
}
```

- Findings are ordered by rank, with ids in that order (F1 first).
- `where.line` points at the line named in `what`, checked by reading it.
- A `confirmed` finding's `evidence` says what was run and what it showed. A `likely` one
  says what was traced.
- Keep text short: the page shows the title, severity and where first, and the rest on
  opening the finding.
