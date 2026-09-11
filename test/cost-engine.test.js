import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CostEngine, snapshotAt } from "../src/cost-engine.js";
import { JsonSnapshotStore } from "../src/snapshot-store.js";

const input = { destination: { name: "Las Vegas", airportCode: "LAS" }, originAirport: "JFK", startDate: "2026-10-20", endDate: "2026-10-22", travelerCount: 6, occupancy: { roomCount: 2, adultsPerRoom: 3 }, activities: [{ providerActivityId: "a1" }, { providerActivityId: "a2" }] };
const result = (lineItems, extras = {}) => ({ lineItems, taxesAndFeesCaptured: [], completenessWarnings: [], ...extras });
const item = (category, id, totalMinor) => ({ category, provider: "live-provider", providerOfferId: id, description: id, quantity: 1, unitMinor: totalMinor, totalMinor, currency: "USD", pricingMetadata: { rawReference: id } });

test("resolves, rounds, timestamps and immutably persists a quote", async () => {
  const directory = await mkdtemp(join(tmpdir(), "snapshots-"));
  const store = new JsonSnapshotStore(directory);
  const engine = new CostEngine({
    flightProvider: { getLineItems: async () => result([item("flight", "f1", 120001)], { taxesAndFeesCaptured: [{ type: "included-tax", amountMinor: 1000 }] }) },
    lodgingProvider: { getLineItems: async () => result([item("lodging", "h1", 90000)]) },
    activityProvider: { getLineItems: async () => result([item("activity", "a1", 30000), item("activity", "a2", 30000)]) },
    snapshotStore: store,
    clock: () => new Date("2026-01-01T12:00:00.000Z")
  });
  const snapshot = await engine.quote(input);
  assert.equal(snapshot.grandTotalMinor, 270001);
  assert.equal(snapshot.perPersonTotalMinor, 45000, "nearest-cent half-up rounding");
  assert.equal(snapshot.expiresAt, "2026-01-03T12:00:00.000Z");
  assert.deepEqual(snapshot.subtotalByCategory, { flight: 120001, lodging: 90000, activity: 60000, fee: 0, tax: 0 });
  assert.equal((await store.getCurrent(snapshot.id, new Date("2026-01-03T11:59:59Z"))).status, "current");
  await assert.rejects(() => store.getCurrent(snapshot.id, new Date("2026-01-03T12:00:00Z")), /expired/);
  assert.equal((await store.get(snapshot.id, new Date("2026-01-03T12:00:00Z"))).status, "expired");
  await assert.rejects(() => store.create(snapshot), /EEXIST/, "refresh cannot overwrite evidence");
});

test("origin is required and no origin is assumed", async () => {
  const bad = structuredClone(input); delete bad.originAirport;
  const engine = new CostEngine({});
  await assert.rejects(() => engine.quote(bad), /originAirport/);
});

test("status is current only strictly before expiry", () => {
  const snapshot = { expiresAt: "2026-01-03T12:00:00.000Z" };
  assert.equal(snapshotAt(snapshot, new Date("2026-01-03T11:59:59.999Z")).status, "current");
  assert.equal(snapshotAt(snapshot, new Date("2026-01-03T12:00:00.000Z")).status, "expired");
});
