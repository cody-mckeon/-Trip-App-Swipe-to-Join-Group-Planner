# SLI-102 — observed per-person cost engine

## Conclusion

The architecture can reproduce a total from provider-returned bookable amounts, but the provider mix is **not yet credential-validated end to end**. Duffel Flights was live-validated; Duffel Stays and Viator still require a credentialed search → quote/availability → booking-path run. Until those runs prove mandatory-fee completeness, the MVP must fail closed (as this implementation does), display a qualified incomplete estimate elsewhere, or use a validated fallback such as LiteAPI. It must never say “Locked for 48 hours.”

Preferred copy is **“Price observed at [time] · rechecked before booking.”** A 48-hour UX can only be a display-freshness policy unless a provider-native hold or startup-funded guarantee is separately introduced.

## Exact scenario and endpoints

The committed live runner requires the previously open `ORIGIN_AIRPORT`; it never defaults it. The intended run is LAX → LAS, 2026-10-20 through 2026-10-22, six adults, two occupancy-qualified rooms, and two or three explicitly selected Viator product/option codes.

| Component | Calls per snapshot | Selection and evidence |
|---|---:|---|
| Duffel Flights | 1 | `POST /air/offer_requests?return_offers=true`; cheapest returned offer with total, currency, offer ID, request ID, and native `expires_at` |
| Duffel Stays | 2 | `POST /stays/search_results`, then `POST /stays/quotes`; selected accommodation/rate, quote ID, occupancy, displayed total, fee fields, economics if exposed, and native expiry |
| Viator | 2–3 | `POST /availability/check` per selected activity; exact `recommendedRetailPrice`, `PER_PERSON`/`UNIT` basis, availability/product/option references, and `extraChargesSummary` |

Paths and response shapes must be checked against the enabled provider account/version during the credentialed run. No discovery “from” value enters the normalized contract. Provider secrets are environment-only.

## Live and test evidence

On 2026-09-11, a credentialed Duffel Flights search for the exact LAX/LAS dates and six adults returned 100+ offers across four airlines. The least expensive observed offer was Frontier nonstop: USD 1,151.76 total (`115176` minor units), or USD 191.96/person under the engine rule. Its native expiry was about one hour later (`2026-09-11T22:56Z`), direct evidence that 48 hours is not a provider guarantee.

Duffel Stays and Viator credentials were unavailable in this repository environment, so there is deliberately no fabricated “live” result, latency, or all-in claim for those legs. Provider-shaped automated tests prove parsing, occupancy, arithmetic, expiry, append-only repricing, and failure behavior—not live commercial/API access. Run `npm run spike:live` and retain the JSONL evidence before MVP sign-off.

## Internal contract and example

`TripQuoteInput` contains destination, required origin IATA code, dates, traveler count, rooms/adults, and 2–3 selected activity requirements. Each `ProviderPrice` retains category, provider/reference, bookable amount in integer minor units, currency, basis/quantity, extras, tax qualification, observation/native expiry, notes, and raw audit metadata. `CostLineItem` retains the payable amount and its source. `CostSnapshot` stores all of these plus inputs, category subtotals, validity, qualification, timings, references, status, and totals.

```json
{
  "status": "observed",
  "providerPrices": [{ "provider": "duffel_stays", "providerReference": "quote-id", "bookableAmountMinor": 72000, "taxesAndFeesIncluded": "yes", "nativeExpiresAt": "..." }],
  "lineItems": [{ "category": "lodging", "totalAmountMinor": 72000, "classification": "required" }],
  "subtotalByCategoryMinor": { "flight": 115176, "lodging": 90000, "activity": 90000, "fee": 0, "tax": 0 },
  "grandTotalMinor": 295176,
  "travelerCount": 6,
  "perPersonTotalMinor": 49196,
  "currency": "USD"
}
```

The illustrative provider-shaped test calculation is `115176 + 90000 + 60000 + 30000 = 295176` cents. `295176 / 6 = 49196` cents/person. All money is parsed and summed as integer currency-minor units. Per-person division rounds to the nearest minor unit, with half away from zero; the grand total remains authoritative, so rounded shares can differ by a cent in aggregate.

## Qualification findings

* **Duffel Flights:** live-qualified for observed offer totals. The native offer expiry controls validity; ancillary baggage or other user-selected optional services are outside this spike.
* **Duffel Stays:** code requires actual six-person occupancy and a quote reference, not a headline rate. It records tax inclusion, expiry, search fee, and exposed economics without assuming commission. It is **not all-in qualified** until a live booking-path test confirms mandatory property/destination/resort charges, quote expiry, search/query fee policy, and economics. An unknown/excluded inclusion flag fails closed.
* **Viator:** code accepts only exact `recommendedRetailPrice` with `PER_PERSON` or `UNIT`, multiplies all six people or selected units, and persists `extraChargesSummary`. Included charges are recorded but not double-counted; payable-now mandatory extras are added. Unknown/unprepayable mandatory charges fail closed. Basic API sufficiency remains unproved: availability, attribution, and booking-path access may require Full or Full+Booking approval. Tiqets remains a later fallback, not implemented.

## Refresh and repricing

Every component retains its native expiry. At the exact expiry instant it becomes `refresh_required`; it cannot remain a verified current price. The booking/commitment path always re-queries, even before expiry. A change creates (never mutates) a new `repriced` snapshot with `previousSnapshotId`, new totals, and signed `priceDeltaMinor`; tests preserve both records. Product policy should reprice and require explicit confirmation. Absorbing differences would constitute a separate funded guarantee; silently retaining the old snapshot is unacceptable.

## Latency and cost per snapshot

Snapshots record each provider call-group latency and wall-clock total. Provider calls run concurrently; the stored total is therefore normally near the slowest leg rather than the sum. No invented live latency is reported: the complete credentialed run will populate `duffelFlightsMs`, `duffelStaysMs`, each `viatorActivityNMs`, and total milliseconds.

One complete snapshot uses **1 Flights call + 2 Stays calls + N Viator availability calls**, where N is 2–3: five to six HTTP requests. Reverification costs the same. Dollar cost per snapshot is:

`Duffel flight request rate + Duffel Stays search rate + Duffel Stays quote rate + N × Viator availability rate`.

Provider/account pricing was not available and unpublished commission must not be guessed, so a defensible dollar figure requires the executed account agreements/billing dashboards. The runner captures any response-exposed Stays search fee/economics. This formula and call counts should be multiplied by contracted rates during sign-off.

## Recommendation and escalations

Keep provider adapters isolated from a strict normalization/qualification core and append-only snapshot store. Re-query on native expiry and immediately before commitment. Adopt “reprice and reconfirm” as the default policy. Do not market an observed amount as frozen. Credential-test Duffel Stays first; if mandatory totals remain unknown, qualify lodging visibly or validate LiteAPI as the lodging fallback. Confirm Viator access tier and booking/attribution obligations; evaluate Tiqets only if Viator cannot furnish exact availability and mandatory-charge evidence.

Remaining product decisions are ownership of any 48-hour guarantee, reconfirmation UX, fallback policy, and whether an incomplete-but-disclosed estimate is useful outside the exact all-in flow. The exact all-in engine itself appropriately returns no snapshot when a required leg is unqualified.
