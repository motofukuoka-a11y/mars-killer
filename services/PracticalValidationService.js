import {passengerTotals, validatePassengers} from './PassengerModel.js';
import {validateSectionServices} from './SectionServiceManager.js';

const MAX_REASONABLE_PASSENGERS = 50;
const MAX_REASONABLE_VIA_STATIONS = 8;
const MAX_REASONABLE_BUSINESS_KM = 5000;

const issue = (code, message, field = null, details = {}) => ({
  code,
  message,
  field,
  details
});

/**
 * Version 5.1の実務検索を段階別に検証する。
 * 金額計算や営業規則の採否は担当せず、入力・経路・Engine結果の整合性のみを扱う。
 */
export default class PracticalValidationService {
  validateInput({options = {}, passengers = [], sectionServices = null} = {}) {
    const errors = [];
    const warnings = [];
    const infos = [];
    const start = options.start || null;
    const goal = options.goal || null;
    const via = Array.isArray(options.via) ? options.via.filter(Boolean) : [];

    if (!start) errors.push(issue('ORIGIN_REQUIRED', '発駅を入力してください。', 'origin'));
    if (!goal) errors.push(issue('DESTINATION_REQUIRED', '着駅を入力してください。', 'destination'));
    if (start && goal && start === goal) {
      errors.push(issue('SAME_ORIGIN_DESTINATION', '発駅と着駅に同じ駅が指定されています。', 'destination'));
    }

    const chain = [start, ...via, goal].filter(Boolean);
    const duplicate = chain.find((station, index) => chain.indexOf(station) !== index);
    if (duplicate) {
      errors.push(issue('DUPLICATE_STATION', `同じ駅が複数回指定されています：${duplicate}`, 'via'));
    }
    if (via.length > MAX_REASONABLE_VIA_STATIONS) {
      warnings.push(issue('MANY_VIA_STATIONS', '経由駅が非常に多く指定されています。経由順を確認してください。', 'via', {count: via.length}));
    }

    const passengerValidation = validatePassengers(passengers);
    for (const message of passengerValidation.errors || []) {
      errors.push(issue('INVALID_PASSENGER', message, 'passengers'));
    }
    for (const message of passengerValidation.warnings || []) {
      warnings.push(issue('PASSENGER_WARNING', message, 'passengers'));
    }

    const totals = passengerTotals(passengers);
    if (totals.total_count === 0) {
      errors.push(issue('PASSENGER_REQUIRED', '大人または小児を1人以上指定してください。', 'passengers'));
    }
    if (totals.total_count > MAX_REASONABLE_PASSENGERS) {
      warnings.push(issue('MANY_PASSENGERS', '旅客人数が極端に多いため、入力内容を確認してください。', 'passengers', totals));
    }

    this.validateAssistants(passengers, errors, warnings);

    if (sectionServices) {
      const sectionValidation = validateSectionServices(sectionServices);
      for (const message of sectionValidation.errors || []) {
        errors.push(issue('INVALID_SECTION_SERVICE', message, 'section_services'));
      }
      for (const message of sectionValidation.warnings || []) {
        warnings.push(issue('SECTION_SERVICE_WARNING', message, 'section_services'));
      }
    }

    return this.result(errors, warnings, infos, totals);
  }

  validateRoute(route) {
    const errors = [];
    const warnings = [];
    const infos = [];
    const distance = route?.distance;
    const sections = distance?.sections || [];
    const totals = distance?.totals || {};

    if (!route || sections.length === 0) {
      errors.push(issue('ROUTE_NOT_FOUND', '経路を取得できませんでした。', 'route', {fatal_stage: 'RouteEngine'}));
    }
    if (!Number.isFinite(Number(totals.business_km))) {
      errors.push(issue('BUSINESS_KM_FAILED', '営業キロを取得できませんでした。', 'distance.business_km', {fatal_stage: 'FareEngine'}));
    } else if (Number(totals.business_km) < 0 || Number(totals.business_km) > MAX_REASONABLE_BUSINESS_KM) {
      warnings.push(issue('ABNORMAL_BUSINESS_KM', '営業キロが異常値の可能性があります。', 'distance.business_km', {value: totals.business_km}));
    }
    if (!Number.isFinite(Number(totals.fare_calculation_km))) {
      errors.push(issue('FARE_CALCULATION_KM_FAILED', '運賃計算キロを取得できませんでした。', 'distance.fare_calculation_km', {fatal_stage: 'FareEngine'}));
    }

    return this.result(errors, warnings, infos);
  }

  validateCalculation(calculation, passengers) {
    const errors = [];
    const warnings = [];
    const infos = [];
    const rows = calculation?.passengers || [];
    const expectedGroups = passengers.filter(row => Number(row.count || 0) > 0);

    if (rows.length !== expectedGroups.length) {
      errors.push(issue('PASSENGER_ROW_MISMATCH', '旅客人数と旅客別計算結果が一致しません。', 'passenger_rows', {
        expected_group_count: expectedGroups.length,
        actual_group_count: rows.length
      }));
    }
    if (!Number.isFinite(Number(calculation?.totals?.ordinary_fare_total_yen))) {
      errors.push(issue('FARE_FAILED', '運賃を取得できませんでした。', 'fare', {fatal_stage: 'ChargeEngine'}));
    }
    if (!Number.isFinite(Number(calculation?.totals?.charge_total_yen))) {
      errors.push(issue('CHARGE_FAILED', '料金を取得できませんでした。', 'charges', {fatal_stage: 'DiscountEngine'}));
    }

    const sum = rows.reduce((total, row) => total + Number(row.subtotal || 0), 0);
    if (sum !== Number(calculation?.totals?.total_yen || 0)) {
      errors.push(issue('TOTAL_MISMATCH', '旅客別小計と全旅客合計が一致しません。', 'totals', {
        passenger_subtotal_sum: sum,
        total_yen: calculation?.totals?.total_yen
      }));
    }

    return this.result(errors, warnings, infos);
  }

  validateAssistants(passengers, errors, warnings) {
    const countByDiscount = type => passengers
      .filter(row => row.discount_type === type)
      .reduce((sum, row) => sum + Number(row.count || 0), 0);
    const disabled1 = countByDiscount('disability_type1');
    const disabled2 = countByDiscount('disability_type2');
    const assistantNormal = countByDiscount('assistant_normal');
    const assistant1 = countByDiscount('assistant_type1');
    const assistant2 = countByDiscount('assistant_type2');
    const assistantTotal = assistantNormal + assistant1 + assistant2;

    if (assistantTotal > 0 && disabled1 + disabled2 === 0) {
      errors.push(issue('ASSISTANT_WITHOUT_DISABLED_PASSENGER', '介助者のみが指定されています。対象となる障害者を指定してください。', 'passengers'));
    }
    if (disabled1 > 0 && assistant1 === 0) {
      warnings.push(issue('TYPE1_WITHOUT_ASSISTANT', '障害者1種が指定されていますが、介助者が0人です。取扱条件を確認してください。', 'passengers'));
    }
    if (assistant1 > disabled1 || assistant2 > disabled2) {
      warnings.push(issue('TOO_MANY_ASSISTANTS', '介助者人数が対象となる障害者人数を上回っています。', 'passengers', {
        disabled_type1_count: disabled1,
        disabled_type2_count: disabled2,
        assistant_type1_count: assistant1,
        assistant_type2_count: assistant2
      }));
    }
  }

  result(errors, warnings, infos, passengerTotalsValue = null) {
    return {
      errors,
      warnings,
      infos,
      isValid: errors.length === 0,
      valid: errors.length === 0,
      passenger_totals: passengerTotalsValue
    };
  }
}
