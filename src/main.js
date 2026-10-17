import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './style/main.css';
import './style/title.css';
import './style/menus.css';
import { Game } from './game/Game.js';

const game = new Game(document.getElementById('game'));
game.start();
// Exposed for automated play-testing (tests/playthrough.py). Harmless in production.
window.__ashen = game;
