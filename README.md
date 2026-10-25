# naqsha

*Naqsha* (نقشہ) is Urdu for map, plan or blueprint.

[![The naqsha demo](media/naqsha-demo.gif)](https://github.com/illeniall239/naqsha/releases/download/v0.11.0/naqsha-demo.mp4)

*The demo you are seeing was made with naqsha itself, using `/naqsha:demo`. Click it for the full video.*

A Claude Code plugin that puts you back in charge of AI coding. Claude plans with you on a
page you can see, you make every decision, and no code is written until you approve.

## How it works

1. **Plan.** `/naqsha:plan <what to build>`. Claude asks you questions, reads your
   codebase, researches how it's usually done, and writes a plan as a local webpage. You
   answer each decision on the page. Your project files stay locked while you plan.
2. **Approve.** `/naqsha:approve`. Only you can type it. It checks the plan is complete,
   then unlocks the project.
3. **Build.** `/naqsha:build`. Claude builds the plan step by step, tests first, and asks
   you before changing the plan.

It works for a new app or for a feature in an existing codebase.

## Commands

| Command | What it does |
|---------|--------------|
| `/naqsha:plan <request>` | Start or resume a plan. Locks project files until approved. |
| `/naqsha:design <what to design>` | Design the interface, with live previews and visual options to choose from. |
| `/naqsha:approve` | Approve the plan and unlock the project. Only you can run it. |
| `/naqsha:build` | Build the approved plan, or resume building it. |
| `/naqsha:review [area]` | Review an existing codebase: a map of it, and ranked findings that can become plans. |
| `/naqsha:learn [topic]` | Learn what was built and why, on a page and in chat. |
| `/naqsha:demo <what it's for>` | Make a demo video of your app, recorded from the real app and rendered to MP4. |
| `/naqsha:help` | The commands, where your project stands, and what to type next. |

Send each command as a message of its own. Plans are saved in `docs/plans/` so you can
commit them.

## Install

Requires Claude Code and `node`.

```sh
claude plugin marketplace add illeniall239/naqsha
claude plugin install naqsha@naqsha
```

Or inside Claude Code: `/plugin marketplace add illeniall239/naqsha`, then
`/plugin install naqsha@naqsha`. Start a new session to load it.

To update:

```sh
claude plugin marketplace update naqsha
claude plugin update naqsha@naqsha
```

To leave planning without approving, delete the `.naqsha/` folder in your project.
