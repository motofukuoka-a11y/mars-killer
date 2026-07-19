import RouteEngine from './engines/RouteEngine.js';
import FareEngine from './engines/FareEngine.js';
import ChargeEngine from './engines/ChargeEngine.js';
import ChangeEngine from './engines/ChangeEngine.js';
import RefundEngine from './engines/RefundEngine.js';
import DiscountEngine from './engines/DiscountEngine.js';
import ValidationEngine from './engines/ValidationEngine.js';
import BusinessEngine from './engines/BusinessEngine.js';
import RuleResolver from './shared/RuleResolver.js';
import {
  DiscountType
} from './shared/Constants.js';

export class SalesEngine {

  constructor(data) {
    Object.assign(this, data);

    this.validationEngine =
      new ValidationEngine();

    this.ruleResolver = new RuleResolver({
      masters: {
        business_regulation_master:
          this.businessRegulationMaster,
        station_group_master:
          this.stationGroupMaster,
        route_rule_master:
          this.routeRuleMaster,
        validity_rule_master:
          this.validityRuleMaster,
        company_master:
          this.companyMaster,
        line_master:
          this.lineMaster,
        station_master:
          this.stationMaster,
        distance_master:
          this.distanceMaster,
        fare_master:
          this.fareMaster,
        charge_master:
          this.chargeMaster
      },
      datasets: {
        legacy_lines: this.lines,
        legacy_stations: this.stations,
        legacy_segments: this.segments,
        legacy_ordinary_fares:
          this.ordinaryFares,
        legacy_special_fares:
          this.specialFares,
        legacy_charge_tables:
          this.chargeTables,
        legacy_product_charges:
          this.productCharges,
        legacy_season_adjustments:
          this.seasonAdjustments
      },
      validationEngine:
        this.validationEngine
    });

    const masterValidation =
      this.ruleResolver.validate();

    if (!masterValidation.valid) {
      const error = new Error(
        masterValidation.message
      );
      error.code =
        masterValidation.error_code;
      error.details =
        masterValidation.details;
      throw error;
    }

    this.routeEngine =
      new RouteEngine(this.ruleResolver);

    this.fareEngine =
      new FareEngine(this.ruleResolver);

    this.chargeEngine =
      new ChargeEngine(this.ruleResolver);

    this.changeEngine = new ChangeEngine(
      this.routeEngine,
      this.fareEngine,
      this.changeRules
    );

    this.refundEngine = new RefundEngine(
      this.refundRules
    );

    this.discountEngine =
      new DiscountEngine(
        this.discountRules,
        this.validationEngine
      );

    this.businessEngine = new BusinessEngine({
      routeEngine: this.routeEngine,
      fareEngine: this.fareEngine,
      chargeEngine: this.chargeEngine,
      discountEngine: this.discountEngine,
      changeEngine: this.changeEngine,
      refundEngine: this.refundEngine,
      validationEngine: this.validationEngine,
      rules: this.businessRules,
      ruleResolver: this.ruleResolver
    });
  }

  static async load(base = './data') {

    const get = async path => {
      const response = await fetch(`${base}/${path}`);

      if (!response.ok) {
        throw new Error(`${path} の読込みに失敗しました`);
      }

      return response.json();
    };

    const [
      lines,
      lines,
      stations,
      segments,
      ordinaryFares,
      chargeTables,
      productCharges,
      seasonAdjustments,
      changeRules,
      discountRules,
      refundRules,
      businessRules,
      businessRegulationMaster,
      stationGroupMaster,
      routeRuleMaster,
      validityRuleMaster,
      companyMaster,
      lineMaster,
      stationMaster,
      distanceMaster,
      fareMaster,
      chargeMaster,
      specialFares
    ] = await Promise.all([
      get('distance/lines.json'),
      get('distance/stations.json'),
      get('distance/segments.json'),
      get('fare/ordinary_fares.json'),
      get('rules/distance_charge_tables.json'),
      get('rules/train_product_charges.json'),
      get('rules/charge_season_adjustments.json'),
      get('rules/change_rules.json'),
      get('rules/discount_rules.json'),
      get('rules/refund_rules.json'),
      get('rules/business_rules.json'),
      get('master/business_regulation_master.json'),
      get('master/station_group_master.json'),
      get('master/route_rule_master.json'),
      get('master/validity_rule_master.json'),
      get('master/company_master.json'),
      get('master/line_master.json'),
      get('master/station_master.json'),
      get('master/distance_master.json'),
      get('master/fare_master.json'),
      get('master/charge_master.json'),
      get('rules/special_fares.json')
    ]);

    return new SalesEngine({
      stations,
      segments,
      ordinaryFares,
      chargeTables,
      productCharges,
      seasonAdjustments,
      changeRules,
      discountRules,
      refundRules,
      businessRules,
      businessRegulationMaster,
      stationGroupMaster,
      routeRuleMaster,
      validityRuleMaster,
      companyMaster,
      lineMaster,
      stationMaster,
      distanceMaster,
      fareMaster,
      chargeMaster,
      specialFares
    });
  }

  resolveStation(value) {
    return this.routeEngine.resolveStation(value);
  }

  shortestLeg(start, goal) {
    return this.routeEngine.shortestLeg(start, goal);
  }

  route(start, goal, via = []) {
    return this.routeEngine.route(start, goal, via);
  }

