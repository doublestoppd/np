import type { RandomEventDefinition } from "../types";
import { companionEvents } from "./companions";
import { discoveryEvents } from "./discoveries";
import { groveEvents } from "./grove";
import { rareEvents } from "./rarities";
import { saltmereEvents } from "./saltmere";
import { tarnreachEvents } from "./tarnreach";

/**
 * The random-event catalog.
 *
 * Adding an event is an entry in one of these files and nothing else — the
 * roll never names an event, and the effect registry never names one
 * either. Offline validation (`prisma/seed/validation.ts`) checks keys,
 * weights, item references, route rules, and the no-harm bounds, so a
 * malformed entry fails `npm run content:validate` rather than at 3am.
 */
export const RANDOM_EVENTS: readonly RandomEventDefinition[] = [
  ...discoveryEvents,
  ...companionEvents,
  ...groveEvents,
  ...saltmereEvents,
  ...tarnreachEvents,
  ...rareEvents,
];

