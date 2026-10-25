# A demo's plan.js

A demo lives in `<plans>/demos/<slug>/plan.js`, in the same `window.NAQSHA = <JSON>;`
format as a plan, so the page renders it with its own tabs (Story, Style, Video). It is not
a plan to approve or build: there's no lock and no `/naqsha:approve`. `questions` (with
`phase`), `decisions` (options with `preview`) and `changelog` follow
`${CLAUDE_PLUGIN_ROOT}/skills/plan/references/plan-format.md`.

```js
window.NAQSHA = {
  "meta": {
    "title": "Mentora: 30-second launch video",
    "slug": "launch",
    "kind": "demo",
    "status": "storyboard",            // storyboard | producing | rendered
    "created": "2026-10-25", "updated": "2026-10-25",
    "engine": "hyperframes@0.8.196",   // the version used, pinned for re-renders
    "length": 30,                      // seconds, the target
    "formats": ["16:9", "9:16"],
    "narration": "captions",           // captions | local voice | provider voice (with the user's yes)
    "design": "docs/plans/mentora-design"   // where the tokens come from, if anywhere
  },

  "summary": {
    "goal": "Launch post on X and LinkedIn; viewers sign up for the beta",
    "audience": "Self-taught developers who stall on long courses",
    "remember": "Mentora turns any doc into a daily 10-minute lesson",
    "cta": "Join the beta at mentora.app"
  },

  "story": { "hook": "A 400-page doc collapsing into one 10-minute lesson", "kind": "hybrid" },

  "look": {                            // the chosen template; fonts are .woff2 files in the demo folder
    "template": "signal",              // signal | paper | blueprint
    "entrance": "mask",                // mask | snap | cut: how titles arrive
    "colors": { "accent": "#4d7cff" }, // optional overrides: bg, ink, dim, accent, panel, line, frame
    "fonts": { "display": { "family": "Inter Tight", "file": "fonts/InterTight.woff2" },
               "mono": { "family": "IBM Plex Mono", "file": "fonts/PlexMono-500.woff2" } },
    "templates": { "paper": { "fonts": { "display": { "family": "Fraunces", "file": "fonts/Fraunces.woff2" } } } }
  },

  "scenes": [{
    "id": "SC1", "kind": "motion", "seconds": 4,
    "shows": "The hook",
    "caption": "400 pages. Ten minutes a day.",
    "make": { "type": "title", "lines": ["400 pages.", "Ten minutes a day."], "sub": "Mentora turns docs into <em>daily lessons.</em>" }
  }, {
    "id": "SC2", "kind": "motion", "seconds": 3.5, "caption": "Long courses stall. You stop on page 40.",
    "make": { "type": "statement", "lines": ["Long courses stall.", { "text": "You stop on page 40.", "tone": "accent" }], "texture": "code" }
  }, {
    "id": "SC3", "kind": "motion", "seconds": 4, "caption": "One command adds a course.",
    "make": { "type": "terminal", "above": ["One command adds a course."], "command": "mentora add https://docs.example.com",
              "output": "Added: 42 lessons, 10 minutes each.", "lock": "" }   // lock: "close" | "open" | ""
  }, {
    "id": "SC4", "kind": "recording", "caption": "Paste a link. Get today's lesson.",
    "make": { "type": "recording", "rec": "sc4", "segments": [[1.5, 8.2]],   // seconds of capture/sc4/recording.webm
              "caption": ["Paste a link.", "Get <em>today's lesson.</em>"] }   // a recording scene lasts as long as its segments
  }, {
    "id": "SC5", "kind": "motion", "seconds": 4, "caption": "Mentora",
    "make": { "type": "end", "name": "Mentora", "tagline": "Learn a little, <em>every day.</em>", "command": "mentora.app",
              "note": "" }                // optional small line, e.g. a credit: "Made with <em>/naqsha:demo</em>"
  }],

  "renders": [                         // filled by production; the Video tab plays them
    { "file": "renders/launch-16x9.mp4", "format": "16:9", "seconds": 30.0 },
    { "file": "renders/launch-9x16.mp4", "format": "9:16", "seconds": 30.0 }
  ],
  "poster": "renders/launch-poster.png",
  "captions": "renders/launch.srt",

  "qa": [{ "check": "Frames at every scene boundary", "result": "pass: text readable at phone size, nothing sensitive" }]
}
```

Files the page plays live in `<demo>/renders/` and are named with letters, digits, `.`,
`_` and `-` only.
