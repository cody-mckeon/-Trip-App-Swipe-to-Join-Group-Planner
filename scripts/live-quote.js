import { CostEngine, DuffelFlightProvider, DuffelStaysProvider, JsonlSnapshotRepository, ViatorProvider } from "../src/index.js";

for (const key of ["ORIGIN_AIRPORT", "DUFFEL_ACCESS_TOKEN", "DUFFEL_ACCOMMODATION_ID", "VIATOR_API_KEY", "VIATOR_PRODUCT_CODES"]) if (!process.env[key]) throw new Error(`${key} is required`);
const activities = process.env.VIATOR_PRODUCT_CODES.split(",").map(value => { const [productCode, productOptionCode] = value.split(":"); return { productCode, productOptionCode }; });
const input = { destination: "LAS", originAirport: process.env.ORIGIN_AIRPORT, startDate: process.env.START_DATE ?? "2026-10-20", endDate: process.env.END_DATE ?? "2026-10-22", travelerCount: 6, occupancy: { rooms: Number(process.env.ROOMS ?? 2), adults: 6 }, activities };
const engine = new CostEngine({
  flights: new DuffelFlightProvider({ token: process.env.DUFFEL_ACCESS_TOKEN }),
  stays: new DuffelStaysProvider({ token: process.env.DUFFEL_ACCESS_TOKEN, accommodationId: process.env.DUFFEL_ACCOMMODATION_ID }),
  activities: new ViatorProvider({ apiKey: process.env.VIATOR_API_KEY }),
  repository: new JsonlSnapshotRepository(process.env.SNAPSHOT_PATH ?? "evidence/live-snapshots.jsonl")
});
const snapshot = await engine.observe(input);
process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
