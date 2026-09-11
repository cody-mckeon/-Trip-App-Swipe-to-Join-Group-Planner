# Trip App — cost engine spike

This repository contains the SLI-102 live-provider quote spike. It normalizes a Duffel flight, Amadeus hotel, and two or three Amadeus activities into an immutable, 48-hour `CostSnapshot`.

## Run

Requires Node.js 20+, a live Duffel token, and production Amadeus credentials:

```sh
cp examples/las-vegas-trip.json /tmp/trip.json
# Set a real origin IATA code, dates, and activity IDs in /tmp/trip.json first.
DUFFEL_ACCESS_TOKEN=... AMADEUS_CLIENT_ID=... AMADEUS_CLIENT_SECRET=... npm run quote -- /tmp/trip.json
```

The origin is deliberately invalid in the example so a caller cannot accidentally quote a hardcoded origin. Snapshot JSON is written with create-only semantics to `.cost-snapshots/` (or `SNAPSHOT_DIRECTORY`) and the printed output includes provider and end-to-end latency.

```sh
npm test
```

See [`docs/sli-102-cost-engine-spike.md`](docs/sli-102-cost-engine-spike.md) for scope, calculations, limitations, and the live-test protocol.
