# guide.js format

`<guide folder>/guide.js` holds the whole guide, and `index.html` next to it (a copy of
`assets/learn.html`) renders it, re-reading it every few seconds. The file must be exactly:

```
window.NAQSHA_GUIDE = { ...strict JSON, 2-space indent... };
```

No comments, trailing commas or code. Text is plain: `` `backticks` `` for code. In `body`,
`intro` and check answers, a blank line starts a new paragraph, and a block whose lines all
start with `- ` is a list.

```jsonc
{
  "meta": {
    "title": "YarSun: on-device AI wellness companion",
    "plan": "ai-therapist",          // the plan folder it explains, or null with no plan
    "scope": "Full guide",           // "Tour", "Full guide", or "Topic: data storage"
    "audience": "New to mobile development; maintains it alone",
    "commit": "03257c3",             // git rev-parse --short HEAD when written
    "generated": "2026-10-24"
  },
  "intro": "Two or three sentences: what this guide covers and how to use it.",

  "chapters": [{
    "id": "C1",
    "title": "The big picture",
    "summary": "One sentence: the single idea to take away.",
    "body": "Paragraphs...\n\n- a list item\n- another",
    "diagram": "flowchart LR\n  U[You] --> A[App]",   // Mermaid; optional
    "why": [{
      "text": "Everything runs on the phone, so nothing you say leaves it.",
      "source": "Q8"                // Q#, D#, N#, T#, S#, a URL, or "not recorded"; never invented
    }],
    "where": [{ "path": "app/src/main/java/chat/ChatSession.kt", "line": 42, "what": "Where a reply is streamed" }],
    "try": ["Open `ChatSession.kt:42` and find where the reply stops if the safety check fails."],
    "check": [{ "q": "Why is there no server?", "a": "Because nothing may leave the phone (Q8)..." }]
  }],

  "map": [{ "path": "app/src/main/java/chat/", "what": "The chat screen and its session logic" }],
  "glossary": [{ "term": "LiteRT", "meaning": "Google's runtime for running AI models on the phone itself" }]
}
```

## Rules the page relies on

- Chapter ids are stable (`C1`, `C2`…), so reading progress survives a rewrite of the guide.
- Every `where` path exists at `meta.commit`, and its line points at what `what` names.
- Every `why` has a `source`; "not recorded" is an honest answer, an invented reason is not.
