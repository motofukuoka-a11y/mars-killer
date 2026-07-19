import {DiscountType} from '../shared/Constants.js';
import {AGE_CATEGORIES, DISCOUNT_TYPES} from './PassengerModel.js';
import {buildSectionServices} from './SectionServiceManager.js';

const ZERO = 0;
const ONE = 1;
const ROUND_TRIP_FACTOR = 2;

const FARE_COMPONENTS = new Set([
  'ordinary_fare',
  'special_fare',
  'additional_fare'
]);

const SEAT_TYPE_MAP = Object.freeze({
  non_reserved: 'unreserved',
  reserved: 'reserved',
  green: 'green'
});

const DISCOUNT_TYPE_MAP = Object.freeze({
  [DISCOUNT_TYPES.STUDENT]: DiscountType.STUDENT,
  [DISCOUNT_TYPES.DISABILITY_TYPE1]: DiscountType.DISABILITY_TYPE1_SOLO,
  [DISCOUNT_TYPES.DISABILITY_TYPE2]: DiscountType.DISABILITY_TYPE2_SOLO,
  [DISCOUNT_TYPES.ASSISTANT_TYPE1]: DiscountType.DISABILITY_TYPE1_CAREGIVER
});

const cloneComponent = component => ({...component});
const sumAmounts = rows => rows.reduce(
  (total, row) => total + Number(row.amount_yen || ZERO),
  ZERO
);

/**
 * Version 5.1の旅客グループ別計算を統合する。
 * 既存Engineの単価APIは変更せず、結果を人数単位へ展開する。
 */
export default class PassengerCalculationService {
  constructor({salesEngine}) {
    this.salesEngine = salesEngine;
  }

  calculate({route, passengers = [], sectionServices = [], travelDate, tripType = 'one_way'}) {
    const normalizedServices = buildSectionServices(
      route?.distance?.sections || [],
      sectionServices
    );
    const tripFactor = tripType === 'round_trip'
      ? ROUND_TRIP_FACTOR
      : ONE;
    const warnings = [];
    const passengerRows = passengers.map(passenger =>
      this.calculatePassengerGroup({
        route,
        passenger,
        sectionServices: normalizedServices,
        travelDate,
        tripFactor,
        warnings
      })
    );

    const fareTotal = passengerRows.reduce(
      (sum, row) => sum + row.fare.subtotal,
      ZERO
    );
    const chargeTotal = passengerRows.reduce(
      (sum, row) => sum + row.charges.subtotal,
      ZERO
    );
    const discountTotal = passengerRows.reduce(
      (sum, row) => sum + row.discount.subtotal_discount,
      ZERO
    );
    const extraChargeTotal = passengerRows.reduce(
      (sum, row) => sum + row.extra_charge.subtotal,
      ZERO
    );
    const total = passengerRows.reduce(
      (sum, row) => sum + row.subtotal,
      ZERO
    );

    return {
      passengers: passengerRows,
      fare: {
        passengers: passengerRows.map(row => ({
          passenger_group_id: row.passenger_group_id,
          count: row.count,
          unit_fare: row.fare.unit_fare,
          subtotal: row.fare.subtotal,
          discount_amount: row.discount.subtotal_discount,
          final_fare: row.fare.subtotal - row.discount.subtotal_discount
        })),
        fare_total: fareTotal
      },
      charges: {
        passengers: passengerRows.map(row => ({
          passenger_group_id: row.passenger_group_id,
          charge_total: row.charges.subtotal
        })),
        sections: passengerRows.flatMap(row => row.charges.sections),
        charge_total: chargeTotal
      },
      discounts: {
        passengers: passengerRows.map(row => ({
          passenger_group_id: row.passenger_group_id,
          discount_type: row.discount.discount_type,
          discount_name: row.discount.discount_name,
          unit_discount: row.discount.unit_discount,
          subtotal_discount: row.discount.subtotal_discount
        })),
        discount_total: discountTotal
      },
      totals: {
        ordinary_fare_total_yen: fareTotal,
        charge_total_yen: chargeTotal,
        discount_total_yen: discountTotal,
        extra_charge_total_yen: extraChargeTotal,
        total_yen: total
      },
      section_services: normalizedServices,
      warnings: [...new Set(warnings)]
    };
  }

  calculatePassengerGroup({route, passenger, sectionServices, travelDate, tripFactor, warnings}) {
    const count = Number(passenger.count || ZERO);
    const enginePassenger = passenger.age_category === AGE_CATEGORIES.CHILD
      ? 'child'
      : 'adult';

    const fareComponents = [
      this.salesEngine.ordinaryFare(route, enginePassenger),
      ...this.salesEngine.specialComponents(route, enginePassenger)
    ].map(cloneComponent);
    const unitFare = sumAmounts(fareComponents);

    const chargeResult = this.calculateCharges({
      route,
      passenger,
      enginePassenger,
      count,
      tripFactor,
      sectionServices,
      travelDate,
      warnings
    });

    const discountResult = this.calculateDiscount({
      route,
      passenger,
      fareComponents,
      chargeComponents: chargeResult.unit_components,
      tripFactor,
      warnings
    });

    const unitDiscount = discountResult.unit_discount;
    const unitExtraCharge = ZERO;
    const unitSubtotal = unitFare + chargeResult.unit_charge - unitDiscount + unitExtraCharge;
    const subtotal = unitSubtotal * count * tripFactor;

    return {
      passenger_group_id: passenger.passenger_group_id,
      age_category: passenger.age_category,
      discount_type: passenger.discount_type,
      count,
      trip_factor: tripFactor,
      fare: {
        unit_fare: unitFare,
        subtotal: unitFare * count * tripFactor,
        components: fareComponents
      },
      charges: {
        unit_charge: chargeResult.unit_charge,
        subtotal: chargeResult.unit_charge * count * tripFactor,
        sections: chargeResult.sections,
        components: chargeResult.unit_components
      },
      discount: {
        ...discountResult,
        subtotal_discount: unitDiscount * count * tripFactor
      },
      extra_charge: {
        unit_extra_charge: unitExtraCharge,
        subtotal: unitExtraCharge * count * tripFactor
      },
      unit_subtotal: unitSubtotal,
      subtotal,
      formula_steps: this.formulaSteps({
        route,
        passenger,
        count,
        tripFactor,
        unitFare,
        unitCharge: chargeResult.unit_charge,
        unitDiscount,
        unitExtraCharge,
        subtotal
      })
    };
  }

