---
name: help
description: Show what naqsha does, its commands, and where this project stands. Run as /naqsha:help.
disable-model-invocation: true
---

# Naqsha: help

The hook's message above ("Naqsha help: …") says where this project stands. Reply with the
text below, nothing before it, filling in the last section from that message. Keep the
wording; it's written for the user. Don't read any files.

---

**Naqsha** plans before code. You steer the plan on a local page, nothing in your project
changes until you approve it, and then Claude builds it test-first and security-first.

**The flow:** `/naqsha:plan` → answer on the page → `/naqsha:approve` → `/naqsha:build`

| Command | What it does |
|---|---|
| `/naqsha:plan <idea>` | Plan what to build: requirements, system design, decisions, security, tests and steps. Locks project files until you approve. |
| `/naqsha:design <idea>` | Design the interface: a direction, tokens, and live previews of every screen in every state. Locks files too. |
| `/naqsha:approve` | Approve the plan or design. Only you can run it. |
| `/naqsha:build` | Build the approved plan, a step at a time, with reviews and checks. Resumes where it stopped. |
| `/naqsha:review` | Audit an existing codebase and map it. Changes no code. |
| `/naqsha:learn` | Learn what was built and why, on its own page. Changes no code. |
| `/naqsha:help` | This. |

**Good to know**
- Send each command as a message of its own.
- At the start of a plan you choose the effort (light, standard, thorough); it sets how much research and review it costs.
- Ask "what did this cost?" any time during a build: it's measured from your session logs and shown on the plan page.
- For a one-file fix or a small tweak, just ask Claude directly; naqsha is for features and new systems.

**In this project:** [from the hook's message: what's in progress, the plans and designs with their status and cost, reviews, and whether there's a codebase map]. Then one line: what to type next. Nothing in progress and no plans: `/naqsha:plan <your idea>`, or `/naqsha:review` first for an existing codebase. A draft: answer on its page, then `/naqsha:approve`. Approved or building: `/naqsha:build`.
