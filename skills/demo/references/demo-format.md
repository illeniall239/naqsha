# A demo's plan.js

A demo lives in `<plans>/demos/<slug>/plan.js`, in the same `window.NAQSHA = <JSON>;`
format as a plan, so the page renders it with its own tabs (Storylines, Storyboard,
Choices, Video). It is not a plan to approve or build: there's no lock and no
`/naqsha:approve`. `questions` (with `phase`), `decisions` (options with `preview`, `video`
or `storyline`) and `changelog` follow
`${CLAUDE_PLUGIN_ROOT}/skills/plan/references/plan-format.md`.

```js
window.NAQSHA = {
  "meta": {
    "title": "Mentora: 30-second launch video",
    "slug": "launch",
    "kind": "demo",
    "status": "storyboard",            // storylines | storyboard | producing | rendered
    "created": "2026-10-25", "updated": "2026-10-25",
    "engine": "hyperframes@0.8.200",   // the version used, pinned for re-renders
    "length": 30,                      // seconds, the target
    "formats": ["16:9"],
    "fps": 30,                         // optional: 60 for a filmic, smoother render
    "narration": "captions",           // captions | local voice | provider voice (with the user's yes)
    "design": "docs/plans/mentora-design"   // where the tokens come from, if anywhere
  },

  "summary": {
    "goal": "Launch post on X and LinkedIn; viewers sign up for the beta",
    "audience": "Self-taught developers who stall on long courses",
    "remember": "Mentora turns any doc into a daily 10-minute lesson",
    "cta": "Join the beta at mentora.app"
  },

  // Three different films (direction.md section 2). Each hook is the look and the first
  // five seconds or so of scenes, composed with --storyline and rendered to its clip.
  "storylines": [{
    "id": "S1", "name": "The doc collapses", "recommended": true,
    "device": "The result first", "form": "An endless zoom",
    "sees": "A 400-page doc collapses into one ten-minute lesson, then the camera dives into the lesson to show how it was made.",
    "first": "The page count 400 already on screen, rolling down to 1.",
    "beats": "400 pages → one lesson → paste a link → today's lesson → streak → join the beta",
    "look": "Mentora's paper and green, Fraunces display, a dark world for the end card",
    "sound": "a soft click on each action, a bass hit on the end card",
    "clip": "renders/storyline-S1.mp4",
    "hook": { "look": { /* as "look" below */ }, "scenes": [ /* as "scenes" below */ ] }
  }],
  // The pick: a decision whose options point at storylines (the page shows the rest).
  // "decisions": [{ "id": "D1", "phase": "Storyline", "question": "Which film should this be?",
  //   "options": [{ "name": "S1 · The doc collapses", "storyline": "S1" }, …], … }]

  "story": { "hook": "A 400-page doc collapsing into one 10-minute lesson", "storyline": "S1" },

  // The look, from the product: its tokens, its CSS, its brand. Hex colors; the rest of
  // the palette (dim, panel, line) is derived unless given.
  "look": {
    "source": "Mentora's tokens in src/styles/tokens.css: paper, ink, leaf green; Fraunces and Inter (the product's own)",
    "colors": { "ground": "#f7f5ef", "ink": "#16201a", "accent": "#1f7a4d" },
    "grounds": { "night": { "ground": "#0e1a14", "ink": "#eef3ee", "accent": "#6fd39b" } },   // other worlds
    "fonts": { "display": { "family": "Fraunces", "file": "fonts/Fraunces.woff2" },
               "text": { "family": "Inter", "file": "fonts/Inter.woff2" },          // optional, else display
               "mono": { "family": "IBM Plex Mono", "file": "fonts/PlexMono-500.woff2" } },
    "type": { "weight": 600, "track": "-0.03em", "upper": false },
    "titles": ["blur", "ink", "mask"],  // entrances, rotated across titles and statements
    "blur": true                        // render-time motion blur on fast moves (the default)
  },

  "sound": {
    "sfx": true,                        // UI sounds on clicks, keys, typing, transitions, landings
    "music": { "file": "audio/track.mp3", "license": "CC BY 4.0: \"Morning\" by A. Artist, openverse.org/…",
               "start": 12.0,           // seconds into the track: start on a strong section
               "volume": 0.7, "beats": "audio/beats.json" },   // optional; beats from `hyperframes beats`
    "voice": null                       // { "file": "audio/voice.wav", "at": 0 } when chosen
  },

  "scenes": [{
    "id": "SC1", "seconds": 3.5,
    "shows": "The hook",
    "caption": "400 pages. Ten minutes a day.",
    "make": { "type": "number", "value": "400", "suffix": "pages", "label": "Ten minutes a day." }
  }, {
    "id": "SC2", "seconds": 3, "caption": "Long courses stall.",
    "transition": "whip",               // how it arrives: cut | dip | whip | blur | iris | zoom-through | grow | match
    "make": { "type": "title", "lines": ["Long courses", { "text": "stall.", "tone": "accent" }], "fit": true, "enter": "ink" }
  }, {
    "id": "SC3", "seconds": 4, "caption": "One command adds a course.", "transition": "blur",
    "make": { "type": "terminal", "above": ["One command adds a <em data-roll=\"doc|wiki|book\">course</em>."],
              "command": "mentora add https://docs.example.com", "output": "Added: 42 lessons, 10 minutes each." }
  }, {
    "id": "SC4", "caption": "Paste a link. Get today's lesson.",
    "transition": { "type": "zoom-through", "via": "#SC3-term" },
    "make": { "type": "recording", "rec": "sc4", "segments": [[1.5, 8.2]], "frame": "window",
              "caption": ["Paste a link.", "Get <em>today's lesson.</em>"] }
  }, {
    "id": "SC5", "seconds": 4, "caption": "Your streak, kept.",
    "transition": { "type": "grow" },   // after a recording: from its last click
    "make": { "type": "custom", "src": "scenes/SC5.html", "sfx": [{ "at": 1.2, "sound": "pop" }] }
  }, {
    "id": "SC6", "seconds": 4.5, "caption": "Mentora", "transition": "dip", "ground": "night",
    "make": { "type": "end", "name": "Mentora", "tagline": "Learn a little, <em>every day.</em>",
              "command": "mentora.app", "mark": "media/logo.svg", "note": "" }
  }],

  "renders": [                         // filled by production; the Video tab plays them
    { "file": "renders/launch-16x9.mp4", "format": "16:9", "seconds": 23.4 }
  ],
  "poster": "renders/launch-poster.png",
  "captions": "renders/launch.vtt",

  "qa": [{ "check": "Review sheets, every beat and seam", "result": "P0 none; P1 fixed: SC4's punch-in held 0.6 s longer so the lesson reads" }]
}
```

