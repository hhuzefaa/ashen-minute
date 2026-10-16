// Feature flags for Tier 3 experiments (brief §6). Every experiment ships switched off until it
// has been play-tested; flipping a flag must never break a level.
// For testing only, a flag can be switched on with the URL: ?features=SUNDIAL_HUB,ASH_DARK
const DEFAULTS = {
  GNOMON_ILEN: false,   // Ilen's body casts a shadow under other lights (body runes only)
  SUNDIAL_HUB: false,   // a sun orbits the Sanctuary after the ring wakes; hold E at the Heart to run it back
  BACKWARD_ECHO: false, // reversed sigil: an echo recorded on it replays end → start
  ASH_DARK: false,      // ash zones dim the lantern (40 %, reach 5 m) and crumble echoes
};

function fromUrl() {
  try {
    const q = new URLSearchParams(location.search).get('features');
    return q ? Object.fromEntries(q.split(',').filter((k) => k in DEFAULTS).map((k) => [k, true])) : {};
  } catch { return {}; }
}

export const FEATURES = Object.freeze({ ...DEFAULTS, ...fromUrl() });
