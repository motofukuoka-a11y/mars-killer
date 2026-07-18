/**
 * ChargeEngine
 *
 * 特急料金・設備料金・商品ごとの固定料金を担当する。
 */
export default class ChargeEngine {

  static NETWORKS = Object.freeze({
    HOKKAIDO_CONVENTIONAL: 'hokkaido_conventional',
    HOKKAIDO_SHINKANSEN: 'hokkaido_shinkansen'
  });

  static SEAT_TYPES = Object.freeze({
    UNRESERVED: 'unreserved',
    RESERVED: 'reserved',
    GREEN: 'green'
  });

  static SEASONS = Object.freeze({
    NORMAL: 'normal',
    BUSY: 'busy',
    OFF_PEAK: 'off_peak'
  });

  static ERROR_CODES = Object.freeze({
    UNSUPPORTED_CHARGE_TABLE: 'UNSUPPORTED_CHARGE_TABLE',
    INVALID_ARGUMENT: 'INVALID_ARGUMENT',
    SEASON_ADJUSTMENT_NOT_FOUND:
      'SEASON_ADJUSTMENT_NOT_FOUND'
  });

  constructor(
    chargeTables,
    productCharges,
    seasonAdjustments = []
  ) {
    this.chargeTables = chargeTables;
    this.productCharges = productCharges;
    this.seasonAdjustments = seasonAdjustments;
  }

  limitedExpressCharge({
    km,
    passenger = 'adult',
    seatType = ChargeEngine.SEAT_TYPES.UNRESERVED,
    season = ChargeEngine.SEASONS.NORMAL,
    network = ChargeEngine.NETWORKS.HOKKAIDO_CONVENTIONAL
  }) {
    this.validatePassenger(passenger);
    this.validatePositiveKm(km);
    this.validateEnum(
      seatType,
      Object.values(ChargeEngine.SEAT_TYPES),
      '座席種別'
    );
    this.validateEnum(
      season,
      Object.values(ChargeEngine.SEASONS),
      'シーズン'
    );
    this.validateEnum(
      network,
      Object.values(ChargeEngine.NETWORKS),
      '路線体系'
    );

    const lookupKm = this.lookupKm(km);
    const breakdown = [];

    if (seatType === ChargeEngine.SEAT_TYPES.GREEN) {
      const baseTableId = this.resolveTableId({
        network,
        seatType: ChargeEngine.SEAT_TYPES.UNRESERVED,
        lookupKm
      });

      const greenTableId = this.resolveTableId({
        network,
        seatType: ChargeEngine.SEAT_TYPES.GREEN,
        lookupKm
      });

      breakdown.push(
        this.distanceCharge(
          baseTableId,
          lookupKm,
          passenger
        )
      );

      breakdown.push(
        this.distanceCharge(
          greenTableId,
          lookupKm,
          passenger
        )
      );
    } else {
      const tableId = this.resolveTableId({
        network,
        seatType,
        lookupKm
      });

      const baseCharge = this.distanceCharge(
        tableId,
        lookupKm,
        passenger
      );

      if (
        seatType === ChargeEngine.SEAT_TYPES.RESERVED
      ) {
        const adjustment = this.seasonAdjustment(
          network,
          season,
          passenger
        );

        baseCharge.base_amount_yen =
          baseCharge.amount_yen;
        baseCharge.season_adjustment_yen =
          adjustment;
        baseCharge.amount_yen += adjustment;
        baseCharge.season = season;
      }

      breakdown.push(baseCharge);
    }

    const amount = breakdown.reduce(
      (total, component) =>
        total + component.amount_yen,
      0
    );

    return {
      component: this.resultComponent(seatType),
      name: this.resultName(seatType),
      network,
      seat_type: seatType,
      season:
        seatType === ChargeEngine.SEAT_TYPES.RESERVED
          ? season
          : ChargeEngine.SEASONS.NORMAL,
      lookup_km: lookupKm,
      amount_yen: amount,
      discountable:
        seatType !== ChargeEngine.SEAT_TYPES.GREEN,
      breakdown
    };
  }

