# Shoulder data

- `bones.bin`, `bones.json`: the right shoulder's bones (shoulder blade, collarbone, upper arm, forearm,
  ribs 1 to 7, breastbone), as scanned.
- `muscles.json`: the built muscles. Each is a stack of slices fitted to the scan of the same muscle, so
  that the page can bend, thin and tear it. `node tests/shoulder/review.mjs` checks every built muscle
  against its scan.

Both are made by `node tests/shoulder/build-data.mjs` from:

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.
<https://dbarchive.biosciencedbc.jp/en/bodyparts3d/>

Changes from the original: axes turned (the page's y is up and z is forward), positions packed to 16 bits
per axis, and the muscles rebuilt as fitted slices.
