import {normalizeSearchConditions} from './SearchConditionAdapter.js';
import {normalizePassengers, passengerTotals} from './PassengerModel.js';
import {buildSectionServices} from './SectionServiceManager.js';

const ENGINE_SEQUENCE = Object.freeze([
  'RouteEngine',
  'FareEngine',
  'ChargeEngine',
  'DiscountEngine',
  'BusinessEngine',
  'RuleResolver',
  'ValidationEngine',
  'PracticalOperationPlatform'
]);

/**
 * 実務検索の実行順序、途中停止、各Engine結果の統合を担当する。
 */
export default class PracticalOperationPlatform {
  constructor({salesEngine, stationSearchIndex, storage, debugService, validationService, passengerRuleService}) {
    this.salesEngine = salesEngine;
    this.stationSearchIndex = stationSearchIndex;
    this.storage = storage;
    this.debugService = debugService;
    this.validationService = validationService;
    this.passengerRuleService = passengerRuleService;
    this.routeCache = new Map();
    this.executionMetrics = [];
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
          route: this.salesEngine.route(start, goal, [...via].reverse())
        });
      } catch {
        // 正式に探索できた候補のみを採用する。
      }
    }

    const unique = new Map();
    for (const row of routes) {
      const sections = row.route.distance?.sections || [];
      const signature = sections.map(section =>
        `${section.from}|${section.line}|${section.to}`
      ).join('>');
      const stations = [sections[0]?.from, ...sections.map(section => section.to)].filter(Boolean);
      if (new Set(stations).size !== stations.length) {
        const error = new Error('循環経路を検出しました。');
        error.code = 'ROUTE_CYCLE';
        error.engine = 'RouteEngine';
        throw error;
      }
      if (!unique.has(signature)) {
        unique.set(signature, {
          ...row,
          signature,
          company_boundary_count: this.companyBoundaryCount(row.route)
        });
      }
    }

    return [...unique.values()]
      .sort((a, b) => a.route.fare_calculation_km - b.route.fare_calculation_km)
      .slice(0, maxCandidates)
      .map((row, index) => ({candidate_id: `route-${index + 1}`, ...row}));
  }

  companyBoundaryCount(route) {
    const companies = (route.segments || []).map(segment => segment.company_id).filter(Boolean);
    let count = 0;
    for (let index = 1; index < companies.length; index += 1) {
      if (companies[index] !== companies[index - 1]) count += 1;
    }
    return count;
  }

  async calculate(options) {
    const startedAt = new Date().toISOString();
    this.executionMetrics = [];
    const normalizedConditions = normalizeSearchConditions(options);
    const passengers = normalizePassengers(options);
    const initialSectionServices = normalizedConditions.section_services || [];
    const inputValidation = this.validationService.validateInput({
      options,
      passengers,
      sectionServices: initialSectionServices.length ? initialSectionServices : null
    });

    if (!inputValidation.isValid) {
      throw this.fatalError('ValidationEngine', 'PRACTICAL_INPUT_INVALID', inputValidation.errors.map(row => row.message).join('\n'), {
        validation: inputValidation,
        input: options
      });
    }

    try {
      const routeCacheKey = this.routeCacheKey(options);
      const canReuseRoute = ['passengers', 'section-services', 'procedure', 'calculation'].includes(options.recalculation_scope);
      let routeCandidates = canReuseRoute ? this.routeCache.get(routeCacheKey) : null;
      let route_reused = Boolean(routeCandidates);
      if (!routeCandidates) {
        routeCandidates = await this.measure('RouteEngine', 'routeCandidates', () => this.routeCandidates(options));
        this.routeCache.set(routeCacheKey, routeCandidates);
        route_reused = false;
      } else {
        this.executionMetrics.push({engine: 'RouteEngine', operation: 'routeCandidates', duration_ms: 0, cache_hit: true});
      }
      const selectedRoute = routeCandidates[0];
      const route = selectedRoute?.route;
      const routeValidation = this.validationService.validateRoute(route);
      if (!routeValidation.isValid) {
        throw this.fatalError('RouteEngine', 'ROUTE_VALIDATION_FAILED', routeValidation.errors.map(row => row.message).join('\n'), {
          validation: routeValidation,
          route
        });
      }

      const sectionServices = buildSectionServices(route?.distance?.sections || [], initialSectionServices);
      const sectionValidation = this.validationService.validateInput({options, passengers, sectionServices});
      if (!sectionValidation.isValid) {
        throw this.fatalError('ValidationEngine', 'SECTION_VALIDATION_FAILED', sectionValidation.errors.map(row => row.message).join('\n'), {
          validation: sectionValidation,
          section_services: sectionServices
        });
      }

      const calculation = await this.measure(
        'FareEngine/ChargeEngine/DiscountEngine',
        'calculatePassengerGroups',
        () => this.salesEngine.calculatePassengerGroups({
          route,
          passengers,
          sectionServices,
          travelDate: normalizedConditions.travel_date,
          tripType: options.trip_type || 'one_way'
        })
      );

      const calculationValidation = this.validationService.validateCalculation(calculation, passengers);
      if (!calculationValidation.isValid) {
        throw this.fatalError('ValidationEngine', 'CALCULATION_VALIDATION_FAILED', calculationValidation.errors.map(row => row.message).join('\n'), {
          validation: calculationValidation,
          calculation
        });
      }

      const passengerCountsByDiscount = Object.fromEntries(
        passengers.map(row => [
          row.discount_type,
          passengers.filter(item => item.discount_type === row.discount_type)
            .reduce((sum, item) => sum + Number(item.count || 0), 0)
        ])
      );

      const businessRules = await this.measure('BusinessEngine', 'evaluatePassengerGroups', () =>
        this.passengerRuleService.evaluate({
          passengers,
          calculation,
          context: {
            procedure_station_id: normalizedConditions.procedure_station_id,
            travel_date: normalizedConditions.travel_date,
            company_preference: normalizedConditions.company_preference,
            passenger_counts_by_discount: passengerCountsByDiscount
          }
        })
      );

      const ruleResolver = await this.measure('RuleResolver', 'resolvePassengerGroups', () => ({
        passengers: businessRules.passengers.map(row => ({
          passenger_group_id: row.passenger_group_id,
          candidate_rules: row.candidate_rules,
          accepted_rules: row.accepted_rules,
          rejected_rules: row.rejected_rules
        }))
      }));

      const totals = passengerTotals(passengers);
      const validation = this.mergeValidation(inputValidation, routeValidation, sectionValidation, calculationValidation);
      const passengerRows = calculation.passengers.map(row => {
        const ruleRow = businessRules.passengers.find(item => item.passenger_group_id === row.passenger_group_id);
        return {
          ...row,
          applied_rules: ruleRow?.applied_rules || [],
          rule_resolver: {
            candidate_rules: ruleRow?.candidate_rules || [],
            accepted_rules: ruleRow?.accepted_rules || [],
            rejected_rules: ruleRow?.rejected_rules || []
          },
          applied_rule_count: ruleRow?.accepted_rules?.length || 0
        };
      });

      const result = {
        version: '5.1-stage5',
        execution_started_at: startedAt,
        engine_sequence: ENGINE_SEQUENCE,
        recalculation: {
          scope: options.recalculation_scope || 'full',
          route_reused
        },
        execution_metrics: [...this.executionMetrics],
        conditions: {...options, passengers},
        conditions_v5_1: normalizedConditions,
        passengers,
        passenger_rows: passengerRows,
        passenger_totals: totals,
        section_services: calculation.section_services,
        validation,
        route_candidates: routeCandidates,
        selected_route: selectedRoute,
        route,
        distance: route.distance,
        fare_result: calculation.fare,
        charge_result: calculation.charges,
        discount_result: calculation.discounts,
        business_result: businessRules,
        rule_resolver_result: ruleResolver,
        totals: calculation.totals,
        fare: {
          ordinary_fare_yen: calculation.totals.ordinary_fare_total_yen,
          charge_yen: calculation.totals.charge_total_yen,
          discount_yen: calculation.totals.discount_total_yen,
          extra_charge_yen: calculation.totals.extra_charge_total_yen,
          passenger_count: totals.total_count,
          total_yen: calculation.totals.total_yen
        },
        components: calculation.passengers.flatMap(row => [
          ...row.fare.components,
          ...row.charges.components
        ]),
        formulas: calculation.passengers.map(row => ({
          passenger_group_id: row.passenger_group_id,
          formula_steps: row.formula_steps
        })),
        warnings: [
          ...validation.warnings.map(row => row.message),
          ...calculation.warnings,
          '最終取扱いは規程・端末・上長確認を優先してください。'
        ]
      };

      this.storage.addHistory({
        conditions: result.conditions,
        conditions_v5_1: result.conditions_v5_1,
        passengers: result.passengers,
        passenger_rows: result.passenger_rows,
        passenger_totals: result.passenger_totals,
        section_services: result.section_services,
        distance: result.distance?.totals || null,
        fare_yen: result.fare.ordinary_fare_yen,
        charge_yen: result.fare.charge_yen,
        discount_yen: result.fare.discount_yen,
        extra_charge_yen: result.fare.extra_charge_yen,
        total_yen: result.fare.total_yen
      });

      this.storage.rememberStations(
        [options.start, ...(options.via || []), options.goal]
          .map(name => this.stationSearchIndex.search(name, {limit: 1})[0])
          .filter(Boolean)
      );
      return result;
    } catch (error) {
      const normalized = this.normalizeError(error, options);
      this.storage.addError(normalized, {
        operation: 'practicalQuote',
        options,
        engine: normalized.engine
      });
      throw normalized;
    }
  }

  async measure(engine, operation, callback) {
    const started = globalThis.performance?.now?.() ?? Date.now();
    try {
      return await this.debugService.measure(engine, operation, callback);
    } finally {
      const ended = globalThis.performance?.now?.() ?? Date.now();
      this.executionMetrics.push({
        engine,
        operation,
        duration_ms: Number((ended - started).toFixed(2)),
        cache_hit: false
      });
    }
  }

  routeCacheKey(options = {}) {
    return JSON.stringify({
      start: options.start || null,
      goal: options.goal || null,
      via: Array.isArray(options.via) ? options.via : [],
      company_id: options.company_id || options.company_preference || null,
      route_preferences: options.route_preferences || null
    });
  }

  mergeValidation(...results) {
    const unique = rows => [...new Map(rows.map(row => [`${row.code}:${row.field}:${row.message}`, row])).values()];
    const errors = unique(results.flatMap(row => row.errors || []));
    const warnings = unique(results.flatMap(row => row.warnings || []));
    const infos = unique(results.flatMap(row => row.infos || []));
    return {errors, warnings, infos, isValid: errors.length === 0, valid: errors.length === 0};
  }

  fatalError(engine, code, message, details = {}) {
    const error = new Error(message);
    error.name = 'PracticalOperationFatalError';
    error.engine = engine;
    error.code = code;
    error.details = details;
    error.fatal = true;
    return error;
  }

  normalizeError(error, input) {
    if (error.engine && error.details?.stack) return error;
    error.engine = error.engine || 'PracticalOperationPlatform';
    error.code = error.code || 'PRACTICAL_OPERATION_FAILED';
    error.details = {
      ...(error.details || {}),
      cause: error.message,
      engine: error.engine,
      input,
      stack: error.stack || null
    };
    return error;
  }
}
