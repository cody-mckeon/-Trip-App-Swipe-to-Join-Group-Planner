# Trip App cost-engine spike

An evidence-preserving spike for observed, provider-backed trip prices. It integrates Duffel Flights, Duffel Stays, and Viator without SDK dependencies and fails closed when a required price cannot be qualified.

```sh
npm test
ORIGIN_AIRPORT=LAX DUFFEL_ACCESS_TOKEN=... DUFFEL_ACCOMMODATION_ID=... \
  VIATOR_API_KEY=... VIATOR_PRODUCT_CODES=CODE1:OPTION1,CODE2:OPTION2 npm run spike:live
```

The live command appends snapshots to `evidence/live-snapshots.jsonl`; do not commit credential-bearing raw responses. See [the spike report](docs/SLI-102-cost-engine-spike.md) for the contract, evidence, limitations, and recommendation.