## Scenes

Every scene has an `id`, a `caption` (verbatim, for the `.srt`), a `make`, and `seconds`
(a recording's length comes from its segments). From the second scene on, `transition` says
how it arrives (`direction.md` section 6): a name, or `{ "type", "via", "point", "dir",
"color" }`. `ground` puts it in another world from `look.grounds`. `enter` overrides the
entrance for a title or statement. The composer writes back `at` (its start in the film)
and `seconds`.

| `make.type` | Fields | What it is |
| --- | --- | --- |
| `title` | `lines`, `sub`, `size`, `fit` (true, or a share of the width), `align` | Big kinetic type: one or two lines, the first already there at frame 0 |
| `statement` | `lines` (strings or `{ text, tone: "dim" \| "accent" }`), `size` | A sentence, line by line across the scene |
| `number` | `value` ("1,240"), `prefix`, `suffix`, `above`, `label`, `size` | A number that lands on rolling digit columns, then its label |
| `terminal` | `above`, `command`, `output`, `lock` ("close" \| "open") | A command typed into a terminal, with its output |
| `recording` | `rec`, `segments`, `caption` (one or two lines), `frame` ("full" \| "window"), `zoom` | The real app: camera, cursor, keys, masks from the event log |
| `end` | `name`, `tagline`, `command`, `mark` (a logo in the demo folder), `note`, `align` | The mark lands, the name letter by letter, a rule draws, the call to action types in and holds |
| `custom` | `src`, `sfx` | A hand-made scene (`production.md`) |

Text takes `<em>` for the accent word, and `<em data-roll="a|b|c">word</em>` for a word
that rolls through options as it lands. Files the page plays live in `<demo>/renders/` and
are named with letters, digits, `.`, `_` and `-` only.
