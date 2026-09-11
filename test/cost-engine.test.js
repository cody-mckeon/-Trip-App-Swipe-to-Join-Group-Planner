import test from "node:test";
import assert from "node:assert/strict";
import { CostEngine, MemorySnapshotRepository } from "../src/index.js";

const input = { destination: "LAS", originAirport: "LAX", startDate: "2026-10-20", endDate: "2026-10-22", travelerCount: 6, occupancy: { rooms: 2, adults: 6 }, activities: [{ productCode: "A" }, { productCode: "B" }] };
const price = (category, provider, amount, expiry = null) => ({ category, provider, providerReference: `${provider}-ref`, bookableAmountMinor: amount, currency: "USD", pricingBasis: "total", quantity: 1, requiredExtras: [], taxesAndFeesIncluded: "yes", qualificationNotes: [], observedAt: "2026-09-11T21:00:00.000Z", nativeExpiresAt: expiry, rawPricingMetadata: { evidence: true } });
function setup({ flight = 115176, stay = 90000, activities = [60000, 30000], expiry = "2026-09-11T22:00:00.000Z" } = {}) {
  const repository = new MemorySnapshotRepository(); let ai = 0;
  return { repository, engine: new CostEngine({ flights: { quote: async () => price("flight", "duffel_flights", flight, expiry) }, stays: { quote: async () => price("lodging", "duffel_stays", stay) }, activities: { quote: async () => price("activity", "viator", activities[ai++]) }, repository, clock: () => new Date("2026-09-11T21:30:00.000Z"), id: () => `snapshot-${repository.snapshots.length + 1}` }) };
}

test("persists an auditable observed all-in snapshot and rounds per person", async () => {
  const { engine, repository } = setup();
  const snapshot = await engine.observe(input);
  assert.equal(snapshot.grandTotalMinor, 295176);
  assert.equal(snapshot.perPersonTotalMinor, 49196);
  assert.equal(snapshot.lineItems.length, 4);
  assert.equal(snapshot.qualification.allInEligible, true);
  assert.match(snapshot.displayCopy, /rechecked before booking/);
  assert.equal(repository.snapshots.length, 1);
});

test("native expiry requires refresh at the exact expiry instant", async () => {
  const { engine } = setup(); const snapshot = await engine.observe(input);
  assert.equal(engine.status(snapshot, new Date("2026-09-11T21:59:59.999Z")), "observed");
  assert.equal(engine.status(snapshot, new Date("2026-09-11T22:00:00.000Z")), "refresh_required");
});

test("before commitment appends repriced evidence with an explicit delta", async () => {
  const { engine, repository } = setup({ activities: [60000, 30000, 61000, 30000] });
  const first = await engine.observe(input); const second = await engine.beforeCommit(first);
  assert.equal(second.status, "repriced"); assert.equal(second.priceDeltaMinor, 1000);
  assert.equal(second.previousSnapshotId, first.id); assert.equal(repository.snapshots.length, 2);
  assert.equal(repository.snapshots[0].grandTotalMinor, 295176);
});

test("fails closed for unknown mandatory fees and absent origin", async () => {
  const { engine, repository } = setup(); engine.stays.quote = async () => ({ ...price("lodging", "duffel_stays", 90000), taxesAndFeesIncluded: "unknown" });
  await assert.rejects(engine.observe(input), /refusing an all-in total/); assert.equal(repository.snapshots.length, 0);
  await assert.rejects(engine.observe({ ...input, originAirport: undefined }), /originAirport is required/);
});
