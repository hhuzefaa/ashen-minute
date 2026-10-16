// Feature flags for Tier 3 experiments (brief §6). Every experiment ships switched off until it
// has been play-tested; flipping a flag must never break a level.
export const FEATURES = Object.freeze({
  GNOMON_ILEN: false,   // Ilen's body casts a shadow under other lights (body runes only)
  SUNDIAL_HUB: false,   // a sun orbits the Sanctuary after the ring wakes
  BACKWARD_ECHO: false, // reversed sigil: an echo replays end → start
  ASH_DARK: false,      // ash zones dim the lantern and crumble echoes
});
