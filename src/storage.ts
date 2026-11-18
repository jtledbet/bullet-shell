/**
 * Small save file in localStorage. The site hosts other games on the same origin, so the
 * key is namespaced. Every access is guarded: private windows and blocked storage throw.
 */
const KEY = 'bullet-shell:save:v1';

export interface BestRun {
  /** Seconds survived. */
  time: number;
  level: number;
  kills: number;
}

interface Save {
  muted: boolean;
  /** Name plates over the tutorial seeds. */
  labels: boolean;
  best: BestRun | null;
  /** Developer extras on this device (turned on with `?dev` in the URL), and the auto shotgun among them. */
  dev: boolean;
  devShotgun: boolean;
}

function validBest(b: unknown): BestRun | null {
  const r = b as Partial<BestRun> | null;
  const ok = r && [r.time, r.level, r.kills].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  return ok ? { time: r.time!, level: r.level!, kills: r.kills! } : null;
}

function read(): Save {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Save> | null;
    return {
      muted: parsed?.muted === true,
      labels: parsed?.labels === true,
      best: validBest(parsed?.best),
      dev: parsed?.dev === true,
      devShotgun: parsed?.devShotgun === true,
    };
  } catch {
    return { muted: false, labels: false, best: null, dev: false, devShotgun: false };
  }
}

const save = read();

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable: the game still works, it just forgets.
  }
}

export const isMuted = () => save.muted;

export function setMuted(muted: boolean) {
  save.muted = muted;
  write();
}

export const labelsOn = () => save.labels;

export function setLabels(on: boolean) {
  save.labels = on;
  write();
}

export const devOn = () => save.dev;

export function setDev(on: boolean) {
  save.dev = on;
  write();
}

export const devShotgunOn = () => save.dev && save.devShotgun;

export function setDevShotgun(on: boolean) {
  save.devShotgun = on;
  write();
}

export const bestRun = () => save.best;

/** Stores the run if it outlasted the best one. Returns whether it is a new best. */
export function recordRun(run: BestRun) {
  if (save.best && save.best.time >= run.time) return false;
  save.best = run;
  write();
  return true;
}
