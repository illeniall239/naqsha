# Interface: built like the best product in its category, not assembled from defaults

An interface is where slop shows first. The usual signs: the same SaaS card kit on every
page (identical rounded cards, one radius, one soft shadow, a gradient wash), Inter for
everything, gray text on colored backgrounds, a fade-and-slide-up on every section, a
big-number hero, screens that only have a happy path, controls that don't work from the
keyboard, and browser defaults nobody styled. Models produce the statistically safest
choice, and safe reads as generic.

**Creative is the default.** The bar is the best of the web: the work that wins Awwwards
Site of the Day, not the median SaaS template. Every screen gets a distinct, considered
look, with an unexpected composition, expressive type and motion that feels designed, and
it stays clean: precise alignment, nothing that doesn't earn its place, and fast. A
typical, interchangeable interface is a failure even when it works. Plain is a choice the
user makes, never the fallback.

These rules build on Anthropic's frontend-design skill, Vercel's Web Interface Guidelines,
Paul Bakaus's Impeccable and Taste Skill, held to WCAG 2.2 AA and Core Web Vitals. A design
approved with `/naqsha:design` wins over any of them: its tokens, screens and previews are
the spec. Where the user's brief asks for something these rules call a default, the brief
wins.

## Follow the design

- **Tokens only.** Colors, type, spacing, radii, shadows and motion come from the design's
  tokens, set up once in the project's styling system (CSS custom properties, the Tailwind
  theme, the platform theme). A raw hex value or a one-off pixel size in a component is a
  defect.
- **Components before screens.** A control used on two screens is one component with its
  states (hover, focus, active, disabled, loading, error), built and tested once.
- **The mode decides how the creativity serves, never whether there is any.**
  *Persuade* and *experience* screens (landing, pricing, showcases) go all the way:
  editorial layouts, oversized type, art direction, a signature motion moment.
  *Operate* screens (apps, dashboards, settings) are just as designed, with the creativity
  in the composition, the type, the color and the motion of every interaction, while the
  task stays obvious: controls read as controls, work from the keyboard and screen
  reader, and nothing slows the user down. *Read* screens set type and layout for the
  pleasure of reading. A dashboard that could be any dashboard has missed the bar as
  surely as a landing page that could be any landing page.
