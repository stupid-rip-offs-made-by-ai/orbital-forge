export const MISSIONS = [
  { id: 'liftoff', name: 'First Flight', desc: 'Leave the launch pad.' },
  { id: 'alt10k', name: 'Cloud Breaker', desc: 'Reach 10 km altitude.' },
  { id: 'space', name: 'Edge of Space', desc: 'Pass 70 km — above the atmosphere.' },
  { id: 'orbit', name: 'Orbital!', desc: 'Get a periapsis above 70 km around Verdan.' },
  { id: 'return', name: 'Safe Return', desc: 'Land or splash down on Verdan after reaching space.' },
  { id: 'soi', name: 'Moonbound', desc: "Enter Lumen's sphere of influence." },
  { id: 'moonorbit', name: 'Lunar Orbit', desc: 'Achieve a stable orbit around Lumen.' },
  { id: 'moonland', name: 'Footprints', desc: 'Land on Lumen.' },
  { id: 'moonreturn', name: 'Homecoming', desc: 'Return to Verdan safely after landing on Lumen.' },
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
