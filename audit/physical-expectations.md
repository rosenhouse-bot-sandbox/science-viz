# Physical expectations, written before looking at the pages

Written 2026-11-18 for the realism audit of Rainbows, Vesicle fusion, Japanese maple and Engine.
Each line is what real physics, chemistry or biology says the scene should show. They were written
from the README's list of scenes and from first principles, before any frame was recorded, so that
the recordings could be compared against them. Each has a tag (for example `ENG-C4`) that the
GitHub issues cite.

Rules that apply to every page:

- `ALL-1` Matter is conserved. Nothing appears from nowhere or vanishes; a count shown at one moment
  must be explained by what came in and went out.
- `ALL-2` Nothing passes through a solid wall, a membrane or another object.
- `ALL-3` Anything shown at two zoom levels is shown at every zoom between them, at its true size.
- `ALL-4` Things that are the same object keep the same place, size and direction across scales.
- `ALL-5` Speeds on screen agree with each other: if time is slowed N times, everything in the scene
  is slowed N times, or the page says what is not.
- `ALL-6` Motion is used only for things that really move.
- `ALL-7` Numbers on screen agree with what is drawn and with each other.
- `ALL-8` A wavelength is physical, a color is what we see. Light of one wavelength keeps it.

## Engine

The engine: four cylinders in a row, 2.0 L, bore 84 mm, stroke 90 mm, rod 145 mm, compression 10.5,
2,400 rpm at 60 mph. Intake valve opens 10° before top, closes 40° after bottom; exhaust opens 50°
before bottom, closes 10° after top; lift 9 mm; spark 25° before top; order 1, 3, 4, 2.

### Car on the road (real speed)

- `ENG-A1` 60 mph is 26.8 m/s. A tire about 0.63 m across turns 13.5 times a second, and the point of
  the tire on the road does not slide: the road must pass under the car at exactly the speed the
  wheels' rims turn.
- `ENG-A2` Lane dashes, posts or anything else beside the road pass at 26.8 m/s (US dashes are 3 m
  long with 9 m gaps, so about 2.2 a second).
- `ENG-A3` When time is slowed 60 times (as the Car now opens, until Real speed is pressed), the road, the
  wheels and the engine all slow together: 0.45 m/s on the road, one wheel turn in 4.4 s, one crank turn in 1.5 s.
- `ENG-A4` Crank to wheel ratio is fixed while in gear: 2,400 / 813 rpm, about 2.95 crank turns per
  wheel turn.
- `ENG-A5` The car's shadow lies on the road under it, on the side away from the light, and moves with it.
- `ENG-A6` All four wheels turn the same way at the same rate; the body does not float or sink.

### Engine (slowed 60 times)

- `ENG-B1` Pistons 1 and 4 move together, 2 and 3 together, half a turn apart. Each cylinder runs the
  same four strokes offset by 180° of crank in the order 1, 3, 4, 2.
- `ENG-B2` Piston height is `r cos θ + sqrt(l² − r² sin² θ)`: it lingers near the bottom and turns
  around faster at the top. Peak speed about 11.7 m/s near 74° after top, mean 7.2 m/s.
- `ENG-B3` The rod's big end rides the crank pin on a circle of 45 mm, its small end stays on the
  cylinder's axis, and its length never changes. It never passes through the cylinder wall or the piston skirt.
- `ENG-B4` The crank turns one way without pause. Camshafts turn at exactly half its speed, both the
  same way (one belt or chain). The cam sprockets are twice the size of the crank's, and the belt
  runs at one speed all the way around without slipping.
- `ENG-B5` A valve is pushed open by its cam lobe: the valve is down exactly while the lobe's nose is on it,
  and stays in contact with it. A spring closes it (some sign of what returns the valve).
- `ENG-B6` Valves open downward into the cylinder and never touch the piston, including at the overlap
  around the top between exhaust and intake when both are a little open.
- `ENG-B7` Each cylinder's spark comes once per two turns, 25° before the top of its own compression
  stroke, and at no other time.
- `ENG-B8` Each cylinder's burn, glow and gas colors follow its own phase, not cylinder 4's.
- `ENG-B9` Intake ports join an intake manifold on one side, exhaust ports an exhaust manifold on the
  other. Air has a way in and burned gas a way out (ALL-1).
- `ENG-B10` Crank counterweights sit opposite their pins.

### Cylinder (slowed 600 times): the gas

- `ENG-C1` Intake: as the piston goes down, fresh air comes in only through the ring-shaped gap between the
  open valve's head and its seat, as a sheet around the head, never through the head or the roof.
