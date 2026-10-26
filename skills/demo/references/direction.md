# Directing the film

What separates a demo people share from one that looks generated. The numbers come from
HyperFrames' measurements of its own launch films (its `/hyperframes` skill: `story.md`,
`motion.md`, `types/launch.md`, `review.md`) and from product-launch-motion; where this file
and a person's reference film disagree, the reference wins for its own beat.

Most weak demos are good motion around no story: a feature list, three cards in a row, a
logo, a URL. Story first, then look, then motion.

## 1. The spine

- **What it is,** in one line ("You can now …"). A whole release isn't one thing: take its
  headline.
- **The one thing to remember,** in the viewer's words, not the slogan.
- **One viewer doing one real task,** from the moment they need it to the result, with one
  real piece of data (a query, a file, a number) travelling from the hook to the payoff.
- Facts (what it does, real numbers, real labels) stay apart from creative choices (angle,
  tone, look). Every claim traces to the code, the docs or the user's words. Never derive a
  claim ("40 min to 2 min" is not "20× faster").

## 2. Three storylines, then one

Write three different films, not three titles on one film. Each has its own **device**
(what the story is), **form** (how the camera and cuts carry it) and **world** (where it
happens, what it looks like). Sketch five or more pairings first, drop what the product
can't carry, keep the three that differ most, and make one the bold one you wouldn't have
picked first.

| Device | What the viewer sees |
| --- | --- |
| A moment in someone's day | a person, a time, the message that creates the need |
| The cursor does the work | a cursor carries, drags and clicks; every cut has a cause |
| The feature as the hook | the feature working on something recognisable in the first half second |
| The result first | the finished output plays, then the camera pulls back to where it came from |
| One object across apps | the thing being made travels into the product, which keeps working on it |
| Before and after | the old way failing as a scene, then the new way calmly working |
| Type carries the argument | giant kinetic words and color fields that cut on the beat |
| A number lands | one real number earned by a scene, then made physical |
| A question with the input | "What if your ⟨docs⟩ were a course?", the blank filled by a real input |

| Form | What the viewer sees |
| --- | --- |
| One continuous take | the camera never cuts; it pushes and travels from world to world |
| Object-to-object chain | every shot ends on the thing that opens the next |
| An endless zoom | the camera dives into a detail that becomes the next world |
| Cut on the beat | hard cuts on the music, type and color changing every half beat |
| Match cuts | one shape holds while everything around it changes |
| Split screen to one | several panes at once collapse into the one that matters |
| One frame that rebuilds | one composition keeps rearranging and never leaves the frame |

A pitch where all three are plain cuts between scenes hasn't tried the forms. Each
storyline says: its name, device and form, what the viewer sees and feels (two sentences),
the first two seconds exactly, its beats in one line, its look in one line, its sound in
one line. Recommend one, with the reason in a clause. Pick for the story a stranger would
follow and remember, ahead of the most striking picture.

## 3. Hook and beats

Frame 0 is the thumbnail: never black, never a logo alone. Open on the product working on
something recognisable, the moment that creates the need, a question with the input in it,
or the bug itself. Let the old way fail on screen before the product brings relief.
Typing into a prompt box as the opener, with nothing else on screen, is the tell of a
generated film.

A launch of about 35 s (scale it; the device bends it):

| Beat | Share | Job |
| --- | --- | --- |
| Hook | ~8% | the world and the need, or the feature already working |
| Tension | ~12% | the old way failing on screen |
| Reveal | ~8% | the product named, 20 to 30% in |
| Proof | ~40% | the real task in the real UI as 3 to 6 verbs (paste, pick, watch it build), one each |
| Payoff | ~20% | the output arrives, already moving: the biggest moment, once, 60 to 80% in |
| Claim | ~8% | the one thing, in one line |
| End card | ~8% | the mark lands, the name and the call to action hold 2 to 3 s |

Copy: at most 6 words a title line, one line at a time, no trailing periods on titles.
Never "Introducing" first, never "unlock", "seamless", "supercharge", "effortless". Read the
lines alone: a stranger gets the pitch. Watch the pictures alone: they tell the same story.

## 4. The look and its worlds

Left alone, the same brief comes out with the same look every time. The look comes from
outside: the product's design tokens, its CSS, a brand page, a reference film, the
subject's own world. Write it as numbers (hex, a named face and weight), with
`look.source` saying where it came from.

- Inter, Space Grotesk, Instrument Serif, Geist and JetBrains Mono are where generated
  design lands: use them when the product does, not by default.
- A film visits several **worlds**, each with its own ground (`look.grounds`, a scene's
  `ground`): the product's light ground, a dark world for the end card, a color field for
  the claim. Never one dark canvas with small UI floating in it. Keep one home world to
  return to, and the palette and type constant across them.
- The accent is rationed: one highlighted word, the payoff, the end card.
- Video facts: full-frame linear gradients on dark grounds band under H.264 (use a solid
  or a radial glow); an accent under 15% opacity disappears in compression.

## 5. Motion craft

- **Arrive slow, leave clean.** Arrivals land on long-tailed ease-outs (`expo.out`,
  `power4.out`); camera moves and color floods ease both ways (`power2.inOut`); a zoom
  through or an exit accelerates (`power3.in`). The same `power2.out` at 0.5 s on
  everything is what makes a film feel generated.
- **Springs** by damping: 1 never bounces, 0.7 to 0.85 reads premium, 0.4 to 0.6 playful.
  Position and size may bounce; opacity and color never do (`c.spring(0.75)`).
- **Exits** are 40 to 50% shorter than entrances. **Overlap:** the next element starts when
  the last is 30 to 50% done. **Stagger:** letters a frame apart, words 60 to 120 ms, list
  items 40 to 80 ms.
