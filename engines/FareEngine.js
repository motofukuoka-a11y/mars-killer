/**
 * FareEngine
 *
 * 普通運賃・加算運賃・運賃割引時の端数処理を担当する。
 */
export default class FareEngine {

  constructor(ordinaryFares, specialFares) {
    this.ordinaryFares = ordinaryFares;
    this.specialFares = specialFares;
  }

  /**
   * 普通運賃を計算する。
   */
  ordinaryFare(route, passenger) {

    let table;
    let km;

    if (route.route_category === 'trunk') {

      table = 'trunk';
      km = Math.ceil(route.business_km - 1e-12);

    } else if (route.route_category === 'local') {

      table = 'local';
      km = Math.ceil(route.business_km - 1e-12);

    } else if (
      Math.ceil(route.business_km - 1e-12) <= 10
    ) {

      table = 'local';
      km = Math.ceil(route.business_km - 1e-12);

    } else {

      table = 'trunk';
      km = Math.ceil(
        route.fare_calculation_km - 1e-12
      );

    }

    const row = this.ordinaryFares.find(item =>
      item.line_category === table &&
      Number(item.min_km) <= km &&
      km <= Number(item.max_km)
    );

    if (!row) {
      throw new Error(
        `普通運賃表に ${table}/${km}km がありません`
      );
    }

    return {
      component: 'ordinary_fare',
      name: '普通運賃',
      table,
      lookup_km: km,
      amount_yen: Number(
        passenger === 'adult'
          ? row.adult_one_way_fare_yen
          : row.child_one_way_fare_yen
      ),
      discountable: true
    };
  }

  /**
   * 特定区間を通過した際の加算運賃を作成する。
   */
  specialComponents(route, passenger) {

    const traversed = new Set(
      route.segments.map(segment =>
        [
          segment.from_station_id,
          segment.to_station_id
        ]
          .sort()
          .join('|')
      )
    );

    const result = [];

    for (const rule of this.specialFares) {

      const key = [
        rule.trigger_segment.station_a,
        rule.trigger_segment.station_b
      ]
        .sort()
        .join('|');

      if (!traversed.has(key)) {
        continue;
      }

      result.push({
        component: 'additional_fare',
        rule_id: rule.special_rule_id,
        name: rule.name,
        amount_yen: Number(
          passenger === 'adult'
            ? rule.adult_yen
            : rule.child_yen
        ),
        discountable: true
      });
    }

    return result;
  }

  /**
   * 割引後金額を計算する。
   */
  discounted(amount, rate, rounding) {

    if (
      [
        'discounted_fare_down_to_10',
        'half_5_yen_fraction_discard'
      ].includes(rounding)
    ) {
      return Math.floor(
        amount * (1 - rate) / 10
      ) * 10;
    }

    throw new Error(
      `未対応端数処理: ${rounding}`
    );
  }
}
