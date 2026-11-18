/**
 * What the core becomes from orientation (the opening), one point per seed:
 * hard (seeds killed), calm (calm seeds let in), rage (angry seeds let in).
 */
export type Trait = 'hard' | 'calm' | 'rage';

/** Each trait's colour: steel, soft blue, red. Used by the power button and the power's own effects. */
export const TRAIT_COLOURS: Record<Trait, number> = { hard: 0x94a3b8, calm: 0x7dd3fc, rage: 0xf43f5e };

/**
 * The core starts plain white and takes its colour from what it has done: steel for killing,
 * soft blue for the calm it has taken in, a deep dark red for the anger.
 */
export const CORE_WHITE = 0xf8fafc;
export const CORE_COLOURS: Record<Trait, number> = { hard: 0x8492a8, calm: 0x7cc8f5, rage: 0xa8182a };

/** What each power does, in plain words. Shown when the power first appears, and on hover. */
export const POWER_TIPS: Record<Trait, string> = {
  hard: 'Brace: for a moment, hits do only a fifth of their harm.',
  calm: 'Phase: slip out of reach. Shots pass through you, and enemies nearby are charmed. Walk into a charmed one to take it in.',
  rage: 'Burst: everything close to you is hit hard and hurled away.',
};

/** The power each trait gives (the button, or right-click). Shown as a caption when labels are on. */
export const POWER_NAMES: Record<Trait, string> = { hard: 'brace', calm: 'phase', rage: 'burst' };