  distanceCharge(tableId, km, passenger) {
    this.validatePassenger(passenger);
    this.validatePositiveKm(km);

    const lookupKm = this.lookupKm(km);

    const row = this.chargeTables.find(item =>
      item.table_id === tableId &&
      Number(item.min_km) <= lookupKm &&
      lookupKm <= Number(item.max_km)
    );

    if (!row) {
      throw this.createError(
        ChargeEngine.ERROR_CODES.UNSUPPORTED_CHARGE_TABLE,
        `料金表に該当がありません: ${tableId}/${lookupKm}km`,
        {
          table_id: tableId,
          lookup_km: lookupKm
        }
      );
    }

    return {
      component: row.component,
      name: this.tableName(tableId),
      table_id: tableId,
      lookup_km: lookupKm,
      amount_yen: Number(
        passenger === 'adult'
          ? row.adult_yen
          : row.child_yen
      ),
      discountable:
        row.component === 'ordinary_express' ||
        row.component === 'limited_express_reserved' ||
        row.component === 'limited_express_unreserved'
    };
  }

  tableName(id) {
    const names = {
      JRH_HOKKAIDO_SPECIAL_RESERVED:
        '在来線特急指定席（道内特例）',
      JRH_A_EXPRESS_RESERVED:
        'A特急指定席',
      JRH_A_EXPRESS_UNRESERVED:
        'A特急自由席',
      JRH_ORDINARY_EXPRESS:
        '急行料金',
      JRH_GREEN_EXPRESS:
        'グリーン料金',
      JRH_HOKKAIDO_SHINKANSEN_RESERVED:
        '北海道新幹線 指定席特急料金',
      JRH_HOKKAIDO_SHINKANSEN_UNRESERVED:
        '北海道新幹線 自由席特急料金',
      JRH_HOKKAIDO_SHINKANSEN_GREEN:
        '北海道新幹線 グリーン料金',
      JRH_GRANCLASS_A_HOKKAIDO:
        'グランクラスA',
      JRH_GRANCLASS_B_HOKKAIDO:
        'グランクラスB'
    };

    return names[id] || id;
  }

  productCharge(productId, travelDate, passenger) {
    this.validatePassenger(passenger);

    const date = new Date(
      `${travelDate}T00:00:00`
    );

    if (Number.isNaN(date.getTime())) {
      throw this.createError(
        ChargeEngine.ERROR_CODES.INVALID_ARGUMENT,
        `乗車日が不正です: ${travelDate}`,
        { travel_date: travelDate }
      );
    }

    const row = this.productCharges.find(item => {

      if (item.product_id !== productId) {
        return false;
      }

      if (
        item.effective_from &&
        date < new Date(`${item.effective_from}T00:00:00`)
      ) {
        return false;
      }

      if (
        item.effective_to &&
        date > new Date(`${item.effective_to}T23:59:59`)
      ) {
        return false;
      }

      return true;
    });

    if (!row) {
      throw new Error(
        `商品がないか適用期間外です: ${productId}`
      );
    }

    return {
      component: row.component,
      product_id: productId,
      name: row.name,
      amount_yen: Number(
        passenger === 'adult'
          ? row.adult_yen
          : row.child_yen
      ),
      discountable: false
    };
  }

  resolveTableId({
    network,
    seatType,
    lookupKm
  }) {
    const candidates = this.tableCandidates(
      network,
      seatType,
      lookupKm
    );

    const tableId = candidates.find(id =>
      this.chargeTables.some(row =>
        row.table_id === id &&
        Number(row.min_km) <= lookupKm &&
        lookupKm <= Number(row.max_km)
      )
    );

    if (!tableId) {
      throw this.createError(
        ChargeEngine.ERROR_CODES.UNSUPPORTED_CHARGE_TABLE,
        '対応する特急料金表が登録されていません: ' +
        `${network}/${seatType}/${lookupKm}km`,
        {
          network,
          seat_type: seatType,
          lookup_km: lookupKm,
          candidate_table_ids: candidates
        }
      );
    }

    return tableId;
  }

