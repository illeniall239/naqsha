# The codebase map

`<plans>/CODEBASE.md` is what a new engineer would want on day one, and what every later
plan, guide and review starts from instead of exploring the repo again. It's Markdown so
people read it on GitHub too. Keep it to what's true and useful: about 150 to 300 lines.
Every path is real, every command was seen to work or is marked "not verified".

The second line must be the stamp the hook reads to tell how far the code has moved since:

```markdown
# <Project> codebase map
<!-- naqsha codebase map · commit <short hash> · <YYYY-MM-DD> -->

## What it is
Two or three sentences: what it does, for whom, and what it's built with.

## Run it
| Task | Command | Notes |
|---|---|---|
| Set up | `...` | the env vars it needs and where they come from |
| Start | `...` | the URL or port, how you know it's ready |
| Test | `...` | how long the suite takes, what it needs (a database, Docker) |
| Lint, format, types | `...` | |
| Build, deploy | `...` | or "not in the repo" |

## Layout
One line per top-level folder, and per folder inside the main source tree that matters.

## Architecture as it is
The deployables, data stores and outside services, how they talk, and where each lives
(`path:line`). A Mermaid diagram when there's more than one moving part.

## Conventions
How things are done here, each with a `file:line` example: errors, validation, logging,
config, naming, where tests go, how modules depend on each other.

## Reuse before you write
What already exists for common jobs, with paths: the HTTP client, auth checks, validation,
the error type, logging, dates and money, test helpers and fixtures.

## Dependencies that matter
The ten or so a change is most likely to meet, with the versions the lockfile pins.

## Tests
Where they live, the kinds there are, how to run one file, what's slow or flaky, and what
has no tests.

## Hotspots
Files that change most (`git log --since=6.months --name-only --format= | sort | uniq -c |
sort -rn | head`), and which of them have no tests. These are where changes go wrong.

## Learnings
See `LEARNINGS.md` for what was learned the hard way.
```

When refreshing, change only the sections the new commits touched, then update the stamp.
