# Run it like a user

Tests, linters and scanners check the code. None of them checks that the app works: that
it starts, that the page renders, that the form submits, that the API answers a real request.
"All tests pass" while the app is broken is a classic AI failure: a missing env var at
startup, a route that was never registered, a button wired to nothing. So the build also
drives the real, running app the way its users will, and reads what it sees.

## How the app runs

The plan's `testing.runIt` says how, from the repository or from the user, never guessed:
how to set up data, start, check it's ready, drive it (browser, HTTP, CLI, or a job), and
stop. If it turns out to be wrong, fix the plan's entry with the user's say-so; don't
improvise a different way to run it.

## Before the first step: a baseline

Start the app once, before changing anything, and walk one existing flow. If it doesn't
start or the flow fails, that's the state you inherited: tell the user, record it in the
notes, and don't fix it silently or let it be blamed on the build later.

## After each step with user-facing changes

Any step that changes what a user, a client or an operator sees: a page, an endpoint, a
command, a job, an email, a log an operator relies on.

1. **Start clean.** Set up data the way `runIt` says (migrations, test fixtures), then start
   the app with the project's own command. If it doesn't start, that's a failure of this
   step: read the error and fix it.
2. **Wait for ready** with a timeout (a health endpoint, a port, a log line). Read the
   startup output: a new warning or error counts.
3. **Walk the flows** this step changed, and every acceptance criterion it delivers:
   - **Web UI:** a real browser. Use the project's browser tests (Playwright, Cypress) if it
     has them, the browser tools in your session if you have them, or a headless browser
     driven from the scratchpad (never add a dependency to the project for this). Click,
     type and submit as a user would.
   - **API:** real HTTP requests, with the payloads clients will send.
   - **CLI:** run the real command, with real arguments.
   - **Job or worker:** trigger it, then check its effect where a user would see it.
4. **Walk the unhappy paths too:** invalid input, a missing or expired session, another
   user's object, the empty state, the error state, and a dependency that's down if the
   stand-in allows it.
5. **Look, don't just check a status code.** Take a screenshot and look at it: layout,
   text, the state shown. Read the browser console and the network panel (no 4xx or 5xx
   you didn't expect) and the server log during the walk (no errors or stack traces).
6. **Stop the app,** and leave no processes running and no test data in a database the user
   works in. Use a separate database, schema or container where the project allows.

## At the finish

Start the app once more and walk every acceptance criterion in `testing.acceptance`, end to
end, in one session, as the final proof.

## What you find

- **A bug found by walking is fixed test-first:** a failing test that reproduces it
  (`tdd.md`), then the fix, then walk it again.
- **Can't run it** (it needs a paid service's credentials, hardware, or an account only the
  user has): the check is `blocked`, with exactly what's needed. Use a provider's test or
  sandbox mode, or a local stand-in, if the plan allows. Never mark it passed, and never put
  a real credential in the repo to get past it.

## Never

- Point it at production, or at real customer data.
- Use a credential that isn't a test credential the user gave you.
- Count "the server started" as walking the flow.

## Record the evidence

In the step's notes: the start command and whether it came up clean; each flow walked and
its result (pass or fail); the screenshots' paths or the response excerpts; console and
server errors seen (none, or each one listed).
