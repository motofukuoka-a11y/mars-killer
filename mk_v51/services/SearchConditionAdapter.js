import {normalizePassengers, passengerTotals} from './PassengerModel.js';

const cleanIds = values => Array.isArray(values) ? values.filter(Boolean) : [];

export function normalizeSearchConditions(input = {}) {
  const passengers = normalizePassengers(input);
  const originStationId = input.origin_station_id ?? input.start_station_id ?? null;
  const destinationStationId = input.destination_station_id ?? input.goal_station_id ?? null;
  const viaStationIds = cleanIds(input.via_station_ids ?? input.viaStationIds);

  return {
    origin_station_id: originStationId,
    destination_station_id: destinationStationId,
    via_station_ids: viaStationIds,
    procedure_station_id: input.procedure_station_id ?? null,
    travel_date: input.travel_date ?? input.travelDate ?? null,
    company_preference: input.company_preference ?? input.company_id ?? null,
    passengers,
    passenger_totals: passengerTotals(passengers),
    route_preferences: {
      candidate_policy: input.route_preferences?.candidate_policy ?? 'recommended',
      max_candidates: Number(input.route_preferences?.max_candidates ?? input.maxCandidates ?? 3)
    },
    section_services: Array.isArray(input.section_services) ? input.section_services : [],
    legacy: {
      start: input.start ?? null,
      goal: input.goal ?? null,
      via: Array.isArray(input.via) ? input.via : [],
      passenger: input.passenger ?? null,
      trip_type: input.trip_type ?? 'one_way'
    }
  };
}

export function toLegacyPracticalOptions(searchConditions, stationLookup) {
  const stationName = stationId => stationLookup(stationId)?.station_name ?? null;
  const passengers = searchConditions.passengers ?? [];
  const totalCount = searchConditions.passenger_totals?.total_count ?? passengerTotals(passengers).total_count;

  return {
    start: searchConditions.legacy?.start ?? stationName(searchConditions.origin_station_id),
    goal: searchConditions.legacy?.goal ?? stationName(searchConditions.destination_station_id),
    via: searchConditions.legacy?.via?.length
      ? searchConditions.legacy.via
      : searchConditions.via_station_ids.map(stationName).filter(Boolean),
    passenger: searchConditions.legacy?.passenger ?? 'adult',
    passengers: totalCount || 1,
    travelDate: searchConditions.travel_date,
    company_id: searchConditions.company_preference,
    trip_type: searchConditions.legacy?.trip_type ?? 'one_way',
    section_services: searchConditions.section_services,
    procedure_station_id: searchConditions.procedure_station_id
  };
}