  tableCandidates(network, seatType, lookupKm) {
    if (
      network ===
      ChargeEngine.NETWORKS.HOKKAIDO_CONVENTIONAL
    ) {
      if (
        seatType ===
        ChargeEngine.SEAT_TYPES.UNRESERVED
      ) {
        return ['JRH_A_EXPRESS_UNRESERVED'];
      }

      if (
        seatType === ChargeEngine.SEAT_TYPES.RESERVED
      ) {
        return lookupKm <= 150
          ? [
              'JRH_HOKKAIDO_SPECIAL_RESERVED',
              'JRH_A_EXPRESS_RESERVED'
            ]
          : ['JRH_A_EXPRESS_RESERVED'];
      }

      return ['JRH_GREEN_EXPRESS'];
    }

    const shinkansenTables = {
      [ChargeEngine.SEAT_TYPES.UNRESERVED]:
        ['JRH_HOKKAIDO_SHINKANSEN_UNRESERVED'],
      [ChargeEngine.SEAT_TYPES.RESERVED]:
        ['JRH_HOKKAIDO_SHINKANSEN_RESERVED'],
      [ChargeEngine.SEAT_TYPES.GREEN]:
        ['JRH_HOKKAIDO_SHINKANSEN_GREEN']
    };

    return shinkansenTables[seatType];
  }

  seasonAdjustment(network, season, passenger) {
    const row = this.seasonAdjustments.find(item =>
      item.network === network &&
      item.season === season &&
      item.applies_to === 'reserved'
    );

    if (!row) {
      throw this.createError(
        ChargeEngine.ERROR_CODES.SEASON_ADJUSTMENT_NOT_FOUND,
        `シーズン差額設定がありません: ${network}/${season}`,
        {
          network,
          season,
          passenger
        }
      );
    }

    return Number(
      passenger === 'adult'
        ? row.adult_yen
        : row.child_yen
    );
  }

  lookupKm(km) {
    return Math.ceil(Number(km) - 1e-12);
  }

  resultComponent(seatType) {
    const components = {
      [ChargeEngine.SEAT_TYPES.UNRESERVED]:
        'limited_express_unreserved',
      [ChargeEngine.SEAT_TYPES.RESERVED]:
        'limited_express_reserved',
      [ChargeEngine.SEAT_TYPES.GREEN]:
        'limited_express_green'
    };

    return components[seatType];
  }

  resultName(seatType) {
    const names = {
      [ChargeEngine.SEAT_TYPES.UNRESERVED]:
        '特急自由席料金',
      [ChargeEngine.SEAT_TYPES.RESERVED]:
        '特急指定席料金',
      [ChargeEngine.SEAT_TYPES.GREEN]:
        '特急グリーン料金'
    };

    return names[seatType];
  }

  validatePassenger(passenger) {
    this.validateEnum(
      passenger,
      ['adult', 'child'],
      '旅客区分'
    );
  }

  validatePositiveKm(km) {
    if (
      !Number.isFinite(Number(km)) ||
      Number(km) <= 0
    ) {
      throw this.createError(
        ChargeEngine.ERROR_CODES.INVALID_ARGUMENT,
        `営業キロが不正です: ${km}`,
        { km }
      );
    }
  }

  validateEnum(value, allowed, label) {
    if (!allowed.includes(value)) {
      throw this.createError(
        ChargeEngine.ERROR_CODES.INVALID_ARGUMENT,
        `${label}が不正です: ${value}`,
        {
          value,
          allowed
        }
      );
    }
  }

  createError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    return error;
  }
}