- `ENG-C2` Flow continuity: the gap of two 32 mm valves at 9 mm lift is about 1,800 mm²; the piston's
  face is 5,540 mm². Gas through the gap moves about 3 times faster than the piston (over 30 m/s at
  mid-stroke), and faster still at small lift.
- `ENG-C3` The amount of gas in the cylinder grows in step with the volume the piston opens (roughly even
  density at about half an atmosphere). Gas in the port moves toward the valve only while it is open.
- `ENG-C4` Intake valve stays open 40° past the bottom: gas does not cross a closed valve, and nothing
  leaves through it once shut.
- `ENG-C5` Compression: both valves shut. The amount of gas is fixed, so it gets denser evenly as the
  volume shrinks 10.5 times (no gas vanishing, none passing the piston).
- `ENG-C6` Trapped gas heats as it is squeezed: from 385 K to about 800 to 850 K, about 11 atm at the top
  without a burn (`p V^1.33` constant).
- `ENG-C7` Fuel: sprayed during the intake stroke (direct injection, even mixture) for a few
  milliseconds (15° to 45° of crank), never while the exhaust valve is open or the charge is burning.
  Droplets evaporate; the vapor spreads through the air and stays until it burns. About 1 molecule
  in 60 is fuel.
- `ENG-C8` Spark at 335° at the plug's gap. The flame starts there and nowhere else.
- `ENG-C9` Pressure is the same everywhere in the cylinder at any instant (sound crosses it in 0.1 ms).
- `ENG-C10` Power stroke: pressure peaks 10° to 20° after the top, then falls as the gas expands and cools
  (about 2,400 K down to about 1,400 K when the exhaust valve opens). Any glow dims with it.
- `ENG-C11` Exhaust valve opens 50° before the bottom at 3 to 4 atm: gas rushes out through the valve gap
  before the piston turns (blowdown), then the rising piston pushes out the rest. (The exhaust flow
  is being fixed in another thread; not filed here.)
- `ENG-C12` At the top after exhaust, the 1/10.5 of the volume above the piston is still full of burned
  gas, which stays and mixes into the next charge.
- `ENG-C13` Gas is never drawn inside metal, below the piston's top, or in a port whose valve is shut and
  whose manifold is not drawn feeding it.
- `ENG-C14` Chart: intake near 0.5 atm, compression curve, peak about 21 atm at 14° after top, expansion,
  a fall at exhaust valve opening to about 1 atm, exhaust near 1 atm. The marker, the number and the
  stroke name agree with the dial and the picture.
- `ENG-C15` Temperature and pressure and density agree by the gas law at every instant.

### Flame (slowed 6,000 times)

- `ENG-D1` The burning zone is a thin front (tens of micrometers, wrinkled over a few millimeters), far
  thinner than the 0.13 m view. It grows outward from the plug at 10 to 30 m/s and crosses the
  cylinder in about 45° to 60° of crank.
- `ENG-D2` The chamber near the top is a flat disc 84 mm across and 10 to 15 mm high, so the front reaches
  the piston and the roof within the first millimeters and then spreads sideways.
- `ENG-D3` Burned gas is 3 to 4 times hotter than the unburned gas ahead at the same pressure, so 3 to
  4 times thinner: dots behind the front must be that much sparser than dots ahead (ALL-1 and gas law).
- `ENG-D4` Burned gas expanding pushes unburned gas ahead of the front, away from the plug. When half the
  mass has burned the front has swept about four fifths of the volume.
- `ENG-D5` Behind the front no fuel remains and no free fuel dots are drawn; ahead of it the mixture is
  unchanged except for being squeezed.
- `ENG-D6` The front only advances. It stops at walls, piston and roof, and does not pass through them.
- `ENG-D7` The piston moves only about 5 mm during the first 25° of the burn; the picture's piston should
  be nearly still at this stop while the front moves ten times as far.
- `ENG-D8` The spark is a short arc across the 0.9 mm gap, lasting 1 to 2 ms (15° to 30°).

### Molecules (slowed 60,000 times)

- `ENG-E1` Number density is `p / kT`: about 1 molecule per 105 nm³ on intake (a cube 23 nm wide holds 121),
  about 1 per 13 nm³ at the spark. An 8 nm view holds about 5 molecules on intake and 40 at the spark:
  mostly empty space.
- `ENG-E2` 94 N₂ to 25 O₂ to 2 C₈H₁₈; products 16 CO₂ and 18 H₂O; every atom accounted for; N₂ unchanged.
- `ENG-E3` Shapes: N₂ and O₂ two atoms 0.11 and 0.12 nm apart; CO₂ straight, 0.116 nm bonds; H₂O bent
  104.5°, 0.096 nm bonds; iso-octane branched, five carbons in a chain with three methyl branches,
  about 0.7 nm across.
