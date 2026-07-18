/**
 * ChangeEngine
 *
 * 普通乗車券の変更計算を担当する。
 *
 * RouteEngineは経路探索、FareEngineは普通運賃算出を担当し、
 * ChangeEngineは両者を利用して変更可否・精算額・計算根拠を組み立てる。
 */
export default class ChangeEngine {

  static TYPES = Object.freeze({
    JOURNEY_CHANGE: 'journey_change',
    ROUTE_CHANGE: 'route_change',
    DIRECTION_CHANGE: 'direction_change',
    OVERTRAVEL: 'overtravel'
  });

  static USAGE_STATES = Object.freeze({
    BEFORE_USE: 'before_use',
    AFTER_USE: 'after_use'
  });

  static ERROR_CODES = Object.freeze({
    INVALID_CHANGE_REQUEST: 'INVALID_CHANGE_REQUEST',
    UNSUPPORTED_CHANGE_TYPE: 'UNSUPPORTED_CHANGE_TYPE',
    CHANGE_NOT_ALLOWED: 'CHANGE_NOT_ALLOWED',
    CURRENT_STATION_NOT_ON_ROUTE:
      'CURRENT_STATION_NOT_ON_ROUTE'
  });

  constructor(routeEngine, fareEngine, rules = {}) {
    this.routeEngine = routeEngine;
    this.fareEngine = fareEngine;
    this.rules = {
      distance_threshold_km: 100,
      short_distance_classification: '100km_or_less',
      long_distance_classification: '101km_or_more',
      before_use_method: 'whole_journey_difference',
      after_use_short_method: 'origin_recalculation',
      after_use_long_method: 'cutoff_recalculation',
      overtravel_short_method: 'origin_recalculation',
      overtravel_long_method: 'cutoff_recalculation',
      allow_before_use_change: true,
      allow_after_use_change: true,
      allow_direction_change_before_use: false,
      ...rules
    };
  }

  /**
   * 変更種別に応じて計算する。
   */
  calculate(input) {
    const normalized = this.normalizeInput(input);

    switch (normalized.type) {
      case ChangeEngine.TYPES.JOURNEY_CHANGE:
        return this.journeyChange(normalized);

      case ChangeEngine.TYPES.ROUTE_CHANGE:
        return this.routeChange(normalized);

      case ChangeEngine.TYPES.DIRECTION_CHANGE:
        return this.directionChange(normalized);

      case ChangeEngine.TYPES.OVERTRAVEL:
        return this.overtravel(normalized);

      default:
        throw this.createError(
          ChangeEngine.ERROR_CODES.UNSUPPORTED_CHANGE_TYPE,
          `未対応の変更種別です: ${normalized.type}`,
          { type: normalized.type }
        );
    }
  }

  /**
   * 使用開始前・使用開始後の乗車変更。
   */
  journeyChange(input) {
    const allowed = this.changeAllowed(input.usageState);

    if (!allowed) {
      return this.disallowedResult(
        input,
        '設定上、この使用状態では乗車変更できません。'
      );
    }

    const original = this.journeyQuote(
      input.original,
      input.passenger
    );
    const changed = this.journeyQuote(
      input.changed,
      input.passenger
    );

    if (
      input.usageState ===
      ChangeEngine.USAGE_STATES.BEFORE_USE
    ) {
      return this.buildDifferenceResult({
        input,
        original,
        changed,
        ruleClassification: 'before_use',
        calculationMethod:
          this.rules.before_use_method,
        reason:
          '使用開始前のため、変更前後の全区間の普通運賃を比較しました。'
      });
    }

    return this.afterUseChange({
      input,
      original,
      changed,
      reasonPrefix:
        '使用開始後の乗車変更として計算しました。'
    });
  }