  calculateCharges({route, passenger, enginePassenger, count, tripFactor, sectionServices, warnings}) {
    const sectionsById = new Map(
      buildSectionServices(route?.distance?.sections || [])
        .map((service, index) => [service.section_id, route.distance.sections[index]])
    );
    const unitComponents = [];
    const sections = [];

    for (const service of sectionServices) {
      const distanceSection = sectionsById.get(service.section_id);
      const km = Number(distanceSection?.business_km || ZERO);
      let component = null;

      if (['local', 'rapid'].includes(service.train_type)) {
        component = null;
      } else if (service.train_type === 'limited_express' || service.train_type === 'shinkansen') {
        const seatType = SEAT_TYPE_MAP[service.seat_type];
        if (!seatType) {
          warnings.push(`${service.section_id}は料金計算可能な席種が未設定です。`);
        } else {
          try {
            component = this.salesEngine.limitedExpressCharge({
              km,
              passenger: enginePassenger,
              seatType,
              season: 'normal',
              network: service.train_type === 'shinkansen'
                ? 'hokkaido_shinkansen'
                : 'hokkaido_conventional'
            });
          } catch (error) {
            warnings.push(`${service.section_id}の料金を取得できません：${error.message}`);
          }
        }
      } else {
        warnings.push(`${service.section_id}の${service.train_type}料金は正式マスター未収録のため加算していません。`);
      }

      const unitCharge = Number(component?.amount_yen || ZERO);
      if (component) unitComponents.push({...component, section_id: service.section_id});
      sections.push({
        passenger_group_id: passenger.passenger_group_id,
        section_id: service.section_id,
        train_type: service.train_type,
        seat_type: service.seat_type,
        unit_charge: unitCharge,
        count,
        trip_factor: tripFactor,
        subtotal: unitCharge * count * tripFactor
      });
    }

    return {
      unit_charge: sumAmounts(unitComponents),
      unit_components: unitComponents,
      sections
    };
  }

  calculateDiscount({route, passenger, fareComponents, chargeComponents, warnings}) {
    if (passenger.discount_type === DISCOUNT_TYPES.NONE || passenger.discount_type === DISCOUNT_TYPES.ASSISTANT_NORMAL) {
      return this.noDiscount(passenger.discount_type, '割引なし');
    }

    const engineDiscountType = DISCOUNT_TYPE_MAP[passenger.discount_type];
    if (!engineDiscountType) {
      warnings.push(`${passenger.passenger_group_id}の割引は正式な規則データが未収録のため適用していません。`);
      return this.noDiscount(passenger.discount_type, '未実装');
    }

    const components = [
      ...fareComponents.map(cloneComponent),
      ...chargeComponents.map(cloneComponent)
    ];
    const result = this.salesEngine.discountEngine.applyToComponents({
      discountType: engineDiscountType,
      components,
      businessKm: route.business_km,
      passenger: passenger.age_category === AGE_CATEGORIES.CHILD ? 'child' : 'adult'
    });

    if (!result.applicable) {
      warnings.push(`${passenger.passenger_group_id}：${result.reason}`);
      return this.noDiscount(passenger.discount_type, result.reason, result.error_code);
    }

    return {
      discount_type: passenger.discount_type,
      discount_name: result.reason,
      unit_discount: Number(result.discount_yen || ZERO),
      subtotal_discount: ZERO,
      applicable: true,
      error_code: null,
      applied: result.applied || []
    };
  }

  noDiscount(discountType, reason, errorCode = null) {
    return {
      discount_type: discountType,
      discount_name: reason,
      unit_discount: ZERO,
      subtotal_discount: ZERO,
      applicable: false,
      error_code: errorCode,
      applied: []
    };
  }

  formulaSteps({route, passenger, count, tripFactor, unitFare, unitCharge, unitDiscount, unitExtraCharge, subtotal}) {
    const totals = route?.distance?.totals || {};
    return [
      {type: 'distance', label: '営業キロ', value: Number(totals.business_km ?? route.business_km ?? ZERO), unit: 'km'},
      {type: 'distance', label: '換算キロ', value: Number(totals.conversion_km ?? route.conversion_km ?? ZERO), unit: 'km'},
      {type: 'distance', label: '運賃計算キロ', value: Number(totals.fare_calculation_km ?? route.fare_calculation_km ?? ZERO), unit: 'km'},
      {type: 'fare', label: '1人あたり普通運賃', value_yen: unitFare},
      {type: 'charge', label: '1人あたり料金', value_yen: unitCharge},
      {type: 'discount', label: '1人あたり割引額', value_yen: unitDiscount},
      {type: 'extra_charge', label: '1人あたり加算額', value_yen: unitExtraCharge},
      {
        type: 'subtotal',
        label: '旅客グループ小計',
        expression: `(${unitFare} + ${unitCharge} - ${unitDiscount} + ${unitExtraCharge}) × ${count} × ${tripFactor}`,
        value_yen: subtotal,
        passenger_group_id: passenger.passenger_group_id
      }
    ];
  }
}
