# SLI-102: frozen per-person quote spike

## Result and test input

The implementation is a runnable live-provider spike, not a claim that prices are guaranteed for 48 hours. A `CostSnapshot` freezes the **observed** payable totals for display/audit; airline, hotel, and activity inventory can change before booking.

The intended test is Las Vegas (`LAS`, 36.1716/-115.1391), six adults, two rooms with three adults per room, two nights, round-trip economy flights, and two or three selected activities. Dates and the origin airport remain caller inputs. `examples/las-vegas-trip.json` intentionally has an invalid origin placeholder because SLI-102 did not specify an origin. A credentialed live run must replace that placeholder and record the exact input JSON and resulting snapshot. No provider credentials were available in this development environment, so the checked-in evidence verifies normalization, arithmetic, persistence, and expiry with provider-shaped test doubles—not a fabricated “live” result.

## Providers and endpoints

| Component | Provider | Calls per quote | Endpoint |
| --- | --- | ---: | --- |
| Flight | Duffel | 1 | `POST /air/offer_requests?return_offers=true` |
| Hotel discovery | Amadeus Self-Service | 1 | `GET /v1/reference-data/locations/hotels/by-geocode` |
| Hotel price | Amadeus Self-Service | 1 | `GET /v3/shopping/hotel-offers` |
| Activities | Amadeus Self-Service | 1 | `GET /v1/shopping/activities` |
| Amadeus OAuth | Amadeus Self-Service | up to 3 in this spike | `POST /v1/security/oauth2/token` |

Calls execute concurrently by component. The deliberately simple client obtains a token for each Amadeus search; production should cache tokens until their server-provided expiry. Duffel's `total_amount`/`total_currency` and Amadeus hotel's `price.total`/`price.currency` are treated as payable totals. Provider offer IDs, tax arrays, occupancy, price variations, expiry, booking links, and pricing model are retained as pricing metadata.

## Normalized structure and calculation

Money is stored as integer minor units. Decimal provider amounts are converted to cents by nearest-cent rounding. Division is also rounded to the nearest cent (`Math.round` for non-negative amounts). This prevents binary floating-point values from entering stored arithmetic.

```json
{
  "lineItems": [
    {
      "category": "flight",
      "provider": "duffel",
      "providerOfferId": "off_...",
      "description": "Round-trip flights for 6",
      "quantity": 6,
      "unitMinor": 20000,
      "unitAmount": "200.00",
      "totalMinor": 120000,
      "totalAmount": "1200.00",
      "currency": "USD",
      "pricingMetadata": { "taxAmount": "...", "payableTotalUsed": true }
    }
  ],
  "subtotalByCategory": { "flight": 120000, "lodging": 90000, "activity": 60000, "fee": 0, "tax": 0 },
  "taxesAndFeesCaptured": [{ "type": "included-tax", "amountMinor": 1000 }],
  "grandTotalMinor": 270000,
  "grandTotal": "2700.00",
  "travelerCount": 6,
  "perPersonTotalMinor": 45000,
  "perPersonTotal": "450.00"
}
```

Included taxes are audit metadata rather than additional line items, because they are already in the provider payable total and adding them again would double-count. A separately payable charge would need its own `tax` or `fee` line item. The invariant is `grandTotalMinor = sum(lineItems.totalMinor)`, then `perPersonTotalMinor = round(grandTotalMinor / travelerCount)`. Mixed-currency snapshots are rejected; this spike does not conceal conversion assumptions.

## Occupancy, completeness, and accuracy risks

The hotel request sends both all six adults and the explicit requested room quantity. The selected offer stores those values in its audit metadata. Activities are multiplied by six unless the provider explicitly identifies group pricing. The activities adapter warns that Amadeus's advertised activity price does not provide a separate mandatory-tax/fee breakdown. An Amadeus lodging tax marked excluded likewise makes the quote incomplete. These warnings remain on the snapshot and must be visible to a future UI.

Other constraints discovered in implementation:

* An activity search response must contain every selected provider ID and a currency/amount; unavailable selections fail the whole quote rather than silently substituting an activity.
* Hotel availability and the activity catalog vary by Amadeus environment and market. The test environment may not represent production inventory.
* “From” activity prices may not represent the exact date/time variant or six-person availability. A booking-grade activity partner endpoint is needed for an exact-cost promise.
* Provider offer lifetime may be shorter than 48 hours. The snapshot's expiry is a product freshness boundary, not inventory reservation.
* The current flow fails closed if any component fails and does not silently invent fees.

## Persistence and expiry evidence

Snapshots are written as new UUID-named JSON files with the filesystem's exclusive-create flag. A refresh therefore creates a new record rather than mutating evidence. `expiresAt` is exactly `createdAt + 48h`. Reads calculate status at read time: only `now < expiresAt` is current. At the exact expiry instant, `getCurrent` rejects while historical `get` returns the same evidence marked `expired`.

The automated test fixes creation at `2026-01-01T12:00:00.000Z`, verifies expiry at `2026-01-03T12:00:00.000Z`, verifies rejection at that instant, checks the historical view, and proves a duplicate ID cannot overwrite its file.

## Latency and API cost protocol

Every provider branch records elapsed milliseconds and the snapshot records total wall-clock latency. The slowest provider is `max(snapshot.latency.providersMs)`; because calls run in parallel, total latency should approximate that slowest branch plus local normalization/persistence. There is no defensible live latency number without executing the credentialed request, so none is invented here. Save the generated snapshot from the live acceptance run as the evidence; take at least three runs and report median and p95 before an MVP decision.

One complete quote currently requires one Duffel offer request, two Amadeus data requests for lodging, one Amadeus data request for activities, and OAuth token requests (three as written; one with token caching). The monetary estimate is:

`cost/quote = Duffel offer-request unit cost + 3 × Amadeus data-call unit cost + OAuth cost (normally $0)`.

Both providers' commercial rates/allowances are account- and plan-dependent and can change. The owner must fill in current contracted marginal rates from the provider dashboards before sign-off; representing unknown dashboard rates as `$0` would be misleading. Also include any monthly minimum divided by expected monthly quotes when estimating fully loaded cost.

## Recommendation

The contract, integer-money calculation, immutable evidence, concurrency, instrumentation, and strict expiration behavior are suitable foundations for the MVP. The current provider mix is **not sufficient for an unqualified exact-cost promise**: activity prices can be headline/from prices, excluded hotel taxes can occur, and a frozen observation does not reserve inventory. Ship a qualified “observed price, refresh required, subject to availability” quote, expose completeness warnings, and refuse the exact-cost label whenever mandatory charges are excluded or unknown. Before claiming exact cost, integrate bookable activity availability/variant pricing, validate hotel occupancy at room level, cache Amadeus tokens, use durable append-only storage, and complete a credentialed live run with contracted API costs and captured latency evidence.
