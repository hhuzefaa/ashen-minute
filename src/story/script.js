// ASHEN MINUTES — story script (original). Full prose version: docs/STORY.md
//
// Ilen, once an apprentice Keeper, fled the Temple of Minutes ten years ago, the night its Heart
// Ember began to fail. In the city of Vael below, people are forgetting each other; this morning
// her sister Sera did not know her name. Ilen returns to relight the Ember. The old Keeper,
// Marrow, who stayed behind, survives only as echoes: minutes she left behind, still walking.
//
// Revelations: (after III) Marrow put the Ember out herself. (after V) The Ember lived by burning
// the living city's minutes — the forgetting was its hunger. (after VI) Lit *backwards* it returns
// every stolen minute, but the Keeper who lights it gives up her own memories of the temple.
// Ending: Ilen lights it backwards. Sera remembers her. Ilen forgets the temple — and Marrow.

export const SPEAKERS = { ILEN: 'Ilen', MARROW: 'Marrow — echo', TEMPLE: 'Inscription' };

// Camera shots used by scenes: [camX, camY, camZ, lookX, lookY, lookZ]
export const SCENES = {
  // cold open: one card, one line, then control (the rest are barks on the walk to Room I)
  opening: [
    { fade: 1, instant: true },
    { cam: [6, 4.5, 84, 0, 3, 50], speed: 99 },
    { fade: 0, dur: 1.0 },
    { card: ['THE TEMPLE OF MINUTES', 'Ten years after the Ember failed'], dur: 2.4 },
    { cam: [-3.5, 2.4, 79, 0, 1.6, 70], speed: 0.9 },
    { say: ['ILEN', 'Sera didn’t know my name this morning. So I’m going back in.'] },
    { do: 'openingBarks' },
  ],
  hub_first: [
    { cam: [0, 7, 21, 0, 1.5, 0], speed: 1.2 },
    { say: ['ILEN', 'The Sanctuary. And the Heart Ember… cold as a hearthstone in winter.'] },
    { cam: [-14, 6, 14, 0, 1, -4], speed: 0.7 },
    { say: ['ILEN', 'Six braziers around the ring, one for every wing of the temple. Every one of them dark.'] },
    { say: ['MARROW', 'If you’re hearing this, Ilen, then you came back. I knew you would.'] },
    { say: ['MARROW', 'Follow my embers. I left them where you’d look. West first — where I taught you.'] },
  ],
  rev1: [
    { cam: [-47, 5, -56, -57, 1, -40], speed: 1.4 },
    { say: ['MARROW', 'The night you ran, Ilen — it wasn’t failing. I put it out. With my own hands, with ash from the old hearths.'] },
    { say: ['ILEN', 'You put it out? Then the forgetting…'] },
    { say: ['MARROW', 'Keep going. The north wing will tell you why. I couldn’t say it to your face then. I can’t say all of it now.'] },
    { say: ['ILEN', 'Ten years I thought I ran from a dying fire. I ran from you.'] },
    { say: ['TEMPLE', 'The way north is open. A shortcut leads back to the Sanctuary.'] },
  ],
  rev2: [
    { cam: [12, 5, -91, 4, 0.5, -76], speed: 1.2 },
    { say: ['MARROW', 'The Heart was never fed by the minutes we offered. It took them. From the city. From every sleeping house in Vael.'] },
    { say: ['MARROW', 'They weren’t forgetting because it died. They forgot because it was alive. Every minute it burned was one of theirs.'] },
    { say: ['ILEN', 'Then Sera is forgetting because the ash is still settling.'] },
    { say: ['MARROW', 'What it stole is still here. Ash in these halls. The east wing knows how to give it back.'] },
  ],
  ring_wakes: [
    { cam: [0, 14, 30, 0, 0, 0], speed: 1.0 },
    { do: 'wakeRing' },
    { say: ['MARROW', 'Lit forward, the Heart feeds again. Lit backwards, it gives back every minute it ever took.'] },
    { cam: [-19, 5, 3, -12.5, 1, -4], speed: 1.0 },
    { say: ['MARROW', 'But a Keeper must light it backwards, and the fire takes the Keeper’s minutes first. Every one that belongs to this place.'] },
    { say: ['ILEN', 'You were going to do it. That’s why you stayed.'] },
    { say: ['MARROW', 'I was too old. Too few minutes left to light it. You have enough.'] },
    { cam: [19, 5, 3, 12.5, 1, -4], speed: 1.0 },
    { say: ['ILEN', 'Then I’ll forget the temple. And you.'] },
    { say: ['ILEN', '…But Sera will remember me.'] },
    { say: ['MARROW', 'One Keeper can’t hold three shadows. Unless she leaves some of herself behind.'] },
  ],
  finale: [
    { cam: [7, 4, -9, 0, 2, 0], speed: 1.4 },
    { do: 'embersConverge', wait: 2.4 },
    { say: ['ILEN', 'Marrow. Thank you for waiting.'] },
    { do: 'heartBackwards', wait: 1.5 },
    { cam: [0, 16, 26, 0, 3, 0], speed: 0.5 },
    { say: ['MARROW', 'Go home, Keeper.'] },
    { do: 'ashRises', wait: 2.5 },
    { fade: 1, dur: 2.5, color: '#f3e4cc' },
    { card: ['', 'In Vael, a woman wakes and says her sister’s name.'], dur: 4 },
    { card: ['', 'In the temple, the shadows return to their stones.'], dur: 3.6 },
    { card: ['ASHEN MINUTES', 'The temple remembers, so that we may forget.'], dur: 4.4 },
    { do: 'victory' },
  ],
};

