// Part catalogue. Masses in tonnes and thrust in kN here; converted to SI below.
export const CATS = ['Command', 'Fuel', 'Engines', 'Structure', 'Aero', 'Utility'];

export const PARTS = {
  pod_c1: { name: 'Comet Capsule', cat: 'Command', type: 'pod', mass: 0.84, w: 1.25, h: 1.2, torque: 15, crash: 14, cd: 0.5, cdTail: 1.1,
    desc: 'One-seat capsule with built-in reaction wheels and a heat shield.' },
  pod_3: { name: 'Trio Command Pod', cat: 'Command', type: 'pod', mass: 2.7, w: 2.5, h: 1.9, torque: 45, crash: 14, cd: 0.5, cdTail: 1.1,
    desc: 'Three-seat 2.5 m capsule with strong reaction wheels for big ships.' },
  probe: { name: 'Wisp Probe Core', cat: 'Command', type: 'pod', mass: 0.1, w: 1.25, h: 0.5, torque: 5, crash: 8,
    desc: 'Lightweight uncrewed control core. Weaker reaction wheels.' },
  gyro: { name: 'Gyro Ring', cat: 'Command', type: 'gyro', mass: 0.12, w: 1.25, h: 0.35, torque: 25,
    desc: 'Extra reaction wheels. Makes heavy rockets turn faster.' },

  tank_s: { name: 'FT-100 Tank', cat: 'Fuel', type: 'tank', mass: 0.0625, fuel: 0.5, w: 1.25, h: 0.6, desc: 'Small liquid fuel tank.' },
  tank_m: { name: 'FT-400 Tank', cat: 'Fuel', type: 'tank', mass: 0.25, fuel: 2.0, w: 1.25, h: 1.9, desc: 'Medium liquid fuel tank.' },
  tank_l: { name: 'FT-800 Tank', cat: 'Fuel', type: 'tank', mass: 0.5, fuel: 4.0, w: 1.25, h: 3.75, desc: 'Long liquid fuel tank.' },
  tank_xl_s: { name: 'Goliath Half Tank', cat: 'Fuel', type: 'tank', mass: 1.0, fuel: 8.0, w: 2.5, h: 1.9, desc: 'Short 2.5 m tank.' },
  tank_xl: { name: 'Goliath 2.5 m Tank', cat: 'Fuel', type: 'tank', mass: 2.0, fuel: 16.0, w: 2.5, h: 3.75, desc: 'Huge 2.5 m tank for heavy lifters.' },

  eng_ember: { name: 'Ember Thruster', cat: 'Engines', type: 'engine', mass: 0.13, w: 0.9, h: 0.9, thrust: 20, ispVac: 320, ispSL: 270, gimbal: 3, plume: 3,
    desc: 'Tiny efficient engine for probes and landers.' },
  eng_spark: { name: 'Spark Engine', cat: 'Engines', type: 'engine', mass: 0.6, w: 1.25, h: 1.2, thrust: 110, ispVac: 335, ispSL: 280, gimbal: 4, plume: 5,
    desc: 'All-rounder for upper stages and landers. Good in air and in space.' },
  eng_pivot: { name: 'Pivot Lifter', cat: 'Engines', type: 'engine', mass: 1.5, w: 1.25, h: 1.6, thrust: 215, ispVac: 320, ispSL: 250, gimbal: 3, plume: 7,
    desc: 'Workhorse first-stage engine with thrust vectoring.' },
  eng_void: { name: 'Void Vacuum Engine', cat: 'Engines', type: 'engine', mass: 0.5, w: 1.25, h: 1.5, thrust: 60, ispVac: 345, ispSL: 85, gimbal: 4, plume: 6,
    desc: 'Huge efficiency in space, useless at sea level.' },
  eng_nova: { name: 'Nova Nuclear Engine', cat: 'Engines', type: 'engine', mass: 3.0, w: 1.25, h: 3.0, thrust: 60, ispVac: 800, ispSL: 185, gimbal: 0, plume: 7, hot: true,
    desc: 'Heavy and weak, but more than twice as fuel-efficient as anything else. Made for trips between planets.' },
  eng_titan: { name: 'Titan Booster Engine', cat: 'Engines', type: 'engine', mass: 6.0, w: 2.5, h: 3.0, thrust: 1500, ispVac: 310, ispSL: 285, gimbal: 2, plume: 14,
    desc: 'Monstrous 2.5 m main engine.' },
  srb_bolt: { name: 'Bolt Solid Booster', cat: 'Engines', type: 'srb', mass: 0.75, fuel: 2.81, w: 1.25, h: 3.6, thrust: 227, ispVac: 195, ispSL: 170, gimbal: 0, plume: 9, cdTail: 0.9,
    desc: 'Solid rocket: cheap thrust that cannot be throttled or shut down. Great on the sides.' },
  srb_thor: { name: 'Thor Heavy Booster', cat: 'Engines', type: 'srb', mass: 1.5, fuel: 8.0, w: 1.25, h: 6.5, thrust: 600, ispVac: 215, ispSL: 190, gimbal: 0, plume: 13, cdTail: 0.9,
    desc: 'Tall solid booster with enormous thrust. Strap a pair to the sides of a heavy rocket.' },

  decoupler: { name: 'Stack Decoupler', cat: 'Structure', type: 'decoupler', mass: 0.05, w: 1.25, h: 0.3, desc: 'Separates stages. Everything below it drops away.' },
  decoupler_l: { name: 'Large Decoupler', cat: 'Structure', type: 'decoupler', mass: 0.4, w: 2.5, h: 0.4, desc: '2.5 m stage separator.' },
  adapter: { name: '2.5→1.25 Adapter', cat: 'Structure', type: 'adapter', mass: 0.15, w: 2.5, h: 1.2, desc: 'Joins 1.25 m parts on top to 2.5 m parts below.' },

  nose: { name: 'Aero Nose Cone', cat: 'Aero', type: 'cone', mass: 0.06, w: 1.25, h: 1.6, cd: 0.3, desc: 'Slashes drag when it is the topmost part. Also caps side boosters.' },
  nose_l: { name: 'Large Nose Cone', cat: 'Aero', type: 'cone', mass: 0.25, w: 2.5, h: 2.4, cd: 0.3, desc: '2.5 m nose cone.' },
  fins: { name: 'Stabilizer Fin Ring', cat: 'Aero', type: 'fins', mass: 0.15, w: 1.25, h: 1.0, drawW: 3.4, fin: 7,
    desc: 'Pulls the centre of pressure back so the rocket flies nose-first. Put it near the bottom.' },
  winglet: { name: 'Delta Winglet', cat: 'Aero', type: 'fin', sideOnly: true, mass: 0.04, w: 1.0, h: 1.3, fin: 2.4,
    desc: 'Side-mounted fin pair. Mount low on the rocket for stability.' },

  chute: { name: 'Drogue-R Parachute', cat: 'Utility', type: 'chute', mass: 0.1, w: 0.8, h: 0.4, chuteCdA: 480, cd: 0.6,
    desc: 'Deploy in atmosphere below ~400 m/s for a gentle landing. Fast deploys will rip it.' },
  chute_r: { name: 'Radial Parachute', cat: 'Utility', type: 'chute', sideOnly: true, mass: 0.08, w: 0.35, h: 0.7, chuteCdA: 360,
    desc: 'Side-mounted parachute pair for extra braking on heavy landers.' },
  legs: { name: 'Lander Legs', cat: 'Utility', type: 'legs', mass: 0.15, w: 1.25, h: 0.4, drawW: 3.4, drawH: 2.4, crash: 12,
    desc: 'Deploy automatically when they are on the bottom stage. Place above the lander engine.' },
  legs_l: { name: 'Heavy Lander Legs', cat: 'Utility', type: 'legs', mass: 0.5, w: 2.5, h: 0.5, drawW: 6.8, drawH: 4.8, legScale: 2, crash: 12,
    desc: 'Wide legs for 2.5 m landers.' },
  solar: { name: 'Solar Panel', cat: 'Utility', type: 'deco', sideOnly: true, mass: 0.03, w: 2.2, h: 0.9,
    desc: 'Side-mounted solar wings. They make any ship look like a proper spacecraft.' },
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
/** Parts that may hang off the side of the rocket (always as a mirrored pair). */
export const sideOk = (d) => !['pod', 'decoupler', 'legs', 'fins', 'adapter', 'gyro'].includes(d.type);

/**
 * A design is a list, top to bottom. Each entry is a part id, or
 * { id, side: [ids] } to hang a stack of parts on both sides of that part.
 */
export const PRESETS = {
  'Sky Hopper': ['chute', 'pod_c1', 'tank_m', 'tank_m', 'fins', 'eng_pivot'],
  'Orbiter Mk1': ['chute', 'pod_c1', 'decoupler', 'tank_m', 'eng_void', 'decoupler', 'tank_l', 'tank_m', 'fins', 'eng_pivot'],
  'Booster Buddy': ['chute', 'pod_c1', 'decoupler', 'tank_m', 'eng_spark', 'decoupler',
    { id: 'tank_l', side: ['nose', 'srb_bolt'] }, { id: 'tank_m', side: ['winglet'] }, 'eng_pivot'],
  'Lumen Lander': ['chute', 'pod_c1', 'tank_m', 'legs', 'eng_void', 'decoupler', 'tank_l', 'tank_l', 'eng_void',
    'decoupler', 'adapter', 'tank_xl', 'tank_xl', 'fins', 'eng_titan'],
  'Ferra Explorer': ['chute', { id: 'pod_c1', side: ['chute_r'] }, { id: 'tank_m', side: ['solar'] }, 'legs', 'eng_spark', 'decoupler',
    'tank_l', 'tank_l', 'eng_nova', 'decoupler', 'adapter', 'tank_xl', 'tank_xl',
    { id: 'tank_xl', side: ['nose', 'srb_thor'] }, 'fins', 'eng_titan'],
};
