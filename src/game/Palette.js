import * as THREE from 'three';

// Palette from the design bible §7.3, plus a few derived tones.
export const COLORS = {
  bg: 0x171a2c,
  stone: 0x373747,
  stoneLight: 0x4a4a5c,
  stoneDark: 0x24242f,
  ash: 0x777786,
  cold: 0x65758a,
  fire: 0xff8a32,
  hot: 0xffd17a,
  time: 0x69d9e8,
  target: 0xf0c76a,
  cloak: 0x2c2a36,
  rust: 0x9a4322,
};

let _grain = null;
/** Small procedural grain texture so stone surfaces are not perfectly flat. */
export function grainTexture() {
  if (_grain) return _grain;
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const img = g.createImageData(s, s);
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < s * s; i++) {
    const v = 200 + rnd() * 55;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // a few darker cracks / speckles
  g.strokeStyle = 'rgba(60,60,70,0.35)';
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    let x = rnd() * s, y = rnd() * s;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  _grain = new THREE.CanvasTexture(cv);
  _grain.wrapS = _grain.wrapT = THREE.RepeatWrapping;
  _grain.colorSpace = THREE.SRGBColorSpace;
  return _grain;
}

export function stoneMaterial(color = COLORS.stone, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, map: grainTexture(), roughness: 0.95, metalness: 0.02, flatShading: true, ...opts,
  });
}

let _glow = null;
/** Soft radial sprite used by particles and halos. */
export function glowTexture() {
  if (_glow) return _glow;
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  _glow = new THREE.CanvasTexture(cv);
  return _glow;
}

/** Deterministic PRNG so every room looks the same on every run. */
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Shortest signed angle difference a - b in (-PI, PI]. */
export function angleDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

export const DEG = Math.PI / 180;