- `ENG-E4` The flame's reaction zone is thousands of times wider than this view, so the change happens
  throughout the view over time, not as a line crossing it.
- `ENG-E5` Hotter molecules move faster (speed goes as the square root of temperature: 1.7 times faster
  at 2,400 K than 800 K). Burned gas at the same pressure is thinner.
- `ENG-E6` Molecules fly straight for about 20 nm between collisions at these pressures, longer than the
  view is wide.
- `ENG-E7` The count in view, the cube's edge and the panel's pressure and temperature agree (ALL-7).

## Rainbows

### Orbit

- `RB-A1` Sunlight arrives parallel. Half the globe is lit, and the edge of day is a great circle square
  to the sunlight.
- `RB-A2` "You are here" is on the day side with the Sun lower than 42° above the horizon, or no bow
  stands above the ground.
- `RB-A3` The bow's cone has its point at the eye, its axis along the sunlight (pointing away from the
  Sun) and a half angle of 42°. If drawn larger than the kilometers of rain it lives in, the page says so.
- `RB-A4` Atmosphere and clouds are thin: 12 km of weather is 0.2% of the Earth's radius.
- `RB-A5` The Sun's direction at the spot on the globe is the Sun's direction in the Rain scene (same
  height above the horizon, same side).

### Rain

- `RB-B1` The bow is a circle centered on the point opposite the Sun (the shadow of the eye's own head),
  42° out; red outside (42.4°), violet inside (40.6°), about 2° wide.
- `RB-B2` Second bow at 50° to 53°, colors reversed (red inside), fainter and wider. The sky between the
  bows is darker than the sky inside the first bow.
- `RB-B3` The top of the bow stands (42° minus the Sun's height) above the horizon. The figure's shadow
  points at the bow's center and has length height / tan(Sun's height).
- `RB-B4` A bow belongs to an eye: it is not at a place. Moving the eye moves the bow with it.
- `RB-B5` Sunlight rays are all parallel, slanting down at the Sun's height, from the Sun's side.
- `RB-B6` Rain falls straight down in still air at a steady 4 to 9 m/s by size; drops are spheres.
- `RB-B7` Light runs Sun to drop to eye, and the angle between the sunlight reversed and the ray to the
  eye is 42° for a drop in the bow.
- `RB-B8` A falling drop passes through the bow's colors in order as its angle from the eye changes (at
  the top of the bow: dark, then red, through to violet, then faint white inside).
- `RB-B9` Rain needs cloud above it; the Sun's side must be clear.

### Drop

- `RB-C1` Snell's law at every crossing: `sin i = n sin r`. The rainbow ray enters at 59.4°, runs at
  40.2° inside, and leaves turned 138° (42° back from the sunlight). The whole path lies in one plane
  through the drop's center.
- `RB-C2` Reflection inside is at equal angles; every meeting with the wall is at the same 40.2°.
- `RB-C3` Energy: about 6% reflects off the front, 89% leaves at the back, 4.6% forms the first bow,
  0.5% the second. Shares at each crossing add up to what arrived.
- `RB-C4` Short wavelengths bend more: inside the drop the ray we see as violet runs closer to the
  normal, and leaves at 40.6° against 42.4° for the one we see as red.
- `RB-C5` Rays across the whole face of the drop leave at all angles up to 42°, and crowd together at
  42° (that crowding is the bow). None leaves beyond it after one reflection.
- `RB-C6` Photons travel at c in air and at c/1.33 in water: dots inside the drop move 25% slower and
  bunch closer along the ray. Each keeps its wavelength (color drawn) the whole way.
- `RB-C7` Photon counts follow the energy shares, and none is lost or made at a surface.
- `RB-C8` Wave crests are square to the rays, closer together in water by 1.33, and meet without a break
  along the surface. Real crests are 2,000 to the drop's radius; a picture showing fewer must say so.
- `RB-C9` The sunlight's slope and the direction to the eye match the Rain scene.
- `RB-C10` Second bow: two reflections inside, leaving at 51°.

### Surface

- `RB-D1` Three beams: arriving, reflected at an equal angle, and passing at Snell's angle.
- `RB-D2` Crest spacing is the wavelength in air and the wavelength / 1.33 in water, and measures
  correctly against the scale bar (400 to 700 nm). Crests on the two sides meet along the surface.
