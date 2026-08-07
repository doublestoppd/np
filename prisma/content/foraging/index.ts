import { forageSpots as dapplewoodForageSpots } from "./dapplewood-spots";
import { saltmereForageSpots } from "./saltmere-spots";

export const forageSpots = [...dapplewoodForageSpots, ...saltmereForageSpots];
export * from "./dapplewood-spots";
export * from "./saltmere-spots";
