export function validateInput(input) {
  const required = ["destination", "originAirport", "startDate", "endDate", "travelerCount", "occupancy", "activities"];
  for (const field of required) if (input[field] == null) throw new Error(`TripQuoteInput.${field} is required`);
  if (!/^[A-Z]{3}$/.test(input.originAirport)) throw new Error("originAirport must be a three-letter IATA code");
  if (!Number.isInteger(input.travelerCount) || input.travelerCount < 1) throw new Error("travelerCount must be positive");
  if (!Number.isInteger(input.occupancy.rooms) || !Number.isInteger(input.occupancy.adults) || input.occupancy.adults < input.travelerCount) throw new Error("occupancy must cover every traveler");
  if (!Array.isArray(input.activities) || input.activities.length < 2 || input.activities.length > 3) throw new Error("Select 2–3 activities");
  if (Date.parse(input.startDate) >= Date.parse(input.endDate)) throw new Error("endDate must follow startDate");
}
