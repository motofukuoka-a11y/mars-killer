import RouteEngine from './engines/RouteEngine.js';
import FareEngine from './engines/FareEngine.js';
import ChargeEngine from './engines/ChargeEngine.js';

export class SalesEngine {

  constructor(data) {
    Object.assign(this, data);

    this.routeEngine = new RouteEngine(
      this.stations,
      this.segments
    );

    this.fareEngine = new FareEngine(
      this.ordinaryFares,
      this.specialFares
    );

    this.chargeEngine = new ChargeEngine(
      this.chargeTables,
      this.productCharges
    );
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
      stations,
      segments,
      ordinaryFares,
      chargeTables,
      productCharges,
      discountRules,
      refundRules,
      specialFares
    ] = await Promise.all([
      get('distance/stations.json'),
      get('distance/segments.json'),
      get('fare/ordinary_fares.json'),
      get('rules/distance_charge_tables.json'),
      get('rules/train_product_charges.json'),
      get('rules/discount_rules.json'),
      get('rules/refund_rules.json'),
      get('rules/special_fares.json')
    ]);

    return new SalesEngine({
      stations,
      segments,
      ordinaryFares,
      chargeTables,
      productCharges,
      discountRules,
      refundRules,
      specialFares
    });
  }

  /**
   * 駅名または駅IDを駅IDへ変換する。
   *
   * 既存コードとの互換性を保つため、SalesEngine側にも
   * 公開メソッドとして残している。
   */
  resolveStation(value) {
    return this.routeEngine.resolveStation(value);
  }

  /**
   * 指定した2駅間の営業キロ最短経路を探索する。
   *
   * 既存コードとの互換性を保つため、SalesEngine側にも
   * 公開メソッドとして残している。
   */
  shortestLeg(start, goal) {
    return this.routeEngine.shortestLeg(start, goal);
  }

  /**
   * 発駅、着駅、経由駅から経路を作成する。
   */
  route(start, goal, via = []) {
    return this.routeEngine.route(
      start,
      goal,
      via
    );
  }

  /**
   * 経路区間を集計する。
   *
   * 外部コードから直接呼ばれる可能性を考慮し、
   * RouteEngineへの委譲メソッドとして残している。
   */
  summarizeRoute(startId, goalId, legs, via = []) {
    return this.routeEngine.summarizeRoute(
      startId,
      goalId,
      legs,
      via
    );
  }

  /**
   * 普通運賃を計算する。
   *
   * 既存コードとの互換性を保つため、SalesEngine側にも
   * 公開メソッドとして残している。
   */
  ordinaryFare(route, passenger) {
    return this.fareEngine.ordinaryFare(
      route,
      passenger
    );
  }

  /**
   * 特定区間を通過した際の加算運賃を作成する。
   *
   * 既存コードとの互換性を保つため、SalesEngine側にも
   * 公開メソッドとして残している。
   */
  specialComponents(route, passenger) {
    return this.fareEngine.specialComponents(
      route,
      passenger
    );
  }

  /**
   * 営業キロに応じた料金を計算する。
   *
   * 既存コードとの互換性を保つため、SalesEngine側にも
   * 公開メソッドとして残している。
   */
  distanceCharge(tableId, km, passenger) {
    return this.chargeEngine.distanceCharge(
      tableId,
      km,
      passenger
    );
  }

  /**
   * 料金表IDから画面表示名を取得する。
   *
   * 既存コードとの互換性を保つため、SalesEngine側にも
   * 公開メソッドとして残している。
   */
  tableName(id) {
    return this.chargeEngine.tableName(id);
  }

  /**
   * 商品ごとの固定料金を取得する。
   *
   * 既存コードとの互換性を保つため、SalesEngine側にも
   * 公開メソッドとして残している。
   */
  productCharge(productId, travelDate, passenger) {
    return this.chargeEngine.productCharge(
      productId,
      travelDate,
      passenger
    );
  }

  /**
   * 割引後金額を計算する。
   *
   * 既存コードとの互換性を保つため、SalesEngine側にも
   * 公開メソッドとして残している。
   */
  discounted(amount, rate, rounding) {
    return this.fareEngine.discounted(
      amount,
      rate,
      rounding
    );
  }

  /**
   * 発売額を計算する。
   */
  quote({
    start,
    goal,
    via = [],
    passenger = 'adult',
    travelDate = '2026-07-18',
    chargeTableId = null,
    productId = null,
    discountId = null
  }) {

    if (!['adult', 'child'].includes(passenger)) {
      throw new Error('旅客区分が不正です');
    }

    const route = this.route(
      start,
      goal,
      via
    );

    const components = [
      this.ordinaryFare(route, passenger),
      ...this.specialComponents(route, passenger)
    ];

    if (chargeTableId) {
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

      const rule = this.discountRules.find(
        item => item.discount_id === discountId
      );

      if (!rule) {
        throw new Error(
          `割引ルールなし: ${discountId}`
        );
      }

      if (rule.rate == null) {
        throw new Error(
          `${discountId} は商品別または設定依存です`
        );
      }

      if (
        rule.distance_condition === 'business_km>100' &&
        !(route.business_km > 100)
      ) {
        throw new Error(
          '割引の距離条件を満たしません'
        );
      }

      const applied = [];

      for (const component of components) {

        if (
          !rule.targets.includes(component.component) ||
          !component.discountable
        ) {
          continue;
        }

        const before = component.amount_yen;

        component.pre_discount_yen = before;

        component.amount_yen = this.discounted(
          before,
          Number(rule.rate),
          rule.rounding
        );

        applied.push({
          component: component.component,
          before,
          after: component.amount_yen
        });
      }

      discountDetail = {
        discount_id: discountId,
        applied
      };
    }

    const total = components.reduce(
      (sum, component) =>
        sum + component.amount_yen,
      0
    );

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
      warnings: [
        '自動経路は営業キロ最短です。経路特例・選択乗車等がある場合は経由駅を指定してください。',
        '列車の停車駅・運転日・空席は時刻表または発売画面で別途確認してください。'
      ]
    };
  }

  /**
   * 払戻手数料を計算する。
   */
  refundFee(ruleId, price) {

    const rule = this.refundRules.find(
      item => item.rule_id === ruleId
    );

    if (!rule) {
      throw new Error(ruleId);
    }

    if (rule.mode === 'fixed') {
      return Number(rule.value);
    }

    return Math.max(
      Math.floor(price * Number(rule.value)),
      Number(rule.minimum)
    );
  }
}
