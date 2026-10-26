# Finding a direction that isn't the default

Why designs come out generic, and the method that stops it. It draws on Anthropic's
frontend-design work ("distributional convergence") and Paul Bakaus's Impeccable (its
new-work method, Apache 2.0); read this before proposing directions.

## Why it happens

- **The center of the distribution.** Safe choices dominate what models learned from, so
  with nothing pushing elsewhere you land on the most probable page: Inter, a purple or
  blue gradient, rounded cards, a centered hero.
- **Avoiding the default lands on the next default.** "Not Inter" becomes Space Grotesk;
  "not a SaaS gradient" becomes cream paper with a serif. AI interfaces cluster around a
  few looks whatever the subject:
  1. warm cream ground, a high-contrast serif display, a terracotta or signal-red accent;
  2. near-black with one neon accent and glowing edges;
  3. broadsheet hairlines, an italic display serif, small tracked mono labels;
  4. flat saturated ink, black boxes, hard offset shadows, heavy condensed type.
  Each is right when the brief asks for it. Landing in one when the brief left the look
  free means the method below was skipped.
- **The ranking rut.** Ask for three directions and rank them, and your first pick is the
  category's usual page. Picking your favorite is how every run converges.
- **Mood words decide nothing.** "Clean, modern, bold, premium" describe the average. A
  direction is decided when it can be drawn: what is where, in what material, at what scale.
- **You can't see what you built.** Code that parses isn't a layout that works. Look at
  rendered screenshots, and have someone without your context judge them.

The self-check, for every direction: **could someone guess this look from the category
alone, or from the category plus "avoid the obvious"?** If yes, it isn't done.

## 1. Mode sets the ambition

From the screen's `mode` (`interface.md`): **persuade** and **experience** surfaces get full
commitment, a world with a point of view. **Operate** and **read** surfaces show ambition as
precision: known patterns earn their place, the task stays obvious, and the brand lives in
the details (type, color jobs, the signature interaction, the motion). A tool's landing
page is persuade; its settings screen is operate. An existing product's established world is
inherited (extend, refine): the method below runs only for a new or replaced world.

## 2. Name the ground, and the rut

In a few lines, in `direction`:

- **The mechanism:** what this product does that others don't, in one sentence.
- **The scene:** who uses it, where, under what light, in what hurry. One physical sentence
  that forces light or dark, density and size. Dark or light is never a default.
- **The cultural home:** the world its audience lives in (a trade, a hobby, a city, an era).
- **The rut** (`direction.rut`): the page this category always ships, and its predictable
  opposite ("not another dark dev-tool page" turning into cream editorial). Both are out.

## 3. Seven worlds from the audience's life

List seven concrete things the audience knows by heart (`direction.worlds`): visual
systems, artifacts, places, rituals, publications, notations, signage, data graphics,
interfaces it reads every day. For each: why it resonates and can carry the mechanism, and
how it looks (its ground and main colors, its type voices, the one signature that makes it
recognizable).

- Not the tools the audience operates: a terminal, a scope or a control panel on a working
  screen comes back as a costume of that tool. On persuade surfaces, at most one candidate
  may come from them.
- A literal reading of the product's name or metaphor counts toward the rut: at most one.
- Ask what this thing would look like as a physical object, and what its world looked like
  before the web.
- When more than three share one material family (all paper, all screens, all signage),
  you stopped at the obvious artifact: dig until the list spans three families or more.
- Awwwards and the category's best products are for the craft bar (finish, motion,
  composition), never the source of the world: they are a cluster of their own.

## 4. Let the roll pick, not your ranking

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-tool.js" roll <plan.js> 7` with the worlds
listed in your order. It deals which of them become directions (a lead and one or two more)
and records the deal. Then build those, fused with the product: the world supplies the form
and its grammar (palette, materials, type voices, composition, controls); the product
supplies every fact; clarity wins every conflict.

Show the user, as one decision with a rendered first viewport per option:

- the **dealt directions**, the lead first, each fully committed;
- **your own pick**, when the roll didn't deal it, labeled honestly: if it sits near where
  most designs in this category land, its risk line says so. Familiar and effective is a
  legitimate choice; the user makes it knowingly;
- one line offering the **category standard, played straight**, on request. Never
  recommend it, never let it soften the others; if the user takes it, ask for two or three
  products it should sit beside and match their craft.

The user may steer ("bolder", "safer", "more like the third") or re-roll. A brief that
pins a look, a brand, fonts or a palette beats the roll, always.

## 5. Commit the world

- **Color strategy before colors.** Restrained (tinted neutrals and one accent: common on
  operate and read), Committed (one saturated color carries 30 to 60% of the surface), Full
  palette (three or four named roles), or Drenched (the surface is the color). Persuade and
  experience surfaces may take the bolder ones. Color commits at page scale, fields that own
  whole regions, not accents sprinkled on a neutral ground. Tint every neutral from the world.
- **Faces are objects from the world.** On operate and read, workhorse UI faces and system
  stacks serve well. On persuade and experience, a face with a point of view, and these
  training-data defaults mean you stopped looking: Inter (as display), Roboto, Open Sans,
  Lato, Fraunces, Playfair Display, Cormorant, Lora, Crimson, Newsreader, Syne, Space Grotesk,
  Space Mono, IBM Plex, DM Sans, DM Serif, Outfit, Plus Jakarta Sans, Instrument Sans and
  Serif, Geist. Using one anyway needs a reason no other face could satisfy; "books want a
  serif" or "tech wants a mono" is the association the list exists to break. Contrast is
  extreme: weights like 200 against 800, sizes several steps apart.
- **Author the material; never substitute chrome.** Great surfaces live on made content:
  real names, entries, copy, covers, figures, textures, illustrations (inline SVG, CSS
  drawing, or images as `data:` URIs in a preview). Gradients, glass, glows, generic icon
  tiles and blobs where an authored asset belongs are the gap wearing chrome. Demonstration
  content is authored at full fidelity and labeled as sample where a visitor could mistake
  it; claims (prices, customers, numbers, capabilities) are never invented.

## 6. The direction contract

Before any screen, write the chosen direction as a contract (`direction.contract`), short
enough to read in a minute and specific enough to audit a screenshot against:

- **thesis:** the one idea this product owns, and the category arrangement it refuses.
- **world:** the palette and component language, recognizable with all content removed.
- **story:** what the visitor understands, believes and does.
- **firstViewport:** the exact composition: what is where, at what scale, where the
  primary action sits. The first viewport is a thesis, not a header: it shows the mechanism
  working, at the scale it has in life. If someone left after one viewport, what would they
  describe an hour later? If the answer is a mood, it isn't decided.
- **signature:** the one interaction or motion that is this product's, and the motion
  grammar around it (how things enter, respond and transition), orchestrated once rather
  than scattered.

If a line reads like a mood, the direction isn't decided yet.

## 7. Build every atom, then look

Every screen is built in the world's vocabulary: navigation, buttons, inputs, tables,
empty states. A stock component inside a committed world is a lapse. Pace a long page like
a studio: vary density, scale and quiet inside one grammar; one spacing rhythm, more space
above a heading than below it; end on a real close.

Then look, as `/naqsha:design` section 7 says: screenshots of every preview at phone and
desktop width, judged by you and by a reviewer who has only the screenshots and the
contract. Two rounds of fixes is the ceiling; a round that resolves nothing ends it.