  /**
   * 経路変更。
   */
  routeChange(input) {
    const allowed = this.changeAllowed(input.usageState);

    if (!allowed) {
      return this.disallowedResult(
        input,
        '設定上、この使用状態では経路変更できません。'
      );
    }

    const original = this.journeyQuote(
      input.original,
      input.passenger
    );
    const changed = this.journeyQuote(
      input.changed,
      input.passenger
    );

    if (
      input.usageState ===
      ChangeEngine.USAGE_STATES.BEFORE_USE
    ) {
      return this.buildDifferenceResult({
        input,
        original,
        changed,
        ruleClassification: 'before_use',
        calculationMethod:
          this.rules.before_use_method,
        reason:
          '使用開始前の経路変更として、変更後経路の営業キロと普通運賃を再計算しました。'
      });
    }

    return this.afterUseChange({
      input,
      original,
      changed,
      reasonPrefix:
        '使用開始後の経路変更として、営業キロ区分に応じて計算しました。'
    });
  }

  /**
   * 方向変更。
   */
  directionChange(input) {
    if (
      input.usageState ===
      ChangeEngine.USAGE_STATES.BEFORE_USE &&
      !this.rules.allow_direction_change_before_use
    ) {
      return this.disallowedResult(
        input,
        '方向変更は使用開始後の取扱いとして設定されています。'
      );
    }

    const original = this.journeyQuote(
      input.original,
      input.passenger
    );

    const currentStation = this.requireCurrentStation(
      input
    );
    const position = this.routePosition(
      original.route,
      currentStation
    );

    const changedGoalId =
      this.routeEngine.resolveStation(
        input.changed.goal
      );

    const traveledStationIds =
      position.stationIds.slice(0, position.index);

    const isReverseDirection =
      traveledStationIds.includes(changedGoalId);

    if (!isReverseDirection) {
      return {
        ...this.baseResult(input),
        change_allowed: false,
        original_fare_yen: original.fare.amount_yen,
        changed_fare_yen: null,
        difference_yen: null,
        shortage_yen: 0,
        refundable_amount_yen: 0,
        reason:
          '変更後の着駅が既乗車区間上にないため、方向変更として判定できません。',
        calculation_basis: {
          current_station: currentStation,
          changed_goal: input.changed.goal,
          determination: 'not_reverse_direction'
        }
      };
    }

    const unusedOriginal = this.journeyQuote(
      {
        start: currentStation,
        goal: input.original.goal,
        via: []
      },
      input.passenger
    );

    const changed = this.journeyQuote(
      {
        start: currentStation,
        goal: input.changed.goal,
        via: input.changed.via
      },
      input.passenger
    );

    const settlement = this.settlement(
      unusedOriginal.fare.amount_yen,
      changed.fare.amount_yen
    );

    return {
      ...this.baseResult(input),
      change_allowed: true,
      rule_classification: 'direction_change_cutoff',
      calculation_method: 'cutoff_recalculation',
      original_fare_yen: original.fare.amount_yen,
      changed_fare_yen: changed.fare.amount_yen,
      difference_yen:
        changed.fare.amount_yen -
        unusedOriginal.fare.amount_yen,
      shortage_yen: settlement.shortage,
      refundable_amount_yen: settlement.refundable,
      original_route: original.route,
      changed_route: changed.route,
      calculation_reason:
        '変更駅で原乗車券を打ち切り、未使用区間相当額と変更駅から変更後着駅までの普通運賃を比較しました。',
      calculation_basis: {
        current_station: currentStation,
        original_total_fare_yen:
          original.fare.amount_yen,
        unused_original_section:
          this.routeSummary(unusedOriginal.route),
        unused_original_fare_yen:
          unusedOriginal.fare.amount_yen,
        new_section:
          this.routeSummary(changed.route),
        new_section_fare_yen:
          changed.fare.amount_yen
      },
      warnings: this.defaultWarnings()
    };
  }

