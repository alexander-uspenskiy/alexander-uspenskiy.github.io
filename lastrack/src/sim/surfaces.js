// Track surface lookup (deterministic, pure). Only tracks that define `def.surfaces` get non-tarmac zones.
// def.surfaces = { oil:[{s,d,r}], puddles:[{s,d,r}], dirt:[{s0,s1,side}] }  — s as 0..1 lap fractions, d metres (+right).
export const SURFACES = {
  tarmac: { grip: 1, drag: 0, rough: 0 },
  kerb: { grip: 0.94, drag: 0.004, rough: 0.35 },
  dirt: { grip: 0.7, drag: 0.012, rough: 0.6 },
  puddle: { grip: 0.8, drag: 0.01, rough: 0 },
  oil: { grip: 0.5, drag: 0, rough: 0 },
};

const wrapDist = (a, b, L) => { let d = a - b; d -= Math.round(d / L) * L; return d; };

/** Surface name under a point given as track coordinates (s metres along lap, d signed lateral). */
export function surfaceAt(track, s, d) {
  const sf = track.def && track.def.surfaces;
  if (!sf) return 'tarmac';
  const L = track.length, half = track.width / 2;
  if (sf.oil) for (const o of sf.oil) if (Math.hypot(wrapDist(s, o.s * L, L), d - o.d) < o.r) return 'oil';
  if (sf.puddles) for (const o of sf.puddles) if (Math.hypot(wrapDist(s, o.s * L, L), d - o.d) < o.r) return 'puddle';
  if (sf.dirt) for (const z of sf.dirt) {
    const m = (((s / L) - z.s0) % 1 + 1) % 1;
    if (m <= ((z.s1 - z.s0) % 1 + 1) % 1 && d * z.side > half - 3.5) return 'dirt';
  }
  if (Math.abs(d) > half - 1.1) return 'kerb';
  return 'tarmac';
}

export const surfaceMods = (name) => SURFACES[name] || SURFACES.tarmac;
