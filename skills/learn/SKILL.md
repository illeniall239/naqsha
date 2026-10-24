---
name: learn
description: Teach the user what was built and why (every module, technology and decision, where it lives in the code, and how to change it) as a guide rendered on its own local webpage, then taught in chat at the user's level. Grounded in the naqsha plan (their answers, the decisions, the research) and checked against the current code. Run as /naqsha:learn [plan-folder | topic].
argument-hint: "[plan-folder | topic]"
disable-model-invocation: true
---

# Naqsha: learn

The user owns this code now and will maintain it. Your job is to make them understand it:
what was built, why it was built this way, what each technology is and why it was chosen,
where everything lives, and how to change it safely. You teach; you don't change the
project. The only files you write are the guide and its page.

The request: $ARGUMENTS

The hook's message above ("Naqsha learn: …") names the plans folder, the plans in it, and
where the guide goes. If it's missing, ask the user to send `/naqsha:learn` as a message of
its own.

## Rules that make it teaching, not storytelling

- **Every "why" cites where it came from:** the user's answer (`Q4`), a decision (`D2`), a
  quality scenario (`N1`), a threat (`T3`), or a research source's URL. If no reason was
  recorded anywhere, say so: `"source": "not recorded"`. Never invent a reason that sounds
  right; a confident wrong "why" is worse than an honest gap.
- **Every "where" is checked against the code as it is now,** not the plan: the path exists,
  and the line points at the thing named (find it with a search, then read it). Where the
  code differs from the plan, say so in the chapter.
- **At the user's level.** `meta.developer` and their answers say who they are. Explain a
  term the first time you use it, and put it in the glossary. Concrete beats abstract:
  "when you tap Send, `ChatScreen.kt:88` calls…" teaches more than "the UI layer delegates
  to the domain layer".
- **No filler.** Every sentence is about this project. If a line would fit any app, cut it.

## 1. Scope and audience

- Pick the plan: the folder the user named, else the newest plan that's been built (status
  `building` or `done`), else the newest plan. With no plan at all, the guide comes from the
  code, its git history, its README and docs; most whys will then be "not recorded", and
  the guide says so up front.
- A topic in the request ("auth", "how data is stored", a file path) narrows the guide to
  the chapters that cover it.
- Ask the user, in one AskUserQuestion call:
  - **How deep:** a tour (the big picture, one flow traced through the code, how to change
    things, and the file map), the full guide (every chapter below), or just the topic.
  - **What they already know,** with what `meta.developer` says as the recommendation.

## 2. Gather the facts, cheaply

- The plan's whys: `node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-tool.js" digest <plan>/plan.js`.
  It's a compact digest of the answers, decisions, research with sources, prior art,
  modules, threats, steps and what was rejected. Open `plan.js` itself only for something
  the digest doesn't carry, and read just that part.
- `<plans>/LEARNINGS.md`, if it exists: what the build learned the hard way belongs in the
  guide too.
- The codebase map, if the hook's message names one (`<plans>/CODEBASE.md`): start from
  it for the layout, commands and conventions.
- The code: `git log --oneline` for how it was built (steps land as commits), `git ls-files`
  for the map, and the files each module's `location` names. In a large codebase, use an
  Explore subagent (`model: "haiku"`) named Atlas ("Atlas · map the code") that returns
  `file:line` conclusions, not file contents. Write the guide yourself: what's true and why is the part that needs care.
- The current commit: `git rev-parse --short HEAD`, for the guide's `meta.commit`.

## 3. Write the guide

Write it to `<plans>/<slug>/learn/guide.js` (with no plan, `<plans>/learn/guide.js`) in the
format in `${CLAUDE_SKILL_DIR}/references/guide-format.md`; read it now. Chapters, in this
order, skipping any the scope leaves out:

1. **The big picture:** what it does, for whom, and its shape, as a diagram when there's
   more than one moving part. The stack in a line each.
2. **One flow, end to end:** the most important user action, traced through the actual
   files and functions it passes through, in order.
3. **The modules:** for each, its job, where it lives, what it exposes, and why the boundary
   is where it is.
4. **The technologies:** each framework, library and service: what it is, in plain words,
   why it was chosen, what was passed over and why (the decision that chose it), where it's
   used, and its docs.
5. **The data:** what's stored, where, in what shape, how it changes (migrations), and how
   long it's kept.
6. **Security:** what's protected, the threats, where each defense lives in the code, and
   the test that proves it.
7. **Tests and checks:** how to run them, where tests live, what each kind covers, how to
   add one.
8. **Running and shipping:** setup, running it, deploying it, what to watch in production,
   and what still needs the user.
9. **How to change things:** the changes they're most likely to make ("add a mood type",
   "change the model"): which files to touch, in what order, and which tests guard it.
10. **What was left out, and why:** the rejected options, the accepted risks, known debt.

Plus the **file map** (every folder and important file, one line each) and the
**glossary**. Give each chapter 2 to 4 **check yourself** questions with answers, and a
**try it** list of small read-only exercises ("open `x.kt:40`, find where the reply is
streamed").

## 4. Open the page

```
mkdir -p <guide folder> && cp "${CLAUDE_PLUGIN_ROOT}/assets/learn.html" <guide folder>/index.html
node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.js" start <guide folder> --open
```

Give the user the URL in one line too. If the server won't start, open `index.html`
directly; the page works read-only from a file.

## 5. Teach

The page is the reference; the conversation is the lesson.

- Walk them through it a chapter at a time, in a few lines each, not the whole chapter
  again: the one idea that matters most, and where to look. End each with one question
  that checks understanding, and adapt to the answer.
- Questions they send from the page arrive like page answers do: run
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.js" wait <guide folder>` in the background, and
  when it returns, answer in chat. Keep one `wait` running at a time; if it times out,
  tell them and stop, without restarting it on your own.
- Answer from the code and the plan, with `file:line` and the id behind each why. If a
  question shows the guide is wrong or unclear, fix the guide.
- Stop when they say so. Running `/naqsha:learn` again after the code changes rewrites the
  guide for the code as it is then.
