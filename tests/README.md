# Browser checks

These scripts drive the game in a headless Chrome and check that it behaves. They need
nothing installed beyond Node 22 and Chrome: they talk to the browser directly.

## Running them

Start the game's dev server in one terminal:

```bash
npx vite --host 127.0.0.1 --port 5173 --strictPort
```

Then, in another:

```bash
bash tests/run.sh              # every check
bash tests/run.sh coretest     # just one (or several, by name)
```

Each check prints `PASS` or `FAIL` per line and ends with `ALL PASS` or a count of
failures. Screenshots land in `tests/.out/<name>/`, which git ignores.

Chrome is expected at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Set
`CHROME` to its path anywhere else.

Each check starts with all three powers already introduced, so a power's card doesn't
hold the game mid-check. `abilitytest` and `tiptest` clear that to check the card itself.

## What each one covers

| Script | Covers |
| --- | --- |
| `basicstest` | Idle nudges, backdrops, shots, the power's feedback, pause, game over, "again" and "reorient" |
| `coretest` | The core's colour and face, damage numbers, ghosting, seed thoughts |
| `energytest` | Firing spends energy, motes, the Siphon card, the red power's blast |
| `charmtest` | Charm: taking enemies in, how it spreads, how it ends, "souls" and "kills" |
| `weapontest` | Shot damage and growth, the flare, its shop items, the developer switch |
| `rescuetest` | The second wind offered to new players |
| `desktoptest` | The power's place and key on desktop, fullscreen, space to pause |
| `startest` | The grid in orientation and the starfield after it |
| `cornertest` | The pause and fullscreen buttons fading back |
| `orbtest` | The build orb in the pause menu (live game only) |
| `fstest` | Fullscreen: the button and F ask for it; clicking it or pause fires nothing |
| `rotatetest` | The "turn your phone" screen |
| `devtest` | The developer switches, speed readout and event log, and that `?dev` lasts only for that visit |
| `tiptest` | Explanations: on cards, on the power's card (closed with E), and on hover (it also runs `tipcards` at phone size) |
| `wavetest` | Balance (harder hits, Siphon's ceiling, card and level growth), merging gems, the lull between waves, the gem radar, and the minimap (it also runs `wavephone` at phone size) |
| `powertest` | The powers growing with level, and Brace knocking away what touches you |
| `abilitytest` | The power's card and its button; run with `TOUCH=1` for the phone layout |
| `tutfixtest` | Orientation's endings, sounds and temperament tells |
| `traitstest` | What each trait does |
| `broodtest` | The brood that follows the first angry seed |
| `shoptest` | The shop between waves: kills give experience, gems are money, gems fading and the shop opening when the lull ends, buying, rerolls, the new items, and the layout at two phone sizes (it runs `shopphone`) |

Two more are tools, not checks: `perftest` (frame times and where the time goes) and
`flareshot` (a screenshot of a flare bursting).

## Things to know

- They are timing-based, so one will occasionally fail on a slow moment. Run a failed
  check again before believing it.
- Headless Chrome draws in software, so its frame rates say nothing about real machines.
- The checks open the game with `?fullres`, which turns off the automatic drop in
  resolution so screenshots stay sharp.
- After editing game code, restart the dev server before running a check that counts
  sounds (`tutfixtest`, `energytest`): hot reload leaves two copies of the sound module.
- A fresh browser profile is used every run, so nothing is remembered between runs.
