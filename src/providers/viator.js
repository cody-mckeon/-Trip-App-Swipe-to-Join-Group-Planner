import { providerPrice } from "./duffel.js";
import { parseMoney } from "../money.js";

export class ViatorProvider {
  constructor({ apiKey, fetch = globalThis.fetch, baseUrl = "https://api.viator.com/partner", currency = "USD" }) { Object.assign(this, { apiKey, fetch, baseUrl, currency }); }
  async quote(input, activity) {
    const response = await this.fetch(`${this.baseUrl}/availability/check`, { method: "POST", headers: { "exp-api-key": this.apiKey, "Accept-Language": "en-US", Accept: "application/json;version=2.0", "Content-Type": "application/json" }, body: JSON.stringify({ productCode: activity.productCode, travelDate: input.startDate, currency: this.currency, paxMix: [{ ageBand: "ADULT", numberOfTravelers: input.travelerCount }] }) });
    if (!response.ok) throw new Error(`Viator returned HTTP ${response.status}`);
    const body = await response.json();
    const option = (body.bookableItems ?? []).find(x => x.productOptionCode === activity.productOptionCode) ?? body.bookableItems?.[0];
    const schedule = option?.seasons?.flatMap(s => s.pricingRecords ?? [])?.[0] ?? option?.pricing ?? option;
    const retail = schedule?.recommendedRetailPrice;
    const basis = schedule?.pricingDetails?.pricingType ?? schedule?.pricingType ?? retail?.pricingType;
    const amount = retail?.amount ?? retail?.fromPrice;
    if (!option || amount == null || !["PER_PERSON", "UNIT"].includes(basis)) throw new Error(`Viator ${activity.productCode} lacks a qualified recommendedRetailPrice`);
    if (retail.fromPrice != null && retail.amount == null) throw new Error(`Viator ${activity.productCode} only returned a from price`);
    const quantity = basis === "PER_PERSON" ? input.travelerCount : (activity.units ?? 1);
    const extras = normalizeExtras(body.extraChargesSummary ?? option.extraChargesSummary, this.currency, quantity);
    const unresolved = extras.filter(x => x.mandatory && !x.bookable);
    const price = providerPrice("activity", "viator", `${activity.productCode}:${option.productOptionCode ?? "default"}`, amount, retail.currency ?? this.currency, basis === "PER_PERSON" ? "per_person" : "per_unit", quantity, unresolved.length ? "no" : "yes", extras, option.expiresAt, { productCode: activity.productCode, productOptionCode: option.productOptionCode, availabilityId: body.availabilityId, pricingType: basis, extraChargesSummary: body.extraChargesSummary ?? option.extraChargesSummary });
    price.bookableAmountMinor *= quantity;
    if (unresolved.length) price.qualificationNotes.push("Mandatory charge is not prepaid/bookable");
    return price;
  }
}

function normalizeExtras(summary, currency, quantity) {
  const charges = Array.isArray(summary) ? summary : summary?.items ?? summary?.charges ?? [];
  return charges.map((x, i) => ({ reference: x.id ?? `extra-${i}`, description: x.description ?? x.name ?? "Provider charge", mandatory: x.required === true || x.mandatory === true, bookable: x.payableNow === true || x.includedInPrice === true, amountMinor: x.includedInPrice === true ? 0 : x.amount == null ? null : parseMoney(x.amount, x.currency ?? currency) * (x.pricingType === "PER_PERSON" ? quantity : 1), currency: x.currency ?? currency, raw: x }));
}
