---
name: prose-lint
description: Rewrite plodding on-screen text and descriptions (captions, briefs, stage titles, info cards, README prose) into short, plain, accurate sentences. Use when writing or changing any text a visitor reads.
---

# prose-lint

Use this whenever you write or change text that a visitor reads: captions, level briefs, stage titles, info cards, labels, taglines, and the prose in the README. Gabe wrote these rules by choosing between rewrites one at a time. The examples are his picks or his own words, so copy their style.

## The style in one paragraph

Short, complete sentences with a clear subject and a verb. One fact per sentence. Plain and conversational, like explaining to a smart friend. Nothing figurative. Every sentence is true of what the page draws and computes.

## Process

1. Read the text and the code that draws or computes what it describes. Check each claim against the code.
2. Search the page for the same fact elsewhere (a stage caption and an info card often repeat each other). Say it once, in the place a reader will look.
3. Rewrite with the rules below.
4. Run `.claude/skills/prose-lint/check.sh <files>` and fix what it flags, or decide that a hit is fine.
5. Keep every number, unit and physical claim. If a rewrite changes the meaning, stop and ask.

## Rules

1. **Subject and verb.** A noun phrase is not a sentence. Body text is made of sentences. See "Headings" below for titles, taglines and labels.
2. **One fact per sentence.** Let the next sentence say what follows. A cause may share a sentence with its effect through "so" or "because".
   Before: `Seen from outside, the leaf's red is the yellow of its chloroplasts and the crimson of its vacuoles together.`
   After: `The chloroplasts are yellow and the vacuoles are crimson. Together they make the leaf look red.`
3. **Say what has happened, then where things stand.**
   Before: `The vesicle is gone and its lipids keep mixing with their neighbours.`
   After (Gabe's): `The vesicle has flattened and disappeared into the membrane. All the lipids are mixed together, and keep mixing.`
4. **Possessives.** Use "the" when the sentence is about one named thing. Cut "their" and "its" unless the owner would be unclear. Two or more "its" in one string is a smell.
   Before: `Cells far from a vein lose their chlorophyll first. Those beside it keep theirs a few days longer.`
   After: `Cells far from a vein lose their chlorophyll first. Cells beside a vein keep it a few days longer.`
5. **No metaphor or idiom.** No "pays for", "pulls the trigger", "lets go", "swallowed". Plain motion verbs are fine ("rush in"). Put jargon that is figurative in quotes: SNAREs 'zip' closed.
6. **Constraints first, then the objective.** Say what is allowed, then what is being optimized, and define a measure before using it ("cheapest", "best", "lowest").
   After (Gabe's): `An edge is routed using horizontal and vertical runs to avoid intersecting a node. Various routes are considered based on a 'cost' that penalizes extra length, too many bends, and other factors. The lowest-cost route is chosen.`
   A caption is a summary. Name the main factors and write "and other factors". Do not list everything.
7. **Titles summarize.** A title says the main thing that happens: `Calcium triggers fusion`, not `Calcium pulls the trigger`.
8. **Add the one fact a newcomer needs, and say what causes what.**
   After (Gabe's): `A nerve impulse opens channels that allow calcium from outside the cell to rush in. The calcium binds to synaptotagmin, which causes the SNAREs to 'zip' closed, forcing the two membranes together.`
9. **Every sentence must tell the reader something they will use.** A sentence that only restates a convention ("From here on, parallel rays stand for one far-off point") says nothing until the reader knows where it applies. Cut it, or make it concrete.
10. **Cut what the screen already says.** If a label or control shows it, the text need not.
11. **Say each fact once.** A stage caption tells what happens in order and only names the part. The info card says what the part is and does.
    Stage: `...which causes the SNAREs to 'zip' closed...` Card (Gabe's): `Synaptotagmin is the calcium sensor. When calcium binds its two C2 domains, they push into the cell membrane and start the SNARE "zipping".`
12. **No timing inequalities in captions** ("within a fraction of a millisecond") unless the number is the point.
13. **Check against what is drawn.** Name the thing that really does it. The burned gas glows, not the cylinder; the glow is drawn so the gas can be told apart.
14. **Run-ons.** Split a sentence of 30 or more words. A colon may introduce a term or a list. Do not use it to join two clauses; use two sentences or "so".

## Headings, taglines and labels

Titles summarize (rule 7). A tagline or a small label under a part name may be a phrase, if it completes the name above it ("Piston: slides up and down in the cylinder"). Body text may not be a phrase. This is the one place the rules are not settled; see the open issue about round 2.

## Always keep

- Wavelength is physical and color is perception. Write "short wavelengths, which we see as blue", and "drawn in gold" for a color that is only the picture's. White light is a mix of wavelengths.
- American English: color, center, meter, gray, neighbor.
- Show, don't tell: a sentence or two per brief, and a control or picture does the explaining.
- No new floating labels on a canvas. Put facts in the panel.
- Numbers on screen come from the model in code. A rewrite never types a number that the code computes.

## Before and after, from Gabe's picks

| Before | After |
|---|---|
| A cylinder glows from its spark until its burned gas has cooled. | After the spark, the burned gas glows. It stops glowing when it has cooled. |
| The stacks of membrane are taken apart and their chlorophyll is broken down. The chloroplasts shrink and turn yellow: carotenoids are what is left in them. | The chlorophyll breaks down and the membrane stacks come apart. Only carotenoids remain, so the chloroplasts shrink and turn yellow. |
| Anthocyanin dissolves in water, so it collects in the vacuole and not in the chloroplasts. Seen from outside, the leaf's red is the yellow of its chloroplasts and the crimson of its vacuoles together. | Anthocyanin dissolves in water, so it collects in the vacuole, not in the chloroplasts. The chloroplasts are yellow and the vacuoles are crimson. Together they make the leaf look red. |
| From far away, the light a lens catches from one point is a bundle of parallel rays, and the picture of that point is a small spot, one focal length behind the lens. From here on, parallel rays are... | Rays from a far-off point reach the lens parallel to each other. The lens focuses them to a small spot, one focal length behind it. That spot is the picture of the point, and the smaller it is, the sharper the picture. |
| The calcium sensor. Its two C2 domains bind calcium and plunge into the cell membrane, which triggers fusion within a fraction of a millisecond. | Synaptotagmin is the calcium sensor. When calcium binds its two C2 domains, they push into the cell membrane and start the SNARE "zipping". |
| Each edge takes the cheapest path... A path pays for its length, its bends and any box it cuts through. | An edge is routed using horizontal and vertical runs to avoid intersecting a node. Various routes are considered based on a 'cost' that penalizes extra length, too many bends, and other factors. The lowest-cost route is chosen. |

## Where this came from

Built by choosing among A/B/C rewrites in the project thread on 2026-11-20. The raw corpus, the options and the choices are in the project files under `prose-lint/`.
