import { toMinorUnits } from "./cost-engine.js";

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${url}: ${JSON.stringify(body)}`);
  return body;
}

export class DuffelFlightProvider {
  constructor(token) { if (!token) throw new Error("DUFFEL_ACCESS_TOKEN is required"); this.token = token; }
  async getLineItems(input) {
    const payload = await jsonRequest("https://api.duffel.com/air/offer_requests?return_offers=true", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Duffel-Version": "v2", "Content-Type": "application/json" },
      body: JSON.stringify({ data: { cabin_class: "economy", passengers: Array.from({ length: input.travelerCount }, () => ({ type: "adult" })), slices: [
        { origin: input.originAirport, destination: input.destination.airportCode, departure_date: input.startDate },
        { origin: input.destination.airportCode, destination: input.originAirport, departure_date: input.endDate }
      ] } })
    });
    const offer = payload.data.offers?.[0];
    if (!offer) throw new Error("Duffel returned no flight offer");
    return { lineItems: [{ category: "flight", provider: "duffel", providerOfferId: offer.id, description: `Round-trip flights for ${input.travelerCount}`, quantity: input.travelerCount, unitMinor: Math.round(toMinorUnits(offer.total_amount) / input.travelerCount), totalMinor: toMinorUnits(offer.total_amount), currency: offer.total_currency, pricingMetadata: { owner: offer.owner?.name, expiresAt: offer.expires_at, taxAmount: offer.tax_amount, taxCurrency: offer.tax_currency, payableTotalUsed: true } }], taxesAndFeesCaptured: offer.tax_amount ? [{ provider: "duffel", offerId: offer.id, type: "included-tax", amountMinor: toMinorUnits(offer.tax_amount), currency: offer.tax_currency }] : [], completenessWarnings: offer.tax_amount ? [] : ["Duffel offer did not expose a separate tax amount; its payable total was used."] };
  }
}

export class AmadeusClient {
  constructor({ clientId, clientSecret, baseUrl = "https://api.amadeus.com" }) { Object.assign(this, { clientId, clientSecret, baseUrl }); }
  async token() {
    if (!this.clientId || !this.clientSecret) throw new Error("AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET are required");
    const body = new URLSearchParams({ grant_type: "client_credentials", client_id: this.clientId, client_secret: this.clientSecret });
    return (await jsonRequest(`${this.baseUrl}/v1/security/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body })).access_token;
  }
  async get(path, params) {
    const url = new URL(path, this.baseUrl); Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return jsonRequest(url, { headers: { Authorization: `Bearer ${await this.token()}` } });
  }
}

export class AmadeusLodgingProvider {
  constructor(client) { this.client = client; }
  async getLineItems(input) {
    const hotels = await this.client.get("/v1/reference-data/locations/hotels/by-geocode", { latitude: input.destination.latitude, longitude: input.destination.longitude, radius: 10, radiusUnit: "KM", hotelSource: "ALL" });
    const ids = hotels.data?.slice(0, 20).map((x) => x.hotelId).join(",");
    if (!ids) throw new Error("Amadeus returned no Las Vegas hotels");
    const response = await this.client.get("/v3/shopping/hotel-offers", { hotelIds: ids, adults: input.travelerCount, roomQuantity: input.occupancy.roomCount, checkInDate: input.startDate, checkOutDate: input.endDate, bestRateOnly: true });
    const hotel = response.data?.[0], offer = hotel?.offers?.[0];
    if (!offer) throw new Error("Amadeus returned no lodging offer for the requested occupancy");
    const taxes = offer.price.taxes ?? [];
    return { lineItems: [{ category: "lodging", provider: "amadeus", providerOfferId: offer.id, description: `${hotel.hotel.name}: ${input.occupancy.roomCount} room(s)`, quantity: input.occupancy.roomCount, unitMinor: Math.round(toMinorUnits(offer.price.total) / input.occupancy.roomCount), totalMinor: toMinorUnits(offer.price.total), currency: offer.price.currency, pricingMetadata: { checkInDate: input.startDate, checkOutDate: input.endDate, roomQuantity: input.occupancy.roomCount, adults: input.travelerCount, variations: offer.price.variations, taxes, payableTotalUsed: true } }], taxesAndFeesCaptured: taxes.map((tax) => ({ provider: "amadeus", offerId: offer.id, type: tax.included === false ? "excluded-tax" : "included-tax", code: tax.code, amountMinor: tax.amount ? toMinorUnits(tax.amount) : undefined, percentage: tax.percentage, currency: offer.price.currency })), completenessWarnings: taxes.some((x) => x.included === false) ? ["Amadeus reported an excluded lodging tax; quote is incomplete because it is not in the payable total."] : [] };
  }
}

export class AmadeusActivityProvider {
  constructor(client) { this.client = client; }
  async getLineItems(input) {
    const response = await this.client.get("/v1/shopping/activities", { latitude: input.destination.latitude, longitude: input.destination.longitude, radius: 20 });
    const byId = new Map((response.data ?? []).map((activity) => [activity.id, activity]));
    const selected = input.activities.map((requirement) => byId.get(requirement.providerActivityId)).filter(Boolean);
    if (selected.length !== input.activities.length) throw new Error("One or more selected Amadeus activities were unavailable");
    return { lineItems: selected.map((activity) => { const quantity = activity.price?.pricingModel === "BY_GROUP" ? 1 : input.travelerCount; const unitMinor = toMinorUnits(activity.price.amount); return { category: "activity", provider: "amadeus", providerOfferId: activity.id, description: activity.name, quantity, unitMinor, totalMinor: unitMinor * quantity, currency: activity.price.currencyCode, pricingMetadata: { bookingLink: activity.bookingLink, minimumDuration: activity.minimumDuration, pricingModel: activity.price.pricingModel ?? "assumed-per-person" } }; }), taxesAndFeesCaptured: [], completenessWarnings: ["Amadeus activity prices do not expose a separate mandatory-tax/fee breakdown; returned advertised prices are used and must be qualified."] };
  }
}
