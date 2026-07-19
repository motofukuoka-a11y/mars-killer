export default class RouteEngine {
  constructor(source, segments = null) {
    if (source?.getRecords) {
      this.dataAccess = source;
      this.stations = source.getRecords('station_master').map(record => ({
        station_id: record.id,
        station_name: record.name,
        ...record.metadata
      }));
      this.segments = source.getRecords('distance_master').map(record => ({
        segment_id: record.id,
        ...record.metadata
      }));
    } else {
      this.dataAccess = null;
      this.stations = source || [];
      this.segments = segments || [];
    }

    this.stationById = new Map(
      this.stations.map(station => [station.station_id, station])
    );
    this.idsByName = new Map();

    for (const station of this.stations) {
      if (!this.idsByName.has(station.station_name)) {
        this.idsByName.set(station.station_name, []);
      }
      this.idsByName.get(station.station_name).push(station.station_id);
    }

    this.graph = new Map();
    const add = (from, to, segment) => {
      if (!this.graph.has(from)) this.graph.set(from, []);
      this.graph.get(from).push({to, e: segment});
    };

    for (const segment of this.segments) {
      add(segment.from_station_id, segment.to_station_id, segment);
      add(segment.to_station_id, segment.from_station_id, segment);
    }
  }

  resolveStation(value) {
    const normalized = (value || '').trim();
    if (this.stationById.has(normalized)) return normalized;
    const matches = this.idsByName.get(normalized) || [];
    if (matches.length === 1) return matches[0];
    if (!matches.length) throw new Error(`駅が見つかりません: ${normalized}`);
    throw new Error(`同名駅が複数あります: ${normalized}`);
  }

  shortestLeg(start, goal) {
    const distance = new Map([[start, 0]]);
    const previous = new Map();
    const done = new Set();
    const queue = [[0, start]];

    while (queue.length) {
      queue.sort((a, b) => a[0] - b[0]);
      const [currentDistance, station] = queue.shift();
      if (done.has(station)) continue;
      done.add(station);
      if (station === goal) break;

      for (const {to, e} of this.graph.get(station) || []) {
        const nextDistance = Math.round(
          (currentDistance + Number(e.business_km)) * 1e10
        ) / 1e10;
        if (nextDistance < (distance.get(to) ?? Infinity)) {
          distance.set(to, nextDistance);
          previous.set(to, {u: station, e});
          queue.push([nextDistance, to]);
        }
      }
    }

    if (!distance.has(goal)) throw new Error('経路が見つかりません');

    const legs = [];
    let station = goal;
    while (station !== start) {
      const item = previous.get(station);
      if (!item) throw new Error('経路復元に失敗しました');
      legs.push({from: item.u, to: station, e: item.e});
      station = item.u;
    }
    return legs.reverse();
  }

  route(start, goal, via = []) {
    const points = [
      this.resolveStation(start),
      ...via.filter(Boolean).map(value => this.resolveStation(value)),
      this.resolveStation(goal)
    ];
    const legs = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      legs.push(...this.shortestLeg(points[index], points[index + 1]));
    }
    return this.summarizeRoute(points[0], points.at(-1), legs, via);
  }

  summarizeRoute(startId, goalId, legs, via = []) {
    let legacyBusinessTotal = 0;
    let legacyConversionTotal = 0;
    let legacyFareCalculationTotal = 0;
    const categories = new Set();
    const rows = [];
    const distanceSections = [];

    for (const {from, to, e} of legs) {
      const fromName = this.stationById.get(from).station_name;
      const toName = this.stationById.get(to).station_name;
      const lineType = this.normalizeLineType(e.line_category);
      const businessKm = this.roundDistance(Number(e.business_km || 0));
      const conversionKm = this.roundDistance(Number(
        e.conversion_km ?? e.fare_calculation_km ?? e.business_km ?? 0
      ));
      const segmentFareCalculationKm = this.roundDistance(Number(
        e.fare_calculation_km ??
        (lineType === 'local' ? conversionKm : businessKm)
      ));

      legacyBusinessTotal += businessKm;
      legacyConversionTotal += Number(e.conversion_km || 0);
      legacyFareCalculationTotal += segmentFareCalculationKm;
      categories.add(lineType);

      rows.push({
        from_station_id: from,
        from_station_name: fromName,
        to_station_id: to,
        to_station_name: toName,
        line_id: e.line_id,
        line_name: e.line_name,
        line_category: e.line_category,
        line_type: lineType,
        business_km: businessKm,
        conversion_km: lineType === 'local' ? conversionKm : null,
        fare_calculation_km: segmentFareCalculationKm,
        segment_id: e.segment_id
      });

      distanceSections.push({
        segment_id: e.segment_id,
        from: fromName,
        to: toName,
        line: e.line_name,
        line_type:
          lineType === 'local'
            ? 'local'
            : 'main',
        business_km:
          lineType === 'local'
            ? null
            : businessKm,
        conversion_km:
          lineType === 'local'
            ? conversionKm
            : null
      });
    }

    const displayBusinessTotal =
      this.sumSections(
        distanceSections,
        'business_km'
      );
    const displayConversionTotal =
      this.sumSections(
        distanceSections,
        'conversion_km'
      );
    const displayFareCalculationTotal = this.roundDistance(
      displayBusinessTotal + displayConversionTotal
    );

    let routeCategory = 'mixed';
    if (categories.size === 1 && categories.has('trunk')) {
      routeCategory = 'trunk';
    } else if (categories.size === 1 && categories.has('local')) {
      routeCategory = 'local';
    }

    const lookupDistance = routeCategory === 'mixed'
      ? (Math.ceil(legacyBusinessTotal - 1e-12) <= 10
          ? legacyBusinessTotal
          : legacyFareCalculationTotal)
      : legacyBusinessTotal;

    return {
      start_station_id: startId,
      start_station_name: this.stationById.get(startId).station_name,
      goal_station_id: goalId,
      goal_station_name: this.stationById.get(goalId).station_name,
      via,
      route_category: routeCategory,
      business_km: this.roundDistance(legacyBusinessTotal),
      conversion_km: this.roundDistance(legacyConversionTotal),
      fare_calculation_km: this.roundDistance(legacyFareCalculationTotal),
      distance: {
        sections: distanceSections,
        totals: {
          business_km: displayBusinessTotal,
          conversion_km: displayConversionTotal,
          fare_calculation_km: displayFareCalculationTotal
        }
      },
      ordinary_fare_lookup_km: Math.ceil(lookupDistance - 1e-12),
      segments: rows
    };
  }

  normalizeLineType(value) {
    return value === 'local' || value === '地方交通線'
      ? 'local'
      : 'trunk';
  }

  sumSections(sections, field) {
    return this.roundDistance(
      sections.reduce((total, section) =>
        total + Number(section[field] || 0), 0
      )
    );
  }

  roundDistance(value) {
    return Number(Number(value || 0).toFixed(1));
  }
}
