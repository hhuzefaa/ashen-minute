// The menu button artwork (cut from the provided theme sheet by tools/extract_button_art.py).
// Imported once (Vite hashes the files), handed to CSS as custom properties on :root, and decoded
// up front so no button ever pops in half-loaded.
import normal from '../assets/ui/button-normal.png';
import hover from '../assets/ui/button-hover.png';
import pressed from '../assets/ui/button-pressed.png';
import normalWide from '../assets/ui/button-normal-wide.png';
import hoverWide from '../assets/ui/button-hover-wide.png';
import pressedWide from '../assets/ui/button-pressed-wide.png';

const ART = { normal, hover, pressed, 'normal-wide': normalWide, 'hover-wide': hoverWide, 'pressed-wide': pressedWide };

const root = document.documentElement.style;
for (const [k, src] of Object.entries(ART)) root.setProperty(`--art-${k}`, `url("${src}")`);

export const artReady = Promise.all(Object.values(ART).map((src) => {
  const img = new Image();
  img.src = src;
  return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
}));
