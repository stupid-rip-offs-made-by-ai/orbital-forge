// Part catalogue. Masses in tonnes and thrust in kN here; converted to SI below.
export const CATS = ['Command', 'Fuel', 'Engines', 'Structure', 'Aero', 'Utility'];

export const PARTS = {
  pod_c1: { name: 'Comet Capsule', cat: 'Command', type: 'pod', mass: 0.84, w: 1.25, h: 1.2, torque: 15, crash: 14, cd: 0.5, cdTail: 1.1,
    desc: 'One-seat capsule with built-in reaction wheels and a heat shield.' },
  probe: { name: 'Wisp Probe Core', cat: 'Command', type: 'pod', mass: 0.1, w: 1.25, h: 0.5, torque: 5, crash: 8,
    desc: 'Lightweight uncrewed control core. Weaker reaction wheels.' },

  tank_s: { name: 'FT-100 Tank', cat: 'Fuel', type: 'tank', mass: 0.0625, fuel: 0.5, w: 1.25, h: 0.6, desc: 'Small liquid fuel tank.' },
  tank_m: { name: 'FT-400 Tank', cat: 'Fuel', type: 'tank', mass: 0.25, fuel: 2.0, w: 1.25, h: 1.9, desc: 'Medium liquid fuel tank.' },
  tank_l: { name: 'FT-800 Tank', cat: 'Fuel', type: 'tank', mass: 0.5, fuel: 4.0, w: 1.25, h: 3.75, desc: 'Long liquid fuel tank.' },
  tank_xl: { name: 'Goliath 2.5 m Tank', cat: 'Fuel', type: 'tank', mass: 2.0, fuel: 16.0, w: 2.5, h: 3.75, desc: 'Huge 2.5 m tank for heavy lifters.' },

  eng_ember: { name: 'Ember Thruster', cat: 'Engines', type: 'engine', mass: 0.13, w: 0.9, h: 0.9, thrust: 20, ispVac: 320, ispSL: 270, gimbal: 3, plume: 3,
    desc: 'Tiny efficient engine for probes and landers.' },
  eng_pivot: { name: 'Pivot Lifter', cat: 'Engines', type: 'engine', mass: 1.5, w: 1.25, h: 1.6, thrust: 215, ispVac: 320, ispSL: 250, gimbal: 3, plume: 7,
    desc: 'Workhorse first-stage engine with thrust vectoring.' },
  eng_void: { name: 'Void Vacuum Engine', cat: 'Engines', type: 'engine', mass: 0.5, w: 1.25, h: 1.5, thrust: 60, ispVac: 345, ispSL: 85, gimbal: 4, plume: 6,
    desc: 'Huge efficiency in space, useless at sea level.' },
  eng_titan: { name: 'Titan Booster Engine', cat: 'Engines', type: 'engine', mass: 6.0, w: 2.5, h: 3.0, thrust: 1500, ispVac: 310, ispSL: 285, gimbal: 2, plume: 14,
    desc: 'Monstrous 2.5 m main engine.' },
  srb_bolt: { name: 'Bolt Solid Booster', cat: 'Engines', type: 'srb', mass: 0.75, fuel: 2.81, w: 1.25, h: 3.6, thrust: 227, ispVac: 195, ispSL: 170, gimbal: 0, plume: 9, cdTail: 0.9,
    desc: 'Solid rocket: cheap thrust that cannot be throttled or shut down.' },

  decoupler: { name: 'Stack Decoupler', cat: 'Structure', type: 'decoupler', mass: 0.05, w: 1.25, h: 0.3, desc: 'Separates stages. Everything below it drops away.' },
  decoupler_l: { name: 'Large Decoupler', cat: 'Structure', type: 'decoupler', mass: 0.4, w: 2.5, h: 0.4, desc: '2.5 m stage separator.' },
  adapter: { name: '2.5→1.25 Adapter', cat: 'Structure', type: 'adapter', mass: 0.15, w: 2.5, h: 1.2, desc: 'Joins 1.25 m parts on top to 2.5 m parts below.' },

  nose: { name: 'Aero Nose Cone', cat: 'Aero', type: 'cone', mass: 0.06, w: 1.25, h: 1.6, cd: 0.3, desc: 'Slashes drag when it is the topmost part.' },
  fins: { name: 'Stabilizer Fin Ring', cat: 'Aero', type: 'fins', mass: 0.15, w: 1.25, h: 1.0, drawW: 3.4, fin: 7,
    desc: 'Pulls the centre of pressure back so the rocket flies nose-first. Put it near the bottom.' },

  chute: { name: 'Drogue-R Parachute', cat: 'Utility', type: 'chute', mass: 0.1, w: 0.8, h: 0.4, chuteCdA: 480, cd: 0.6,
    desc: 'Deploy in atmosphere below ~400 m/s for a gentle landing. Fast deploys will rip it.' },
  legs: { name: 'Lander Legs', cat: 'Utility', type: 'legs', mass: 0.15, w: 1.25, h: 0.4, drawW: 3.4, drawH: 2.4, crash: 12,
    desc: 'Deploy automatically when they are on the bottom stage. Place above the lander engine.' },
};

for (const [id, p] of Object.entries(PARTS)) {
  p.id = id;
  p.mass *= 1000;
  p.fuel = (p.fuel || 0) * 1000;
  p.thrust = (p.thrust || 0) * 1000;
  p.torque = (p.torque || 0) * 1000;
  p.gimbal = ((p.gimbal || 0) * Math.PI) / 180;
  p.drawW = p.drawW || p.w;
  p.drawH = p.drawH || p.h;
  p.tex = 'parts/' + id;
}
export const isEngine = (d) => d.type === 'engine' || d.type === 'srb';

export const PRESETS = {
  'Sky Hopper': ['chute', 'pod_c1', 'tank_m', 'tank_m', 'fins', 'eng_pivot'],
  'Orbiter Mk1': ['chute', 'pod_c1', 'decoupler', 'tank_m', 'eng_void', 'decoupler', 'tank_l', 'tank_m', 'fins', 'eng_pivot'],
  'Bolt Rocket': ['chute', 'pod_c1', 'decoupler', 'tank_l', 'eng_pivot', 'decoupler', 'fins', 'srb_bolt'],
  'Lumen Lander': ['chute', 'pod_c1', 'tank_m', 'legs', 'eng_void', 'decoupler', 'tank_l', 'tank_l', 'eng_void',
    'decoupler', 'adapter', 'tank_xl', 'tank_xl', 'fins', 'eng_titan'],
};
