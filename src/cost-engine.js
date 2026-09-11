import { randomUUID } from "node:crypto";
import { divideMoney } from "./money.js";
import { validateInput } from "./validation.js";

export class CostEngine {
  constructor({ flights, stays, activities, repository, clock = () => new Date(), id = randomUUID }) { Object.assign(this, { flights, stays, activities, repository, clock, id }); }

  async observe(input, previous = null) {
    validateInput(input);
    const started = performance.now();
    const timed = async (name, work) => { const at = performance.now(); try { return await work(); } finally { timings[name] = Math.round((performance.now() - at) * 100) / 100; } };
    const timings = {};
    // All required legs execute, but Promise.all rejects the entire quote: there
    // is no partial-looking total when a provider cannot qualify its price.
    const [flight, lodging, activityPrices] = await Promise.all([
      timed("duffelFlightsMs", () => this.flights.quote(input)),
      timed("duffelStaysMs", () => this.stays.quote(input)),
      Promise.all(input.activities.map((a, i) => timed(`viatorActivity${i + 1}Ms`, () => this.activities.quote(input, a))))
    ]);
    const prices = [flight, lodging, ...activityPrices];
    qualify(prices, input);
    const currency = prices[0].currency;
    if (prices.some(p => p.currency !== currency)) throw new Error("Currency conversion is not implemented; provider currencies must match");
    const lineItems = prices.flatMap(toLineItems);
    const grandTotalMinor = lineItems.filter(x => x.classification === "required").reduce((n, x) => n + x.totalAmountMinor, 0);
    const observedAt = this.clock().toISOString();
    const subtotalByCategoryMinor = Object.fromEntries(["flight", "lodging", "activity", "fee", "tax"].map(category => [category, lineItems.filter(x => x.category === category).reduce((n, x) => n + x.totalAmountMinor, 0)]));
    const snapshot = {
      id: this.id(), previousSnapshotId: previous?.id ?? null, tripInput: structuredClone(input), providerPrices: prices,
      lineItems, subtotalByCategoryMinor, taxesAndFeesCaptured: prices.every(p => p.taxesAndFeesIncluded === "yes"),
      requiredExtrasCaptured: prices.every(p => p.requiredExtras.every(x => !x.mandatory || x.bookable)),
      grandTotalMinor, travelerCount: input.travelerCount, perPersonTotalMinor: divideMoney(grandTotalMinor, input.travelerCount), currency,
      observedAt, componentValidity: prices.map(p => ({ provider: p.provider, providerReference: p.providerReference, observedAt: p.observedAt, nativeExpiresAt: p.nativeExpiresAt })),
      status: previous && previous.grandTotalMinor !== grandTotalMinor ? "repriced" : "observed",
      priceDeltaMinor: previous ? grandTotalMinor - previous.grandTotalMinor : null,
      providerReferences: prices.map(p => ({ provider: p.provider, reference: p.providerReference })),
      qualification: { allInEligible: true, notes: prices.flatMap(p => p.qualificationNotes) },
      latency: { ...timings, totalMs: Math.round((performance.now() - started) * 100) / 100 },
      displayCopy: `Price observed at ${observedAt} · rechecked before booking`
    };
    await this.repository.save(snapshot); // append/create-only persistence preserves evidence
    return snapshot;
  }

  status(snapshot, now = this.clock()) {
    const expired = snapshot.componentValidity.some(x => x.nativeExpiresAt && Date.parse(x.nativeExpiresAt) <= now.getTime());
    return expired ? "refresh_required" : snapshot.status;
  }

  async beforeCommit(snapshot) {
    // Commitment always re-queries, even if a display-freshness window remains.
    return this.observe(snapshot.tripInput, snapshot);
  }
}

function qualify(prices, input) {
  if (prices.length !== 2 + input.activities.length) throw new Error("Every required trip component must be priced");
  for (const p of prices) {
    if (!p.providerReference || !Number.isSafeInteger(p.bookableAmountMinor) || p.bookableAmountMinor < 0) throw new Error(`${p.provider} price is not bookable/auditable`);
    if (p.taxesAndFeesIncluded !== "yes") throw new Error(`${p.provider} mandatory taxes/fees are ${p.taxesAndFeesIncluded}; refusing an all-in total`);
    if (p.requiredExtras.some(x => x.mandatory && (!x.bookable || x.amountMinor == null))) throw new Error(`${p.provider} has an unresolved mandatory extra`);
  }
}

function toLineItems(price) {
  const base = { category: price.category, provider: price.provider, providerReference: price.providerReference, description: `${price.provider} ${price.category}`, quantity: price.quantity, unitAmountMinor: Math.round(price.bookableAmountMinor / price.quantity), totalAmountMinor: price.bookableAmountMinor, currency: price.currency, classification: "required", pricingMetadata: { pricingBasis: price.pricingBasis, raw: price.rawPricingMetadata } };
  const extras = price.requiredExtras.filter(x => x.mandatory && x.bookable).map(x => ({ category: "fee", provider: price.provider, providerReference: x.reference, description: x.description, quantity: 1, unitAmountMinor: x.amountMinor, totalAmountMinor: x.amountMinor, currency: x.currency, classification: "required", pricingMetadata: x.raw }));
  return [base, ...extras];
}
