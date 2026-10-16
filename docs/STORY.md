# Ashen Minutes — Story

The story is original. Its storytelling principles were researched from *Celeste*, *Outer Wilds* and *The Witness*: the first level is quiet, story beats sit *between* hard sections, difficulty mirrors the emotional low point, and the environment carries most of the lore. No plot, characters or dialogue were taken from any of them. The text in the game lives in `src/story/script.js`.

## Premise
The city of Vael is forgetting itself. First faces go, then names, then whole years. **Ilen** was once an apprentice Keeper of the Temple of Minutes. Ten years ago, on the night its Heart Ember began to fail, she ran away. This morning her sister **Sera** did not know her name. Ilen comes back to relight the Ember.

## Setting and lore
- The temple's builders found that **a shadow cast by fire remembers the minute it was cast**. They built relics as floating sundials whose gnomons cast those shadows, and fed the kept minutes to the **Heart Ember**.
- When the Ember went dark, the temple's shadows came loose from the objects that cast them. That is why shadows can become bridges.
- **Marrow**, the old Keeper, stayed behind. She survives only as **echoes** recorded in the relics' memories. You hear her when relics ignite, and in the revelation scenes.

## Emotional stakes
Ilen's guilt about running away and abandoning Marrow; the fear of being forgotten by Sera. Her arc moves from *running from* the temple to *giving herself* to it.

## Structure and beats

| When | Scene / beat | Purpose |
|---|---|---|
| New game | **Opening**: camera over the entrance, title card, Ilen's four lines about Sera, the city and Marrow | Who she is, why she's here, what's at stake |
| L1 lit | Marrow's echo: "Fire first, child. A sundial with no sun keeps no hours." | Introduces the voice; the lesson doubles as a tutorial |
| Hub, first visit | **Sanctuary**: the dead Heart and ten dark braziers. Marrow: "Follow my embers." | Shows the structure: ten embers, ten braziers that light as you progress |
| L2–L3 | Echo lines about memory and about "keeping this alone" | Builds Marrow's character, tired and guilty |
| After L4 | **Revelation I**: "The night you ran… I put it out." | Mystery twist. Ilen: "I ran from you." |
| L5–L6 | "The past is a path, not a wall." · warm air from the deep | Rising tension |
| After L7 | **Revelation II**: the Ember fed on the *living* city's minutes; the forgetting was its hunger, and its ash is still settling | Recasts the goal: relighting it as it was would be a crime |
| L8–L9 | "A door, a flame, a memory…" · "I'm sorry I made you do this alone." | The hardest levels sit at the emotional low point |
| After L9 | **The ring wakes**: lit *backwards*, the Ember returns every stolen minute, but the Keeper who lights it loses her own minutes of the temple | The final choice and its cost, accepted: "But Sera will remember me." |
| L10 sockets | Ilen: "Three shadows. One heart. Hold." | The climax is mechanical; the player performs the choice |
| Finale | Three embers converge, the Heart burns backwards, ash rises. "Marrow. Thank you for waiting." / "Go home, Keeper." | Catharsis |
| Ending cards | "In Vael, a woman wakes and says her sister's name." · "In the temple, the shadows return to their stones." · **"The temple remembers, so that we may forget."** | Bittersweet resolution |

## Environmental storytelling
- **Hub braziers:** one lights for each level restored, so the Sanctuary visibly warms. Fog, ambient light and the music drone also shift from cold blue toward amber as embers return.
- **Optional inscriptions:**
  - **S1** (gallery): the founding principle.
  - **S2** (Echo Court alcove): Ilen's childhood height mark.
  - **S3** (Clockwork alcove): Marrow's ledger, "Day 3,650…".
- **Hint inscriptions** in levels II, IV, V, VI and VII are written as the temple's own maxims, never as button instructions.
- **Architecture:** cold relics, ash falling everywhere, broken statues of earlier Keepers, the sealed Heart island.

## Cutscene system
- Cutscenes run in-engine: camera keyframes, letterbox bars, typewriter dialogue with speaker names, fades and title cards.
- **Space / E / click** advances a line; **Esc** skips the whole scene. Skipping still applies every state change the scene would have made (for example, waking the ring).
- Control and the third-person camera are always restored when a scene ends (tested).
- The barks during play (echo lines) never take control away from the player.
