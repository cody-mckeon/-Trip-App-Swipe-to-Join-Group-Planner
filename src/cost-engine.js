import { randomUUID } from "node:crypto";

const MONEY_SCALE = 100;

export function toMinorUnits(amount) {
  if (!/^\d+(\.\d+)?$/.test(String(amount))) throw new Error(`Invalid money amount: ${amount}`);
  return Math.round(Number(amount) * MONEY_SCALE);
}

export function fromMinorUnits(amount) {
  return (amount / MONEY_SCALE).toFixed(2);
}

export function validateTripInput(input) {
  const required = ["destination", "originAirport", "startDate", "endDate", "travelerCount", "occupancy", "activities"];
  for (const key of required) if (input[key] == null) throw new Error(`Missing required trip input: ${key}`);
  if (!/^[A-Z]{3}$/.test(input.originAirport)) throw new Error("originAirport must be a three-letter IATA code");
  if (!Number.isInteger(input.travelerCount) || input.travelerCount < 1) throw new Error("travelerCount must be a positive integer");
  if (!Number.isInteger(input.occupancy.roomCount) || input.occupancy.roomCount < 1) throw new Error("occupancy.roomCount is required");
  if (!Number.isInteger(input.occupancy.adultsPerRoom) || input.occupancy.adultsPerRoom < 1) throw new Error("occupancy.adultsPerRoom is required");
  if (input.occupancy.roomCount * input.occupancy.adultsPerRoom < input.travelerCount) throw new Error("Requested lodging occupancy cannot hold every traveler");
  if (!Array.isArray(input.activities) || input.activities.length < 2 || input.activities.length > 3) throw new Error("Select 2–3 activities");
  const start = Date.parse(input.startDate), end = Date.parse(input.endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error("Valid startDate and endDate are required, with endDate after startDate");
}

function assertCompatibleLineItems(items) {
  if (!items.length) throw new Error("Providers returned no payable line items");
  const currencies = new Set(items.map((item) => item.currency));
  if (currencies.size !== 1) throw new Error(`Currency conversion is not supported: ${[...currencies].join(", ")}`);
  for (const item of items) {
    if (!["flight", "lodging", "activity", "fee", "tax"].includes(item.category)) throw new Error(`Invalid line-item category: ${item.category}`);
    if (!Number.isInteger(item.totalMinor) || item.totalMinor < 0) throw new Error(`Invalid provider total for ${item.description}`);
    if (!item.providerOfferId) throw new Error(`Missing provider reference for ${item.description}`);
  }
  return [...currencies][0];
}

export class CostEngine {
  constructor({ flightProvider, lodgingProvider, activityProvider, snapshotStore, clock = () => new Date() }) {
    Object.assign(this, { flightProvider, lodgingProvider, activityProvider, snapshotStore, clock });
  }

  async quote(input) {
    validateTripInput(input);
    const started = performance.now();
    const timed = async (name, operation) => {
      const before = performance.now();
      const value = await operation();
      return { name, value, latencyMs: Math.round((performance.now() - before) * 100) / 100 };
    };
    const results = await Promise.all([
      timed("flight", () => this.flightProvider.getLineItems(input)),
      timed("lodging", () => this.lodgingProvider.getLineItems(input)),
      timed("activity", () => this.activityProvider.getLineItems(input))
    ]);
    const lineItems = results.flatMap((result) => result.value.lineItems).map((item) => ({
      ...item,
      unitAmount: fromMinorUnits(item.unitMinor),
      totalAmount: fromMinorUnits(item.totalMinor)
    }));
    const currency = assertCompatibleLineItems(lineItems);
    const grandTotalMinor = lineItems.reduce((sum, item) => sum + item.totalMinor, 0);
    const createdAt = this.clock();
    const snapshot = {
      id: randomUUID(),
      tripInput: structuredClone(input),
      lineItems,
      subtotalByCategory: Object.fromEntries(["flight", "lodging", "activity", "fee", "tax"].map((category) => [category, lineItems.filter((x) => x.category === category).reduce((sum, x) => sum + x.totalMinor, 0)])),
      taxesAndFeesCaptured: results.flatMap((result) => result.value.taxesAndFeesCaptured ?? []),
      completenessWarnings: results.flatMap((result) => result.value.completenessWarnings ?? []),
      grandTotalMinor,
      grandTotal: fromMinorUnits(grandTotalMinor),
      travelerCount: input.travelerCount,
      perPersonTotalMinor: Math.round(grandTotalMinor / input.travelerCount),
      perPersonTotal: fromMinorUnits(Math.round(grandTotalMinor / input.travelerCount)),
      currency,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + 48 * 60 * 60 * 1000).toISOString(),
      status: "current",
      providerReferences: lineItems.map(({ provider, providerOfferId }) => ({ provider, providerOfferId })),
      latency: {
        providersMs: Object.fromEntries(results.map((result) => [result.name, result.latencyMs])),
        totalMs: Math.round((performance.now() - started) * 100) / 100
      }
    };
    await this.snapshotStore.create(snapshot);
    return snapshot;
  }
}

export function snapshotAt(snapshot, now = new Date()) {
  return { ...structuredClone(snapshot), status: now < new Date(snapshot.expiresAt) ? "current" : "expired" };
}
