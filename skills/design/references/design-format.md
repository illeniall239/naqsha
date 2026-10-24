# A design's plan.js

A design lives in `<plans>/<slug>/plan.js`, in the same `window.NAQSHA = <JSON>;` format as a
plan, so approval, the build, checkpoints and crew mode all work the same way. What
differs is `meta.kind` and the sections below. The common sections (`questions` with
`phase`, `decisions`, `steps`, `needsYou`, `risks`, `rejected`, `later`, `changelog`) follow
`${CLAUDE_PLUGIN_ROOT}/skills/plan/references/plan-format.md`.

```js
window.NAQSHA = {
  "meta": {
    "title": "Shopfront admin: orders and returns",
    "slug": "admin-design",
    "kind": "design",
    "status": "draft",                 // draft | approved | building | done; approval is the user's command
    "created": "2026-10-24", "updated": "2026-10-24",
    "effort": "standard",
    "platform": "web",                 // web | ios | android | cross-platform
    "plan": "docs/plans/admin",        // the backend plan it serves, if there is one; omit otherwise
    "approach": "refine"               // existing product only: extend | refine | redesign
  },

  "context": { "stack": ["Next.js 15", "Tailwind 4"] },   // existing product: as in plan-format; new: { "na": "new product" }

  "current": {                         // existing product only: the design system as the code has it
    "system": "Tailwind theme in tailwind.config.ts; no CSS variables",
    "tokens": [{ "name": "brand", "value": "#4f46e5", "where": "tailwind.config.ts:12" }],
    "components": [{ "name": "Button", "where": "src/components/ui/button.tsx", "states": "default, hover, disabled; no loading" }],
    "fonts": "Inter via next/font", "icons": "lucide-react", "motion": "none beyond hover colors",
    "debt": ["23 hex colors outside the theme", "3 different modal components", "no empty states on lists"]
  },

  "impact": [],                        // existing product: required, as in plan-format (shared components and tokens this changes), or { "na": "..." }


  "summary": { "problem": "...", "users": ["Store staff, on desktop at the counter and on phones in the stockroom"], "goals": ["..."], "nonGoals": ["..."] },

  "direction": {
    "brief": "Staff process 200 orders a day between customers; speed and no mistakes beat delight",
    "scene": "Bright shop floor and a dim stockroom; light theme with a dark one for the stockroom",
    "references": [                    // Awwwards winners first, then the category's best products
      { "name": "Linear issue list", "url": "https://linear.app", "take": "dense rows, keyboard-first, one accent" }
    ],
    "principles": ["Every action reachable by keyboard", "Status colors only where they mean something"],
    "signature": "Order timelines drawn as a single horizontal track across the row",
    "motion": "Rows expand in place with a 240 ms spring; views slide in the direction of navigation; approving an order sweeps its timeline to done",
    "defaultsAvoided": [
      { "default": "Dashboard of identical stat cards", "instead": "A worklist sorted by what needs action" }
    ]                                   // required: or { "na": "<why>" }
  },

  "tokens": {                          // names follow the Design Tokens format 2025.10 where the stack allows
    "color": [
      { "name": "bg", "value": "#f7f6f2", "role": "page background" },
      { "name": "text", "value": "#1c1d1a", "role": "body text" },
      { "name": "accent", "value": "#1f5f4a", "role": "primary actions and selection" },
      { "name": "danger", "value": "#b3261e", "role": "destructive actions and errors" }
    ],                                 // at least 3; every text/background pair meets 4.5:1
    "dark": [{ "name": "bg", "value": "#141513" }],   // overrides for a dark theme, if the scene needs one
    "type": {
      "families": [
        { "name": "Source Serif 4", "role": "headings", "source": "google", "weights": [400, 600] },   // google | system | self-hosted
        { "name": "IBM Plex Sans", "role": "body and controls", "source": "google", "weights": [400, 500] }
      ],
      "scale": [
        { "name": "display", "size": "32px", "lineHeight": "40px", "weight": 600 },
        { "name": "body", "size": "15px", "lineHeight": "22px", "weight": 400 },
        { "name": "small", "size": "13px", "lineHeight": "18px", "weight": 500 }
      ]                                // at least 3 steps
    },
    "space": ["4px", "8px", "12px", "16px", "24px", "32px", "48px"],
    "radius": [{ "name": "control", "value": "6px" }, { "name": "panel", "value": "10px" }],
    "shadow": [{ "name": "raised", "value": "0 1px 2px rgb(28 29 26 / .08), 0 4px 12px rgb(28 29 26 / .06)" }],
    "motion": { "fast": "120ms", "base": "240ms", "signature": "700ms", "easing": "cubic-bezier(.2, .7, .2, 1)", "spring": "stiffness 300, damping 30" }   // required: at least 2
  },

  "screens": [{
    "id": "SC1",
    "name": "Orders worklist",
    "mode": "operate",                 // operate | persuade | read | experience
    "purpose": "See what needs action now and act on it without leaving the list",
    "data": "Orders: 0 to 2,000 open, 40 a page",   // when present, empty, loading and error are required states
    "states": ["default", "empty", "loading", "error", "long"],
    "previews": {                      // static HTML for each state, styled only with the token variables below
      "default": "<main class=\\"list\\">...</main><style>.list{padding:var(--space-4);font:var(--weight-body) var(--size-body)/var(--leading-body) var(--font-body)}</style>",
      "empty": "...", "loading": "...", "error": "...", "long": "..."
    },
    "notes": "Rows open inline; Enter approves, R starts a return",
    "current": "<img alt=\"Orders today\" src=\"data:image/png;base64,...\">"   // existing screen: how it looks now, shown as Now on the page
  }],

  "testing": {
    "runIt": { "start": "npm run dev", "ready": "http://localhost:3000", "drive": "browser", "data": "npm run seed:demo" },
    "uiChecks": [
      { "check": "Accessibility", "command": "npx playwright test e2e/a11y.spec.ts" },
      { "check": "Performance budgets", "command": "npx lhci autorun" }
    ]                                  // or { "na": "<why>" }
  },

  "steps": [{
    "id": "S1",
    "title": "Tokens in the theme, base components with their states",
    "screens": [],                     // the screen ids this step builds; every screen is built by some step
    "files": ["src/styles/tokens.css", "src/ui/Button.tsx"],
    "tests": [{ "test": "Button shows a spinner and keeps its label while loading", "kind": "unit" }],
    "doneWhen": "Component tests and axe pass for every state; screenshots match the token specimen",
    "status": "todo"
  }]
}
```

## Previews

The page renders each preview in a sandboxed frame (no scripts), with the tokens turned
into CSS variables and the fonts loaded, at phone, tablet and desktop width:

- `--color-<name>` for each color (dark overrides apply when the viewer picks dark)
- `--font-<role-slug>` for each family, by the first word of its role (`--font-headings`,
  `--font-body`)
- `--size-<name>`, `--leading-<name>` and `--weight-<name>` for each step of the type scale

Google fonts load in the previews with the `weights` listed (only weights the family has).
Images in previews are inline `data:` URIs or left out; nothing else loads. A direction
option's `preview` in a decision is self-contained, with its own styles, since the tokens
come after the choice.
- `--space-1` … `--space-n` in order, `--radius-<name>`, `--shadow-<name>`

Write previews as plain HTML and CSS using only those variables, with realistic content.
Static is the point: they show the look and each state, and the build makes them real.
