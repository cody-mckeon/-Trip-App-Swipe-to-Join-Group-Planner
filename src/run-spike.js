import { readFile } from "node:fs/promises";
import { CostEngine } from "./cost-engine.js";
import { JsonSnapshotStore } from "./snapshot-store.js";
import { AmadeusActivityProvider, AmadeusClient, AmadeusLodgingProvider, DuffelFlightProvider } from "./providers.js";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: npm run quote -- path/to/trip-input.json");
const input = JSON.parse(await readFile(inputPath, "utf8"));
const amadeus = new AmadeusClient({ clientId: process.env.AMADEUS_CLIENT_ID, clientSecret: process.env.AMADEUS_CLIENT_SECRET, baseUrl: process.env.AMADEUS_BASE_URL });
const engine = new CostEngine({
  flightProvider: new DuffelFlightProvider(process.env.DUFFEL_ACCESS_TOKEN),
  lodgingProvider: new AmadeusLodgingProvider(amadeus),
  activityProvider: new AmadeusActivityProvider(amadeus),
  snapshotStore: new JsonSnapshotStore(process.env.SNAPSHOT_DIRECTORY)
});
const snapshot = await engine.quote(input);
console.log(JSON.stringify(snapshot, null, 2));
