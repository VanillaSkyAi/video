const SECOND_WAVE_INTERVAL = 4;
const SECOND_WAVE_START = 0.33;
const SECOND_WAVE_DURATION = 1;
const EXIT_FADE_START = 0.76;
const EXIT_FADE_END = 0.85;

export interface CelebrationParticleTiming {
  progress: number;
  opacity: number;
}

/**
 * Keeps most particles on the opening burst while delaying a restrained
 * quarter-sized cohort into the back half of the scene. The final fade is
 * scene-relative so particles always clear before the copy exits, regardless
 * of their individual physics duration.
 */
export function getCelebrationParticleTiming(
  sceneProgress: number,
  particleIndex: number,
  durationFactor: number,
): CelebrationParticleTiming | null {
  if (sceneProgress >= EXIT_FADE_END) return null;

  const isSecondWave = particleIndex % SECOND_WAVE_INTERVAL === 0;
  if (isSecondWave && sceneProgress <= SECOND_WAVE_START) return null;

  const waveProgress = isSecondWave
    ? (sceneProgress - SECOND_WAVE_START) / SECOND_WAVE_DURATION
    : sceneProgress;
  const progress = Math.min(1, Math.max(0, waveProgress / durationFactor));
  const opacity = sceneProgress <= EXIT_FADE_START
    ? 1
    : (EXIT_FADE_END - sceneProgress) / (EXIT_FADE_END - EXIT_FADE_START);

  return { progress, opacity };
}
