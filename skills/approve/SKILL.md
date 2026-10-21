---
name: approve
description: Approve the naqsha plan being drafted and unlock building. Only the user can run this.
argument-hint: "[plan-folder]"
disable-model-invocation: true
---

# Naqsha: approve

The user typed `/naqsha:approve`. The naqsha hook has already checked the plan and
recorded the approval. Its message above names the approved plan and says project files are
unlocked.

If that message is missing, the hook didn't run (for example, `node` isn't on PATH). Then
nothing was approved. Tell the user that, and don't start building.

Otherwise, confirm in one line which plan was approved, then build it. Follow
`${CLAUDE_PLUGIN_ROOT}/skills/build/SKILL.md`: read it now and start with its first step.
