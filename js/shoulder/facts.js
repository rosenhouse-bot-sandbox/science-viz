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
  bp3d: { name: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0', url: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/' },
};

// What each muscle does, in the panel's muscle list.
export const DOES = {
  supra: { text: 'runs under the acromion to the top of the arm bone; helps lift the arm out to the side', src: ['cuff', 'uw'] },
  infra: { text: 'turns the arm outward', src: ['cuff', 'uw'] },
  tminor: { text: 'turns the arm outward', src: ['cuff', 'uw'] },
  subscap: { text: 'on the front of the shoulder blade; turns the arm inward', src: ['cuff', 'uw'] },
  deltA: { text: 'part of the big muscle over the shoulder that lifts the arm', src: ['uw'] },
  deltM: { text: 'part of the big muscle over the shoulder that lifts the arm', src: ['uw'] },
  deltP: { text: 'part of the big muscle over the shoulder that lifts the arm', src: ['uw'] },
};

// The conditions. show: what the model does for it (model.js and main.js read these, and say on screen what
// is drawn larger than life).
export const CONDITIONS = [
  { id: 'healthy', name: 'Healthy',
    title: 'Four muscles hold the ball in its socket',
    body: 'The ball at the top of the arm bone sits in a shallow socket on the shoulder blade. Four muscles, the rotator cuff, wrap round it from the shoulder blade and hold it in while the deltoid, the big muscle over the top, lifts the arm. The supraspinatus tendon runs under the acromion, the bony roof of the shoulder, with a thin fluid sac, the bursa, between them so that they slide.',
    src: ['cuff', 'uw', 'bursitis'] },
  { id: 'tendinopathy', name: 'Tendinopathy',
    title: 'A worn tendon',
    body: 'Tendinopathy is wear in a tendon, most often the supraspinatus near where it attaches. The tendon can thicken, and it hurts most when the arm is lifted.',
    note: 'The tendon is drawn half as thick again; how much a worn tendon thickens differs from one person to the next.',
    src: ['merck'] },
  { id: 'partial', name: 'Partial tear',
    title: 'Torn partway through, from below',
    body: 'A partial tear goes only partway through the tendon. Most start on its underside, the side facing the joint: those are two to three times as common as tears on the side facing the bursa.',
    note: 'Drawn as half the tendon\'s thickness gone from its underside near where it attaches.',
    src: ['partial'] },
  { id: 'full', name: 'Full tear',
    title: 'A hole right through',
    body: 'A full-thickness tear goes right through the tendon, most often the supraspinatus where it attaches. When a tear is large, the cuff can no longer hold the ball down and it rides up toward the acromion, narrowing the space under it.',
    note: 'The hole and how far the ball rides up are drawn; real tears differ in size, and small ones do not move the ball.',
    src: ['merck', 'ahd'] },
  { id: 'bursitis', name: 'Bursitis',
    title: 'A swollen bursa',
    body: 'The bursa is the thin sac between the tendon and the acromion. On ultrasound a healthy one is usually under 2 mm thick. Inflamed, it swells and fills the space the tendon moves through.',
    note: 'The bursa is drawn as a sheet over the supraspinatus tendon only, 0.8 mm thick when healthy and 3 mm swollen; the real sac spreads further, under the deltoid.',
    src: ['bursaUS', 'bursitis'] },
  { id: 'impingement', name: 'Impingement',
    title: 'Pinched under the acromion',
    body: 'As the arm lifts, the top of the arm bone carries the tendon and bursa under the acromion, and they can be squeezed between the two. That often hurts in the middle of the lift, from about 60° to 120° (the painful arc), and less below or above it. Lift the arm and watch the part of the tendon nearest the acromion, lit in red.',
    note: 'Red marks where the acromion presses on the tendon at this pose: the places the model has to push the tendon out of the bone\'s way. It is not a measure of pain.',
    src: ['arc', 'bursitis'] },
];

// Exercises from the AAOS program, with the muscles it lists as worked for each (only those this model has).
export const EXERCISES = [
  { id: 'pendulum', name: 'Pendulum', works: ['deltA', 'deltM', 'deltP', 'supra', 'infra', 'subscap'], stretch: false,
    body: 'Lean forward with one hand on a table and let the other arm hang, then swing it gently in small circles. Leaning makes the hanging arm point forward from the body.',
    note: 'The body is not drawn leaning: the arm is drawn lifted forward instead, the same pose seen from the body.', src: ['aaos'] },
  { id: 'sleeper', name: 'Sleeper stretch', works: ['infra', 'tminor'], stretch: true,
    body: 'Lying on the side of the shoulder, arm forward and elbow bent, the other hand presses the forearm down until a stretch is felt at the back of the shoulder. Watch the muscles that turn the arm out grow longer.',
    note: 'The body is not drawn lying down: only the shoulder and arm, posed as they are relative to the body.', src: ['aaos'] },
  { id: 'external', name: 'Turn out with a band', works: ['infra', 'tminor', 'deltP'], stretch: false,
    body: 'Elbow at the side and bent, hold a band and turn the forearm outward. The infraspinatus and teres minor do the work, shortening as they turn the arm.',
    src: ['aaos'] },
  { id: 'internal', name: 'Turn in with a band', works: ['subscap'], stretch: false,
    body: 'Elbow at the side and bent, pull a band across the body. The subscapularis turns the arm inward (the program also lists the chest muscle, not drawn here).',
    src: ['aaos'] },
  { id: 'external90', name: 'Turn out, arm up', works: ['infra', 'tminor'], stretch: false,
    body: 'Elbow out at shoulder height and bent, hand forward, raise the hand against a band until it is level with the head. The infraspinatus and teres minor do the work.',
    src: ['aaos'] },
];

export const MODEL_NOTE = 'Bones are one person\'s scanned right shoulder; muscles are built to match the scans of the same body (checked against them: within 1 mm over 95% of each surface). The shoulder blade turns a third of the lift (the 2 to 1 rhythm, a simplification). In this scan the acromion sits low over the ball, so as the arm lifts the model lets the ball slide down in its socket enough to keep 2 mm between the bones; real shoulders slide less. The gap is the narrowest distance between the two bones in this model, not an X-ray measurement.';
export const MODEL_SRC = ['bp3d', 'inman', 'ludewig'];
