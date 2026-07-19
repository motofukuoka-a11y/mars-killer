import { ErrorCodes } from '../shared/ErrorCodes.js';
import {
  PassengerType
} from '../shared/Constants.js';
import {
  isFiniteNumber
} from '../shared/Utils.js';

/**
 * 入力検証のみを担当する。
 */
export default class ValidationEngine {

  validate(input = {}) {
    const type = input.type || 'quote';

    switch (type) {
      case 'quote':
        return this.validateQuote(input);
      case 'discount':
        return this.validateDiscount(input);
      case 'refund':
        return this.validateRefund(input);
      case 'rules':
        return this.validateRules(input);
      default:
        return this.invalid(
          ErrorCodes.UNSUPPORTED_OPERATION,
          `未対応の検証種別です: ${type}`
        );
    }
  }

  validateQuote(input) {
    const required = this.requiredFields(
      input,
      ['start', 'goal']
    );

    if (!required.valid) {
      return required;
    }

    if (input.start === input.goal) {
      return this.invalid(
        ErrorCodes.INVALID_STATION,
        '発駅と着駅が同一です。',
        {
          start: input.start,
          goal: input.goal
        }
      );
    }

    if (
      input.passenger != null &&
      !Object.values(PassengerType)
        .includes(input.passenger)
    ) {
      return this.invalid(
        ErrorCodes.INVALID_PASSENGER_TYPE,
        `旅客区分が不正です: ${input.passenger}`
      );
    }

    return this.valid();
  }

  validateDiscount(input) {
    const required = this.requiredFields(
      input,
      [
        'discountType',
        'beforeDiscountYen'
      ]
    );

    if (!required.valid) {
      return required;
    }

    if (
      !isFiniteNumber(
        input.beforeDiscountYen
      ) ||
      Number(input.beforeDiscountYen) < 0
    ) {
      return this.invalid(
        ErrorCodes.INVALID_NUMBER,
        '割引前金額が不正です。',
        {
          beforeDiscountYen:
            input.beforeDiscountYen
        }
      );
    }

    if (
      input.businessKm != null &&
      (
        !isFiniteNumber(input.businessKm) ||
        Number(input.businessKm) < 0
      )
    ) {
      return this.invalid(
        ErrorCodes.DISTANCE,
        '営業キロが不正です。',
        { businessKm: input.businessKm }
      );
    }

    return this.valid();
  }

  validateRefund(input) {
    const required = this.requiredFields(
      input,
      [
        'ticketType',
        'status',
        'amountYen'
      ]
    );

    if (!required.valid) {
      return required;
    }

    if (!isFiniteNumber(input.amountYen)) {
      return this.invalid(
        ErrorCodes.INVALID_NUMBER,
        '払戻対象額が不正です。',
        { amountYen: input.amountYen }
      );
    }

    return this.valid();
  }

  validateRules(input) {
    if (!Array.isArray(input.rules)) {
      return this.invalid(
        ErrorCodes.JSON_MISSING,
        '規則JSONが不足しています。',
        { field: 'rules' }
      );
    }

    if (input.rules.length === 0) {
      return this.invalid(
        ErrorCodes.RULE_NOT_FOUND,
        '規則JSONにルールがありません。'
      );
    }

    return this.valid();
  }

  requiredFields(input, fields) {
    for (const field of fields) {
      const value = input[field];

      if (
        value == null ||
        (
          typeof value === 'string' &&
          value.trim() === ''
        )
      ) {
        return this.invalid(
          ErrorCodes.REQUIRED_FIELD,
          `${field}は必須です。`,
          { field }
        );
      }
    }

    return this.valid();
  }

  valid(details = {}) {
    return {
      valid: true,
      error_code: null,
      message: null,
      details
    };
  }

  invalid(
    errorCode,
    message,
    details = {}
  ) {
    return {
      valid: false,
      error_code: errorCode,
      message,
      details
    };
  }
}
