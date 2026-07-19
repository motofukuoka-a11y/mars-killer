/**
 * 営業実務共通定数
 */

export const RefundStatus = Object.freeze({
  BEFORE_TRIP: 'before_trip',
  AFTER_TRIP_START: 'after_trip_start',
  BEFORE_TRAIN_DEPARTURE: 'before_train_departure',
  AFTER_TRAIN_DEPARTURE: 'after_train_departure',
  AFTER_USE_START: 'after_use_start',
  JOURNEY_ABANDONED: 'journey_abandoned'
});

export const PassengerType = Object.freeze({
  ADULT: 'adult',
  CHILD: 'child'
});

export const TicketType = Object.freeze({
  ORDINARY: 'ordinary',
  LIMITED_EXPRESS: 'limited_express',
  RESERVED_SEAT: 'reserved_seat',
  GREEN: 'green'
});

export const DiscountType = Object.freeze({
  STUDENT: 'student',
  DISABILITY_TYPE1_SOLO:
    'disability_type1_solo',
  DISABILITY_TYPE1_CAREGIVER:
    'disability_type1_caregiver',
  DISABILITY_TYPE2_SOLO:
    'disability_type2_solo',
  EMPLOYEE_PURCHASE:
    'employee_purchase',
  FAMILY_PURCHASE:
    'family_purchase'
});

export const SeasonType = Object.freeze({
  NORMAL: 'normal',
  PEAK: 'peak',
  BUSY: 'busy',
  OFF_PEAK: 'off_peak'
});

export const ChargeType = Object.freeze({
  LIMITED_EXPRESS_RESERVED:
    'limited_express_reserved',
  LIMITED_EXPRESS_UNRESERVED:
    'limited_express_unreserved',
  ORDINARY_EXPRESS:
    'ordinary_express',
  RESERVED_SEAT:
    'reserved_seat',
  GREEN:
    'green'
});

export const DistanceComparison = Object.freeze({
  GREATER_THAN: 'greater_than',
  GREATER_THAN_OR_EQUAL:
    'greater_than_or_equal',
  LESS_THAN: 'less_than',
  LESS_THAN_OR_EQUAL:
    'less_than_or_equal',
  EQUAL: 'equal'
});
