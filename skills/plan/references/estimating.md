# Estimating

Estimates are for a human developer doing the work, not for how fast an AI can write code.
The user uses them to decide scope and schedule, so an optimistic number hurts them more
than a candid range.

## Who the estimate is for

Use `meta.developer`, which comes from the interview: how many people, their experience with
this stack, and any part of the work that is new to them. An expert in the codebase and a
newcomer to the framework can be 3x apart on the same step. If you don't know, ask; don't
assume a senior developer.

## Per step

- Give hours as `low` / `likely` / `high`:
  - **low**: everything goes right.
  - **likely**: the normal amount of friction.
  - **high**: the plausible bad case, such as an API that behaves differently from its
    docs, a failing migration, or a review that sends it back.
- A step includes everything needed to meet its `doneWhen`: writing the code, the tests,
  local verification, fixing what review finds, and the docs the step needs.
- Uncertainty widens `high`; it doesn't raise `likely`. A step whose high is more than 4x its
  low is really two steps, or has an unknown that should be a spike step of its own
  ("S0: prove the provider's webhook signature works with our framework, 2–4 h").
- Steps larger than about 2 days (likely) get split. Large steps hide most estimation error.

## Totals

The page computes the expected total as Σ (low + 4·likely + high) / 6 (PERT), plus the full
range. Also state what the total leaves out, in `risks` or the step details. Examples:
waiting on third-party approval, app store review, design work, stakeholder sign-off,
calendar time and hours that aren't spent coding.

## Calibration

- Compare with things the user has built before, if they told you. Adjust to their pace.
- First-time integration with an external service: at least half a day before anything
  works end to end (keys, sandbox, webhooks, local tunneling).
- Auth, payments, data migrations and anything concurrent are underestimated more than
  anything else. Be honest about their high end.
- Don't pad every step "to be safe". Put the uncertainty where it actually is.