- **Native where native exists.** On iOS and Android, the platform's own controls,
  navigation and gestures (Apple's Human Interface Guidelines, Material 3), themed with the
  tokens, not web imitations of them.

## In an existing product

The product's design system, written down or not, is the starting point. The design's
`meta.approach` says how far to move from it. Without a design, an existing product is
extended; a new one gets the creative default, and Claude suggests `/naqsha:design` before
its first UI step.

- **Extend:** the existing tokens, components and patterns, exactly. A new color, font,
  radius or component style needs the user's say-so. Find the closest existing screen and
  build the new one the same way.
- **Refine:** the same identity, raised: the missing states, the motion language, the debt
  the design lists (values outside the tokens move into them, duplicate components merge),
  tighter type and spacing.
- **Redesign:** the new direction, in the order the design's steps give, never half old
  and half new in front of users unless behind a flag or theme switch.
- **Reuse first.** Use the existing component for a job before writing one. Changing a
  shared component or token changes every screen that uses it: check each one in the
  design's `impact`, and search for any it missed.
- **A visual baseline.** Before the first change, screenshot every screen the design
  touches and the ones it must not (with the project's visual tests if it has them:
  Playwright's `toHaveScreenshot`, Storybook with Chromatic or similar). After each step,
  every difference is either intended by the design or a regression to fix.
- **Leave the rest alone.** No reformatting or "tidying" of styles the step doesn't need;
  debt outside the design is reported as `found:`, not fixed on the side.

## The defaults to refuse

Each is fine when the brief asks for it. Reaching for one when nothing asked means no
decision was made: rewrite the element, don't soften it.

- Same-size cards (icon, heading, text) as the page structure; cards inside cards.
- One radius and one soft shadow on everything. Shadows have an offset and blur, use two
  layers (ambient and direct), and nested radii fit inside their parent's.
- Gradient text; purple-to-blue gradients; glass and blur as decoration; glows.
- A tracked-out uppercase label above every heading; 01/02/03 markers without a real
  sequence; an accented word in the headline; "→" on every link.
- The big-number hero with small stats and an accent.
- A colored left border on cards and alerts as the only design move.
- Gray text on colored backgrounds (tint it from the background's hue); pure `#000` or
  neutral gray with no tint.
- Emoji or Unicode glyphs in place of an icon set. One icon library, one stroke weight.
- Monospace as a costume for "technical"; it's for code, data and measurements.
- The same entrance animation on every section.
- A modal for a task that needs no interruption.
- Placeholder content: lorem ipsum, "John Doe", round fake numbers. Use realistic content,
  including the long and awkward cases.

Before calling a screen done, look at it as a whole and remove one thing.

## The floor

- **Accessibility, WCAG 2.2 AA.** Text contrast at least 4.5:1 (3:1 for large text and for
  icons and control borders), with every token pair checked. Everything works from the
  keyboard in a logical order, following the WAI-ARIA Authoring Practices for custom
  widgets, with a visible `:focus-visible` ring that sticky headers never cover. Touch
  targets at least 24 by 24 px (44 on mobile). Real elements first (`<button>`, `<a>`,
  `<label>`), ARIA only where no element fits. Headings in order, a skip link, every image
  and icon-only button named, status never by color alone. Text scales to 200% without
  breaking. Reduced motion gets a calm version (see Motion). Login never relies on a
  memory or puzzle test without an alternative.
- **States, on every screen that shows data:** loading (a skeleton that matches the final
  layout, or a spinner that waits about 200 ms before showing and stays at least 300 to
  500 ms), empty (what it is and the first action), error (what happened and how to
  recover, keeping what the user typed), partial and offline where they can happen, and
  very long, very short and very many items. No screen is a dead end.
- **Forms.** A `<label>` for every field; the right `type`, `inputmode` and `autocomplete`;
  validation shown next to the field after the user leaves it or submits, with focus moved
  to the first error; submit isn't disabled in advance, is disabled while sending, and the
  request carries an idempotency key; paste always works; unsaved changes warn before
  leaving.
- **Interaction.** Navigation is a link and an action is a button. State that should
  survive a refresh or be shared (tabs, filters, pages) lives in the URL; Back and Forward
  work and restore scroll. Destructive actions confirm or offer undo. Optimistic updates
  roll back visibly on failure. Every gesture has a tap or keyboard alternative.
- **Type and layout.** Body lines 45 to 75 characters; a clear scale with visible steps;
  more space above a heading than below it; tight groups and generous separation; tabular
  numerals in tables; no widows in headings. Layout with flex and grid, not measured in
  JavaScript, and checked at phone, tablet and wide desktop widths, with safe-area insets
  on mobile.
- **The parts nobody drew:** text selection, the caret, scrollbars, focus rings, link
  underlines, `<select>` on Windows, `theme-color` and `color-scheme` for dark mode. Theme
  them from the tokens.
- **Copy is part of the design.** The product's own words. Buttons name their action
  ("Save draft", not "Submit"). Errors say what went wrong and what to do, without
  apology or blame.
- **International.** No hard-coded strings; dates, numbers and currency formatted for the
  locale; layouts that survive text 30% longer; logical CSS properties
  (`margin-inline-start`) so right-to-left languages mirror correctly; language from
  `Accept-Language` or the device, never from location.
- **Performance budgets,** measured at the 75th percentile: on the web, Largest Contentful
  Paint within 2.5 s, Interaction to Next Paint within 200 ms, Cumulative Layout Shift
  under 0.1. Images sized and lazy below the fold, fonts preloaded and subset, long lists
  virtualized. On mobile, a fast cold start and no dropped frames while scrolling.

## Motion

Motion is part of the design, not a garnish: a product that moves well feels made. Every
build has a motion language, from the design's `direction.motion` and motion tokens:

- **Transitions between views** carry the user's place: shared elements that move to their
  new position, content that follows the direction of navigation (the View Transitions API
  on the web, shared-element transitions on iOS and Android).
- **Every control responds:** press, hover, focus, success and error each have a small,
  quick change, so the interface feels alive under the hand.
- **Entrances are choreographed, not repeated.** Content arrives in an order that reveals
  the hierarchy (staggered, from where it comes from), once, not the same fade-up on every
  section. Scroll-driven effects (CSS scroll-driven animations) only where they show
  something: progress, a reveal, depth.
- **One signature moment** the product is remembered for, named in the design.
- **Clean means:** consistent durations and easings from the tokens (feedback within
  100 ms, transitions about 150 to 400 ms, a signature moment up to about 800 ms, once);
  natural easing (ease-out or springs, never bounce on interface elements); interruptible
  by input; never blocking the user; no layout shift.
- **Optimized means:** animate only compositor-friendly properties (`transform`, `opacity`,
  and `filter` or `clip-path` where they stay smooth), never `transition: all` or layout
  properties; 60 frames per second on a mid-range phone, checked with the browser's
  performance tools; no long tasks during an animation. Build it with CSS first, then the
  Web Animations API and View Transitions, and a library (Motion, GSAP) only when the
  choreography needs one, loaded only where it's used. WebGL or 3D only with a reason in
  the design, loaded lazily, with a still fallback, inside the performance budget.
- **Reduced motion** (`prefers-reduced-motion`) gets a calm version: cross-fades instead of
  movement, nothing that zooms, spins or parallaxes, and nothing lost.

### Choosing the tools

The design names its motion tools as a decision, with the stack. Use what the project
already has; a new library is a dependency like any other. One tool per job: never two
libraries doing the same thing.

- **CSS and the platform first.** Transitions, `@keyframes`, `@starting-style` for elements
  as they appear, and the View Transitions API for view changes (available in all major
  browsers for same-document transitions; check support for cross-document ones).
  Scroll-driven animations (`animation-timeline: scroll()` / `view()`) are still uneven
  across browsers: use them as progressive enhancement inside
  `@supports (animation-timeline: scroll())`, with a design that works without them. The
  Web Animations API when JavaScript has to drive it.
- **Motion** (motion.dev; formerly Framer Motion, MIT) for React, and Vue: layout
  animations, exit animations (`AnimatePresence`), gestures and springs, declared on the
  component. Install `motion` and import from `motion/react`; existing `framer-motion`
  code moves by changing the import. Keep the bundle small with `LazyMotion` and the `m`
  component, and read `useReducedMotion` for the calm version.
- **GSAP** (free for commercial use, every plugin included since Webflow took it over) for
  choreography a component library makes awkward: long timelines, scroll storytelling
  (ScrollTrigger), split-text reveals (SplitText), layout morphs (Flip), SVG. Works with
  any framework; in React use `useGSAP` from `@gsap/react` so everything is cleaned up on
  unmount. Put breakpoints and reduced motion in `gsap.matchMedia()`. Install the public
  `gsap` package; old instructions about a private registry or auth tokens are outdated.
- **Svelte's** built-in transitions, **Angular's** animations package, and **Vue's**
  `<Transition>` before adding a library in those stacks.
- **Smooth scrolling** (Lenis, ScrollSmoother) only on persuade and experience pages, with
  a reason in the design, never on operate screens. It turns off with reduced motion, and
  keyboard scrolling, anchors, find-in-page and screen readers keep working: test each.
- **Illustration that moves:** Rive for interactive animation with states, Lottie for
  exported After Effects animation. Loaded lazily, sized in advance, with a still frame
  as the fallback and for reduced motion.
- **3D** with Three.js where it applies: see below.
- **Native:** SwiftUI's animations and `matchedGeometryEffect` on iOS, Jetpack Compose's
  animation APIs and shared element transitions on Android, Reanimated in React Native.
### 3D with Three.js

Consider 3D wherever it shows something a flat image can't, and propose it then: a
physical product to turn and configure, a space or a place, data with a real third
dimension, an interactive story or brand moment, a playful first run, or a shader-driven
hero or background as the signature. Skip it where it would slow the task (the core flows
of operate screens), carry information only visually, or say what a picture says.

- **The stack.** Three.js; in React, React Three Fiber with drei for the common pieces
  (controls, loaders, environment, text) and the postprocessing library for effects.
  `WebGPURenderer` is the forward path, with an automatic WebGL 2 fallback: call `init()`
  before rendering, write custom shaders in TSL so they compile for both, and test both
  backends (`forceWebGL: true`), since WebGPU support still varies by browser and
  platform. Plain `WebGLRenderer` is fine where the project already uses it.
- **Assets.** glTF/GLB only, geometry compressed (Draco or meshopt), textures in KTX2
  (Basis), sized for the screen they're seen on; a poly and texture budget per scene in the
  design. Load after the page's content, with progress shown and a still poster in place
  until the scene is ready.
- **Frame budget.** 60 fps on a mid-range phone, measured: cap the device pixel ratio
  (about 1.5 to 2), instance repeated objects (`InstancedMesh`, `BatchedMesh`), keep draw
  calls low, bake lighting and shadows where they don't change, render on demand when
  nothing moves (`frameloop="demand"` in React Three Fiber), and stop rendering when the
  canvas is off screen or the tab is hidden. Dispose of geometries, materials, textures
  and render targets when the scene goes.
- **It always works without 3D.** No WebGL or WebGPU, a weak device, a low-power mode or
  reduced motion gets the still poster or a 2D version with the same content. Information
  in the scene is also in the page as text. Interactions have keyboard and button
  alternatives (rotate, zoom, choose a variant), the canvas has an accessible name and a
  description, and nothing in it flashes. Camera moves and parallax stop with reduced
  motion.
- **Prove it early.** A 3D signature is a risky unknown, so the build's first steps include
  a spike that loads the real assets on a mid-range phone and measures frame time and load
  size against the budget, before the rest of the screen is built around it.

- **Every library:** animations are cleaned up when their component goes (timelines,
  scroll triggers, observers), so nothing leaks between views, and tests either turn
  animation off or wait for it to finish, never `sleep`.

## Verify by looking

Tests prove behavior; looking proves the design. For every step that changes what a user
sees:

1. **Behavior first, test-first** (`tdd.md`): each state, validation rule and interaction
   gets a test at the component's interface, with an automated accessibility check (axe)
   on each rendered state.
2. **Run it** as `run-like-a-user.md` describes, and take screenshots at phone (390 px),
   tablet (820 px) and desktop (1440 px), in dark mode if the design has one, for each
   state the step's screens list.
3. **Compare with the approved preview** of each screen and state. Then judge the result
   against this file: the floor, then the defaults to refuse.
4. **Fix the three biggest problems, then look again,** for at most three rounds. Batch the
   fixes; don't screenshot after every tweak.
5. **Stress it:** a 100-character name, emoji, a right-to-left language, 1,000 items, no
   network, a forced server error, ten fast clicks on submit, keyboard only.
6. **Run `testing.uiChecks`** (accessibility, performance budgets) and record each result
   in the notes like any other check.

## Review

- Could this screen belong to any product, or does it read as this one? Would it hold up
  next to this month's Awwwards Sites of the Day?
- Does it move well: transitions that carry the user's place, controls that respond, one
  signature moment, smooth on a mid-range phone, calm with reduced motion?
- Which default did this step reach for without a reason?
- Does every screen work, and read well, when it's empty, loading, failing, or full of long
  content?
- Can someone do the whole flow with only a keyboard, or only a screen reader?
- Is any color, size or spacing written outside the tokens?
