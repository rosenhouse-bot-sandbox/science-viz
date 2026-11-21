// Overshoot saccades: every sentence on the page, with its sources. Numbers are put in from model.js.
import { PURSUIT, CATCHUP, MAIN_SEQ, NEURON, INSET_DEG } from './model.js?v=8664a690';

export const SRC = {
  sanz: { name: 'Sanz, Aivar and Tejedor (2026). Differences in smooth pursuit and associated saccades in children with two common types of strabismus. Investigative Ophthalmology & Visual Science 67(2):28. Defines catch-up, overshoot, anticipatory and back-up saccades during pursuit.', url: 'https://doi.org/10.1167/iovs.67.2.28' },
  trigger: { name: 'de Brouwer, Yüksel, Blohm, Missal and Lefèvre (2002). What triggers catch-up saccades during visual tracking? Journal of Neurophysiology 87:1646–1650.', url: 'https://doi.org/10.1152/jn.00432.2001' },
  amplitude: { name: 'de Brouwer, Missal, Barnes and Lefèvre (2002). Quantitative analysis of catch-up saccades during sustained pursuit. Journal of Neurophysiology 87:1772–1780.', url: 'https://doi.org/10.1152/jn.00621.2001' },
  gelder: { name: 'Van Gelder, Lebedev and Tsui (1997). Peak velocities of visually and nonvisually guided saccades in smooth-pursuit and saccadic tasks. Experimental Brain Research 116:201–215. Overshooting saccades occur in healthy pursuit too.', url: 'https://doi.org/10.1007/PL00005750' },
  collewijn: { name: 'Collewijn, Erkelens and Steinman (1988). Binocular co-ordination of human horizontal saccadic eye movements. Journal of Physiology 404:157–182.', url: 'https://doi.org/10.1113/jphysiol.1988.sp017284' },
  bahill: { name: 'Bahill, Clark and Stark (1975). The main sequence, a tool for studying human eye movements. Mathematical Biosciences 24:191–204.', url: 'https://doi.org/10.1016/0025-5564(75)90075-9' },
  carl: { name: 'Carl and Gellman (1987). Human smooth pursuit: stimulus-dependent responses. Journal of Neurophysiology 57:1446–1463.', url: 'https://doi.org/10.1152/jn.1987.57.5.1446' },
  barnes: { name: 'Barnes (2008). Cognitive processes involved in smooth pursuit eye movements. Brain and Cognition 68:309–326.', url: 'https://doi.org/10.1016/j.bandc.2008.08.020' },
  robinson: { name: 'Robinson (1970). Oculomotor unit behavior in the monkey. Journal of Neurophysiology 33:393–403.', url: 'https://doi.org/10.1152/jn.1970.33.3.393' },
  apt: { name: 'Apt and Call (1982). An anatomical reevaluation of rectus muscle insertions. Ophthalmic Surgery 13:108–112.', url: 'https://doi.org/10.3928/1542-8877-19820201-06' },
  demer: { name: 'Demer (2002). The orbital pulley system: a revolution in concepts of orbital anatomy. Annals of the New York Academy of Sciences 956:17–32.', url: 'https://doi.org/10.1111/j.1749-6632.2002.tb02805.x' },
  leigh: { name: 'Leigh and Zee (2015). The Neurology of Eye Movements, 5th edition. Oxford University Press. Pursuit and saccade timing, hypermetria, and vision during saccades.', url: 'https://doi.org/10.1093/med/9780199969289.001.0001' },
};

const pct = (g) => `${Math.round(g * 100)}%`;
const more = pct(CATCHUP.over.overshoot - 1);
// two settings, chosen apart: how well the eyes follow, and how large each saccade is
export const CONDITIONS = [{ id: 'healthy', name: 'Healthy pursuit' }, { id: 'poor', name: 'Poor pursuit' }];
export const SACCADES = [{ id: 'accurate', name: 'Accurate saccades' }, { id: 'overshoot', name: 'Overshoot saccades' }];
export const CAPTIONS = {
  'healthy accurate': { title: 'Healthy pursuit keeps the eyes on the target',
    body: `Pursuit is the smooth eye movement that follows a moving object. Here the eyes turn at ${pct(PURSUIT.gain.healthy)} of the target's speed. When they fall a little behind, a quick jump brings them back. That jump is a saccade. It lands on the target or a little short of it, as measured saccades do.`,
    src: ['leigh', 'trigger', 'amplitude'] },
  'poor accurate': { title: 'Poor pursuit needs many more saccades',
    body: `Here the eyes turn at only ${pct(PURSUIT.gain.poor)} of the target's speed, so they keep falling behind. Many more saccades are needed to catch up. Each one is sized as measured saccades are, so it lands on the target or a little short of it.`,
    src: ['amplitude', 'sanz'] },
  'healthy overshoot': { title: 'Saccades that go too far, with healthy pursuit',
    body: `Here each saccade is ${more} larger than measured saccades. Pursuit keeps the eyes close to the target, so the saccades are few and small. Few of them land ahead of the target.`,
    src: ['gelder', 'amplitude'] },
  'poor overshoot': { title: 'Poor pursuit, and saccades that go too far',
    body: `The eyes turn at only ${pct(PURSUIT.gain.poor)} of the target's speed, so they keep falling behind and make many saccades. Each saccade is ${more} larger than measured saccades. So many of them start behind the target and land ahead of it. These are called overshoot saccades.`,
    src: ['sanz', 'amplitude'] },
};

