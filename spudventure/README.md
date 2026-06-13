# SPUDVENTURE

A third-person 3D survival game. You are a potato with tiny legs.
The oven has come alive. Reach the cutting board.

## Run

```sh
npm install
npm run dev
```

## Controls

| Desktop | Touch | Action |
| --- | --- | --- |
| WASD / Arrows | Drag left half of screen | Move |
| SPACE | JUMP button | Jump (coyote time + input buffering) |
| SHIFT (tap) | ROLL button | Roll |
| SHIFT (hold) | hold ROLL | Run |

The exit stays hidden and dark until a survival timer opens it, in a different
spot each level. Find it, then run. Failing restarts the level you died on;
the ↺ button restarts the whole run from level 1.

## The six levels

1. **Kitchen** — the oven comes alive and chases you.
2. **Oil Slick** — the whole counter is olive oil; spice shakers rain down.
3. **Kids Party** — three hungry party kids chase you between balloons.
4. **Dinner Table** — the edges are cliffs; a giant fork sweeps like a zamboni.
   Roll into olives to fire them and stun the fork.
5. **The Fridge** — cold, slippery, with tupperware that tries to vacuum you in.
   The exit is the veg drawer at the bottom: you win by *falling in*.
6. **Inside the Oven** — the floor heats up and invisible heat waves sweep the
   room. The door opens for 1.2 s every 8 s. One window. Don't miss it.

Built with Three.js, GSAP and the `postprocessing` library on Vite.