  /**
   * 乗り越し精算。
   */
  overtravel(input) {
    const original = this.journeyQuote(
      input.original,
      input.passenger
    );

    const actualGoal =
      input.actualGoal || input.changed.goal;

    if (!actualGoal) {
      throw this.createError(
        ChangeEngine.ERROR_CODES.INVALID_CHANGE_REQUEST,
        '乗り越し後の実着駅を指定してください。',
        { field: 'actualGoal' }
      );
    }

    const distanceClass = this.distanceClassification(
      original.route.business_km
    );

    let changed;
    let calculationMethod;
    let shortage;
    let basis;
    let reason;

    if (
      distanceClass ===
      this.rules.short_distance_classification
    ) {
      changed = this.journeyQuote(
        {
          start: input.original.start,
          goal: actualGoal,
          via: input.changed.via
        },
        input.passenger
      );

      shortage = Math.max(
        changed.fare.amount_yen -
        original.fare.amount_yen,
        0
      );

      calculationMethod =
        this.rules.overtravel_short_method;

      reason =
        '原乗車券の営業キロが100km以下のため、発駅から実着駅までの普通運賃を再計算し、所持乗車券との差額を不足運賃としました。';

      basis = {
        held_ticket:
          this.routeSummary(original.route),
        held_ticket_fare_yen:
          original.fare.amount_yen,
        recalculated_journey:
          this.routeSummary(changed.route),
        recalculated_fare_yen:
          changed.fare.amount_yen
      };
    } else {
      changed = this.journeyQuote(
        {
          start: input.original.goal,
          goal: actualGoal,
          via: input.changed.via
        },
        input.passenger
      );

      shortage = changed.fare.amount_yen;
      calculationMethod =
        this.rules.overtravel_long_method;

      reason =
        '原乗車券の営業キロが101km以上のため、原着駅で打ち切り、原着駅から実着駅までの普通運賃を不足運賃としました。';

      basis = {
        held_ticket:
          this.routeSummary(original.route),
        held_ticket_fare_yen:
          original.fare.amount_yen,
        cutoff_station:
          input.original.goal,
        additional_section:
          this.routeSummary(changed.route),
        additional_section_fare_yen:
          changed.fare.amount_yen
      };
    }

    return {
      ...this.baseResult(input),
      change_allowed: true,
      rule_classification: distanceClass,
      calculation_method: calculationMethod,
      passenger_section: {
        start: input.original.start,
        goal: actualGoal
      },
      held_ticket: {
        start: input.original.start,
        goal: input.original.goal,
        via: input.original.via,
        business_km:
          original.route.business_km,
        fare_yen:
          original.fare.amount_yen
      },
      original_fare_yen:
        original.fare.amount_yen,
      changed_fare_yen:
        distanceClass ===
        this.rules.short_distance_classification
          ? changed.fare.amount_yen
          : original.fare.amount_yen +
            changed.fare.amount_yen,
      difference_yen: shortage,
      shortage_yen: shortage,
      refundable_amount_yen: 0,
      original_route: original.route,
      changed_route: changed.route,
      calculation_reason: reason,
      calculation_basis: basis,
      warnings: this.defaultWarnings()
    };
  }

