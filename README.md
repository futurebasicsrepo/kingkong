# Silverback: World Tour

A browser brawler, built phone-first for players aged about 8 to 16. One very large ape goes on tour through eight cities and batters the animals that run each one. The first stop, Philadelphia, is playable.

There are five apes to play as: **Trevor, Lukas, Sloan, Calvin and Zo**. They play the same and differ in fur, scarf and gear. All characters are original.

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

Philadelphia runs: break out of the zoo, clear the raccoons off Eakins Oval below the Art Museum steps, swat the pigeons at Logan Circle, take Independence Mall back from Big Bandit (the king of the Trash Pandas), then fight the eagle at City Hall.

Three difficulty levels, chosen on the tour screen or in the pause menu: **Easy**, **Normal** and **Hard**. They change how hard and how often the animals hit, how many attack at once, how tough they and the boss are, and how generous the pretzels are. On Hard, an animal that has started a swing cannot be jabbed out of it.

Other things to do:

- **Climb.** Run into any building and keep pushing: the ape climbs it. Push toward the wall to go up, pull away to come down, jump to leap off, slam to dive. Towers with setbacks are climbed ledge by ledge.
- **Rooftops.** Roofs can be stood on and run across. A dive from high up makes a much bigger crater.
- **Wreck things.** Buildings, trees, street lamps and parked cars can all be flattened; landmarks cannot. A car kicked while an animal is in front of the ape flies at it.
- **Pretzels** heal. Clearing an objective heals a little too.
- **Golden pretzels.** Ten are hidden round the city, some on roofs and one on top of the tallest tower. They show as ringed gold dots on the map.
- There is a secret on Independence Mall.

## The tour

| Stop | City | Rival |
| --- | --- | --- |
| 1 | Philadelphia (playable) | Baldwin, the Bald Eagle of Broad Street |
| 2 | New York City | Bullion, the Wall Street Bull |
| 3 | Santa Clara | Nugget, the Gold Rush Grizzly |
| 4 | San Francisco | Barker, the Sea Lion of the Bay |
| 5 | London | Regent, the Lion of Trafalgar |
| 6 | Tokyo | Kabuto, the Giant Stag Beetle |
| 7 | Paris | Chanticleer, the Rooster of Paris |
| 8 | Shanghai | Huangpu, the Tiger of the Bund |

Each later city needs a map file like `src/world/philadelphia.js`, its animals, and its entry opened in `TOUR` in `src/game.js`.

## Phones

- Two graphics tiers. Phones start on the lighter one; the pause menu switches.
- The game watches its own frame rate and lowers the drawing resolution when a device cannot keep up, then raises it again when there is headroom.
- On touch devices, starting a game asks for full screen and landscape where the browser allows it; a phone held upright is asked to turn sideways.
- The game can be added to a phone's home screen (it ships a web app manifest and icons in `public/`). Opened from there it runs full screen in landscape, which is the only way to get that on iPhones.
- Hits and knocks rumble on phones that support vibration.

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

- `/?autoplay=1` skips the title. `&start=oval`, `&start=logan`, `&start=mall` or `&start=boss` jumps to that checkpoint. `&level=easy` or `&level=hard` sets the difficulty. `&god=1` refills health when hit. `&ape=zo` picks an ape. `&gov=0` turns the frame-rate governor off.
- `/?quality=high` or `/?quality=low` forces the graphics tier (phones default to low; the pause menu has a toggle).
- `/city.html?cam=x,y,z&look=x,y,z` shows the city alone. `/view.html?who=ape&v=sloan&pose=run` shows a character (`who`: ape, raccoon, thrower, pigeon, eagle; `v`: which ape).

## Deploying

Railway project `kingkong`, service `silverback`: it builds the `Dockerfile` (Vite build, then `node server.js`). The service needs no variables and no volume; `/health` answers `ok`.

`main` is the trunk. The Railway service currently follows the working branch so new work can be previewed before it is merged; point it at `main` once the game has a release to protect.
