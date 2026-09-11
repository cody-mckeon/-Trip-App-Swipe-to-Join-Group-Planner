import { parseMoney } from "../money.js";

const headers = token => ({ Authorization: `Bearer ${token}`, "Duffel-Version": "v2", "Content-Type": "application/json", Accept: "application/json" });
async function json(response, provider) {
  if (!response.ok) throw new Error(`${provider} returned HTTP ${response.status}`);
  return response.json();
}

export class DuffelFlightProvider {
  constructor({ token, fetch = globalThis.fetch, baseUrl = "https://api.duffel.com" }) { Object.assign(this, { token, fetch, baseUrl }); }
  async quote(input) {
    const response = await this.fetch(`${this.baseUrl}/air/offer_requests?return_offers=true`, { method: "POST", headers: headers(this.token), body: JSON.stringify({ data: { cabin_class: "economy", passengers: Array.from({ length: input.travelerCount }, () => ({ type: "adult" })), slices: [{ origin: input.originAirport, destination: input.destination, departure_date: input.startDate }, { origin: input.destination, destination: input.originAirport, departure_date: input.endDate }] } }) });
    const data = (await json(response, "Duffel Flights")).data;
    const offers = data.offers ?? [];
    const offer = offers.filter(o => o.total_amount && o.id).sort((a, b) => Number(a.total_amount) - Number(b.total_amount))[0];
    if (!offer) throw new Error("Duffel Flights returned no bookable offer");
    return providerPrice("flight", "duffel_flights", offer.id, offer.total_amount, offer.total_currency, "total", 1, "yes", [], offer.expires_at, { offerRequestId: data.id, owner: offer.owner?.name, liveMode: offer.live_mode });
  }
}

export class DuffelStaysProvider {
  constructor({ token, fetch = globalThis.fetch, baseUrl = "https://api.duffel.com", accommodationId }) { Object.assign(this, { token, fetch, baseUrl, accommodationId }); }
  async quote(input) {
    if (!this.accommodationId) throw new Error("A selected Duffel accommodationId is required; headline search prices are not bookable totals");
    const search = await this.fetch(`${this.baseUrl}/stays/search_results`, { method: "POST", headers: headers(this.token), body: JSON.stringify({ data: { accommodation: this.accommodationId, check_in_date: input.startDate, check_out_date: input.endDate, rooms: input.occupancy.rooms, guests: Array.from({ length: input.travelerCount }, () => ({ type: "adult" })) } }) });
    const result = (await json(search, "Duffel Stays")).data;
    const rate = (result.results ?? result.rates ?? []).filter(r => r.id && (r.total_amount || r.total_currency_amount)).sort((a,b) => Number(a.total_amount ?? a.total_currency_amount)-Number(b.total_amount ?? b.total_currency_amount))[0];
    if (!rate) throw new Error("Duffel Stays returned no occupancy-qualified rate");
    // A quote is deliberately required: a search-result headline is not enough evidence.
    const quoteResponse = await this.fetch(`${this.baseUrl}/stays/quotes`, { method: "POST", headers: headers(this.token), body: JSON.stringify({ data: { rate: rate.id } }) });
    const quote = (await json(quoteResponse, "Duffel Stays quote")).data;
    const amount = quote.total_amount ?? quote.total_currency_amount;
    const currency = quote.total_currency ?? quote.currency;
    const inclusion = quote.taxes_and_fees_included === true ? "yes" : quote.taxes_and_fees_included === false ? "no" : "unknown";
    if (!quote.id || !amount || !currency) throw new Error("Duffel Stays quote lacks a booking-path total/reference");
    return providerPrice("lodging", "duffel_stays", quote.id, amount, currency, "total", 1, inclusion, [], quote.expires_at, { searchResultId: result.id, rateId: rate.id, rooms: input.occupancy.rooms, adults: input.occupancy.adults, taxes: quote.taxes, fees: quote.fees, searchFee: result.search_fee, economics: quote.commission ?? quote.profit_share });
  }
}

export function providerPrice(category, provider, providerReference, amount, currency, pricingBasis, quantity, taxesAndFeesIncluded, requiredExtras, nativeExpiresAt, rawPricingMetadata) {
  return { category, provider, providerReference, bookableAmountMinor: parseMoney(amount, currency), currency, pricingBasis, quantity, requiredExtras, taxesAndFeesIncluded, qualificationNotes: [], observedAt: new Date().toISOString(), nativeExpiresAt: nativeExpiresAt ?? null, rawPricingMetadata };
}
