import { ErrorCodes } from '../shared/ErrorCodes.js';
import {
  BusinessOperation,
  RefundStatus,
  DepartureStatus
} from '../shared/Constants.js';

export default class BusinessEngine {

  constructor({
    routeEngine,
    fareEngine,
    chargeEngine,
    discountEngine,
    changeEngine,
    refundEngine,
    validationEngine,
    rules = {},
    regulations = {}
  }) {
    Object.assign(this, {
      routeEngine,
      fareEngine,
      chargeEngine,
      discountEngine,
      changeEngine,
      refundEngine,
      validationEngine,
      rules,
      regulations
    });
  }

  calculate(input = {}) {
    const validation =
      this.validationEngine.validate({
        type: 'business',
        ...input,
        businessRules: this.rules
      });

    if (!validation.valid) {
      return this.failure(
        input.operation,
        validation.error_code,
        validation.message,
        validation.details
      );
    }

    const state = this.determineBusinessState(
      validation.details.requestDate,
      validation.details.startDate,
      validation.details.endDate
    );

    try {
      const result = this.executeOperation(
        input,
        this.rules.operations[input.operation],
        state
      );

      const regulationResult =
        this.evaluateRegulations(
          input,
          state,
          result,
          validation.details
        );

      if (!regulationResult.valid) {
        return this.failure(
          input.operation,
          regulationResult.error_code,
          regulationResult.message,
          regulationResult.details
        );
      }

      return {
        success: true,
        operation: input.operation,
        business_state: state,
        regulations:
          regulationResult.regulations,
        regulation_details:
          regulationResult.details,
        fare: result.fare,
        calculation: [
          ...result.calculation,
          ...regulationResult.calculation
        ],
        details: result.details,
        error_code: null,
        message: null
      };
    } catch (error) {
      return this.failure(
        input.operation,
        error.code ||
          ErrorCodes.UNSUPPORTED_OPERATION,
        error.message,
        error.details || {}
      );
    }
  }

  determineBusinessState(
    requestDate,
    startDate,
    endDate
  ) {
    const before = requestDate < startDate;

    return {
      before_use: before,
      after_use_start: !before,
      in_valid_period:
        requestDate >= startDate &&
        requestDate <= endDate,
      expired: requestDate > endDate
    };
  }

  evaluateRegulations(
    input,
    businessState,
    operationResult,
    validatedDates
  ) {
    const context =
      this.createRegulationContext(
        input,
        businessState,
        operationResult,
        validatedDates
      );

    const validation =
      this.validationEngine.validate({
        type: 'business_regulations',
        context,
        businessRegulations:
          this.regulations
      });

    if (!validation.valid) {
      return validation;
    }

    const regulationValues = {};
    const details = [];
    const calculation = [];

    for (
      const regulation of
      this.regulations.regulations
    ) {
      const missing =
        validation.details
          .missing_by_regulation[
            regulation.regulation_id
          ] || [];

      const evaluated =
        missing.length > 0
          ? {
              applicable: false,
              reason:
                regulation
                  .missing_input_reason,
              missing_fields: missing,
              calculated_value: null
            }
          : this.evaluateRegulation(
              regulation,
              context
            );

      regulationValues[
        regulation.result_key
      ] = evaluated.applicable;

      details.push({
        regulation_id:
          regulation.regulation_id,
        key: regulation.result_key,
        name: regulation.name,
        applicable:
          evaluated.applicable,
        reason: evaluated.reason,
        missing_fields:
          evaluated.missing_fields || [],
        calculated_value:
          evaluated.calculated_value
      });

      calculation.push({
        engine: 'BusinessEngine',
        type: 'regulation',
        regulation_id:
          regulation.regulation_id,
        applicable:
          evaluated.applicable,
        reason: evaluated.reason,
        calculated_value:
          evaluated.calculated_value
      });
    }

    return {
      valid: true,
      regulations: regulationValues,
      details,
      calculation,
      error_code: null,
      message: null
    };
  }

