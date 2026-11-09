# Security

## Reporting a vulnerability

Please report security issues privately, through GitHub: **Security**, then **Report a
vulnerability** on this repository. Don't open a public issue for them.

Include what you found, how to reproduce it, and what it lets someone do. You'll get a
reply within a week. A fix goes out as a new release, with credit to you if you'd like it.

## What's in scope

- **The approval gate.** A way for Claude to change project files while a plan is being
  drafted, without the user approving, or to approve a plan itself.
- **The local page server** (`scripts/serve.js`). A way for another site, or another
  user on the same machine, to read a plan's page or send answers to it without its key.
- **The hooks** (`scripts/hook.js`). Anything that runs a command the user didn't intend,
  or writes outside the project and naqsha's own folders.
- **Generated content.** A plan, page or demo composition that runs code from a source it
  shouldn't trust.

The lock is a guardrail for Claude's own edits, not a sandbox. A program the user runs
themselves can always change their files; that alone isn't a vulnerability.

## Supported versions

Fixes go into the latest release. Update with `claude plugin update naqsha@naqsha`.
