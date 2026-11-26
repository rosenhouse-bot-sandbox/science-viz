// Shoulder: every statement the page makes, with where it comes from. Text with no source here does not go
// on the page. Numbers on screen are not typed here: they come from model.js.

export const SRC = {
  cuff: { name: 'Wikipedia, Rotator cuff (functions of each muscle)', url: 'https://en.wikipedia.org/wiki/Rotator_cuff' },
  uw: { name: 'University of Washington Orthopaedics, What is the rotator cuff?', url: 'https://orthop.washington.edu/patient-care/shoulder/what-is-the-rotator-cuff.html' },
  merck: { name: 'Merck Manual Professional, Rotator Cuff Injury/Subacromial Bursitis', url: 'https://www.merckmanuals.com/professional/injuries-poisoning/sports-injury/rotator-cuff-injury-subacromial-bursitis' },
  bursitis: { name: 'Wikipedia, Subacromial bursitis', url: 'https://en.wikipedia.org/wiki/Subacromial_bursitis' },
  bursaUS: { name: 'Radiopaedia, Subacromial-subdeltoid bursa (normally under 2 mm on ultrasound)', url: 'https://radiopaedia.org/articles/subacromial-subdeltoid-bursa' },
  partial: { name: 'Radhakrishnan et al. 2023, partial-thickness rotator cuff tears (review): joint-side tears 2 to 3 times as common', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10938024' },
  ahd: { name: 'Acromiohumeral distance and rotator cuff tears (review)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9446281' },
  arc: { name: 'GPnotebook, Painful arc', url: 'https://gpnotebook.com/pages/musculoskeletal-medicine/painful-arc' },
  aaos: { name: 'AAOS OrthoInfo, Rotator Cuff and Shoulder Conditioning Program', url: 'https://www.orthoinfo.org/recovery/rotator-cuff-and-shoulder-conditioning-program' },
  inman: { name: 'Inman, Saunders and Abbott 1944, Observations on the function of the shoulder joint (2 to 1 rhythm)', url: 'https://pubmed.ncbi.nlm.nih.gov/8790188/' },
  ludewig: { name: 'Ludewig et al. 2009, Motion of the shoulder complex during multiplanar humeral elevation', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2657311' },
  deltoid: { name: 'Wikipedia, Deltoid muscle (what each part does)', url: 'https://en.wikipedia.org/wiki/Deltoid_muscle' },
  lat: { name: 'Wikipedia, Latissimus dorsi muscle', url: 'https://en.wikipedia.org/wiki/Latissimus_dorsi_muscle' },
  teresMajor: { name: 'Wikipedia, Teres major muscle', url: 'https://en.wikipedia.org/wiki/Teres_major_muscle' },
  trapezius: { name: 'Wikipedia, Trapezius muscle', url: 'https://en.wikipedia.org/wiki/Trapezius' },
  pnf: { name: 'Proprioceptive neuromuscular facilitation for the upper extremity and scapula (review), Int J Sports Phys Ther', url: 'https://ijspt.scholasticahq.com/article/143176' },
  plank: { name: 'Wikipedia, Plank (exercise): muscles worked', url: 'https://en.wikipedia.org/wiki/Plank_(exercise)' },
  gmed: { name: 'Wikipedia, Gluteus medius', url: 'https://en.wikipedia.org/wiki/Gluteus_medius' },
  thoracic: { name: 'Wikipedia, Thoracic vertebrae', url: 'https://en.wikipedia.org/wiki/Thoracic_vertebrae' },
  sharkey: { name: 'Sharkey and Marder 1995, The rotator cuff opposes superior translation of the humeral head', url: 'https://doi.org/10.1177/036354659502300303' },
  ackland: { name: 'Ackland et al. 2008, Moment arms of the muscles crossing the anatomical shoulder', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2644775' },
  axford: { name: 'Axford 2024, Development and evaluation of a novel in-vitro shoulder simulator and its use in the study of glenohumeral muscle moment arms (PhD thesis, Western University)', url: 'https://ir.lib.uwo.ca/etd/10285' },
  garner: { name: 'Garner and Pandy 2000, The obstacle-set method for representing muscle paths in musculoskeletal models', url: 'https://doi.org/10.1080/10255840008915251' },
  bp3d: { name: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0', url: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/' },
};

// What each muscle does, in the panel's muscle list.
export const DOES = {
  supra: { text: 'runs under the acromion to the top of the arm bone; helps lift the arm out to the side', src: ['cuff', 'uw'] },
  infra: { text: 'turns the arm outward', src: ['cuff', 'uw'] },
  tminor: { text: 'turns the arm outward', src: ['cuff', 'uw'] },
  subscap: { text: 'on the front of the shoulder blade; turns the arm inward', src: ['cuff', 'uw'] },
  deltA: { text: 'lifts the arm forward and turns it in', src: ['deltoid'] },
  deltM: { text: 'lifts the arm out to the side', src: ['deltoid'] },
  deltP: { text: 'takes the arm back and turns it out', src: ['deltoid'] },
};

// The conditions. show: what the model does for it (model.js and main.js read these, and say on screen what
// is drawn larger than life).
// What else happens when a muscle pulls with no other muscle helping: shown under its Contract slider. How far the
// ball moves is the page's own size (RIDE_UP in main.js), which the sentence says.
export const ALONE = {
  deltA: { text: 'Alone, it also pulls the ball up (drawn 3 mm). The cuff muscles stop this.', src: ['sharkey'] },
  deltM: { text: 'Alone, it also pulls the ball up (drawn 3 mm). The cuff muscles stop this.', src: ['sharkey'] },
};
export const CONDITIONS = [
  { id: 'healthy', name: 'Healthy',
    title: 'Four muscles hold the ball in its socket',
    body: 'The ball at the top of the arm bone sits in a shallow socket on the shoulder blade. Four muscles, the rotator cuff, wrap round it from the shoulder blade and hold it in while the deltoid, the big muscle over the top, lifts the arm. The supraspinatus tendon runs under the acromion, the bony roof of the shoulder, with a thin fluid sac, the bursa, between them so that they slide.',
    src: ['cuff', 'uw', 'bursitis'] },
  { id: 'tendinopathy', name: 'Tendinopathy',
    title: 'A worn tendon',
    body: 'Tendinopathy is damage and wear in a tendon, most often the supraspinatus near where it attaches. The tendon can thicken, and it hurts most when the arm is lifted.',
    note: 'The tendon is drawn half as thick again; how much a worn tendon thickens differs from one person to the next.',
    src: ['merck'] },
  { id: 'partial', name: 'Partial tear',
    title: 'Torn partway through, from below',
    body: 'A partial tear goes only partway through the tendon. Most are on its underside, the side facing the joint: those are two to three times as common as tears on the side facing the bursa.',
    note: 'Drawn as half the tendon\'s thickness gone from its underside near where it attaches.',
    src: ['partial'] },
  { id: 'full', name: 'Full tear',
    title: 'A hole right through',
    body: 'A full-thickness tear goes right through the tendon, most often the supraspinatus where it attaches. When a tear is large, the cuff can no longer hold the ball down and it rides up toward the acromion, narrowing the space under it.',
    note: 'The hole and how far the ball rides up (3 mm, where there is room) are drawn; real tears differ in size, and small ones do not move the ball.',
    src: ['merck', 'ahd'] },
  { id: 'bursitis', name: 'Bursitis',
    title: 'A swollen bursa',
    body: 'The bursa is the thin sac between the tendon and the acromion. On ultrasound a healthy one is usually under 2 mm thick. Inflamed, it swells and fills the space the tendon moves through.',
    note: 'The bursa is drawn as a sheet over the supraspinatus tendon only, 0.8 mm thick when healthy and 3 mm swollen; the real sac spreads further, under the deltoid.',
    src: ['bursaUS', 'bursitis'] },
  { id: 'impingement', name: 'Impingement',
    title: 'Pinched under the acromion',
    body: 'As the arm lifts, the top of the arm bone carries the tendon and bursa under the acromion, and they can be squeezed between the two. That often hurts in the middle of the lift, from about 60° to 120° (the painful arc), and less below or above it. Lift the arm and watch the part of the tendon nearest the acromion, lit in red.',
    note: 'Red marks where the acromion presses on the tendon at this pose: the places the model has to push the tendon out of the bone\'s way. It is not a measure of pain, and this model does not show the easing above 120° that people feel.',
    src: ['arc', 'bursitis'] },
];

// Exercises, with the muscles of this model that each works. The first five are from the AAOS program, which lists the
// muscles each targets. For the rest, a muscle is marked when a source says it makes one of the exercise's movements
// (lifting forward, out to the side or back, turning out or in). The poses are in exercises.js.
// role: how the panel names them: 'works' (they do the work), 'stretch' (they are stretched), 'relaxed' (targeted,
// with the arm kept relaxed), 'holds' (they hold a pose still).
export const EXERCISES = [
  { id: 'pendulum', name: 'Pendulum', works: ['deltA', 'deltM', 'deltP', 'supra', 'infra', 'subscap'], role: 'relaxed',
    body: 'Lean forward with one hand on a table and let the other arm hang loose, its muscles relaxed. Swing it gently forward and back, then side to side, then in small circles. Leaning makes the hanging arm point forward from the body.',
    note: 'The body is not drawn leaning: the arm is drawn lifted forward instead, the same pose seen from the body.', src: ['aaos'] },
  { id: 'sleeper', name: 'Sleeper stretch', works: ['infra', 'tminor'], role: 'stretch',
    body: 'Lie on your side with the sore shoulder under you, arm forward and elbow bent. The other hand presses the forearm down until a stretch is felt at the back of the shoulder. The muscles that turn the arm out are stretched: watch them grow longer as the arm turns in.',
    note: 'The body is not drawn lying down: only the shoulder and arm, posed as they are relative to the body.', src: ['aaos'] },
  { id: 'external', name: 'Turn out with a band', works: ['infra', 'tminor', 'deltP'], role: 'works',
    body: 'Elbow at the side and bent, hold a band and turn the forearm outward. The infraspinatus and teres minor do the work, shortening as they turn the arm.',
    src: ['aaos'] },
  { id: 'internal', name: 'Turn in with a band', works: ['subscap'], role: 'works',
    body: 'Elbow at the side and bent, pull a band across the body. The subscapularis turns the arm inward (the program also lists the chest muscle, not drawn here).',
    src: ['aaos'] },
  { id: 'external90', name: 'Turn out, arm up', works: ['infra', 'tminor'], role: 'works',
    body: 'Elbow out at shoulder height and bent, hand forward, raise the hand against a band until it is level with the head. The infraspinatus and teres minor do the work.',
    src: ['aaos'] },
  { id: 'wiper', name: 'Windshield wiper', works: ['infra', 'tminor'], role: 'works',
    body: 'Standing, raise the upper arm in front to shoulder height and bend the elbow, so the forearm lies across the chest. Against a band, turn the forearm up until it points straight up. The infraspinatus and teres minor turn the arm outward, so they do the work.',
    src: ['cuff'] },
  { id: 'pnf', name: 'Diagonal lift (PNF D2)', works: ['deltA', 'deltM', 'supra', 'infra', 'tminor'], role: 'works',
    body: 'Lying on your back, start with the hand by the other hip and the arm turned in. Against a band, lift the arm up and out past the head, turning it out. The arm lifts forward, lifts out to the side and turns out at the same time. The front of the deltoid lifts it forward, the middle of the deltoid and the supraspinatus lift it out, and the infraspinatus and teres minor turn it out.',
    note: 'The body is not drawn lying down. The start and end of the lift are a common version of the pattern, not measured.',
    src: ['pnf', 'deltoid', 'cuff'] },
  { id: 'bentRaise', name: 'Bent-over raise', works: ['deltP'], role: 'works',
    body: 'Bend forward with one hand and knee on a chair, and let the other arm hang with a weight. Lift it out to the side, straight, until it is level with the shoulder. The back of the deltoid makes this lift.',
    note: 'The body is not drawn bent over: the arm is drawn lifted forward instead, the same pose seen from the body.',
    src: ['deltoid'] },
  { id: 'extension', name: 'Arm back with a band', works: ['deltP'], role: 'works',
    body: 'Standing, hold a band anchored in front, arm straight and turned neither in nor out. Pull the arm back past the side of the body. The latissimus dorsi does this, with help from the teres major and the back of the deltoid. Only the deltoid is drawn.',
    src: ['lat', 'teresMajor', 'deltoid'] },
  { id: 'highRow', name: 'High row', works: ['deltP', 'infra', 'tminor'], role: 'works',
    body: 'Hold the handles of a suspension trainer with straight arms at shoulder height, and lean back. Pull until the elbows are out to the sides and bent, hands up beside the head. The back of the deltoid pulls the arms back, and the infraspinatus and teres minor turn them up.',
    note: 'The body is drawn upright, not leaning back.',
    src: ['deltoid', 'cuff'] },
  { id: 'prone', name: 'Arms out on a ball', works: ['deltM', 'deltP'], role: 'works',
    body: 'Lie face down over a ball and let the arms hang. Lift them out to the sides, straight and level with the shoulders, thumbs turned up. The middle and back of the deltoid make this lift. The exercise is named for the middle part of the trapezius, which pulls the shoulder blades together. The trapezius is not drawn.',
    note: 'The body is not drawn lying down: the arm is drawn lifted forward instead, the same pose seen from the body.',
    src: ['deltoid', 'trapezius'] },
  { id: 'thoracic', name: 'Foam roll, upper back', works: [], role: 'works',
    body: 'Lie on your back over a foam roll across the upper back, hands behind the head to support it, and arch back over the roll. The movement is in the spine of the upper back, which is not drawn. The shoulders hold still with the hands behind the head, so no muscle is marked.',
    note: 'The body is not drawn lying down: only the shoulder and arm, posed as they are relative to the body.',
    src: ['thoracic'] },
  { id: 'plank', name: 'Plank', works: ['deltA', 'deltM', 'deltP'], role: 'holds',
    body: 'Hold the body straight, resting on the forearms and toes. The muscles of the trunk do most of the work, and none of them is drawn. The deltoid works too, holding the shoulders.',
    note: 'The body is not drawn: only the shoulder and arm, posed as they are relative to the body.',
    src: ['plank'] },
  { id: 'sidePlank', name: 'Side plank, leg lift', works: [], role: 'works',
    body: 'Lie on one side, propped on the elbow and the lower knee, and lift the hips into a straight line. Then lift the top leg. The trunk muscles hold the body up and the gluteus medius lifts the leg. None of them is drawn, so no muscle is marked. The arm drawn is the one underneath, holding still.',
    note: 'The body is not drawn: only the shoulder and arm, posed as they are relative to the body.',
    src: ['plank', 'gmed'] },
];

export const MODEL_NOTE = 'Bones are one person\'s scanned right shoulder; muscles are built to match the scans of the same body (checked against them: within 1 mm over 95% of each surface). The shoulder blade turns a third of the lift (the 2 to 1 rhythm, a simplification). In this scan the acromion sits low over the ball, so as the arm lifts the model lets the ball slide down in its socket enough to keep 2 mm between the bones. That is a correction for this scan, not a motion to learn from: in a real shoulder the ball stays close to the middle of its socket. The gap is the narrowest distance between the two bones in this model, not an X-ray measurement. Each muscle bends along a line pulled tight from its own bone, over the ball, to the arm bone (the method of Garner and Pandy 2000). A muscle\'s leverage is how much that line shortens for each degree the arm turns. A muscle that pulls on its own turns the arm up to 40°, a degree at a time, the way that shortens the line fastest. The arm\'s weight and the muscles that would steady it are left out. The shoulder blade still turns with the lift, though the muscles that turn it are not drawn. The arm goes no further than 150° up, 60° in and 90° out, and the elbow does not go into the side of the body. In shoulders from cadavers lifted by the deltoid alone, the ball moved up (Sharkey and Marder 1995). Here the front or the middle of the deltoid pulling alone moves it up 3 mm where there is room, which is a drawn size. The leverage here is close to the leverage measured in shoulders from cadavers (Axford 2024, Ackland 2008). It is not the same. The teres minor and the back of the deltoid have more leverage here than was measured. With the arm high, the supraspinatus lifts it out to the side less than was measured. Above shoulder height few measurements exist, so the pulls there are less sure.';
export const MODEL_SRC = ['bp3d', 'inman', 'ludewig', 'sharkey', 'garner', 'axford', 'ackland'];
