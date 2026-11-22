# Silverback: World Tour

A browser brawler. One very large ape goes on tour through eight cities and batters the animals that run each one. The first stop, Philadelphia, is playable.

Working title and character names are placeholders (the ape is "Big Jawn", the Philadelphia boss is "Baldwin", a bald eagle in an engineer's cap). The ape is an original character.

```
index.html            the game page
src/main.js           boots the game
src/game.js           mission flow, combat rules, scoring, the frame loop
src/actors/           the ape, raccoons, pigeons, the eagle boss (models, animation, behaviour)
src/world/city.js     what every city shares: instanced buildings, collision, destruction
src/world/philadelphia.js   the Philadelphia map and landmarks
src/engine/           renderer and sky, materials, effects, camera, input, synthesised sound
src/ui/hud.js         HUD, minimap, touch controls, title / tour / pause / results screens
server.js             zero-dependency static server for the built game
city.html, view.html  development viewers for the city and the characters
```

Everything is generated in code: no model, texture or audio files.

## Playing

| | Keyboard and mouse | Touch | Gamepad |
| --- | --- | --- | --- |
| Move | W A S D or arrows | left thumb | left stick |
| Look | drag the mouse, wheel to zoom | drag the right side | right stick |
| Punch (tap three times for a combo) | J, F or click | PUNCH | X |
| Slam (shockwave; press in the air to dive) | K, E or right-click | SLAM | Y |
| Jump | Space | JUMP | A |
| Roar (when the orange bar is full: stuns, then double damage) | L, R or Q | ROAR | B |
| Pause / mute | Esc or P / M | II button | Start |

Philadelphia runs: break out of the zoo, clear the raccoons off Eakins Oval below the Art Museum steps, swat the pigeons at Logan Circle, then fight the eagle at City Hall. Buildings, trees and parked cars can all be flattened; landmarks cannot. Pretzels heal.

## The tour

Philadelphia, New York City, Santa Clara, San Francisco, London, Tokyo, Paris, Shanghai. Each later city needs a map file like `src/world/philadelphia.js`, its animals, and an entry in `TOUR` in `src/game.js`.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # writes dist/
npm start          # serves dist/ on $PORT (default 8080)
npm test
```

Handy URLs while developing:

- `/?autoplay=1` skips the title. `&start=oval`, `&start=logan` or `&start=boss` jumps to that checkpoint. `&god=1` refills health when hit.
- `/?quality=high` or `/?quality=low` forces the graphics tier (phones default to low; the pause menu has a toggle).
- `/city.html?cam=x,y,z&look=x,y,z` shows the city alone. `/view.html?who=ape&pose=run` shows a character (`who`: ape, raccoon, thrower, pigeon, eagle).

## Deploying

Railway builds the `Dockerfile` (Vite build, then `node server.js`). The service needs no variables and no volume; `/health` answers `ok`.
