---
name: design
description: Design the interface before building it. Produces a design the user steers on its own local webpage, with live previews of every screen in every state at phone, tablet and desktop width, a token system, and the build steps. Works with or without a backend plan, for web and native apps. Project files stay locked until the user runs /naqsha:approve; /naqsha:build then builds it to the interface standard.
argument-hint: "<what to design>"
disable-model-invocation: true
---

# Naqsha: design

The user decides how their product looks and behaves; you research, propose, show, and later
build it. The deliverable is a design they've seen, not described: every screen rendered in
every state, in the real colors and type, before any code. A hook locks every project file
outside the plans folder until the user types `/naqsha:approve`.

The request: $ARGUMENTS

Interfaces are where AI slop shows first: the same card kit, the same fonts, the same
gradient, only the happy path, nothing that works from the keyboard. This skill counters
it the way `/naqsha:plan` counters assumed architecture: decisions come from this product's
users and their scene, the user chooses, defaults are named and replaced, and the build is
held to `${CLAUDE_PLUGIN_ROOT}/skills/build/references/interface.md`. Read it now; it is the
standard the design must make possible and the build will enforce.

**As creative as possible is the default.** Aim for the best of the web, the level of
Awwwards Site of the Day: distinct, unexpected, with motion that feels designed, and still
clean and fast. No typical UI, ever, unless the user asks for it.

The brief wins. When the user names a look, a brand, fonts or a palette, or asks for
something calmer, that's the design, even where `interface.md` calls it a default.

**Show options, never just describe them.** Every visual choice reaches the user as two to
four rendered options on the page, never as a suggestion in the terminal and never as a
text-only question: a whole direction, a screen's layout, one section ("redo the hero"),
one component ("change this button"), a state, a piece of copy. Write them as a decision
whose options each carry a `preview`, rendered in context: the real screen around the part
that changes, so the user sees how it sits with everything else. In chat, say only how many
options are waiting and where. Ask in the terminal only what isn't visual.

**Options gel with the whole.** In a product that has a design (this design's tokens once
they exist, an approved earlier design, or the system in the code, as `current` records),
every option speaks its language: its colors, type, spacing, radii and motion. The
creativity goes into composition, imagery, motion and the idea, never into something that
looks pasted in from another site. A change to one part that would clash with the rest is
either brought into the system or shown with what else would have to change for it to fit.
With no design yet, the options can be different directions, each complete enough to judge
on its own.

## 1. Set up

- **Check that the design phase started.** The hook's message ("Naqsha: design phase…")
  should be above. If it isn't, stop and ask the user to send `/naqsha:design <what>` as a
  message of its own.
- **Effort**, as in `/naqsha:plan`: light (one or two screens), standard, thorough (a whole
  product). Ask with your recommendation and record `meta.effort`.
- Choose a slug (`<something>-design`), then:
  `mkdir -p <plans>/<slug> && cp "${CLAUDE_PLUGIN_ROOT}/assets/plan.html" <plans>/<slug>/index.html`
- Write `plan.js` with `meta.kind: "design"`, in the format in
  `${CLAUDE_SKILL_DIR}/references/design-format.md`; read it now.
- Start the page: `node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.js" start <plans>/<slug> --open`,
  and give the user the URL in one line. The page shows a design's own tabs: Direction,
  Tokens and Screens, with live previews.
- Ask on the page the way `/naqsha:plan` does ("Asking on the page" in
  `${CLAUDE_PLUGIN_ROOT}/skills/plan/SKILL.md`; read that section): rounds of questions in
  phases, a background `wait`, no unattended loop.

## 2. Learn the ground

