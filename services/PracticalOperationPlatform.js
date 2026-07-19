
export default class PracticalOperationPlatform {
  constructor({salesEngine, stationSearchIndex, storage, debugService}) {
    this.salesEngine = salesEngine;
    this.stationSearchIndex = stationSearchIndex;
    this.storage = storage;
    this.debugService = debugService;
  }

  validateInput(options) {
    const errors = [];
    if (!options.start) errors.push('発駅を入力してください。');
    if (!options.goal) errors.push('着駅を入力してください。');
    if (Number(options.passengers || 1) < 1) {
      errors.push('利用人数は1人以上で指定してください。');
    }

    const chain = [
      options.start,
      ...(options.via || []),
      options.goal
    ].filter(Boolean);
    const duplicates = chain.filter(
      (station, index) => chain.indexOf(station) !== index
    );
    if (duplicates.length) {
      errors.push(
        `同じ駅が複数回指定されています：${
          [...new Set(duplicates)].join('、')
        }`
      );
    }
    return {valid: errors.length === 0, errors};
  }

  routeCandidates({start, goal, via = [], maxCandidates = 3}) {
    const routes = [{
      criterion: 'shortest_business_km',
      label: '営業キロ最短',
      route: this.salesEngine.route(start, goal, via)
    }];

    if (via.length > 1) {
      try {
        routes.push({
          criterion: 'alternate_via_order',
          label: '経由順比較',
          route: this.salesEngine.route(
            start,
            goal,
            [...via].reverse()
          )
        });
      } catch {
        // 代替経路なし。
      }
    }

    const unique = new Map();
    for (const row of routes) {
      const sections = row.route.distance?.sections || [];
      const signature = sections
        .map(section =>
          `${section.from}|${section.line}|${section.to}`
        )
        .join('>');
      const stations = [
        sections[0]?.from,
        ...sections.map(section => section.to)
      ].filter(Boolean);
      if (new Set(stations).size !== stations.length) {
        throw new Error('循環経路を検出しました。');
      }
      if (!unique.has(signature)) {
        unique.set(signature, {
          ...row,
          signature,
          company_boundary_count:
            this.companyBoundaryCount(row.route)
        });
      }
    }

    return [...unique.values()]
      .sort((a, b) =>
        a.route.fare_calculation_km -
        b.route.fare_calculation_km
      )
      .slice(0, maxCandidates)
      .map((row, index) => ({
        candidate_id: `route-${index + 1}`,
        ...row
      }));
  }

  companyBoundaryCount(route) {
    const companies = (route.segments || [])
      .map(segment => segment.company_id)
      .filter(Boolean);
    let count = 0;
    for (let i = 1; i < companies.length; i += 1) {
      if (companies[i] !== companies[i - 1]) count += 1;
    }
    return count;
  }

  async calculate(options) {
    const validation = this.validateInput(options);
    if (!validation.valid) {
      const error = new Error(validation.errors.join('\n'));
      error.code = 'PRACTICAL_INPUT_INVALID';
      error.details = validation.errors;
      throw error;
    }

    try {
      const routeCandidates =
        await this.debugService.measure(
          'RouteEngine',
          'routeCandidates',
          () => this.routeCandidates(options)
        );

      const quote = await this.debugService.measure(
        'FareEngine/ChargeEngine',
        'quote',
        () => this.salesEngine.quote({
          ...options,
          passenger: options.passenger || 'adult'
        })
      );

      const passengers = Number(options.passengers || 1);
      const tripFactor =
        options.trip_type === 'round_trip' ? 2 : 1;
      const ordinaryFare = quote.components
        .filter(component =>
          ['ordinary_fare', 'special_fare']
            .includes(component.component)
        )
        .reduce((sum, component) =>
          sum + component.amount_yen, 0
        );
      const charge = quote.components
        .filter(component =>
          !['ordinary_fare', 'special_fare']
            .includes(component.component)
        )
        .reduce((sum, component) =>
          sum + component.amount_yen, 0
        );

      const result = {
        version: '5.0',
        conditions: {...options, passengers},
        route_candidates: routeCandidates,
        selected_route: routeCandidates[0],
        route: quote.route,
        distance: quote.route.distance,
        fare: {
          ordinary_fare_yen: ordinaryFare,
          charge_yen: charge,
          discount_yen: quote.discount_yen || 0,
          per_person_one_way_yen: quote.total_yen,
          passenger_count: passengers,
          trip_factor: tripFactor,
          total_yen:
            quote.total_yen * passengers * tripFactor
        },
        components: quote.components,
        warnings: [
          ...(quote.warnings || []),
          '最終取扱いは規程・端末・上長確認を優先してください。'
        ]
      };

      this.storage.addHistory({
        conditions: result.conditions,
        distance: result.distance?.totals || null,
        fare_yen: ordinaryFare,
        charge_yen: charge,
        total_yen: result.fare.total_yen
      });

      this.storage.rememberStations(
        [options.start, ...(options.via || []), options.goal]
          .map(name =>
            this.stationSearchIndex.search(name, {limit: 1})[0]
          )
          .filter(Boolean)
      );
      return result;
    } catch (error) {
      this.storage.addError(error, {
        operation: 'practicalQuote',
        options
      });
      throw error;
    }
  }
}
