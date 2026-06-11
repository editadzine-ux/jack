# SPUDVENTURE

A third-person 3D survival game. You are a potato with tiny legs.
The oven has come alive. Reach the cutting board.

## Run

```sh
npm install
npm run dev
```

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| SPACE | Jump (coyote time + input buffering) |
| SHIFT (tap) | Roll |
| SHIFT (hold) | Run |

## The kitchen

- The oven sits dormant for 4 seconds. Then it doesn't.
- It gets faster every 30 seconds, up to 95% of your speed.
- On your last sliver of skin it goes white-hot and rages.
- Butter is slippery. Steam vents slow you down. Pots do not move.
- The cutting board glows green. That's the way out. Probably.

Built with Three.js, GSAP and the `postprocessing` library on Vite.