  afterUseChange({
    input,
    original,
    changed,
    reasonPrefix
  }) {
    const distanceClass = this.distanceClassification(
      original.route.business_km
    );

    if (
      distanceClass ===
      this.rules.short_distance_classification
    ) {
      return this.buildDifferenceResult({
        input,
        original,
        changed,
        ruleClassification: distanceClass,
        calculationMethod:
          this.rules.after_use_short_method,
        reason:
          `${reasonPrefix} 原乗車券が100km以下のため、発駅から変更後着駅までを再計算しました。`
      });
    }

    const currentStation = this.requireCurrentStation(
      input
    );

    this.routePosition(
      original.route,
      currentStation
    );

    const unusedOriginal = this.journeyQuote(
      {
        start: currentStation,
        goal: input.original.goal,
        via: []
      },
      input.passenger
    );

    const changedRemaining = this.journeyQuote(
      {
        start: currentStation,
        goal: input.changed.goal,
        via: input.changed.via
      },
      input.passenger
    );

    const settlement = this.settlement(
      unusedOriginal.fare.amount_yen,
      changedRemaining.fare.amount_yen
    );

    return {
      ...this.baseResult(input),
      change_allowed: true,
      rule_classification: distanceClass,
      calculation_method:
        this.rules.after_use_long_method,
      original_fare_yen: original.fare.amount_yen,
      changed_fare_yen:
        original.fare.amount_yen -
        unusedOriginal.fare.amount_yen +
        changedRemaining.fare.amount_yen,
      difference_yen:
        changedRemaining.fare.amount_yen -
        unusedOriginal.fare.amount_yen,
      shortage_yen: settlement.shortage,
      refundable_amount_yen: settlement.refundable,
      original_route: original.route,
      changed_route: changed.route,
      calculation_reason:
        `${reasonPrefix} 原乗車券が101km以上のため、変更駅で打ち切り、未使用区間と変更後区間の運賃を比較しました。`,
      calculation_basis: {
        current_station: currentStation,
        original_total:
          this.routeSummary(original.route),
        original_total_fare_yen:
          original.fare.amount_yen,
        unused_original_section:
          this.routeSummary(unusedOriginal.route),
        unused_original_fare_yen:
          unusedOriginal.fare.amount_yen,
        changed_remaining_section:
          this.routeSummary(changedRemaining.route),
        changed_remaining_fare_yen:
          changedRemaining.fare.amount_yen
      },
      warnings: this.defaultWarnings()
    };
  }

  buildDifferenceResult({
    input,
    original,
    changed,
    ruleClassification,
    calculationMethod,
    reason
  }) {
    const difference =
      changed.fare.amount_yen -
      original.fare.amount_yen;

    const settlement = this.settlement(
      original.fare.amount_yen,
      changed.fare.amount_yen
    );

    return {
      ...this.baseResult(input),
      change_allowed: true,
      rule_classification: ruleClassification,
      calculation_method: calculationMethod,
      original_fare_yen: original.fare.amount_yen,
      changed_fare_yen: changed.fare.amount_yen,
      difference_yen: difference,
      shortage_yen: settlement.shortage,
      refundable_amount_yen: settlement.refundable,
      original_route: original.route,
      changed_route: changed.route,
      calculation_reason: reason,
      calculation_basis: {
        original:
          this.routeSummary(original.route),
        changed:
          this.routeSummary(changed.route),
        original_fare:
          original.fare,
        changed_fare:
          changed.fare
      },
      warnings: this.defaultWarnings()
    };
  }

  journeyQuote(journey, passenger) {
    this.validateJourney(journey);

    const route = this.routeEngine.route(
      journey.start,
      journey.goal,
      journey.via
    );

    return {
      route,
      fare: this.fareEngine.ordinaryFare(
        route,
        passenger
      )
    };
  }

  normalizeInput(input = {}) {
    const type = input.type;

    if (!type) {
      throw this.createError(
        ChangeEngine.ERROR_CODES.INVALID_CHANGE_REQUEST,
        '変更種別を指定してください。',
        { field: 'type' }
      );
    }

    const usageState =
      input.usageState ||
      (
        type === ChangeEngine.TYPES.OVERTRAVEL
          ? ChangeEngine.USAGE_STATES.AFTER_USE
          : ChangeEngine.USAGE_STATES.BEFORE_USE
      );

    this.validateEnum(
      usageState,
      Object.values(ChangeEngine.USAGE_STATES),
      '使用状態'
    );

    const passenger = input.passenger || 'adult';

    this.validateEnum(
      passenger,
      ['adult', 'child'],
      '旅客区分'
    );

    return {
      ...input,
      type,
      usageState,
      passenger,
      original: {
        start: input.original?.start ?? input.start,
        goal: input.original?.goal ?? input.goal,
        via: input.original?.via ?? input.via ?? []
      },
      changed: {
        start:
          input.changed?.start ??
          input.newStart ??
          input.start,
        goal:
          input.changed?.goal ??
          input.newGoal ??
          input.goal,
        via:
          input.changed?.via ??
          input.newVia ??
          []
      }
    };
  }

