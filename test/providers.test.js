import test from "node:test";
import assert from "node:assert/strict";
import { DuffelStaysProvider, ViatorProvider } from "../src/index.js";

const input = { destination: "LAS", originAirport: "LAX", startDate: "2026-10-20", endDate: "2026-10-22", travelerCount: 6, occupancy: { rooms: 2, adults: 6 } };
const response = data => ({ ok: true, json: async () => ({ data }) });
test("Duffel Stays persists quote evidence and actual occupancy", async () => {
  const calls = []; const fetch = async (url, init) => { calls.push([url, JSON.parse(init.body)]); return calls.length === 1 ? response({ id: "search-1", results: [{ id: "rate-1", total_amount: "700.00" }] }) : response({ id: "quote-1", total_amount: "720.00", total_currency: "USD", taxes_and_fees_included: true, expires_at: "2026-09-11T22:00:00Z" }); };
  const actual = await new DuffelStaysProvider({ token: "x", fetch, accommodationId: "acc-1" }).quote(input);
  assert.equal(actual.providerReference, "quote-1"); assert.equal(actual.bookableAmountMinor, 72000);
  assert.equal(actual.rawPricingMetadata.adults, 6); assert.equal(calls[0][1].data.guests.length, 6);
});

test("Viator uses recommended retail PER_PERSON and captures required extras", async () => {
  const fetch = async () => ({ ok: true, json: async () => ({ availabilityId: "avail-1", bookableItems: [{ productOptionCode: "OPT", seasons: [{ pricingRecords: [{ recommendedRetailPrice: { amount: "100.00", currency: "USD" }, pricingType: "PER_PERSON" }] }] }], extraChargesSummary: [{ id: "fee", mandatory: true, payableNow: true, amount: "5.00", currency: "USD", pricingType: "PER_PERSON" }] }) });
  const actual = await new ViatorProvider({ apiKey: "x", fetch }).quote(input, { productCode: "ACT", productOptionCode: "OPT" });
  assert.equal(actual.bookableAmountMinor, 60000); assert.equal(actual.requiredExtras[0].amountMinor, 3000);
  assert.equal(actual.pricingBasis, "per_person"); assert.equal(actual.rawPricingMetadata.availabilityId, "avail-1");
});
