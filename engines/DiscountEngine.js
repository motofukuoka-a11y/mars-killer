import { ErrorCodes } from '../shared/ErrorCodes.js';
import {
  DistanceComparison
} from '../shared/Constants.js';
import {
  compareBusinessKm,
  toFiniteNumber
} from '../shared/Utils.js';

/**
 * 学割・障害者割引・社員購入券・家族購入券の
 * 適用判定と割引額計算を担当する。
 *
 * 割引率、距離条件、対象項目、丸め方式は
 * discount_rules.jsonから取得する。
 */
export default class DiscountEngine {

  constructor(rules = [], validationEngine = null) {
    this.rules = rules;
    this.validationEngine = validationEngine;
  }

  calculate(options = {}) {
    const validation = this.validationEngine
      ? this.validationEngine.validate({
          type: 'discount',
          ...options
        })
      : { valid: true };

    if (!validation.valid) {
      return {
        applicable: false,
        discount_type:
          options.discountType || null,
        before_discount_yen:
          Number(options.beforeDiscountYen || 0),
        discount_yen: 0,
        after_discount_yen:
          Number(options.beforeDiscountYen || 0),
        reason: validation.message,
        error_code: validation.error_code,
        calculation_basis: validation.details
      };
    }

    const rule = this.findRule(
      options.discountType
    );

    if (!rule) {
      return this.notApplicable(
        options,
        ErrorCodes.RULE_NOT_FOUND,
        '割引ルールがありません。'
      );
    }

    if (
      rule.enabled === false ||
      rule.rate == null
    ) {
      return this.notApplicable(
        options,
        ErrorCodes.RULE_NOT_FOUND,
        rule.unavailable_reason ||
          '割引率または適用条件が未設定です。',
        rule
      );
    }

    const condition = this.checkConditions(
      rule,
      options
    );

    if (!condition.applicable) {
      return this.notApplicable(
        options,
        condition.error_code,
        condition.reason,
        rule
      );
    }

    const before = toFiniteNumber(
      options.beforeDiscountYen,
      'beforeDiscountYen'
    );

    const after = this.applyRounding(
      before,
      Number(rule.rate),
      rule.rounding
    );

    return {
      applicable: true,
      discount_type: rule.discount_type,
      discount_id: rule.discount_id,
      before_discount_yen: before,
      discount_yen: before - after,
      after_discount_yen: after,
      reason: rule.name,
      error_code: null,
      calculation_basis: {
        discount_id: rule.discount_id,
        rate: rule.rate,
        rounding: rule.rounding,
        distance_condition:
          rule.distance_condition,
        conditions: rule.conditions
      }
    };
  }

  applyToComponents({
    discountType,
    components,
    businessKm,
    passenger
  }) {
    const rule = this.findRule(discountType);

    if (!rule) {
      return {
        applicable: false,
        discount_type: discountType,
        discount_yen: 0,
        applied: [],
        error_code: ErrorCodes.RULE_NOT_FOUND,
        reason: '割引ルールがありません。'
      };
    }

    const applied = [];
    let discountTotal = 0;

    for (const component of components) {
      if (
        !rule.targets.includes(
          component.component
        ) ||
        !component.discountable
      ) {
        continue;
      }

      const result = this.calculate({
        discountType,
        beforeDiscountYen:
          component.amount_yen,
        businessKm,
        passenger,
        component:
          component.component
      });

      if (!result.applicable) {
        return {
          ...result,
          applied
        };
      }

      component.pre_discount_yen =
        result.before_discount_yen;
      component.amount_yen =
        result.after_discount_yen;

      discountTotal += result.discount_yen;

      applied.push({
        component: component.component,
        before:
          result.before_discount_yen,
        after:
          result.after_discount_yen,
        discount_yen:
          result.discount_yen
      });
    }

    return {
      applicable: applied.length > 0,
      discount_type: rule.discount_type,
      discount_id: rule.discount_id,
      discount_yen: discountTotal,
      applied,
      error_code:
        applied.length > 0
          ? null
          : ErrorCodes.RULE_NOT_FOUND,
      reason:
        applied.length > 0
          ? rule.name
          : '割引対象の構成要素がありません。'
    };
  }

  findRule(discountType) {
    return this.rules.find(rule =>
      rule.discount_type === discountType ||
      rule.discount_id === discountType
    );
  }

  checkConditions(rule, options) {
    const condition =
      rule.distance_condition;

    if (!condition) {
      return { applicable: true };
    }

    if (
      options.businessKm == null
    ) {
      return {
        applicable: false,
        error_code: ErrorCodes.REQUIRED_FIELD,
        reason:
          '割引判定に営業キロが必要です。'
      };
    }

    const comparisonMap = {
      'business_km>100': {
        threshold: 100,
        comparison:
          DistanceComparison.GREATER_THAN
      },
      'business_km>=101': {
        threshold: 101,
        comparison:
          DistanceComparison
            .GREATER_THAN_OR_EQUAL
      }
    };

    const setting =
      comparisonMap[condition];

    if (!setting) {
      return {
        applicable: false,
        error_code:
          ErrorCodes.UNSUPPORTED_OPERATION,
        reason:
          `未対応の距離条件です: ${condition}`
      };
    }

    const applicable = compareBusinessKm(
      options.businessKm,
      setting.threshold,
      setting.comparison
    );

    return applicable
      ? { applicable: true }
      : {
          applicable: false,
          error_code: ErrorCodes.DISTANCE,
          reason:
            rule.distance_error_message ||
            '割引の営業キロ条件を満たしません。'
        };
  }

  applyRounding(
    before,
    rate,
    rounding
  ) {
    const discounted = before * (1 - rate);

    switch (rounding) {
      case 'discounted_fare_down_to_10':
        return Math.floor(
          discounted / 10
        ) * 10;

      case 'half_5_yen_fraction_discard': {
        const half = before * rate;
        const discount =
          Math.floor(half / 10) * 10;
        return before - discount;
      }

      case 'floor_to_10':
        return Math.floor(
          discounted / 10
        ) * 10;

      case 'none':
      case null:
      case undefined:
        return Math.floor(discounted);

      default:
        return Math.floor(discounted);
    }
  }

  notApplicable(
    options,
    errorCode,
    reason,
    rule = null
  ) {
    const before = Number(
      options.beforeDiscountYen || 0
    );

    return {
      applicable: false,
      discount_type:
        rule?.discount_type ||
        options.discountType ||
        null,
      discount_id:
        rule?.discount_id || null,
      before_discount_yen: before,
      discount_yen: 0,
      after_discount_yen: before,
      reason,
      error_code: errorCode,
      calculation_basis: rule
        ? {
            discount_id:
              rule.discount_id,
            distance_condition:
              rule.distance_condition,
            conditions:
              rule.conditions
          }
        : null
    };
  }
}
