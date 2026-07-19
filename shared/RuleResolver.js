import { ErrorCodes } from './ErrorCodes.js';

const MASTER_FILES = Object.freeze({
  business_regulation_master:
    'business_regulation_master.json',
  station_group_master:
    'station_group_master.json',
  route_rule_master:
    'route_rule_master.json',
  validity_rule_master:
    'validity_rule_master.json'
});

/**
 * 営業規則マスターの取得・参照解決・優先順位処理・判定を担当する。
 * BusinessEngineは営業規則を直接評価せず、本クラスのみを呼び出す。
 */
export default class RuleResolver {

  constructor({
    masters = {},
    validationEngine = null
  } = {}) {
    this.masters = masters;
    this.validationEngine = validationEngine;
  }

  /**
   * data/master配下から必要マスターを読み込む。
   */
  static async load(
    base = './data/master',
    fetcher = fetch,
    validationEngine = null
  ) {
    const entries = await Promise.all(
      Object.entries(MASTER_FILES).map(
        async ([key, fileName]) => {
          const response = await fetcher(
            `${base}/${fileName}`
          );

          if (!response.ok) {
            const error = new Error(
              `${fileName} の読込みに失敗しました。`
            );
            error.code =
              ErrorCodes.MASTER_MISSING;
            error.details = {
              master: key,
              file_name: fileName,
              status: response.status
            };
            throw error;
          }

          return [key, await response.json()];
        }
      )
    );

    return new RuleResolver({
      masters: Object.fromEntries(entries),
      validationEngine
    });
  }

  resolve({
    input = {},
    businessState = {},
    operationResult = {},
    validatedDates = {}
  } = {}) {
    const validation = this.validate();

    if (!validation.valid) {
      return validation;
    }

    const context = this.createContext(
      input,
      businessState,
      operationResult,
      validatedDates
    );

    const resolvedRules =
      this.resolveReferences();

    if (resolvedRules.valid === false) {
      return resolvedRules;
    }

    const regulations = {};
    const details = [];
    const calculation = [];
    const debug = Boolean(input.debugMode);

    for (const resolved of resolvedRules) {
      const { rule, masterName } = resolved;
      const conditions = rule.conditions || {};

      const missingFields = (
        conditions.required_fields || []
      ).filter(field =>
        context[field] == null ||
        context[field] === ''
      );

      const applicable =
        missingFields.length === 0
          ? this.evaluateGroup(
              conditions,
              context
            )
          : false;

      const reason =
        missingFields.length > 0
          ? conditions.missing_input_reason
          : applicable
            ? conditions.applicable_reason
            : conditions.not_applicable_reason;

      const calculatedValue =
        missingFields.length === 0 &&
        conditions.calculation
          ? this.calculateValue(
              conditions.calculation,
              context
            )
          : null;

      const resultKey =
        conditions.result_key ||
        rule.id.toLowerCase();

      regulations[resultKey] = applicable;

      const detail = {
        regulation_id: rule.id,
        key: resultKey,
        name: rule.name,
        description: rule.description,
        applicable,
        reason,
        priority: rule.priority,
        referenced_master: masterName,
        missing_fields: missingFields,
        calculated_value: calculatedValue
      };

      if (debug) {
        detail.reference_json =
          `data/master/${MASTER_FILES[masterName]}`;
      }

      details.push(detail);

      calculation.push({
        engine: 'RuleResolver',
        type: 'regulation',
        regulation_id: rule.id,
        applicable,
        reason,
        priority: rule.priority,
        referenced_master: masterName,
        calculated_value: calculatedValue
      });
    }

    return {
      valid: true,
      regulations,
      details,
      calculation,
      referenced_masters: [
        ...new Set(
          details.map(
            item => item.referenced_master
          )
        )
      ],
      error_code: null,
      message: null
    };
  }

  validate() {
    if (this.validationEngine) {
      return this.validationEngine.validate({
        type: 'master_database',
        masters: this.masters
      });
    }

    if (
      !this.masters
        .business_regulation_master
    ) {
      return this.invalid(
        ErrorCodes.MASTER_MISSING,
        '営業規則マスターが不足しています。'
      );
    }

    return {
      valid: true,
      error_code: null,
      message: null,
      details: {}
    };
  }

  /**
   * 中央マスターから参照先を取得し、
   * priority昇順で判定対象を返す。
   */
  resolveReferences() {
    const central =
      this.masters.business_regulation_master;

    if (!central) {
      return this.invalid(
        ErrorCodes.MASTER_MISSING,
        '営業規則マスターが不足しています。'
      );
    }

    const resolved = [];

    for (
      const reference of
      central.references || []
    ) {
      const master =
        this.masters[reference.master];

      if (!master) {
        return this.invalid(
          ErrorCodes.MASTER_MISSING,
          `参照マスターが不足しています: ${
            reference.master
          }`,
          { reference }
        );
      }

      const rule = (
        master.records || []
      ).find(
        item => item.id === reference.id
      );

      if (!rule) {
        return this.invalid(
          ErrorCodes.RULE_NOT_FOUND,
          `参照規則が見つかりません: ${
            reference.master
          }/${reference.id}`,
          { reference }
        );
      }

      if (
        master.enabled !== false &&
        rule.enabled !== false
      ) {
        resolved.push({
          rule,
          masterName: reference.master
        });
      }
    }

    return resolved.sort(
      (a, b) =>
        a.rule.priority -
        b.rule.priority
    );
  }

