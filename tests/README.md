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

## What each one covers

| Script | Covers |
| --- | --- |
| `basicstest` | Idle nudges, backdrops, shots, the power's feedback, pause, game over and "again" |
| `coretest` | The core's colour and face, damage numbers, ghosting, seed thoughts |
| `energytest` | Firing spends energy, motes, the Siphon card, the red power's blast |
| `charmtest` | Charm: taking enemies in, how it spreads, how it ends, "souls" and "kills" |
| `weapontest` | Shot damage and growth, the flare, its cards, the developer switch |
| `rescuetest` | The second wind offered to new players |
| `desktoptest` | The power's place and key on desktop, fullscreen, space to pause |
| `startest` | The grid in orientation and the starfield after it |
| `cornertest` | The pause and fullscreen buttons fading back |
| `orbtest` | The build orb in the pause menu |
| `rotatetest` | The "turn your phone" screen |
| `devtest` | The developer shotgun switch (`?dev`) |
| `tiptest` | Explanations: on cards, on the power, and on hover (it also runs `tipcards` at phone size) |
| `abilitytest` | The power button; run with `TOUCH=1` for the phone layout |
| `tutfixtest` | Orientation's endings, sounds and temperament tells |
| `traitstest` | What each trait does |
| `broodtest` | The brood that follows the first angry seed |

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
