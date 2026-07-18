/**
 * ChargeEngine
 *
 * 営業キロに応じた料金・商品ごとの固定料金を担当する。
 */
export default class ChargeEngine {

  constructor(chargeTables, productCharges) {
    this.chargeTables = chargeTables;
    this.productCharges = productCharges;
  }

  /**
   * 営業キロに応じた料金を計算する。
   */
  distanceCharge(tableId, km, passenger) {

    const lookupKm = Math.ceil(km - 1e-12);

    const row = this.chargeTables.find(item =>
      item.table_id === tableId &&
      Number(item.min_km) <= lookupKm &&
      lookupKm <= Number(item.max_km)
    );

    if (!row) {
      throw new Error(
        `料金表に該当なし: ${tableId}/${lookupKm}km`
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
        row.component === 'ordinary_express'
    };
  }

  /**
   * 料金表IDから画面表示名を取得する。
   */
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

      JRH_GRANCLASS_A_HOKKAIDO:
        'グランクラスA',

      JRH_GRANCLASS_B_HOKKAIDO:
        'グランクラスB'
    };

    return names[id] || id;
  }

  /**
   * 商品ごとの固定料金を取得する。
   */
  productCharge(productId, travelDate, passenger) {

    const date = new Date(
      `${travelDate}T00:00:00`
    );

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
}
