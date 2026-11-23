import { buildPhiladelphia } from './world/philadelphia.js';
import { buildNewYork } from './world/newyork.js';

// The tour, in order. A stop with `build` is playable; the rest are shown on
// the tour screen as coming soon.
//
// For a playable stop:
//   build(scene)        builds the city (a City, with .places)
//   map                 the area the minimap shows
//   marks(P)            landmarks drawn as white dots on the minimap
//   objectives(P)       the mission list (see game.js for the types)
//   starts              names for ?start= checkpoints
//   golds(world)        where the ten hidden golden things are
//   boss                which boss runs the city
//   orbit, stage(P)     camera spots for the title and the ape line-up
//   snack, gold         what heals the ape, and what is hidden
export const STOPS = [
  {
    id: 'philly',
    name: 'Philadelphia',
    rival: 'Baldwin, the Bald Eagle of Broad Street',
    build: buildPhiladelphia,
    map: { x0: -640, x1: 452, z0: -400, z1: 400 },
    marks: (P) => [P.cityHall, P.museum, P.liberty],
    intro: 'Something in the Schuylkill made everything big. The zoo gate is shut. Not for long.',
    starts: { oval: 1, logan: 2, mall: 3, boss: 4 },
    objectives: (P) => [
      {
        type: 'gate', title: 'Break out', text: 'Punch the zoo gate down', at: P.zooGate, spawn: P.start,
        inside: { x0: -624, x1: -512, z0: P.zooGate.z - 56, z1: P.zooGate.z + 56 }, done: 'Cross the bridge to the Art Museum',
      },
      {
        type: 'wave', title: 'Eakins Oval', text: 'Clear the Trash Pandas off the Art Museum steps', at: P.oval, r: 62,
        spawn: { x: -500, z: -262, yaw: Math.PI / 2 }, call: ['TRASH PANDAS', 'They got into the Schuylkill punch too'],
        waves: [[['raccoon', 3]], [['raccoon', 3], ['thrower', 2]]],
      },
      {
        type: 'wave', title: 'Logan Circle', text: 'Swat the pigeons off the Parkway', at: P.logan, r: 54,
        spawn: { x: P.oval.x + 10, z: P.oval.z + 10, yaw: 0.85 }, call: ['INCOMING', 'Jump and punch, or wait for the dive'],
        waves: [[['pigeon', 4]], [['pigeon', 3], ['raccoon', 3]], [['thrower', 2], ['pigeon', 3], ['raccoon', 3]]],
      },
      {
        type: 'wave', title: 'Independence Mall', text: 'The Trash Panda king is ringing the Liberty Bell', at: { x: 273, z: -92 }, r: 60,
        spawn: { x: P.logan.x + 6, z: P.logan.z + 34, yaw: 1.3 }, call: ['OLD CITY', 'Get them off the Mall'],
        waves: [[['raccoon', 3], ['pigeon', 2]], [['thrower', 2], ['raccoon', 3]], [['chief', 1], ['raccoon', 2]]],
      },
      {
        type: 'boss', title: 'City Hall', text: 'Baldwin is waiting on the tower', at: P.dilworth, r: 70, spawn: { x: 150, z: -30, yaw: -1.5 },
        call: ['THE BOSS OF BROAD STREET', 'Dodge the red marks. Hit him mid-swoop, or batter him while his talons are stuck.'],
        sound: 'screech', fight: 'Batter Baldwin',
      },
    ],
    golds: (w) => {
      const P = w.places;
      let tallest = null;
      let house = null;
      for (const b of w.buildings) {
        if (!b.solid || b.fixed) continue;
        if (!b.spire && (!tallest || b.top > tallest.top)) tallest = b;
        if (!house && b.h < 15 && b.z > 240 && Math.abs(b.x) < 120 && !b.tiers.length) house = b;
      }
      const spots = [
        [-604, P.zooGate.z + 30],
        [P.terrace.x, P.terrace.z],
        [P.logan.x + 16, P.logan.z + 10],
        [-195, 195],
        [P.liberty.x, P.liberty.z + 16],
        [78, -117],
        [-574, 6],
        [400, -156],
      ];
      if (tallest) spots.push([tallest.x, tallest.z]);
      if (house) spots.push([house.x, house.z]);
      return spots;
    },
    boss: 'eagle',
    bossName: 'Baldwin',
    orbit: { x: -40, y: 40, z: -10, r: 290, h: 120 },
    stage: (P) => ({ x: P.terrace.x, z: P.terrace.z, yaw: P.terraceYaw ?? 0.86 }),
    snack: 'pretzel',
    gold: 'pretzel',
    roam: 'Keep roaming Philly',
  },
  {
    id: 'nyc',
    name: 'New York City',
    rival: 'Bullion, the Wall Street Bull',
    build: buildNewYork,
    map: { x0: -400, x1: 330, z0: -660, z1: 620 },
    marks: (P) => [P.empire, P.times, P.flatiron, P.wall],
    intro: 'Shipped to New York in a box marked FRAGILE. The box was wrong.',
    starts: { times: 1, empire: 2, wall: 3, boss: 4 },
    objectives: (P) => [
      {
        type: 'gate', title: 'Special delivery', text: 'Punch out of the shipping container', at: P.gate, spawn: P.start,
        inside: { x0: -360, x1: -298, z0: P.gate.z - 14, z1: P.gate.z + 14 }, done: 'Head east to Times Square',
      },
      {
        type: 'wave', title: 'Times Square', text: 'The pizza rats have taken Times Square', at: P.times, r: 64,
        spawn: { x: -205, z: P.times.z, yaw: Math.PI / 2 }, call: ['PIZZA RATS', 'Small, fast, and there are lots of them'],
        waves: [[['rat', 6]], [['rat', 5], ['pigeon', 3]], [['gator', 1], ['rat', 4]]],
      },
      {
        type: 'climb', title: 'The Empire State', text: 'Climb to the top of the Empire State Building', at: P.empire, height: P.empire.top,
        spawn: { x: -20, z: -200, yaw: 1.1 }, harass: [['pigeon', 3]], done: 'Now head downtown to Wall Street',
      },
      {
        type: 'wave', title: 'Wall Street', text: 'Clear the trading floor', at: P.wall, r: 56,
        spawn: { x: 70, z: 300, yaw: 0 }, call: ['WALL STREET', 'Everybody is selling'],
        waves: [[['raccoon', 3], ['rat', 4]], [['thrower', 2], ['rat', 5], ['pigeon', 2]], [['raccoon', 3], ['thrower', 1], ['rat', 4]]],
      },
      {
        type: 'boss', title: 'Battery Park', text: 'Bullion is waiting by the water', at: P.battery, r: 72, spawn: { x: 40, z: 410, yaw: 0.2 },
        call: ['THE WALL STREET BULL', 'Step aside when he charges, or slam the ground as he paws it. Batter him while he is stuck or out of breath.'],
        sound: 'bellow', fight: 'Batter Bullion',
      },
    ],
    golds: (w) => {
      const P = w.places;
      let walkup = null;
      for (const b of w.buildings) {
        if (b.solid && !b.fixed && b.style === 'brick' && b.h < 30 && b.z > 150 && b.z < 300 && b.x < -60 && !b.tiers.length) {
          walkup = b;
          break;
        }
      }
      const spots = [
        [P.empire.x, P.empire.z],
        [P.flatiron.x, P.flatiron.z],
        [-100, -500],
        [P.lake.x, P.lake.z],
        [P.times.x, P.times.z - 26],
        [P.columbus.x, P.columbus.z],
        [-345, 80],
        [P.bridge.x, P.bridge.z],
        [P.arch.x, P.arch.z + 10],
      ];
      if (walkup) spots.push([walkup.x, walkup.z]);
      return spots;
    },
    boss: 'bull',
    bossName: 'Bullion',
    orbit: { x: 30, y: 60, z: -120, r: 330, h: 150 },
    stage: (P) => ({ x: P.times.x, z: P.times.z + 6, yaw: 0 }),
    snack: 'pizza',
    gold: 'apple',
    roam: 'Keep roaming New York',
  },
  { id: 'santaclara', name: 'Santa Clara', rival: 'Nugget, the Gold Rush Grizzly' },
  { id: 'sf', name: 'San Francisco', rival: 'Barker, the Sea Lion of the Bay' },
  { id: 'london', name: 'London', rival: 'Regent, the Lion of Trafalgar' },
  { id: 'tokyo', name: 'Tokyo', rival: 'Kabuto, the Giant Stag Beetle' },
  { id: 'paris', name: 'Paris', rival: 'Chanticleer, the Rooster of Paris' },
  { id: 'shanghai', name: 'Shanghai', rival: 'Huangpu, the Tiger of the Bund' },
];

export const stopById = (id) => STOPS.find((s) => s.id === id && s.build) || STOPS[0];

// Names for a stop's number on cards and banners.
export const ORDINAL = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'];

// What the hidden golden things and the healing snacks are called in each city.
export const GOLD_NAMES = {
  pretzel: { one: 'GOLDEN PRETZEL', all: 'PRETZEL KING', plural: 'golden pretzels', short: 'Golden pretzels' },
  apple: { one: 'GOLDEN APPLE', all: 'KING OF THE BIG APPLE', plural: 'golden apples', short: 'Golden apples' },
};