// what the clinic's note may mean
export const NOTE = [
  'The note says "Overshoot saccade due to poor pursuits". Studies of pursuit sort the saccades made during it by where they start and end. An overshoot saccade starts behind the target and ends ahead of it. This page shows that reading.',
  'Healthy people make overshoot saccades during pursuit too. What matters is how often they happen.',
  'Poor pursuit makes the eyes fall behind, so it needs many more saccades. If saccades go too far, more of them then land ahead of the target. Studies have not shown that poor pursuit by itself makes saccades go too far. So this page sets the two apart.',
  'Overshoot has a second meaning. A saccade to a target that is standing still can go too far. Doctors call this hypermetria. Tap the screen in the picture to make the target jump. With overshoot saccades, the first saccade goes past it and a second one comes back.',
  'Only the clinic that wrote the note can say which one they saw. This page is not medical advice.',
];
export const NOTE_SRC = ['sanz', 'gelder', 'leigh'];

// how the model works, in order
const rsAt = (v) => (CATCHUP.rs * Math.min(v, CATCHUP.rsKnee) + CATCHUP.rsFast * Math.max(0, v - CATCHUP.rsKnee));
export const MODEL = [
  `Pursuit: the eyes' smooth speed moves toward the gain times the target's speed. The gain is ${PURSUIT.gain.healthy} for healthy pursuit and ${PURSUIT.gain.poor} for poor pursuit, at every target speed. Real gain falls at higher speeds. ${PURSUIT.gain.poor} is an example, not a value measured in any person.`,
  `The eyes start to follow ${PURSUIT.latency * 1000} ms after the target starts to move. A target that swings back and forth is predictable, and the brain learns to move the eyes with it. Here, after one full swing, the eyes no longer lag behind. One swing is this page's choice.`,
  `The brain checks when the eyes would reach the target at the speed they move now. If that is sooner than ${CATCHUP.txe[0] * 1000} ms, later than ${CATCHUP.txe[1] * 1000} ms, or never, a saccade starts ${CATCHUP.latency * 1000} ms later. For a still target it starts ${CATCHUP.still * 1000} ms later. Within ${CATCHUP.peMin}° of the target, no saccade starts. The ${CATCHUP.peMin}° is this page's choice.`,
  `The size of a saccade comes from what the eyes saw ${CATCHUP.sample * 1000} ms before it starts. It is ${CATCHUP.pe} times the distance to the target, plus ${CATCHUP.rs} s times the slip. Slip is the speed of the target across the retina. Slip above ${CATCHUP.rsKnee}°/s counts at ${CATCHUP.rsFast} s, so ${CATCHUP.rsKnee * 2}°/s of slip adds ${rsAt(CATCHUP.rsKnee * 2).toFixed(1)}°. These numbers were measured in people. With overshoot saccades, each saccade is ${more} larger. That ${more} is this page's example.`,
  'Studies of pursuit count only saccades of 1° or more. This page counts every saccade, so its counts are higher.',
  `A saccade of A degrees lasts ${MAIN_SEQ.a * 1000} ms plus ${MAIN_SEQ.b * 1000} ms for each degree. Its speed rises and falls smoothly. Real saccades vary from one to the next. These do not.`,
  `Nerve signal from a typical nerve cell to a muscle, in spikes per second: ${NEURON.r0} + ${NEURON.k} × position + ${NEURON.r} × speed, along the direction the muscle pulls. These numbers were measured in monkeys. The burst during a saccade moves the eye fast. The steady rate after it holds the eye still.`,
  'The eyes, muscles and screen are drawn to scale. Muscle widths and thicknesses are this page\'s estimates. Real rectus muscles run through sleeves of tissue called pulleys, which hold each path in place. Here each muscle takes the shortest path around the eye. The skull, eyelids and fat are left out.',
  'The lines from the eyes to the screen show where each eye looks. The blue ring and trail on the screen show what an eye tracker would record. A real screen does not show them.',
];
export const MODEL_SRC = ['carl', 'barnes', 'trigger', 'amplitude', 'collewijn', 'bahill', 'robinson', 'apt', 'demer', 'leigh'];

export const INSET = `What the right eye sees, ${INSET_DEG}° across. The ring marks the central 2°, where sight is sharpest. During a saccade the brain turns vision down, so a person does not see this jump.`;
