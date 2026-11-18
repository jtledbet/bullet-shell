/**
 * What the core becomes from orientation (the opening), one point per seed:
 * hard (seeds killed), calm (calm seeds let in), rage (angry seeds let in).
 */
export type Trait = 'hard' | 'calm' | 'rage';

/** Each trait's colour: steel, pale, red. Used by the power button and the power's own effects. */
export const TRAIT_COLOURS: Record<Trait, number> = { hard: 0x94a3b8, calm: 0xe9e5ff, rage: 0xf43f5e };

/** The power each trait gives (the button, or right-click). Shown as a caption when labels are on. */
export const POWER_NAMES: Record<Trait, string> = { hard: 'brace', calm: 'phase', rage: 'burst' };
