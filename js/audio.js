// audio.js — haptic feedback + ljud-stubs (Web Audio kan läggas till senare)

const HAPTIC_OK = typeof navigator !== "undefined" && "vibrate" in navigator;

export function haptic(pattern) {
  if (!HAPTIC_OK) return;
  try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
}

// Genvägar för spelhändelser
export const Haptic = {
  dot:       () => haptic(2),          // prick
  pellet:    () => haptic(15),         // power pellet
  powerup:   () => haptic([10, 30, 10]),
  eatGhost:  () => haptic([20, 40, 40]),
  death:     () => haptic([60, 40, 60, 40, 120]),
  win:       () => haptic([80, 60, 80, 60, 200]),
  pause:     () => haptic(8),
};

// Stub för ljud — Web Audio kan hookas in senare utan att ändra API:et
export const Sfx = {
  dot:       () => {},
  pellet:    () => {},
  powerup:   () => {},
  eatGhost:  () => {},
  death:     () => {},
  win:       () => {},
};
