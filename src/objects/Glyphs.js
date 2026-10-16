import * as THREE from 'three';
import { makeRng } from '../game/Palette.js';

// Original rune glyphs drawn on canvas (no external textures). White on transparent so the
// material colour tints them.
const cache = new Map();

export function runeTexture(kind = 'target', seed = 3) {
  const key = kind + seed;
  if (cache.has(key)) return cache.get(key);
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const rng = makeRng(seed);
  g.translate(s / 2, s / 2);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';

  if (kind === 'target') {
    // outer double ring with tick marks (a sundial face) + an eye-like centre
    g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 112, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 94, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const l = i % 3 === 0 ? 20 : 10;
      g.lineWidth = i % 3 === 0 ? 6 : 3;
      g.beginPath();
      g.moveTo(Math.cos(a) * 94, Math.sin(a) * 94);
      g.lineTo(Math.cos(a) * (94 - l), Math.sin(a) * (94 - l));
      g.stroke();
    }
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(0, -58); g.lineTo(42, 0); g.lineTo(0, 58); g.lineTo(-42, 0); g.closePath(); g.stroke();
    g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill();
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, -58); g.lineTo(0, -80); g.moveTo(0, 58); g.lineTo(0, 80); g.stroke();
  } else if (kind === 'inscription') {
    // a column of invented glyphs
    g.lineWidth = 7;
    for (let row = 0; row < 3; row++) {
      const y = -80 + row * 80;
      const n = 2 + Math.floor(rng() * 3);
      g.beginPath();
      let x = -40, yy = y;
      g.moveTo(x, yy);
      for (let k = 0; k < n; k++) {
        x = (rng() - 0.5) * 100; yy = y + (rng() - 0.5) * 50;
        g.lineTo(x, yy);
      }
      g.stroke();
      g.beginPath(); g.arc((rng() - 0.5) * 70, y + (rng() - 0.5) * 30, 7, 0, Math.PI * 2); g.fill();
    }
    g.lineWidth = 4;
    g.strokeRect(-100, -118, 200, 236);
  } else if (kind === 'finale') {
    // three-part seal: three arcs and a triangle — the completed floor symbol
    g.lineWidth = 6;
    g.beginPath(); g.arc(0, 0, 118, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
      g.beginPath(); g.arc(Math.cos(a) * 52, Math.sin(a) * 52, 46, 0, Math.PI * 2); g.stroke();
    }
    g.lineWidth = 5;
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
      const x = Math.cos(a) * 100, y = Math.sin(a) * 100;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}
