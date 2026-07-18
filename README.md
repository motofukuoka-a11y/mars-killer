# MARS KILLER

運賃・料金・払戻計算支援（非公式）

## 主な機能

- 営業キロ・換算キロ・運賃計算キロ
- 普通運賃・料金・割引・変更・払戻計算
- 特急自由席・指定席・グリーン料金
- 指定席の通常期・繁忙期・閑散期
- 大人・小児
- オフラインPWA

## Version 2.4

`ChargeEngine`による特急料金計算を追加しました。

## Version 2.5

`ChangeEngine`による乗車変更、経路変更、方向変更、乗り越し精算を追加しました。

## Version 2.6変更内容

- `engines/RefundEngine.js`を追加
- 普通乗車券と特急券の払戻し計算を他エンジンから分離
- 普通乗車券の未使用・使用開始前・使用開始後・前途放棄に対応
- 特急券の未使用・使用開始前・使用開始後に対応
- 払戻可否、払戻対象額、手数料、手数料控除後金額を返却
- 普通乗車券の払戻手数料220円をJSONマスタで管理
- 特急券の払戻手数料340円をJSONマスタで管理
- `SalesEngine.refund()`を追加
- `quote()`の通常見積レスポンスへ`refund`プロパティを追加
- `refund`未指定時は`refund: null`
- 旧`engine.js`の`refundFee()`を廃止し、払戻しロジックを`RefundEngine`へ集約

## RefundEngine概要

`RefundEngine`は次の処理だけを担当します。

- 払戻し対象券種の判定
- 使用状態に対応する払戻規則の選択
- 払戻可否の判定
- 払戻対象額の決定
- 手数料の計算
- 手数料控除後金額の計算
- 払戻し不可理由と計算根拠の生成

経路探索、普通運賃、特急料金、変更計算はそれぞれ既存エンジンが担当します。

## 利用例

### 普通乗車券の未使用払戻し

```javascript
const result = engine.refund({
  ticketType: 'ordinary',
  status: 'before_trip',
  amountYen: 4510
});
```

### `quote()`から普通乗車券払戻しを取得

```javascript
const result = engine.quote({
  start: '札幌',
  goal: '函館',
  passenger: 'adult',
  refund: {
    ticketType: 'ordinary',
    status: 'before_trip'
  }
});

console.log(result.total_yen);
console.log(result.refund);
```

### 特急券の払戻し

```javascript
const result = engine.quote({
  start: '札幌',
  goal: '函館',
  passenger: 'adult',
  limitedExpress: {
    seatType: 'reserved',
    season: 'normal',
    network: 'hokkaido_conventional'
  },
  refund: {
    ticketType: 'limited_express',
    status: 'before_train_departure'
  }
});
```

### 使用開始後の普通乗車券

使用開始後は、未使用区間の払戻対象額と営業キロを明示します。

```javascript
const result = engine.refund({
  ticketType: 'ordinary',
  status: 'after_trip_start',
  amountYen: 6820,
  unusedAmountYen: 2640,
  remainingBusinessKm: 145.2
});
```

### 前途放棄

```javascript
const result = engine.refund({
  ticketType: 'ordinary',
  status: 'journey_abandoned',
  amountYen: 4510,
  unusedAmountYen: 2640
});
```

## 返却値一覧

|項目|内容|
|---|---|
|`refundable`|払戻可否|
|`refund_target`|普通乗車券または特急券|
|`ticket_type`|`ordinary`または`limited_express`|
|`status`|旅行開始前、旅行開始後、前途放棄、列車発車前、列車発車後、使用開始後|
|`refund_before_fee_yen`|手数料控除前の払戻対象額|
|`fee_yen`|払戻手数料|
|`refund_after_fee_yen`|手数料控除後の払戻金額|
|`non_refundable_reason`|払戻し不可理由|
|`reason`|適用した取扱い|
|`calculation_basis`|規則ID、金額の取得元、計算式等|

## `refund_rules.json`の役割

`data/rules/refund_rules.json`は次の情報を管理します。

- 対象券種
- 普通乗車券の旅行開始前・旅行開始後・前途放棄
- 特急券等の列車発車前・列車発車後・使用開始後
- 払戻可否
- 普通乗車券手数料220円
- 特急券手数料340円
- 払戻対象額の取得方法
- 使用開始後に必要な未使用区間条件
- 払戻し不可理由

手数料や条件を`RefundEngine.js`へ直接記述しないため、将来の規則変更や券種追加に対応できます。

## Known limitations

- 定期券、回数券、特別企画乗車券は未対応です。
- 学割、障害者割引、購入券は未対応です。
- 団体券、ジパング倶楽部、株主優待は未対応です。
- 指定席特急券の出発日・申出時刻による段階的な手数料は未対応です。
- 列車運休、事故、遅延等による無手数料払戻しは未対応です。
- 旅行開始後の普通乗車券は、未使用区間額を`unusedAmountYen`、未使用区間営業キロを`remainingBusinessKm`で指定する必要があります。
- 営業キロ条件は未使用区間101km以上として判定します。
- `quote()`は通常見積額から払戻対象額を取得しますが、使用開始後の未使用区間額は自動算出しません。
- 前途放棄はVersion 2.6では払戻し不可として扱います。
- 最終的な取扱いは最新の規程、通達、発売端末表示で確認してください。

## 払戻し状態一覧

払戻し判定は`used: true/false`ではなく、`status`の列挙値で指定します。

### 普通乗車券

|status|判定時点|
|---|---|
|`before_trip`|旅行開始前|
|`after_trip_start`|旅行開始後|
|`journey_abandoned`|前途放棄|

### 特急券・指定席券・グリーン券等

|status|判定時点|
|---|---|
|`before_train_departure`|列車発車前|
|`after_train_departure`|列車発車後|
|`after_use_start`|使用開始後|

## 判定の考え方

普通乗車券は「旅行を開始したか」を基準に判定します。

特急券・指定席券・グリーン券等は、「列車が発車したか」と
「券を使用開始したか」を別々の状態として判定します。

`RefundEngine`は券種と`status`の組み合わせから
`refund_rules.json`の規則を選択します。状態に対応する払戻可否、
手数料、払戻対象額の取得方法、営業キロ条件はJSON側で管理します。

旅行開始後の普通乗車券で営業キロ条件を扱う場合は、
未使用区間が`101km以上`であることを判定します。

