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

## Version 2.5の変更内容

- `engines/ChangeEngine.js`を追加
- 変更計算を`RouteEngine`、`FareEngine`、`ChargeEngine`から分離
- 使用開始前・使用開始後の乗車変更
- 経路変更
- 方向変更
- 乗り越し精算
- 100km以下と101km以上の制度区分
- 発駅計算と打切計算
- 変更可否、変更前後運賃、差額、不足額、払戻し対象額、計算根拠を返却
- `SalesEngine.change()`を追加
- `quote()`の`change`オプションから変更計算を利用可能
- 営業キロ条件と計算方式を`data/rules/change_rules.json`へ分離

## Version 2.5の設計方針

各エンジンの責務を次のように分離します。

- `RouteEngine`: 経路探索と営業キロ・換算キロ集計
- `FareEngine`: 普通運賃の算出
- `ChargeEngine`: 特急料金・設備料金の算出
- `ChangeEngine`: 変更可否、再計算区間、差額精算、計算根拠の生成

`ChangeEngine`は経路や普通運賃を独自実装せず、`RouteEngine`と
`FareEngine`を利用します。距離境界や計算方式はJSONマスタから受け取り、
将来の規則改定や券種追加に備えます。

## Version 2.5利用例

### 使用開始前の経路変更

```javascript
const result = engine.quote({
  start: '新千歳空港',
  goal: '岩見沢',
  passenger: 'adult',
  change: {
    type: 'route_change',
    usageState: 'before_use',
    original: {
      start: '新千歳空港',
      goal: '岩見沢'
    },
    changed: {
      start: '新千歳空港',
      goal: '岩見沢',
      via: ['白石']
    }
  }
});
```

### 使用開始後の経路変更

```javascript
const result = engine.change({
  type: 'route_change',
  usageState: 'after_use',
  passenger: 'adult',
  currentStation: '札幌',
  original: {
    start: '函館',
    goal: '旭川'
  },
  changed: {
    goal: '帯広',
    via: ['南千歳']
  }
});
```

### 方向変更

```javascript
const result = engine.change({
  type: 'direction_change',
  usageState: 'after_use',
  passenger: 'adult',
  currentStation: '札幌',
  original: {
    start: '小樽',
    goal: '岩見沢'
  },
  changed: {
    goal: '手稲'
  }
});
```

### 乗り越し精算

```javascript
const result = engine.change({
  type: 'overtravel',
  passenger: 'adult',
  original: {
    start: '札幌',
    goal: '小樽'
  },
  actualGoal: '余市'
});
```

## Version 2.5返却値一覧

|項目|内容|
|---|---|
|`change_type`|変更種別|
|`usage_state`|使用開始前・使用開始後|
|`change_allowed`|変更可否|
|`rule_classification`|100km以下、101km以上等の制度区分|
|`calculation_method`|発駅計算、打切計算等|
|`original_fare_yen`|変更前運賃|
|`changed_fare_yen`|変更後運賃または変更後総額|
|`difference_yen`|変更後－変更前の差額|
|`shortage_yen`|収受対象の不足額|
|`refundable_amount_yen`|払戻し検討対象額。手数料控除前|
|`passenger_section`|実際の乗車区間。乗り越し時に返却|
|`held_ticket`|所持乗車券。乗り越し時に返却|
|`original_route`|変更前経路と営業キロ|
|`changed_route`|変更後または追加区間の経路|
|`calculation_reason`|計算理由|
|`calculation_basis`|計算に使用した区間、運賃、変更駅等|
|`warnings`|対象外制度と確認事項|

## `change_rules.json`の役割

`data/rules/change_rules.json`は、変更計算で使用する次の設定を管理します。

- 100km以下・101km以上を分ける営業キロ境界
- 使用開始前の全区間差額計算
- 使用開始後100km以下の発駅計算
- 使用開始後101km以上の打切計算
- 乗り越し時の発駅計算・打切計算
- 使用状態ごとの変更可否

Version 2.5では基本設定のみを保持します。将来は券種、割引、変更回数、
有効期間、申出時刻等を含む正式な規則マスタへ拡張します。

## Version 2.5 Known limitations

- 払戻手数料の計算は行いません。`refundable_amount_yen`は手数料控除前の検討対象額です。
- 学割、障害者割引、購入券は未対応です。
- 特定都区市内、東京山手線内、大阪市内制度は未対応です。
- 特定区間運賃、遠距離逓減制は未対応です。
- 新幹線乗継割引、在来線特急乗継制度は未対応です。
- 変更回数、有効期間、途中下車、券面表示、発売制限による変更可否は未判定です。
- 101km以上の使用開始後変更では、変更駅を`currentStation`で明示する必要があります。
- 方向変更は、変更後着駅が原経路の既乗車区間上にある場合だけ判定します。
- 経由指定がない場合は`RouteEngine`の営業キロ最短経路を使用します。
- Version 2.5は普通乗車券の基本計算基盤です。最終的な取扱いは最新の規程、通達、端末表示で確認してください。

## Version 2.5 quoteレスポンス

`quote()`へ`change`を指定しても、通常の見積計算は従来どおり実行されます。
変更計算結果は、見積レスポンスの`change`プロパティへ格納されます。

```javascript
const result = engine.quote({
  start: '新千歳空港',
  goal: '岩見沢',
  passenger: 'adult',
  limitedExpress: {
    seatType: 'reserved',
    season: 'normal',
    network: 'hokkaido_conventional'
  },
  change: {
    type: 'route_change',
    usageState: 'before_use',
    original: {
      start: '新千歳空港',
      goal: '岩見沢'
    },
    changed: {
      start: '新千歳空港',
      goal: '岩見沢',
      via: ['白石']
    }
  }
});

console.log(result.components);
console.log(result.total_yen);
console.log(result.change);
```

返却構造の概略は次のとおりです。

```javascript
{
  route: { ... },
  components: [
    { component: 'ordinary_fare', ... },
    { component: 'limited_express_reserved', ... }
  ],
  total_yen: 0,
  change: {
    change_type: 'route_change',
    change_allowed: true,
    original_fare_yen: 0,
    changed_fare_yen: 0,
    difference_yen: 0,
    ...
  }
}
```

`change`を指定しない場合、`change`プロパティは`null`です。

