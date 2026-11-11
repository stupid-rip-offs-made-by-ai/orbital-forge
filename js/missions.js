export const MISSIONS = [
  { id: 'liftoff', name: 'First Flight', desc: 'Leave the launch pad.' },
  { id: 'alt10k', name: 'Cloud Breaker', desc: 'Reach 10 km altitude.' },
  { id: 'boosters', name: 'Strap-Ons', desc: 'Drop a pair of side boosters in flight.' },
  { id: 'space', name: 'Edge of Space', desc: 'Pass 70 km — above the atmosphere.' },
  { id: 'orbit', name: 'Orbital!', desc: 'Get a periapsis above 70 km around Verdan.' },
  { id: 'return', name: 'Safe Return', desc: 'Land or splash down on Verdan after reaching space.' },
  { id: 'soi', name: 'Moonbound', desc: "Enter Lumen's sphere of influence." },
  { id: 'moonorbit', name: 'Lunar Orbit', desc: 'Achieve a stable orbit around Lumen.' },
  { id: 'moonland', name: 'Footprints', desc: 'Land on Lumen.' },
  { id: 'moonreturn', name: 'Homecoming', desc: 'Return to Verdan safely after landing on Lumen.' },
  { id: 'escape', name: 'Deep Space', desc: "Leave Verdan's sphere of influence and orbit the star Solara." },
  { id: 'flyby', name: 'Planet Hopper', desc: 'Reach the sphere of influence of another planet.' },
  { id: 'land_ferra', name: 'Red Dust', desc: 'Land on Ferra.' },
  { id: 'land_pebble', name: 'Tiny Steps', desc: "Land on Pebble, Ferra's moon." },
  { id: 'land_aurea', name: 'Golden Haze', desc: 'Land on Aurea.' },
  { id: 'land_cinder', name: 'Hot Rock', desc: 'Land on Cinder.' },
  { id: 'dive_jovara', name: 'Gas Diver', desc: "Dip into Jovara's atmosphere." },
  { id: 'land_glacia', name: 'Ice Walker', desc: "Land on Glacia, Jovara's frozen moon." },
  { id: 'hero', name: 'Interplanetary Hero', desc: 'Land on another planet and make it back to Verdan.' },
];
let done = {};
try { done = JSON.parse(localStorage.getItem('of_missions') || '{}'); } catch (e) { done = {}; }
export const isDone = (id) => !!done[id];
export function complete(id) {
  if (done[id]) return false;
  done[id] = Date.now();
  try { localStorage.setItem('of_missions', JSON.stringify(done)); } catch (e) { /* ignore */ }
  return true;
}
export function resetMissions() { done = {}; try { localStorage.removeItem('of_missions'); } catch (e) { /* ignore */ } }
export const doneCount = () => MISSIONS.filter((m) => done[m.id]).length;
