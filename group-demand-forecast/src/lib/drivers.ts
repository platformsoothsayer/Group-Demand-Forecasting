/** Covariate encodings shared by the generator, the fitting scripts and the browser scenario code. */
import type { Segment, World } from "./types";

/** Combined leading indicator: web leads plus test drives (a test drive weighs like 4 web leads). */
export const TEST_DRIVE_WEIGHT = 4;
export const leadIndex = (web: number, testDrives: number) => web + TEST_DRIVE_WEIGHT * testDrives;

export const creditX = (w: Pick<World, "finShare" | "ref">, seg: Segment, credit: number) => w.finShare[seg] * (credit - w.ref.credit);
export const fuelX = (w: Pick<World, "ref">, fuel: number) => (fuel - w.ref.fuel) / 10;
export const confX = (w: Pick<World, "ref">, conf: number) => (conf - w.ref.confidence) / 5;

/** Segment used for seasonality and coefficients of new entrants: they sell into the volume market. */
export const coefSegment = (seg: Segment): Exclude<Segment, "newEntrant"> => (seg === "newEntrant" ? "volume" : seg);