// Opening barks (non-blocking, on the walk from the terrace to Room I).
export const OPENING_BARKS = [
  ['ILEN', 'It’s the whole city. Faces go first. Then names. Then whole years.'],
  ['ILEN', 'Marrow used to say the Heart Ember keeps what we can’t. And I left her here alone with it.'],
];

export const COMPLETE_LINES = {
  1: ['ILEN', 'The shadow still answers. The temple still remembers how to listen.'],
  2: ['ILEN', 'A fire left burning holds the road. She taught me that once. I forgot I knew it.'],
  3: ['ILEN', 'Her echoes sound tired. How long did she wait in here?'],
  5: ['ILEN', 'Stop at the right minute. Not the first one. Not the last.'],
  6: ['ILEN', 'Warm air from the deep. Something below is still breathing.'],
};

export const ENTER_LINES = {
  3: ['ILEN', 'Marrow? …No. Just her minutes. Still walking her rounds.'],
  9: ['ILEN', 'No more lessons. Just the work.'],
};

export const READINGS = {
  S1: 'THE FIRST KEEPERS CUT THE HOURS INTO STONE, SO THE STONE WOULD REMEMBER WHEN THEY COULD NOT.',
  S2: 'Scratched low on the wall, in a child’s hand:  “ILEN — TALLER THAN THE DIAL TODAY.”',
  S3: 'Marrow’s ledger:  “Day 3,650. The ash has reached the city gate. If she comes, I will not be here to tell her. The relics will.”',
  L6_hint: 'FIRE FOLLOWS THE SHADOW’S ROAD.',
};
export const SECRETS = ['S1', 'S2', 'S3'];

// Lost Minutes: six optional fragments of the past (brief §4.4). Shown in the reading panel.
export const LOST_MINUTES = {
  lm1: 'Marrow, teaching:  “Again. Slower. The shadow is not late — you are early.”',
  lm2: 'A child’s laugh in the Echo Court. Marrow, softly:  “Taller than the dial today.”',
  lm3: 'Marrow alone, on her rounds:  “Three thousand six hundred and fifty. She’ll come.”',
  lm4: 'Ilen, fifteen, at the gate:  “I’ll be back before the bells.”  She wasn’t.',
  lm5: 'Marrow, to the dark:  “I put it out so they could keep their mornings. Forgive me.”',
  lm6: 'Marrow, laughing:  “You’ll be a better Keeper than me, Ilen. You’ll leave.”',
};
