---
name: approve
description: Approve the naqsha plan being drafted and unlock building. Only the user can run this.
argument-hint: "[plan-folder]"
disable-model-invocation: true
---

# Naqsha: approve

The user typed `/naqsha:approve`. The naqsha hook has already checked the plan, and its
message above says what happened:

- **"the user approved …":** the approval is recorded and project files are unlocked.
  Confirm in one line which plan was approved, then build it. Follow
  `${CLAUDE_PLUGIN_ROOT}/skills/build/SKILL.md`: read it now and start with its first step.
- **"NOT approved":** nothing was approved and project files stay locked. Don't build and
  don't apologize at length. Split what it lists into two:
  - **Yours to fix** (a missing field, state, test, source, impact entry): fix each one in
    `plan.js` now, then run
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-tool.js" check <plan>/plan.js` until it says
    Ready.
  - **Only the user's** (an open question or decision): name each one in plain words and
    where to answer it on the page.

  Then tell the user in a line or two what you fixed and that `/naqsha:approve` will go
  through now (or what they still need to answer first). Only their command approves:
  never set the plan's status yourself.
- **No message from the hook at all:** the hook didn't run (for example, `node` isn't on
  PATH). Nothing was approved. Tell the user that, and don't start building.