- **What it serves.** If a backend plan exists (the hook's message lists plans), read its
  digest (`node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-tool.js" digest <plan>/plan.js`) for the
  users, flows, data and API, and set `meta.plan`. Without one, the screens and their data
  come from the user.
- Don't ask what the repository answers.

### An existing product

A product that already has an interface has a design system, written down or not, and
users who know it. Creative doesn't mean ignoring it. Start from the codebase map
(`<plans>/CODEBASE.md`) if the hook names one, and `<plans>/LEARNINGS.md`, then:

- **Record the system as it is, in `current`,** from the code, not from memory: where the
  tokens or theme live (CSS custom properties, the Tailwind config, a theme file, the
  platform theme) and the values actually used; the component library or the project's
  own components, each with its path and the states it has; the fonts, icons and motion
  already in use; and the screens, with a screenshot of each one the design touches
  (run the app as `testing.runIt` says; store screenshots as inline images or describe
  them). Count the drift too: the colors, font sizes and spacings used outside the tokens,
  one-off components that duplicate others, missing states. That is the design debt.
- **Choose the approach with the user,** recommending one from what you found, and record
  it as `meta.approach`:
  - **extend:** new screens or features inside the existing system. Match it exactly:
    its tokens, its components, its patterns. The creativity goes into the composition and
    the motion of the new screens, never into new colors or fonts, unless the user asks.
  - **refine:** raise the quality of existing screens while keeping their identity: fix
    the debt, add the missing states and the motion language, tighten type and spacing.
    Same brand, same layout logic, visibly better.
  - **redesign:** a new direction, with the creative default in full. What the product
    does, its content and its users' habits stay; the old look is evidence, not the spec.
- **Reuse before you add.** A screen uses the existing component for a job before a new
  one is designed, the way `/naqsha:plan`'s ladder reuses code. A new component, a changed
  token or a changed shared component goes in `impact`: every screen that uses it, how you
  searched, and whether each one should change. Approval needs it.
- **Show before and after.** Give each existing screen its current look as `current` (the
  screenshot or a faithful rendition), so the page shows Now beside each proposed state.
- **A redesign ships in pieces,** as `/naqsha:plan` would migrate an architecture: the new
  tokens first, mapped from the old ones; components switched one at a time; screens
  moved behind a flag or a theme switch where users would otherwise see half the old
  design and half the new; and a final step that removes the old styles.

## 3. Ask the user

On the page, in phases. Only what they know:

- Who uses it, for what job, how often, and in what scene: the device, the light, the
  hurry. The scene picks light or dark, density and size, not the category.
- The platforms: web, iOS, Android, or several. Native apps use the platform's controls.
- Brand: existing assets, colors, fonts, tone of voice, and anything off limits.
- References: two or three products they like the feel of and one they don't, and why.
- Languages, including right-to-left ones, and accessibility needs beyond the WCAG 2.2 AA
  floor.
- Content realities: the longest names, the biggest lists, the empty first day.

## 4. Screens and flows

List every screen with its `mode` (operate, persuade, read, experience; see
`interface.md`), its purpose, the data it shows, and its `states`. A screen that shows data
has `empty`, `loading` and `error`, plus `long` or `offline` where they can happen. Map the
flows between them. A product bigger than about eight screens gets milestones (`later`),
as in `/naqsha:plan`: design the first usable flow fully.

**Check every screen's data against the backend.** A design covers the interface, not the
server, so a screen can easily need data or an action nothing provides. For each screen
that shows data, list its `needs` (what it reads and what it changes) and find where each
comes from: the API in the code (`exists`, with the route and `file:line`), or a step of
the backend plan (`planned`). Search the code; don't assume an endpoint exists because the
screen needs it. When something has no source, bring it to the user as a decision:

- **Plan the backend first** with `/naqsha:plan`, then come back to this screen.
- **Build against a contract:** agree the request and response shape now, record it as
  `contract` with what's `owed`, and the build fakes it behind one adapter until the
  backend exists. It goes in `needsYou` so it isn't forgotten.
- **Drop or defer** the part of the screen that needs it (`later`).

Never fill a gap with data invented in the interface. Approval is refused while a screen's
need has no source.

## 5. Direction

- **Look at the best of the best.** Start from Awwwards (awwwards.com): Sites of the Day,
  of the Month and of the Year (`/websites/sites_of_the_day/`, `/websites/sites_of_the_month/`,
  `/websites/sites_of_the_year/`), narrowed by category (`/websites/web-interactive/`,
  `/websites/e-commerce/`, `/websites/mobile-apps/`) and by the tags for motion
  (`/websites/animation/`, `/websites/transitions/`, `/websites/microinteractions/`,
  `/websites/interaction-design/`). Pick five to eight recent winners that fit this
  product's mood, not its industry, and the best products in its category for how they
  handle the task. For each: the composition, the type, the color, how it moves (view
  transitions, interactions, the signature moment), and the one idea worth taking. Use
  subagents named and modeled as `/naqsha:plan` describes (Sonnet for this), returning
  condensed observations with URLs. Take ideas, never copy a site.
- **Consider 3D where it applies** (a product to turn or configure, a space, data with a
  third dimension, an interactive story, a shader-driven signature; "3D with Three.js" in
  `interface.md`), and when it does, make at least one direction use it.
- **Propose two or three directions** as a decision, each ambitious and each different
  from the others: its palette, type pairing, composition, motion language and signature
  moment, and a `preview` of the key screen in that direction (the page renders option
  previews like screen previews, with their CSS animations running). Recommend one and say
  why, from the scene and the references. The user picks.
- Record the chosen one in `direction`: the brief, the scene, the references and what you
  take from each, the principles, the signature, and the `motion` language (view
  transitions, how controls respond, how content enters, the signature moment).

## 6. Tokens

From the chosen direction, write `tokens`: 4 to 7 named colors with roles (plus `dark`
overrides if the scene needs a dark theme), type families with their roles and source,
a type scale, a spacing scale, radii, shadows, and motion (named durations, easings and
springs that the motion language uses). Check every text and background
pair for contrast (4.5:1 for text, 3:1 for large text and control borders) and fix the
tokens, not the screens. Prefer fonts the user can license and self-host; say where each
comes from.

## 7. Screens

Write each screen's `previews`, one per state: HTML and CSS using only the token
variables (`design-format.md` lists them), with realistic content, including the long and
awkward cases. Show the motion: CSS animations and transitions run in the previews (no
JavaScript), so the entrance choreography, hover and press states and the signature moment
are visible, with a `prefers-reduced-motion` version. A 3D scene can't run in a preview:
show its poster (a CSS rendition or an inline image) and describe the scene, its
interaction and its fallback in the screen's `notes`. On operate screens the task stays
obvious and the controls recognizable, inside a composition that is still clearly this
product's. Then review them as the skeptical design lead who has to sign off:

- Go through "The defaults to refuse" in `interface.md`. For each one you find, rewrite
  the element and add it to `direction.defaultsAvoided` with what replaced it.
- Check the floor: contrast, focus styles visible in the previews, touch target sizes,
  every state present, copy in the product's own words.
- Hold each screen next to the Awwwards references: if it looks like a template, it isn't
  done. Push the composition, the type or the motion until it's this product's.
- Then make it clean: remove one thing from each screen.

If you can render the page in a browser (a headless browser or the user's), look at the
previews at all three widths before handing over, and fix what you see.

## 8. The build

- `testing.runIt`: how the build starts the interface and drives it (from the repo or the
  user), with test data only.
- **The motion tools,** as a decision: CSS and the View Transitions API first, then Motion
  or GSAP, smooth scrolling, Rive or Lottie, or Three.js where the motion language or a
  3D scene needs them, chosen with the stack as "Choosing the tools" in `interface.md` describes. Each new
  library goes in `dependencies` with its version and license.
- `testing.uiChecks`: the commands the build runs on every UI step: an accessibility check
  (axe through the project's test runner), and performance budgets on the web
  (Lighthouse CI). Use what the project has; choosing new tools is a decision for the user.
- `steps`, in order, each with its `screens`, `files`, `tests` (behavior and accessibility
  of each state, test-first per `${CLAUDE_PLUGIN_ROOT}/skills/build/references/tdd.md`) and
  a runnable `doneWhen` that includes matching the previews:
  1. The tokens in the project's styling system, and a specimen page that shows them. In an
     existing product, the first step takes a visual baseline instead: screenshots of every
     screen the design touches and of the ones it must not change, so the build can tell
     an intended change from a regression.
  2. The base components, each with all its states.
  3. A walking skeleton: the main flow's screens working end to end, however plain. A 3D
     scene gets its spike here: the real assets on a mid-range phone, measured against
     the budget.
  4. Then one screen or one flow per step, each with all its states.
  5. A polish step for the parts nobody drew, the stress cases and the final look.
- `needsYou`: font licenses, brand assets, real content, testing on real devices or with
  real users, and approvals.

## 9. Hand over

Every question answered, every decision made, every screen previewed in every state and
built by a step. Add a changelog entry, then tell the user in a few lines what to look at
on the page (the Screens tab, with the phone, tablet and desktop toggle and each state),
that they can comment on any screen and send it, and that `/naqsha:approve` locks the
design and `/naqsha:build` builds it. Start a `wait` for their comments. The hook refuses
approval while anything above is missing.