- `RB-D3` Same frequency on both sides: crests in water advance slower by 1.33.
- `RB-D4` The reflected beam is weak (a few percent; 11% for the polarization with the field along the
  surface). Arriving plus reflected light gives faint fringes on the arriving side only.
- `RB-D5` The passing beam is wider or narrower by `cos r / cos i`; its amplitude differs but its energy
  flow plus the reflected flow equals what arrived.
- `RB-D6` At the back wall and the way out, light goes from water to air: 40.2° inside to 59.4° outside,
  water on the correct side, most light leaving.
- `RB-D7` Changing the wavelength changes the crest spacing in proportion (1.75 times from 400 to 700 nm)
  and the bend a little.
- `RB-D8` Photons: one in, one out, by the Fresnel odds, at c or c/n.

### Molecules

- `RB-E1` The view is about 1 nm; the light's wavelength is 400 to 700 nm. Across the view the field is the
  same everywhere at one instant; a wave with crests among a few molecules is not to scale and must say so.
- `RB-E2` Liquid water has 33 molecules per nm³, 0.3 nm apart; air has almost none at this scale.
- `RB-E3` Electrons are pushed opposite to the electric field and in step with it (the light is far below
  the 101 nm resonance); nuclei hardly move.
- `RB-E4` Shorter wavelengths move the electrons further (6.8% over the steady value at 400 nm, 2.1% at 700).
- `RB-E5` Each layer's own wave lags a quarter cycle, so the total wave falls behind: slower in water,
  slowest for the shortest wavelengths.
- `RB-E6` Magnetic field is in phase with the electric field, square to it and to the direction of travel.
- `RB-E7` The real movement of the electrons is far below an atom's width; the drawn swing is exaggerated
  and must say so.
- `RB-E8` Energy shares add to the whole, and electric and magnetic field energies are in the ratio 1 to n².

## Vesicle fusion

### In vivo

- `VES-A1` Sizes: vesicle about 42 nm, membrane 4 to 5 nm, cleft about 20 nm, SNARE bundle about 12 nm.
- `VES-A2` Membrane area is conserved: lipids are neither made nor lost. A 42 nm vesicle adds a patch of
  about 5,500 nm² to the cell membrane.
- `VES-A3` Topology: the vesicle's inside becomes the cell's outside. Each protein keeps its side: what
  faced the cytoplasm still does after fusion, what faced the vesicle's inside faces the cleft.
- `VES-A4` Hemifusion: only the two facing leaflets join; the far leaflets and the contents are still
  separate. Lipids of the far leaflets do not mix and nothing leaks until the pore opens.
- `VES-A5` Lipids move sideways within a leaflet by random steps and do not hop between leaflets.
- `VES-A6` Membrane proteins stay in the membrane, never cross the cytoplasm or lumen, and pass through the
  neck only when they fit.
- `VES-A7` SNAREs zip from the ends far from the membranes toward the membranes, pulling them together;
  synaptobrevin is anchored in the vesicle, syntaxin and SNAP-25 in the cell membrane.
- `VES-A8` Glutamate: about 1,800 molecules at 150 mM in a 42 nm vesicle. None leaves before the pore opens;
  they leave only through the pore, by random motion, spreading in the cleft; the number inside plus
  outside is constant.
- `VES-A9` Brownian motion is random and undirected until tethers catch the vesicle.
- `VES-A10` The membrane keeps its thickness as it bends, without gaps.

### In vitro (TIRF) and the cameras

- `VES-B1` Critical angle is `asin(n2/n1)`: about 64° for glass 1.518 against cytoplasm 1.36. Past it the
  light reflects totally at an equal angle; below it the beam refracts into the cell by Snell's law.
- `VES-B2` Evanescent depth `λ / 4π sqrt(n1² sin²θ − n2²)`: about 90 nm at 70°, growing without limit toward
  the critical angle. Brightness of a tag falls as `exp(−z/d)` with its height.
- `VES-B3` The objective (NA 1.49) cannot send or collect light beyond 79° in the glass.
- `VES-B4` The membrane the vesicle fuses with is the cell's underside, facing the glass; the vesicle is
  above it, inside the cell. Tags on the vesicle's inside end up outside the cell, nearer the glass.
- `VES-B5` pHluorin: 4% as bright at pH 5.5 as at 7.4. Orange protein: 51%. Both jump when the pore opens,
  not before.
- `VES-B6` Emission goes out in all directions, at 510 and 589 nm, and the objective collects the part
  inside its cone. The laser reflects back down at the mirror angle.
