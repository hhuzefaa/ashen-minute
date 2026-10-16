# Ashen Minutes — Story

The story is original. Its storytelling principles were researched from *Celeste*, *Outer Wilds* and *The Witness*: the first level is quiet, story beats sit *between* hard sections, difficulty mirrors the emotional low point, and the environment carries most of the lore. No plot, characters or dialogue were taken from any of them. The text in the game lives in `src/story/script.js`.

## Premise
The city of Vael is forgetting itself. First faces go, then names, then whole years. **Ilen** was once an apprentice Keeper of the Temple of Minutes. Ten years ago, on the night its Heart Ember began to fail, she ran away. This morning her sister **Sera** did not know her name. Ilen comes back to relight the Ember.

## Setting and lore
- The temple's builders found that **a shadow cast by fire remembers the minute it was cast**. They built gnomon stones — sundials that never turn — so that any fire carried past them would write its minute in shadow, and fed the kept minutes to the **Heart Ember**.
- When the Ember went dark, the temple's shadows came loose from the ground they fall on. That is why a shadow over the abyss can be walked.
- **Marrow**, the old Keeper, stayed behind. She survives as **echoes** — minutes she left behind, still walking. In Room III her echo still walks her nightly rounds, lantern in hand, alone.
- **Ilen** carries the only moving fire: she is the temple's sun. In Room IV Marrow's sigil teaches her to leave minutes of her own behind. In the finale, the minutes she leaves are the price of the ending.

## Emotional stakes
Ilen's guilt about running away and abandoning Marrow; the fear of being forgotten by Sera. Her arc moves from *running from* the temple to *leaving pieces of herself* in it. The mechanics climb the same ladder: her lantern → sconces → Marrow's borrowed echo → her own echoes → echoes that never fade.

## Structure and beats

| When | Scene / beat | Purpose |
|---|---|---|
| New game | **Cold open**: title card "The Temple of Minutes / Ten years after the Ember failed", one line — "Sera didn't know my name this morning. So I'm going back in." — then control (< 30 s) | Who she is and why, without a lecture |
| Walk to Room I | Barks: "It's the whole city. Faces go first…" · "Marrow used to say the Heart Ember keeps what we can't…" | The rest of the opening, while walking |
| Room I first sweep | Marrow: "Fire first, child. Where the fire stands, the shadow falls the other way." | Introduces her voice; names rule 1 after the player has seen it |
| Hub, first visit | **Sanctuary**: the dead Heart, "Six braziers around the ring…", Marrow: "Follow my embers." | Structure: six rooms, six braziers that wake |
| Room II first fall | Ilen: "I can't stand where the light has to be." · on a sconce's road, Marrow: "A Keeper never carries every fire herself." | The core insight, voiced after it is felt |
| Room III entry | Ilen: "Marrow? …No. Just her minutes. Still walking her rounds." | Marrow becomes a presence |
| After Room III | **Revelation I**: "The night you ran… I put it out." | Mystery twist |
| Room IV grant | Marrow: "You can leave a minute behind, Ilen. The temple will walk it for you." · first echo, Ilen: "That's me. Eight seconds ago." | Time becomes Ilen's own minutes |
| After Room V | **Revelation II**: the Ember fed on the living city's minutes; the forgetting was its hunger | Recasts the goal |
| Room VI entry | "No more lessons. Just the work." | The quiet room |
| After Room VI | **The ring wakes**: lit *backwards* the Ember returns every stolen minute, but the Keeper who lights it loses her own minutes of the temple. Ends with Marrow: "One Keeper can't hold three shadows. Unless she leaves some of herself behind." | The choice and its cost — and the final puzzle's rule |
| The Heart | Ilen leaves two echoes that never fade: "That one stays." / "…So does that one." All three held: "Three shadows. One heart. Hold." | The player performs the sacrifice |
| Finale | Three embers converge, the Heart burns backwards. "Marrow. Thank you for waiting." / "Go home, Keeper." | Catharsis |
| **The Unmaking** | Control returns: the shadows return to their stones, the span crumbles behind her, and Ilen runs past her own echoes to Marrow's echo at the gallery door, lantern raised | The ending as an action |
| Ending cards | "In Vael, a woman wakes and says her sister's name." · "In the temple, the shadows return to their stones." · (all six Lost Minutes: "She remembers the smell of the old hearths, and does not know why.") · **"The temple remembers, so that we may forget."** | Bittersweet resolution; the ending itself is unchanged |

Hints on demand are Marrow's lines too (see `levels.js` `hints`), e.g. "Watch my rounds, child. The shadow comes to you."

## Environmental storytelling
- **Hub braziers:** one lights for each room restored; fog, light and music warm from cold blue toward amber.
- **Optional inscriptions:** **S1** (gallery) the founding principle · **S2** (Room II alcove) Ilen's childhood height mark · **S3** (Clockwork alcove) Marrow's ledger, "Day 3,650…". The only maxim left on a wall is Room V's "FIRE FOLLOWS THE SHADOW'S ROAD"; the old hint inscriptions that explained puzzles were removed.
- **Lost Minutes** (optional, six): two-line memories — Marrow teaching ("The shadow is not late — you are early."), a child's laugh, Marrow counting the days, Ilen at fifteen ("I'll be back before the bells." She wasn't.), Marrow's confession to the dark, and her last laugh ("You'll be a better Keeper than me, Ilen. You'll leave.").

## Cutscene system
- Cutscenes run in-engine: camera keyframes, letterbox bars, typewriter dialogue with speaker names, fades and title cards.
- **Space / E / click** advances a line; **Esc** skips the whole scene. Skipping still applies every state change the scene would have made (for example, waking the ring).
- Control and the third-person camera are always restored when a scene ends (tested).
- Barks during play appear at the top of the screen and never take control away from the player.
