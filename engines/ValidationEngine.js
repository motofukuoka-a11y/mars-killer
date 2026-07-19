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
      case 'business':
        return this.validateBusiness(input);
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

  validateBusiness(input) {
    const required = this.requiredFields(input, [
      'requestDate', 'ticketType', 'ticketUsageType',
      'departureStatus', 'operation'
    ]);
    if (!required.valid) {
      const codes = {
        requestDate: ErrorCodes.INVALID_DATE,
        operation: ErrorCodes.INVALID_OPERATION,
        departureStatus: ErrorCodes.INVALID_DEPARTURE_STATUS
      };
      return this.invalid(codes[required.details.field] || required.error_code, required.message, required.details);
    }
    const requestDate = this.parseDate(input.requestDate);
    if (!requestDate) return this.invalid(ErrorCodes.INVALID_DATE, '申出日が不正です。');
    const usageRule = input.businessRules?.ticket_usage_types?.[input.ticketUsageType];
    if (!usageRule) return this.invalid(ErrorCodes.INVALID_TICKET_TYPE, `きっぷ利用形態が不正です: ${input.ticketUsageType}`);
    if (usageRule.requires_start_date && !input.ticketStartDate) return this.invalid(ErrorCodes.INVALID_PERIOD, '有効開始日が必要です。');
    if (usageRule.requires_end_date && !input.ticketEndDate) return this.invalid(ErrorCodes.INVALID_PERIOD, '有効終了日が必要です。');
    const startDate = input.ticketStartDate ? this.parseDate(input.ticketStartDate) : requestDate;
    const endDate = input.ticketEndDate ? this.parseDate(input.ticketEndDate) : startDate;
    if (!startDate || !endDate) return this.invalid(ErrorCodes.INVALID_DATE, '有効期間の日付が不正です。');
    if (startDate > endDate) return this.invalid(ErrorCodes.INVALID_PERIOD, '有効開始日が有効終了日より後です。');
    if (!input.businessRules?.operations?.[input.operation]) return this.invalid(ErrorCodes.INVALID_OPERATION, `営業実務が不正です: ${input.operation}`);
    if (!input.businessRules?.departure_statuses?.includes(input.departureStatus)) return this.invalid(ErrorCodes.INVALID_DEPARTURE_STATUS, `列車状態が不正です: ${input.departureStatus}`);
    return this.valid({ requestDate, startDate, endDate });
  }

  parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
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
