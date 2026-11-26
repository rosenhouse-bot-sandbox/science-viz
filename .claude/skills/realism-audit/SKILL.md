---
name: realism-audit
description: Audit a page for things that could not happen in the real world (matter that appears or vanishes, parts that pass through each other, parts that move without being driven, speeds or numbers that disagree), then fix them and show before and after pictures. Use when asked for a realism audit or review, when someone says a picture "looks wrong", and before calling a new page done.
---

# realism-audit

A cheaper model works the page and takes frames. The strongest model reads the frames and the code, and decides what is wrong. This skill is the same for every page. What must stay true on one page is in that page's `README.md` (`engine/README.md`, `gears/README.md`, and so on).

## Who does what

- **Reviewer**: you, on the strongest model at high effort. You write the expectations, read every frame, confirm each finding in the code, and fix.
- **Operators**: sub-agents on a cheaper model (Sonnet). An operator writes shot lists, runs them, and checks that each frame shows what was asked. An operator does not judge realism.
- **Second reader**: one fresh sub-agent on the strongest model. It gets the sheets, the words on screen and the expectations. It does not get the code or your findings.

This skill asks for those sub-agents. Run at most three captures at once on four cores.

## Steps

1. **Read the page's rules.** Read `<page>/README.md`, the page's section of the top `README.md`, and the notes on the page itself. A simplification the page already says is not a finding. If the page has no README, copy `README-template.md` from this folder.
2. **Write expectations before looking.** From the list of scenes and from first principles, write what physics, chemistry or anatomy says each scene must show. Give each a tag (`ENG-B4`). Start from "Every page" below and the README's rules. Save them as `tests/audit/out/<page>/expectations.md`.
3. **Read the code for candidates.** Note what the model computes and what is only drawn. Take numbers from the page's modules run in Node, never from a picture.
4. **Plan the sets.** A set steps one thing and holds the rest, so motion shows from frame to frame. Cover:
   - every stop, and between stops in small steps
   - one full cycle of anything that plays
   - every control and option
   - each moving part from several starting states, with the other parts in different places
   - sides the page does not open on (behind, below, inside)
   - a few seeded random states
   - desktop, and phone at twice the sharpness
5. **Operators take the frames.** Give each operator one page or one part of it, the README's "Taking frames" lines, the sets, and the expectations' tags for each set's note. The operator writes a plan like `tests/audit/example.json` and runs `node tests/audit/shots.mjs plan.json`. It returns the paths, and says which frames are blank, repeated or not what was asked.
6. **Read the frames.** Go through each sheet in order against the expectations. A small sheet hides small breaks, so open the full frame wherever something looks off. Check:
   - each part alone: shape, size, place, color
   - parts together: what touches what, what drives what, what is in front, what is conserved, how fast one moves against another
   - the words and numbers in `states.json` against the picture beside them
7. **Confirm each candidate.** Find where it comes from in the code. Compare with a published measurement where one exists, and keep the source. Drop it if the page says it on screen or the README lists it under "Checked and right".
8. **Get the second read.** Add what the second reader finds, after confirming it the same way.
9. **Write the findings, worst first.** For each: page and stop, severity, what the page shows, what the real thing does, the address that shows it (with its hash), the frames, the file and function. No fix in the finding. File them as GitHub issues only when asked.
   - **High**: a viewer learns something false.
   - **Medium**: something visibly could not happen, but the main idea survives.
   - **Low**: a simplification the page does not say.
10. **Fix**, unless asked only to report. Fix the model, not the picture. A fix that changes what the page teaches is Gabe's choice: ask, and keep going on the rest. Where a test could have caught the finding, add the test (`tests/gears/collide.mjs` and `tests/vesicle/placement.mjs` began this way).
11. **Check again.** Run the same plans with `--out <after> --against <before>`. Read every before-and-after sheet, not only the sets that had findings. Run the page's tests from `CLAUDE.md`. Ask a fresh second reader to look at the transitions.
12. **Report.** Findings in order, each with its before-and-after picture. Say what is still open, and what was not seen (a real graphics card, a real phone, Safari).
13. **Update the page's README.** Add each new rule in one line, in Gabe's words where he gave them, with the date. Add what was checked and found right, what is open, and anything learned about taking frames.

## Every page

- Matter is conserved. Nothing appears from nowhere or vanishes.
- Nothing passes through a solid, a membrane or another part.
- A part moves only when something drives it, and the driver touches it.
- Anything shown at two zooms is shown at every zoom between them, at its true size.
- One object keeps its place, size and direction from scale to scale.
- If time is slowed N times, everything is slowed N times, or the page says what is not.
- Motion is only for what really moves.
- A finite patch is never drawn of something that is really everywhere.
- Numbers on screen agree with the picture and with each other.
- Light of one wavelength keeps it. Color is what we see.
- Anything simplified or drawn larger than life says so on screen.

## Taking frames

- `tests/audit/shots.mjs` writes numbered frames, the words on screen for each (`states.json`) and one sheet per set. A run that was cut off picks up where it stopped.
- Where WebGL is drawn in software a screenshot can take a minute. Set `canvas` in the plan to read the picture from the canvas.
- Do not put `+` in a hash value (`1e+06` is read wrongly).
- Do not judge a glide with reduced motion on. It makes the zoom jump on purpose.
- Do not edit a page's files while its page test runs. The test loads them live.
- The browser here is Chromium with software drawing. It says nothing about speed, and nothing about Safari.