- `VES-B7` After fusion the tags spread sideways in the cell membrane; the spot widens and its peak falls
  while its total holds.
- `VES-B8` Blur: 175 nm at 510 nm and 202 nm at 589 nm (0.51 λ / NA); pixels 65 nm; noise is photon
  counting.
- `VES-B9` Bench to scale: 0.17 mm coverslip, oil, objective lens; beams turn at each surface by Snell's law.
- `VES-B10` Reflection camera: 0.4% reflects at glass against medium; bright and dark heights are
  `λ/4n` apart (116 nm at 630 nm).
- `VES-B11` Other vesicles in the field behave the same way as ours.

## Japanese maple

### Tree

- `MAP-A1` Sun at 17:00 solar time at 35° N: 25° up at midsummer, about 1° in mid November, set by late
  December; in the west (north of west in summer, south of west in autumn).
- `MAP-A2` Shadows fall away from the Sun, with length height / tan(Sun's height): twice the tree's height
  at midsummer, many times it in autumn, and they swing as the sunset point moves.
- `MAP-A3` Day length: about 12 h 9 min on 25 March, 14 h 22 min at midsummer, 9 h 38 min on 20 December.
- `MAP-A4` Leaves grow from buds over weeks; they do not appear full size. Branches are bare before and after.
- `MAP-A5` A leaf falls downward, lands on the ground and stays. Leaves on the ground are the leaves the
  tree lost (ALL-1). None hangs in the air unattached or passes through the ground.
- `MAP-A6` Low Sun gives dimmer, warmer light; the shadow of a bare crown is thin.
- `MAP-A7` The crown colors from the sunlit outside inward.

### Leaf

- `MAP-B1` A Japanese maple leaf has 5 to 7 pointed lobes with toothed edges, one main vein per lobe
  meeting at the stalk, and a stalk joined to the twig. Blade 4 to 8 cm.
- `MAP-B2` The blade is paper thin: 0.14 mm against centimeters.
- `MAP-B3` Green lasts longest beside the veins; red forms where the Sun reaches.
- `MAP-B4` The leaf's color at this scale is the color its cells and molecules give at the deeper scales on
  the same date (ALL-4).

### Tissue and cells

- `MAP-C1` From the top: clear skin, one row of tall cells packed with chloroplasts, loose cells with air
  between, lower skin with pores. Veins have water tubes above and sugar tubes below.
- `MAP-C2` Light enters from the upper side, from the Sun's direction, and thins out with depth
  (most absorptions near the top; exponential fall).
- `MAP-C3` In a green leaf, wavelengths near 450 and 675 nm are absorbed in the first tall cells; much of
  the light near 550 nm goes deeper or through. In a red leaf, light near 530 nm stops in the vacuoles.
- `MAP-C4` A dot of light keeps its wavelength. An absorbed dot is gone; it does not go on.
- `MAP-C5` Absorbed light becomes heat or chemistry. Chlorophyll gives back a little as red light near
  685 nm whatever was absorbed; carotenoids and anthocyanin give back none. A flash in the absorbed color
  would be wrong.
- `MAP-C6` Chloroplasts are discs about 5 µm across along the cell's walls; the vacuole fills most of the
  cell. Chlorophyll is only in chloroplasts; anthocyanin only in vacuoles.
- `MAP-C7` In autumn the membrane stacks are taken apart, fat drops grow, chloroplasts shrink and yellow, and
  vacuoles redden, in step with the panel's pigment bars.
- `MAP-C8` No light at night: if the Sun has set, no dots fall.

### Molecules

- `MAP-D1` Chlorophyll a: a flat ring about 1 nm across, four nitrogens around one magnesium, a 20-carbon
  tail about 2 nm long. β-carotene: 40 carbons, about 3 nm, a ring at each end. Cyanidin 3-glucoside:
  three rings and a sugar, about 1.2 nm. Bonds 0.14 to 0.15 nm.
- `MAP-D2` A thylakoid membrane is about 4 nm thick; stacks are 0.3 to 0.6 µm across.
- `MAP-D3` Light's wavelength is hundreds of times the molecule's size; a dot of light smaller than a
  molecule is a picture and must say so.
- `MAP-D4` A molecule takes in light only within its band: chlorophyll near 440 and 675 nm, carotenoids
  425 to 480 nm, anthocyanin near 530 nm.
- `MAP-D5` Pigment molecules are taken apart or made over days; counts follow the panel's bars. Chlorophyll's
  order: magnesium out, tail off, ring opened.
- `MAP-D6` Anthocyanin at a few mM is about one molecule per 300 nm³: sparse in a 4 nm view.