- **Titles land, then hold dead still**; the motion moves to the next element, the camera
  or the world behind. Vary entrances across the film (`look.titles` rotates them): `blur`
  (word by word out of a blur), `ink` (grey words turn to ink), `mask` (from behind an
  edge), `line`, `letters` (for a name), `snap`, and a slot-machine word
  (`<em data-roll="plan|design|build">ship</em>`).
- **Holds:** a line holds 0.5 s plus 0.3 s a word; the last line at least 2 s.
- **Size:** titles 4 to 9% of the frame's height, or hero words filling 60 to 90% of the
  width (`fit`); quiet lines 2.5 to 4%; nothing a phone can't read (26 px at 1080p).
- **Rhythm:** contrast speeds. A demo holds one framing 7 to 10 s while the UI acts; shots
  average 2 to 3 s with motion inside them; hold 0.3 to 0.75 s before the payoff, which
  plays at normal speed.
- **Generated defaults:** breathing or floating loops on titles; titles that keep sliding
  or scaling after they land; a slow creeping zoom late in a scene; bounce on UI; click
  rings; every scene entering the same way; everything fading and sliding up.

## 6. Transitions with a cause

Use 3 to 5 kinds in a film, each caused by something on screen. At most a third of the
seams are hard cuts; worlds never crossfade. Set each scene's `transition` (how it arrives):

| Transition | What happens | Needs |
| --- | --- | --- |
| `zoom-through` | the camera tracks to an element, then dives through it; its fill becomes the next frame | `via` (an element of the scene before), or the last click of a recording |
| `grow` | an element (a button, a card, a chip: something with a fill) grows past the frame; the next scene fades in inside it | `via`, or the last click |
| `iris` | the next world opens as a circle from a point | another ground on the next scene, or a recording; `point` or the last click |
| `whip` | a sideways smear out; the next scene lands blurred and sharpens | `dir` (left or right) |
| `blur` | the ground stays; one blurs out, the next blurs in | |
| `dip` | the frame darkens for three frames before a hard cut, so it reads as meant | |
| `match` | a hard cut on frames that match: hand-made scenes built so the last frame of one is the first of the next (a shape holds while the world changes) | both sides hand-made |
| `cut` | a hard cut: inside a beat, or on the music | |

A morph (one container widening into the next), a carry (the result shrinking and landing
inside the next app) or a color flood (the hero stays while the ground changes) happen
inside one hand-made scene that holds both beats.

## 7. The product on screen

Everything that claims to be the product is the product. One invented button loses
everyone who uses it.

- **Recordings** are the proof: the real app driven by the shot, with a camera that cycles
  between the window on its ground (`frame: "window"`), the full screen and a punch-in on
  the control being used (up to 2×), a big cursor whose click causes the next thing, and no
  click rings.
- **Rebuilt pieces** (a hand-made scene): only the part the beat uses (the panel, the
  button, the row that changes), at 1.6 to 2× its real size, in the product's own tokens
  and copy taken from the code. Containers morph instead of cutting: the button becomes the
  menu. The cursor (`k.cursor`) enters from off-screen and causes each change on the frame
  it clicks. Never a made-up dashboard, never product UI tilted in 3D.
- A screen you can't get is a labelled placeholder, said in chat, never drawn from memory.

## 8. Sound

- With music, the music leads: find its beats (`npx hyperframes beats` in `video/`), put
  `sound.music.beats` in the plan, and cut on the beat (the composer notes seams more than
  2 frames off). A move that must land on a hit starts 40 to 190 ms early.
- A short film plays from a strong section of the track, not its quiet intro
  (`sound.music.start`).
- UI sounds (`sound.sfx`) land on the frames of clicks, keys and typing in the recordings,
  on transitions, on a number landing and on the end card; a hand-made scene adds its own
  (`make.sfx`). They sit under the music.
- You can't hear the render: measure it (`npx hyperframes audio <render> --json`) and say
  it was measured, not heard.

## 9. Tells of a generated film

Name any of these you see on a frame, and replace it with something from the product, the
brand or the subject:

- a dark void with small things floating in it; glow and particles;
- the cream-paper, serif and mono-label look when the product isn't like that;
- everything fading and sliding up; every scene entering the same way;
- three cards in a row; a feature list; side-by-side panels standing in for a scene;
- a title over a dimmed screenshot; the logo docked small in a corner;
- titles that keep moving after they land; breathing loops; click rings;
- typing into a prompt box as the opener.

## 10. Reviewing as a harsh motion director

You wrote the timeline, so you know what happens; the viewer sees it once, at full speed,
on a phone.

1. `npx hyperframes check`: fix every error, and every warning unless it's on purpose
   (say why). `nested_structure_needs_subcomposition` is expected: the composer builds one
   timeline so transitions can cross scenes.
2. `npx hyperframes snapshot --review --describe false` writes three sheets: each scene at
   its start and middle, a strip across every seam, and the beats at phone width. Open all
   of them.
3. Describe each beat frame in one sentence as a stranger would. An object you'd have to
   explain is a P0. Do the frames, in order, tell the storyline with the words covered?
4. Write each problem as `t=4.2s · where · problem → exact change`, ranked: **P0** breaks
   the read (unreadable, wrong, a tell in the hero shot), **P1** weakens the film (a dead
   stretch, a soft payoff, a seam that jumps), **P2** polish. Fix the P0s and the P1s worth
   it, text first, then timing, then detail; snapshot only what changed. Never score the
   film out of 10: a score finds nothing to fix. A busy film: remove a third of the motion.
5. Record the creative calls, what was measured and what was only looked at, and the
   weakest shot, in `plan.js` `qa`.
