import { SCRAPYARD } from './scrapyard.js';
import { STRIP } from './strip.js';
import { MOJAVE } from './mojave.js';
import { BAYOU } from './bayou.js';
import { LAKESHORE } from './lakeshore.js';
import { BADLANDS } from './badlands.js';
import { SPILLWAY } from './spillway.js';
import { RUSTBELT } from './rustbelt.js';
import { HARBOR } from './harbor.js';
import { LIBERTY } from './liberty.js';
import { SLICE_TRACKS } from './testTrack.js';

// Difficulty order: winning a track unlocks the next one.
export const TRACKS = [SCRAPYARD, STRIP, MOJAVE, BAYOU, LAKESHORE, BADLANDS, SPILLWAY, RUSTBELT, HARBOR, LIBERTY];

export { SLICE_TRACKS };
export function getTrack(id) {
  return TRACKS.find((t) => t.id === id) || SLICE_TRACKS.find((t) => t.id === id) || null;   // slice-only tracks resolve here but are not in TRACKS
}