  createRegulationContext(
    input,
    businessState,
    operationResult,
    validatedDates
  ) {
    const route =
      this.findRoute(operationResult.details);

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
      ticket_type: input.ticketType,
      ticket_usage_type:
        input.ticketUsageType,
      departure_status:
        input.departureStatus,
      before_use:
        businessState.before_use,
      in_valid_period:
        businessState.in_valid_period,
      expired: businessState.expired,
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
        validatedDates.requestDate,
      validated_start_date:
        validatedDates.startDate,
      validated_end_date:
        validatedDates.endDate
    };
  }

  findRoute(details) {
    if (!details || typeof details !== 'object') {
      return null;
    }

    if (
      details.route &&
      typeof details.route === 'object'
    ) {
      return details.route;
    }

    if (
      details.original_quote?.route
    ) {
      return details.original_quote.route;
    }

    for (const value of Object.values(details)) {
      const found = this.findRoute(value);

      if (found) {
        return found;
      }
    }

    return null;
  }

  evaluateRegulation(
    regulation,
    context
  ) {
    const applicable =
      this.evaluateConditionGroup(
        regulation.conditions,
        context
      );

    return {
      applicable,
      reason: applicable
        ? regulation.applicable_reason
        : regulation.not_applicable_reason,
      missing_fields: [],
      calculated_value:
        regulation.calculation
          ? this.calculateRegulationValue(
              regulation.calculation,
              context
            )
          : null
    };
  }

  evaluateConditionGroup(
    group,
    context
  ) {
    if (!group) {
      return true;
    }

    if (Array.isArray(group.all)) {
      return group.all.every(condition =>
        this.evaluateCondition(
          condition,
          context
        )
      );
    }

    if (Array.isArray(group.any)) {
      return group.any.some(condition =>
        this.evaluateCondition(
          condition,
          context
        )
      );
    }

    return false;
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

    switch (condition.operator) {
      case 'equals':
        return actual === expected;

      case 'not_equals':
        return actual !== expected;

      case 'greater_than':
        return Number(actual) >
          Number(expected);

      case 'greater_than_or_equal':
        return Number(actual) >=
          Number(expected);

      case 'less_than':
        return Number(actual) <
          Number(expected);

      case 'less_than_or_equal':
        return Number(actual) <=
          Number(expected);

      case 'includes':
        return Array.isArray(expected) &&
          expected.includes(actual);

      case 'date_on_or_after':
        return this.dateValue(actual) >=
          this.dateValue(expected);

      case 'date_on_or_before':
        return this.dateValue(actual) <=
          this.dateValue(expected);

      default:
        throw this.error(
          ErrorCodes.UNSUPPORTED_OPERATION,
          `未対応の営業規則演算子です: ${
            condition.operator
          }`,
          { condition }
        );
    }
  }

  calculateRegulationValue(
    calculation,
    context
  ) {
    if (
      calculation.type !==
      'valid_days_by_business_km'
    ) {
      return null;
    }

    const km = Number(context.business_km);

    if (
      km <= calculation.same_day_max_km
    ) {
      return {
        valid_days: 1,
        required_end_date:
          context.ticket_start_date
      };
    }

    const additionalDistance =
      Math.max(
        0,
        km - calculation.base_max_km
      );

    const additionalDays =
      Math.ceil(
        additionalDistance /
        calculation.additional_km_unit
      ) *
      calculation.additional_days_per_unit;

    return {
      valid_days:
        calculation.base_days +
        additionalDays,
      required_end_date: null
    };
  }

  dateValue(value) {
    const date = new Date(
      `${value}T00:00:00`
    );

    return date.getTime();
  }

  executeOperation(
    input,
    rule,
    state
  ) {
    switch (input.operation) {
      case BusinessOperation.OVERRUN:
        return this.executeOverrun(input);

      case BusinessOperation.STOP_CALCULATION:
        return this.executeFareSection(
          input,
          rule,
          '打切計算'
        );

      case BusinessOperation
        .SEPARATE_CALCULATION:
        return this.executeFareSection(
          input,
          rule,
          '別途計算'
        );

      case BusinessOperation.SECTION_CHANGE:
        return this.executeChange(
          input,
          rule,
          '区間変更'
        );

      case BusinessOperation.ROUTE_CHANGE:
        return this.executeChange(
          input,
          rule,
          '経路変更'
        );

      case BusinessOperation.ABANDONMENT:
        return this.executeAbandonment(
          input,
          state
        );

      default:
        throw this.error(
          ErrorCodes.INVALID_OPERATION,
          `未対応の営業実務です: ${
            input.operation
          }`
        );
    }
  }

  executeOverrun(input) {
    const detail =
      this.changeEngine.calculate({
        type: 'overtravel',
        passenger:
          input.passenger || 'adult',
        original:
          this.originalJourney(input),
        actualGoal:
          input.actualGoal ||
          input.changed?.goal ||
          input.goal,
        changed:
          input.changed || {
            goal:
              input.actualGoal ||
              input.goal,
            via:
              input.changedVia || []
          }
      });

    const original =
      Number(
        detail.original_fare_yen || 0
      );
    const additional =
      Number(detail.shortage_yen || 0);

    return {
      fare: {
        original,
        additional,
        refund: 0,
        total: original + additional
      },
      calculation: [
        {
          engine: 'ChangeEngine',
          operation: 'overtravel',
          amount_yen: additional,
          reason:
            detail.calculation_reason
        }
      ],
      details: detail
    };
  }

  executeFareSection(
    input,
    rule,
    label
  ) {
    const section =
      input.section || {
        start:
          input.currentStation ||
          input.start,
        goal:
          input.actualGoal ||
          input.goal,
        via: input.via || []
      };

    const quote = this.quoteJourney(
      section,
      input.passenger || 'adult'
    );

    const amount =
      Number(
        quote.fare.amount_yen || 0
      );

    const original =
      Number(
        input.originalFareYen || 0
      );

    return {
      fare: {
        original,
        additional: amount,
        refund: 0,
        total: original + amount
      },
      calculation: [
        {
          engine: 'RouteEngine',
          operation:
            rule.calculation_type,
          section,
          business_km:
            quote.route.business_km
        },
        {
          engine: 'FareEngine',
          operation:
            rule.calculation_type,
          amount_yen: amount,
          reason: label
        }
      ],
      details: quote
    };
  }

  executeChange(
    input,
    rule,
    label
  ) {
    const detail =
      this.changeEngine.calculate({
        type: rule.change_type,
        usageState:
          input.usageState ||
          (
            input.departureStatus ===
            DepartureStatus
              .BEFORE_DEPARTURE
              ? 'before_use'
              : 'after_use'
          ),
        passenger:
          input.passenger || 'adult',
        currentStation:
          input.currentStation,
        original:
          this.originalJourney(input),
        changed:
          input.changed || {
            start:
              input.changedStart ||
              input.start,
            goal:
              input.changedGoal ||
              input.goal,
            via:
              input.changedVia || []
          }
      });

    const original =
      Number(
        detail.original_fare_yen || 0
      );
    const additional =
      Number(detail.shortage_yen || 0);
    const refund =
      Number(
        detail.refundable_amount_yen || 0
      );

    return {
      fare: {
        original,
        additional,
        refund,
        total:
          original +
          additional -
          refund
      },
      calculation: [
        {
          engine: 'ChangeEngine',
          operation: rule.change_type,
          label,
          additional_yen: additional,
          refund_yen: refund,
          reason:
            detail.calculation_reason ||
            detail.reason
        }
      ],
      details: detail
    };
  }

  executeAbandonment(
    input,
    state
  ) {
    const quote = this.quoteJourney(
      this.originalJourney(input),
      input.passenger || 'adult'
    );

    const original =
      Number(
        input.originalFareYen ??
        quote.fare.amount_yen
      );

    const detail =
      this.refundEngine.calculate({
        ticketType: input.ticketType,
        status:
          RefundStatus
            .JOURNEY_ABANDONED,
        amountYen: original,
        unusedAmountYen:
          Number(
            input.unusedAmountYen || 0
          ),
        remainingBusinessKm:
          input.remainingBusinessKm
      });

    const refund =
      Number(
        detail.refund_after_fee_yen || 0
      );

    return {
      fare: {
        original,
        additional: 0,
        refund,
        total: original - refund
      },
      calculation: [
        {
          engine: 'RefundEngine',
          operation: 'abandonment',
          refundable:
            detail.refundable,
          refund_yen: refund,
          reason:
            detail
              .non_refundable_reason ||
            detail.reason
        }
      ],
      details: {
        refund: detail,
        original_quote: quote,
        business_state: state
      }
    };
  }

  quoteJourney(journey, passenger) {
    const route =
      this.routeEngine.route(
        journey.start,
        journey.goal,
        journey.via || []
      );

    return {
      route,
      fare:
        this.fareEngine
          .ordinaryFare(
            route,
            passenger
          )
    };
  }

  originalJourney(input) {
    return input.original || {
      start: input.start,
      goal:
        input.originalGoal ||
        input.goal,
      via: input.via || []
    };
  }

  failure(
    operation,
    errorCode,
    message,
    details = {}
  ) {
    return {
      success: false,
      operation: operation || null,
      business_state: null,
      regulations: {},
      regulation_details: [],
      fare: {
        original: 0,
        additional: 0,
        refund: 0,
        total: 0
      },
      calculation: [],
      details,
      error_code: errorCode,
      message
    };
  }

  error(
    code,
    message,
    details = {}
  ) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    return error;
  }
}