  validateJourney(journey) {
    if (!journey?.start || !journey?.goal) {
      throw this.createError(
        ChangeEngine.ERROR_CODES.INVALID_CHANGE_REQUEST,
        '発駅と着駅を指定してください。',
        { journey }
      );
    }

    if (
      journey.via != null &&
      !Array.isArray(journey.via)
    ) {
      throw this.createError(
        ChangeEngine.ERROR_CODES.INVALID_CHANGE_REQUEST,
        '経由駅は配列で指定してください。',
        { via: journey.via }
      );
    }
  }

  changeAllowed(usageState) {
    if (
      usageState ===
      ChangeEngine.USAGE_STATES.BEFORE_USE
    ) {
      return this.rules.allow_before_use_change;
    }

    return this.rules.allow_after_use_change;
  }

  distanceClassification(km) {
    return Number(km) <=
      Number(this.rules.distance_threshold_km)
      ? this.rules.short_distance_classification
      : this.rules.long_distance_classification;
  }

  requireCurrentStation(input) {
    if (!input.currentStation) {
      throw this.createError(
        ChangeEngine.ERROR_CODES.INVALID_CHANGE_REQUEST,
        '使用開始後の打切計算には変更駅を指定してください。',
        { field: 'currentStation' }
      );
    }

    return input.currentStation;
  }

  routePosition(route, station) {
    const stationId =
      this.routeEngine.resolveStation(station);

    const stationIds = this.routeStationIds(route);
    const index = stationIds.indexOf(stationId);

    if (index < 0) {
      throw this.createError(
        ChangeEngine.ERROR_CODES.CURRENT_STATION_NOT_ON_ROUTE,
        `変更駅が原経路上にありません: ${station}`,
        {
          station,
          route_station_ids: stationIds
        }
      );
    }

    return {
      stationId,
      stationIds,
      index
    };
  }

  routeStationIds(route) {
    if (!route.segments.length) {
      return [route.start_station_id];
    }

    return [
      route.segments[0].from_station_id,
      ...route.segments.map(
        segment => segment.to_station_id
      )
    ];
  }

  settlement(originalAmount, changedAmount) {
    const difference =
      Number(changedAmount) -
      Number(originalAmount);

    return {
      shortage: Math.max(difference, 0),
      refundable: Math.max(-difference, 0)
    };
  }

  routeSummary(route) {
    return {
      start_station_id: route.start_station_id,
      start_station_name: route.start_station_name,
      goal_station_id: route.goal_station_id,
      goal_station_name: route.goal_station_name,
      via: route.via,
      business_km: route.business_km,
      conversion_km: route.conversion_km,
      fare_calculation_km:
        route.fare_calculation_km,
      route_category: route.route_category
    };
  }

  baseResult(input) {
    return {
      change_type: input.type,
      usage_state: input.usageState,
      passenger: input.passenger
    };
  }

  disallowedResult(input, reason) {
    return {
      ...this.baseResult(input),
      change_allowed: false,
      original_fare_yen: null,
      changed_fare_yen: null,
      difference_yen: null,
      shortage_yen: 0,
      refundable_amount_yen: 0,
      calculation_reason: reason,
      calculation_basis: null,
      warnings: this.defaultWarnings()
    };
  }

  defaultWarnings() {
    return [
      'Version 2.5は普通乗車券の基本的な変更計算のみを対象とします。',
      '払戻手数料、割引、特定都区市内制度、特定区間運賃等は計算へ含めません。',
      '最終的な取扱いは最新の規程、通達および発売端末表示で確認してください。'
    ];
  }

  validateEnum(value, allowed, label) {
    if (!allowed.includes(value)) {
      throw this.createError(
        ChangeEngine.ERROR_CODES.INVALID_CHANGE_REQUEST,
        `${label}が不正です: ${value}`,
        {
          value,
          allowed
        }
      );
    }
  }

  createError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    return error;
  }
}
