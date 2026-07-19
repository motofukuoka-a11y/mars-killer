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
  used: false,
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
    used: false
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
    usageState: 'before_use'
  }
});
```

### 使用開始後の普通乗車券

使用開始後は、未使用区間の払戻対象額と営業キロを明示します。

```javascript
const result = engine.refund({
  ticketType: 'ordinary',
  usageState: 'after_use',
  amountYen: 6820,
  unusedAmountYen: 2640,
  remainingBusinessKm: 145.2
});
```

### 前途放棄

```javascript
const result = engine.refund({
  ticketType: 'ordinary',
  forwardAbandonment: true,
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
|`usage_state`|未使用、使用開始前、使用開始後、前途放棄|
|`refund_before_fee_yen`|手数料控除前の払戻対象額|
|`fee_yen`|払戻手数料|
|`refund_after_fee_yen`|手数料控除後の払戻金額|
|`non_refundable_reason`|払戻し不可理由|
|`reason`|適用した取扱い|
|`calculation_basis`|規則ID、金額の取得元、計算式等|

## `refund_rules.json`の役割

`data/rules/refund_rules.json`は次の情報を管理します。

- 対象券種
- 未使用・使用開始前・使用開始後・前途放棄
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
- 使用開始後の普通乗車券は、未使用区間額を`unusedAmountYen`、未使用区間営業キロを`remainingBusinessKm`で指定する必要があります。
- `quote()`は通常見積額から払戻対象額を取得しますが、使用開始後の未使用区間額は自動算出しません。
- 前途放棄はVersion 2.6では払戻し不可として扱います。
- 最終的な取扱いは最新の規程、通達、発売端末表示で確認してください。

## Version 2.7変更内容

Version 2.7では、今後の営業実務機能で共通利用する基盤を追加しました。

- `DiscountEngine`を追加
- `ValidationEngine`を追加
- 共通エラーコードを追加
- 共通定数を追加
- 共通ユーティリティを追加
- `SalesEngine.discount()`を追加
- `SalesEngine.validate()`を追加
- 既存の`quote()`割引処理を`DiscountEngine`経由へ移行
- 割引率・距離条件・丸め方式を`discount_rules.json`で管理
- 社員購入券と家族購入券を別々の割引種別として定義

## 追加エンジン

### DiscountEngine

保存先：

```text
engines/DiscountEngine.js
```

担当範囲：

- 学生割引
- 障害者割引
- 社員購入券
- 家族購入券
- 割引可否判定
- 割引額計算
- 対象構成要素への割引適用
- 計算根拠の生成

割引率、営業キロ条件、対象項目、丸め方式は
`data/rules/discount_rules.json`から取得します。

社員購入券・家族購入券は、公開可能な正式割引率が
未設定のため、推測値を使用せず非適用結果を返します。

### ValidationEngine

保存先：

```text
engines/ValidationEngine.js
```

入力検証のみを担当します。

- 駅名未入力
- 同一駅
- 営業キロ不正
- status不正
- 券種不正
- 規則JSON不足
- 必須項目不足
- 数値不正

検証結果は例外ではなく、次の共通形式で返します。

```javascript
{
  valid: false,
  error_code: 'ERR_REQUIRED_FIELD',
  message: 'startは必須です。',
  details: {
    field: 'start'
  }
}
```

## Version 2.7ディレクトリ構成

```text
mars-killer/
├── engines/
│   ├── RouteEngine.js
│   ├── FareEngine.js
│   ├── ChargeEngine.js
│   ├── ChangeEngine.js
│   ├── RefundEngine.js
│   ├── DiscountEngine.js
│   └── ValidationEngine.js
├── shared/
│   ├── ErrorCodes.js
│   ├── Constants.js
│   └── Utils.js
└── data/
    └── rules/
        └── discount_rules.json
```

## DiscountEngine利用例

### 学生割引

```javascript
import {
  DiscountType
} from './shared/Constants.js';

const result = engine.discount({
  discountType: DiscountType.STUDENT,
  beforeDiscountYen: 4510,
  businessKm: 318.7,
  passenger: 'adult'
});
```

返却例：

```javascript
{
  applicable: true,
  discount_type: 'student',
  discount_id: 'STUDENT',
  before_discount_yen: 4510,
  discount_yen: 910,
  after_discount_yen: 3600,
  reason: '学生割引',
  error_code: null,
  calculation_basis: {
    rate: 0.2,
    rounding: 'discounted_fare_down_to_10'
  }
}
```

### 社員購入券

```javascript
const result = engine.discount({
  discountType:
    DiscountType.EMPLOYEE_PURCHASE,
  beforeDiscountYen: 4510,
  businessKm: 318.7
});
```

正式な割引率がマスタへ設定されるまでは、
`applicable: false`と`ERR_RULE_NOT_FOUND`を返します。

## ValidationEngine利用例

```javascript
const result = engine.validate({
  type: 'quote',
  start: '札幌',
  goal: '札幌',
  passenger: 'adult'
});
```

返却例：

```javascript
{
  valid: false,
  error_code: 'ERR_INVALID_STATION',
  message: '発駅と着駅が同一です。',
  details: {
    start: '札幌',
    goal: '札幌'
  }
}
```

## DiscountEngine返却値

|項目|内容|
|---|---|
|`applicable`|割引適用可否|
|`discount_type`|共通割引種別|
|`discount_id`|JSON上の割引規則ID|
|`before_discount_yen`|割引前金額|
|`discount_yen`|割引額|
|`after_discount_yen`|割引後金額|
|`reason`|適用理由または非適用理由|
|`error_code`|共通エラーコード|
|`calculation_basis`|割引率・丸め・距離条件等|

## 共通エラーコード

保存先：

```text
shared/ErrorCodes.js
```

主なコード：

- `ERR_INVALID_STATION`
- `ERR_INVALID_STATUS`
- `ERR_INVALID_TICKET_TYPE`
- `ERR_INVALID_PASSENGER_TYPE`
- `ERR_INVALID_DISCOUNT_TYPE`
- `ERR_REFUND_NOT_ALLOWED`
- `ERR_RULE_NOT_FOUND`
- `ERR_REQUIRED_FIELD`
- `ERR_ROUTE_NOT_FOUND`
- `ERR_DISTANCE`
- `ERR_INVALID_NUMBER`
- `ERR_JSON_MISSING`
- `ERR_JSON_LOAD_FAILED`
- `ERR_UNSUPPORTED_OPERATION`

今後のエンジン追加時も、この定数へコードを追加します。

## 共通定数

保存先：

```text
shared/Constants.js
```

次の定数を集約しています。

- `RefundStatus`
- `PassengerType`
- `TicketType`
- `DiscountType`
- `SeasonType`
- `ChargeType`
- `DistanceComparison`

## 共通ユーティリティ

保存先：

```text
shared/Utils.js
```

提供機能：

- `formatYen()`
- `ceilBusinessKm()`
- `compareBusinessKm()`
- `loadJson()`
- `isFiniteNumber()`
- `toFiniteNumber()`
- `createBusinessError()`

## Version 2.7 Known limitations

- 社員購入券と家族購入券の割引率・対象範囲は未設定です。
- 割引証明書、手帳、購入券の現物確認は自動化しません。
- ValidationEngineは入力形式を検証しますが、発売可否を最終決定するものではありません。
- 既存エンジン固有のエラーコードは、今後段階的に共通エラーコードへ移行します。



## Version 2.8変更内容

- `BusinessEngine`を追加
- 申出日・有効期間から営業状態を自動判定
- 乗り越し、打切計算、別途計算、区間変更、経路変更、前途放棄に対応
- `BusinessOperation`、`TicketUsageType`、`DepartureStatus`を追加
- ValidationEngineへ営業実務入力検証を追加
- UIへ営業実務入力欄を追加
- 操作振分けを`business_rules.json`で管理

## BusinessEngine

保存先：`engines/BusinessEngine.js`

BusinessEngineは営業実務の入口であり、運賃計算を持たず、RouteEngine、FareEngine、ChargeEngine、DiscountEngine、ChangeEngine、RefundEngine、ValidationEngineを呼び出します。

公開API：

```javascript
engine.business(options)
```

## 営業実務入力

`requestDate`、`ticketType`、`ticketUsageType`、`ticketStartDate`、`ticketEndDate`、`departureStatus`、`discountType`、`operation`を指定します。

## BusinessOperation

```javascript
BusinessOperation.OVERRUN
BusinessOperation.STOP_CALCULATION
BusinessOperation.SEPARATE_CALCULATION
BusinessOperation.SECTION_CHANGE
BusinessOperation.ROUTE_CHANGE
BusinessOperation.ABANDONMENT
```

## 営業状態判定

申出日、有効開始日、有効終了日から`before_use`、`after_use_start`、`in_valid_period`、`expired`を自動判定します。

## 利用例

```javascript
const result = engine.business({
  requestDate: '2026-07-19',
  ticketType: 'ordinary',
  ticketUsageType: 'valid_period',
  ticketStartDate: '2026-07-18',
  ticketEndDate: '2026-07-20',
  departureStatus: 'after_departure',
  operation: 'overrun',
  start: '札幌',
  goal: '小樽',
  actualGoal: '余市'
});
```

追加エラーコード：`ERR_INVALID_OPERATION`、`ERR_INVALID_DATE`、`ERR_INVALID_PERIOD`、`ERR_INVALID_DEPARTURE_STATUS`。

`data/rules/business_rules.json`は利用形態、列車状態、営業実務ごとの呼出先を管理します。