  summarizeRoute(startId, goalId, legs, via = []) {
    return this.routeEngine.summarizeRoute(
      startId,
      goalId,
      legs,
      via
    );
  }

  ordinaryFare(route, passenger) {
    return this.fareEngine.ordinaryFare(
      route,
      passenger
    );
  }

  specialComponents(route, passenger) {
    return this.fareEngine.specialComponents(
      route,
      passenger
    );
  }

  limitedExpressCharge(options) {
    return this.chargeEngine.limitedExpressCharge(options);
  }

  distanceCharge(tableId, km, passenger) {
    return this.chargeEngine.distanceCharge(
      tableId,
      km,
      passenger
    );
  }

  tableName(id) {
    return this.chargeEngine.tableName(id);
  }

  productCharge(productId, travelDate, passenger) {
    return this.chargeEngine.productCharge(
      productId,
      travelDate,
      passenger
    );
  }

  change(options) {
    return this.changeEngine.calculate(options);
  }

  /**
   * 払戻し計算を実行する。
   */
  refund(options) {
    return this.refundEngine.calculate(options);
  }

  /**
   * 割引計算を実行する。
   */
  discount(options) {
    return this.discountEngine.calculate(options);
  }

  /**
   * 入力検証を実行する。
   */
  validate(options) {
    return this.validationEngine.validate(options);
  }

  business(options) {
    return this.businessEngine.calculate(options);
  }

  discounted(amount, rate, rounding) {
    return this.fareEngine.discounted(
      amount,
      rate,
      rounding
    );
  }

  quote({
    start,
    goal,
    via = [],
    passenger = 'adult',
    travelDate = '2026-07-18',
    limitedExpress = null,
    chargeTableId = null,
    productId = null,
    discountId = null,
    change = null,
    refund = null
  }) {

    if (!['adult', 'child'].includes(passenger)) {
      throw new Error('旅客区分が不正です');
    }

    const changeDetail = change
      ? this.change({
          ...change,
          passenger,
          start,
          goal,
          via
        })
      : null;

    const route = this.route(start, goal, via);

    const components = [
      this.ordinaryFare(route, passenger),
      ...this.specialComponents(route, passenger)
    ];

    if (limitedExpress) {
      components.push(
        this.limitedExpressCharge({
          ...limitedExpress,
          km:
            limitedExpress.km ??
            route.business_km,
          passenger
        })
      );
    } else if (chargeTableId) {
      components.push(
        this.distanceCharge(
          chargeTableId,
          route.business_km,
          passenger
        )
      );
    }

    if (productId) {
      components.push(
        this.productCharge(
          productId,
          travelDate,
          passenger
        )
      );
    }

    const subtotal = components.reduce(
      (total, component) =>
        total + component.amount_yen,
      0
    );

    let discountDetail = null;

    if (discountId) {
      const discountTypeMap = {
        STUDENT: DiscountType.STUDENT,
        DISABILITY_TYPE1_SOLO:
          DiscountType.DISABILITY_TYPE1_SOLO,
        DISABILITY_TYPE1_CAREGIVER:
          DiscountType
            .DISABILITY_TYPE1_CAREGIVER,
        DISABILITY_TYPE2_SOLO:
          DiscountType.DISABILITY_TYPE2_SOLO,
        EMPLOYEE_PURCHASE_TICKET:
          DiscountType.EMPLOYEE_PURCHASE,
        FAMILY_PURCHASE_TICKET:
          DiscountType.FAMILY_PURCHASE
      };

      const discountType =
        discountTypeMap[discountId] ||
        discountId;

      discountDetail =
        this.discountEngine.applyToComponents({
          discountType,
          components,
          businessKm: route.business_km,
          passenger
        });

      if (!discountDetail.applicable) {
        throw new Error(
          discountDetail.reason
        );
      }
    }

    const total = components.reduce(
      (sum, component) =>
        sum + component.amount_yen,
      0
    );

    const refundDetail = refund
      ? this.refund({
          ...refund,
          amountYen:
            refund.amountYen ??
            this.refundTargetAmount(
              refund.ticketType,
              components
            )
        })
      : null;

    return {
      ticket_type: 'one_way',
      route,
      passenger,
      travel_date: travelDate,
      components,
      subtotal_before_discount_yen: subtotal,
      discount_yen: subtotal - total,
      discount_detail: discountDetail,
      total_yen: total,
      change: changeDetail,
      refund: refundDetail,
      warnings: [
        '自動経路は営業キロ最短です。経路特例・選択乗車等がある場合は経由駅を指定してください。',
        '列車の停車駅・運転日・空席は時刻表または発売画面で別途確認してください。'
      ]
    };
  }

  /**
   * quote()の構成要素から払戻対象額を取得する。
   * 払戻可否・手数料計算はRefundEngineのみが担当する。
   */
  refundTargetAmount(ticketType, components) {
    if (ticketType === 'ordinary') {
      return components
        .filter(component =>
          component.component === 'ordinary_fare' ||
          component.component === 'special_fare'
        )
        .reduce(
          (total, component) =>
            total + component.amount_yen,
          0
        );
    }

    if (ticketType === 'limited_express') {
      return components
        .filter(component =>
          String(component.component)
            .startsWith('limited_express')
        )
        .reduce(
          (total, component) =>
            total + component.amount_yen,
          0
        );
    }

    return 0;
  }
}
