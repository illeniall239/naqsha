# Independent review

The engineer who wrote the code misses the same things in review that they missed while
writing it. You are that engineer. So before a step is marked done, a reviewer with fresh
context and no stake in the code checks it against the plan and the standards, reruns the
checks the notes claim pass, and reports only failures it can show.

## When

A review costs a fresh agent, so it goes where a second pair of eyes matters most. The
step's working set (`plan-tool.js step`) says whether this step needs one, and why:

- **light** effort: steps that build a threat mitigation.
- **standard** (the default): those, plus steps that change data or an API and steps that
  prove a hot path.
- **thorough**: every step.

When it's required, run it after your own review (`code-quality.md`) and before you set
the step `done`. When it isn't, your own review is the check, and you say so in the notes.
**At the finish, always:** a separate review of the whole change against the whole plan,
whatever the effort.

## How

1. Note the commit or diff range the step covers (for example, the commit before the step
   started, through the working tree).
2. Start a fresh subagent (the Agent tool, general-purpose) with the reviewer brief below,
   filling in the bracketed parts. Don't set `model`: the review is where security and
   correctness are caught, so it runs on the session's model. Name it as the working set's
   "Names" section says ("Iris · review S2"), and tell the user who is reviewing. Give it pointers, not your opinion of the code. Don't tell
   it what you think is fine.
3. When it reports, sort the findings:
   - **Blocking** (security, correctness, missing or hollow tests, a deviation from the
     plan, a claimed check that doesn't reproduce): fix it. A behavior bug gets a failing
     test first (`tdd.md`). Then rerun the step's checks.
   - **Disputed:** if you believe a finding is wrong, answer it with evidence (a test, a
     command's output, the plan's text), not an argument.
   - **Non-blocking:** fix it if it's cheap and inside the step; otherwise list it in the
     notes for the user.
4. Send the fixes and rebuttals back to the same reviewer (SendMessage) for a re-check.
   Repeat until it reports no blocking findings. After three rounds, or if you and the
   reviewer still disagree, stop and bring it to the user with both sides.
5. In the step's notes: the verdict, the number of rounds, each finding and what happened
   to it (fixed, rebutted with evidence, or left for the user), and what the reviewer said
   it didn't check.

If you can't start a subagent in this session, review the diff again yourself as a
stranger to it, top to bottom against the brief, and say in the notes that the review wasn't
independent. Never skip it silently.

## Reviewer brief

```
You are [name], reviewing one step of an approved plan. You review; you don't build. Don't edit
any file. You may read anything and run read-only commands, tests and checks.

Step: [S#] of [plan folder]/plan.js. Get its working set first:
node [plugin root]/scripts/plan-tool.js step [plan folder]/plan.js [S#]
It has the step's text, tests, doneWhen, the threats and quality scenarios it owns, the
hot paths it proves, the modules it touches and one line per decision. Open plan.js only
for something it doesn't carry, and read just that part.
Project learnings, if any: [plans folder]/LEARNINGS.md.
Change under review: [git diff command for the step's range].
Standards: the references the working set lists under "References to read", in
[plugin root]/skills/build/references/. Read only those.

Check, in this order:
1. Scope: does the diff do what the step says, all of it, and nothing else? Anything the
   plan didn't ask for: a dependency, a layer, an option, unrelated edits, or existing code
   "fixed" on the side. Every existing caller the working set lists for this step is
   updated, or still works as the plan says; search for callers it missed.
2. Secure: every secure-coding.md rule the diff touches; grep it for the red flags listed
   there; each threat mitigation this step owns is built and has a test that fails without
   it.
3. Correct: edge cases from the plan, every caller of anything whose behavior changed,
   errors handled where something can be done about them.
4. Test-first: tests exist for every behavior, at the seams the plan agreed, with red runs
   recorded in the step's notes. Are the tests real? Break the code on purpose for one or
   two key tests and confirm they fail, then restore it exactly.
5. Modular: answer the review questions in modularity.md for each module touched.
6. Performance: hot paths meet performance.md; no traps that grow quietly.
7. Contracts and operations: the review questions in data-and-apis.md, operability.md and
   docs-and-setup.md, for whatever the diff touches (a migration that breaks the running
   version, an endpoint off the contract, a setting not checked at startup, docs left
   behind).
8. Evidence: rerun the step's doneWhen checks and security checks. Does every pass
   claimed in the notes reproduce? Where the working set has a baseline, compare by name:
   anything failing now that isn't in it is this step's. Was the app walked as run-like-a-user.md requires?

Report:
- Verdict: PASS (no blocking findings) or FAIL.
- Each finding: file:line; what is wrong; a concrete failure case (this input or situation
  leads to this wrong result); blocking or not; how you verified it (the command you ran,
  or the code you read). A finding with no concrete failure case is a question; label it
  as one.
- Nothing about style beyond what the standards say.
- What you did not check, and why.
```

## Finish review

At the finish, give a new subagent, named as the last step's "Finish reviewer", the same
brief with these changes: it reads the whole
plan and every reference in [plugin root]/skills/build/references/, once; the change under
review is everything since the plan was approved; check every acceptance criterion, every
threat mitigation, every quality scenario's check and every hot path's benchmark against
the built code; walk the acceptance criteria in the running app; and follow the README
from a fresh clone.
