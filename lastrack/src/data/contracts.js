// Side contracts: bids from two patrons on the board. Pure data (no DOM, no three).
// A contract is accepted for the next race and settles when that race ends: quota kills pay the bounty,
// anything less costs the patron's penalty. Settlement lives in economy.js; this file is the terms.

export const CONTRACT_MAX_QUOTA = 3;

export const CONTRACT_PATRONS = [
  { id: 'military', name: 'Maj. Dana Holt', org: 'Federal Motor Corps', icon: 'target', perKill: 1000, penalty: 300,
    line: 'Clean work. Paid on the flag, cash, no paperwork.' },
  { id: 'mafia', name: 'Nico Varga', org: 'Lantern Street', icon: 'skull', perKill: 1400, penalty: 500,
    line: 'Nobody saw anything, and nobody will. Do the job and the family pays for the trouble.' },
];

export const getPatron = (id) => CONTRACT_PATRONS.find((p) => p.id === id) || null;

/** Quota a patron bids for the next race: 1..3, rotating with races run so the board changes. */
export function quotaFor(save, patron) {
  const i = Math.max(0, CONTRACT_PATRONS.indexOf(patron));
  const races = Math.max(0, Math.floor(Number(save?.races) || 0));
  return 1 + ((races + i) % CONTRACT_MAX_QUOTA);
}

/** The board: one bid per patron for the next race. Pure and deterministic from the save's race count. */
export function offersFor(save) {
  return CONTRACT_PATRONS.map((p) => {
    const quota = quotaFor(save, p);
    return { patron: p.id, quota, bounty: quota * p.perKill, penalty: p.penalty };
  });
}

/** Kills so far against the quota, capped at the quota: 'WRECK 1/2'. */
export function contractProgress(contract, kills = 0) {
  if (!contract) return '';
  return `WRECK ${Math.min(Math.max(0, kills | 0), contract.quota)}/${contract.quota}`;
}