  createContext(
    input,
    state,
    operationResult,
    dates
  ) {
    const route = this.findRoute(
      operationResult.details
    );

    return {
      business_km:
        input.businessKm ??
        route?.business_km ??
        null,
      fare_calculation_km:
        input.fareCalculationKm ??
        route?.fare_calculation_km ??
        route?.business_km ??
        null,
      request_date:
        input.requestDate,
      ticket_start_date:
        input.ticketStartDate ||
        input.requestDate,
      ticket_end_date:
        input.ticketEndDate ||
        input.requestDate,
      ticket_type:
        input.ticketType,
      ticket_usage_type:
        input.ticketUsageType,
      departure_status:
        input.departureStatus,
      before_use:
        state.before_use,
      in_valid_period:
        state.in_valid_period,
      expired:
        state.expired,
      specific_city_zone_applicable:
        input.regulationContext
          ?.specificCityZoneApplicable,
      specific_route_section_applicable:
        input.regulationContext
          ?.specificRouteSectionApplicable,
      outside_section_ride_applicable:
        input.regulationContext
          ?.outsideSectionRideApplicable,
      selected_route_applicable:
        input.regulationContext
          ?.selectedRouteApplicable,
      turnback_ride_applicable:
        input.regulationContext
          ?.turnbackRideApplicable,
      metropolitan_suburban_area_only:
        input.regulationContext
          ?.metropolitanSuburbanAreaOnly,
      stopover_restricted:
        input.regulationContext
          ?.stopoverRestricted,
      validated_request_date:
        dates.requestDate,
      validated_start_date:
        dates.startDate,
      validated_end_date:
        dates.endDate
    };
  }

  findRoute(value) {
    if (
      !value ||
      typeof value !== 'object'
    ) {
      return null;
    }

    if (
      value.route &&
      typeof value.route === 'object'
    ) {
      return value.route;
    }

    if (value.original_quote?.route) {
      return value.original_quote.route;
    }

    for (
      const child of
      Object.values(value)
    ) {
      const found = this.findRoute(child);

      if (found) {
        return found;
      }
    }

    return null;
  }

  evaluateGroup(group, context) {
    if (Array.isArray(group.all)) {
      return group.all.every(
        item =>
          this.evaluateCondition(
            item,
            context
          )
      );
    }

    if (Array.isArray(group.any)) {
      return group.any.some(
        item =>
          this.evaluateCondition(
            item,
            context
          )
      );
    }

    return true;
  }

  evaluateCondition(
    condition,
    context
  ) {
    const actual =
      context[condition.field];

    const expected =
      condition.reference_field
        ? context[
            condition.reference_field
          ]
        : condition.value;

    const operators = {
      equals:
        () => actual === expected,
      not_equals:
        () => actual !== expected,
      greater_than:
        () =>
          Number(actual) >
          Number(expected),
      greater_than_or_equal:
        () =>
          Number(actual) >=
          Number(expected),
      less_than:
        () =>
          Number(actual) <
          Number(expected),
      less_than_or_equal:
        () =>
          Number(actual) <=
          Number(expected),
      includes:
        () =>
          Array.isArray(expected) &&
          expected.includes(actual),
      date_on_or_after:
        () =>
          this.dateValue(actual) >=
          this.dateValue(expected),
      date_on_or_before:
        () =>
          this.dateValue(actual) <=
          this.dateValue(expected)
    };

    const evaluator =
      operators[condition.operator];

    if (!evaluator) {
      const error = new Error(
        `未対応の営業規則演算子です: ${
          condition.operator
        }`
      );
      error.code =
        ErrorCodes.UNSUPPORTED_OPERATION;
      error.details = { condition };
      throw error;
    }

    return evaluator();
  }

  calculateValue(
    calculation,
    context
  ) {
    if (
      calculation.type !==
      'valid_days_by_business_km'
    ) {
      return null;
    }

    const km =
      Number(context.business_km);

    if (
      km <=
      calculation.same_day_max_km
    ) {
      return {
        valid_days: 1,
        required_end_date:
          context.ticket_start_date
      };
    }

    const extraDistance =
      Math.max(
        0,
        km -
          calculation.base_max_km
      );

    const additionalDays =
      Math.ceil(
        extraDistance /
        calculation.additional_km_unit
      ) *
      calculation
        .additional_days_per_unit;

    return {
      valid_days:
        calculation.base_days +
        additionalDays,
      required_end_date: null
    };
  }

  dateValue(value) {
    return new Date(
      `${value}T00:00:00`
    ).getTime();
  }

  invalid(
    errorCode,
    message,
    details = {}
  ) {
    return {
      valid: false,
      regulations: {},
      details,
      calculation: [],
      error_code: errorCode,
      message
    };
  }
}
