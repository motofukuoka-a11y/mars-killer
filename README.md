# MARS KILLER

運賃・料金・払戻計算支援（非公式）

## 主な機能

- 営業キロ・換算キロ・運賃計算キロ
- 普通運賃・料金・割引・払戻計算
- 特急自由席・指定席・グリーン料金
- 指定席の通常期・繁忙期・閑散期
- 大人・小児
- オフラインPWA

## Version 2.4の変更内容

- `ChargeEngine.limitedExpressCharge()`を追加
- 普通運賃と特急料金を独立して計算
- 自由席、指定席、グリーンに対応
- 大人、小児に対応
- JR北海道在来線の特急料金表を自動選択
- JR北海道内在来線の指定席は150km以下で道内特例料金表を優先
- 151km以上の指定席はA特急料金表を使用
- 指定席の通常期、繁忙期、閑散期差額をJSONマスタで管理
- グリーン料金は自由席相当の特急料金とグリーン料金を内訳として合算
- `quote()`の`limitedExpress`オプションから特急料金を取得可能
- 北海道新幹線用料金表が未登録の場合は`UNSUPPORTED_CHARGE_TABLE`を返す
- Version 2.3の公開APIとの互換性を維持

## 利用例

### 特急料金のみ

```javascript
const charge = engine.limitedExpressCharge({
  km: 120.5,
  passenger: 'adult',
  seatType: 'reserved',
  season: 'busy',
  network: 'hokkaido_conventional'
});
```

### `quote()`から普通運賃と特急料金を取得

```javascript
const result = engine.quote({
  start: '札幌',
  goal: '函館',
  passenger: 'adult',
  limitedExpress: {
    seatType: 'reserved',
    season: 'normal',
    network: 'hokkaido_conventional'
  }
});
```

### 未登録料金表の識別

```javascript
try {
  engine.limitedExpressCharge({
    km: 148.8,
    passenger: 'adult',
    seatType: 'reserved',
    season: 'normal',
    network: 'hokkaido_shinkansen'
  });
} catch (error) {
  if (error.code === 'UNSUPPORTED_CHARGE_TABLE') {
    console.error(error.message);
    console.error(error.details);
  }
}
```

## マスタの役割

### `data/rules/distance_charge_tables.json`

営業キロ帯ごとの基本料金を管理します。

- 自由席特急料金
- 通常期の指定席特急料金
- グリーン料金
- 急行料金
- グランクラス料金
- 将来追加する北海道新幹線・JR他社の料金表

### `data/rules/charge_season_adjustments.json`

指定席料金へ加減算するシーズン差額を管理します。

- 通常期
- 繁忙期
- 閑散期
- 大人差額
- 小児差額
- 適用路線体系

## Known limitations

- 乗車日から通常期・繁忙期・閑散期を自動判定する機能は未実装です。
- 北海道新幹線の距離別料金表は未登録です。
- 北海道新幹線と東北新幹線をまたぐ料金計算は未対応です。
- 在来線と新幹線の通算、乗継割引、特定特急料金は未対応です。
- グランクラスはVersion 2.4の`seatType`には含めていません。
- 列車設備、停車駅、運転日、空席状況から座席種別を自動判定する機能は未実装です。
- 実際の特急乗車区間の自動抽出は未実装です。
- JR他社の料金表選択ロジックは未実装です。

## 注意

最終的な取扱いは、最新の規程・通達・端末表示で確認してください。
