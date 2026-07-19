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

## Version 2.9変更内容

Version 2.9では、BusinessEngineへ営業規則判定を追加しました。

- 遠距離逓減制
- 特定都区市内
- 経路特定区間
- 区間外乗車
- 選択乗車
- 折返し乗車
- 大都市近郊区間
- 途中下車可否
- 有効日数判定
- 営業規則判定結果のUI表示
- `business_regulations.json`のPWAキャッシュ

## 営業規則

営業規則の条件はBusinessEngineへ直接記述せず、次のJSONで管理します。

```text
data/rules/business_regulations.json
```

各規則は次の情報を持ちます。

- `regulation_id`
- `result_key`
- `name`
- `required_fields`
- `conditions`
- `applicable_reason`
- `not_applicable_reason`
- `missing_input_reason`
- 必要に応じた計算設定

BusinessEngineには条件比較の共通処理だけを置き、距離境界、必要入力、適用理由はJSONから取得します。

## BusinessEngineの営業規則判定

BusinessEngineは営業実務計算後に、経路結果と入力情報から営業規則判定用コンテキストを作成します。

```javascript
const result = engine.business({
  requestDate: '2026-07-19',
  ticketType: 'ordinary',
  ticketUsageType: 'valid_period',
  ticketStartDate: '2026-07-18',
  ticketEndDate: '2026-07-20',
  departureStatus: 'after_departure',
  operation: 'route_change',
  start: '札幌',
  goal: '函館',
  passenger: 'adult',
  regulationContext: {
    specificCityZoneApplicable: false,
    specificRouteSectionApplicable: false,
    outsideSectionRideApplicable: false,
    selectedRouteApplicable: false,
    turnbackRideApplicable: false,
    metropolitanSuburbanAreaOnly: false,
    stopoverRestricted: false
  }
});
```

## 営業規則返却値

```javascript
{
  success: true,
  regulations: {
    long_distance_discount: false,
    specific_city_zone: false,
    specific_route_section: false,
    outside_section_ride: false,
    selected_route: false,
    turnback_ride: false,
    metropolitan_suburban_area: false,
    stopover_allowed: true,
    valid_days: true
  },
  regulation_details: [
    {
      regulation_id: 'STOPOVER_ALLOWED',
      name: '途中下車可否',
      applicable: true,
      reason: '営業キロ、利用形態および途中下車制限の条件を満たしています。',
      missing_fields: [],
      calculated_value: null
    }
  ],
  calculation: [],
  fare: {},
  error_code: null
}
```

## 入力不足と対象外

規則ごとに必要な入力が不足している場合、営業実務全体を失敗させず、その規則を非適用として返します。

```javascript
{
  applicable: false,
  reason: '経路特定区間の判定には対象区間マスタによる判定結果が必要です。',
  missing_fields: [
    'specific_route_section_applicable'
  ]
}
```

対象条件が入力済みで条件を満たさない場合は、`not_applicable_reason`を返します。

## 経路系規則の取扱い

次の規則は正式な対象駅・区間・経路マスタが必要です。

- 特定都区市内
- 経路特定区間
- 区間外乗車
- 選択乗車
- 折返し乗車
- 大都市近郊区間

Version 2.9では、未登録の対象区間をJavaScriptで推測しません。対象マスタまたは外部判定結果を`regulationContext`へ渡した場合だけ適用判定します。

## UI表示

営業実務の計算結果へ次を追加しました。

- 適用された規則
- 適用されなかった規則
- 適用・非適用理由
- 不足している判定入力
- 有効日数等の計算値

## Version 2.9 Known limitations

- 全国の特定都区市内、経路特定区間、区間外乗車、選択乗車、折返し乗車、大都市近郊区間の対象マスタは未収録です。
- 遠距離逓減制の実際の運賃額計算はFareEngineの責務であり、BusinessEngineは適用対象だけを判定します。
- 有効日数判定はJSONに設定した営業キロ基準を使用します。
- 最終的な取扱いは最新の規程、通達、発売端末表示で確認してください。

## Version 3.0変更内容

Version 3.0では、営業規則を複数のJSONマスターから解決する「営業規則データベース」を実装しました。

- `shared/RuleResolver.js`を追加
- 中央営業規則マスターを追加
- 駅グループマスターを追加
- 経路規則マスターを追加
- 有効期間・運賃制度マスターを追加
- BusinessEngineから個別営業規則判定処理を削除
- マスター不足、重複、優先順位競合、循環参照を検証
- UIへ参照マスターと優先順位を表示
- デバッグモードで参照JSON名を表示

## マスター構成

```text
data/master/
├── business_regulation_master.json
├── station_group_master.json
├── route_rule_master.json
└── validity_rule_master.json
```

### business_regulation_master.json

営業規則の入口です。対象規則と参照先マスターを定義します。

### station_group_master.json

以下の駅グループ規則を管理します。

- 特定都区市内
- 大都市近郊区間

### route_rule_master.json

以下の経路規則を管理します。

- 経路特定区間
- 区間外乗車
- 選択乗車
- 折返し乗車

### validity_rule_master.json

以下の制度・有効期間規則を管理します。

- 遠距離逓減制
- 途中下車可否
- 有効日数判定

## 共通マスター構造

全マスターおよび各規則レコードは、次の共通項目を持ちます。

```javascript
{
  id,
  name,
  enabled,
  description,
  conditions,
  references,
  priority
}
```

## RuleResolver

保存先：

```text
shared/RuleResolver.js
```

RuleResolverの担当範囲：

- BusinessEngineが必要とする営業規則の取得
- 中央マスターから参照先の解決
- enabled判定
- 優先順位による並べ替え
- 判定対象の抽出
- 条件評価
- 計算値生成
- 参照マスター情報の返却
- マスター不足・重複・優先順位競合・循環参照の検出

## BusinessEngine構造

Version 3.0のBusinessEngineは営業規則を直接評価しません。

```text
BusinessEngine
  ↓
RuleResolver
  ↓
business_regulation_master
  ↓
station_group_master
route_rule_master
validity_rule_master
```

BusinessEngineは次の1回だけRuleResolverを呼び出します。

```javascript
const regulationResult = this.ruleResolver.resolve({
  input,
  businessState,
  operationResult,
  validatedDates
});
```

## 営業規則追加方法

新しい営業規則を追加する場合、原則としてJavaScriptを変更しません。

1. 規則の種類に対応するマスターへレコードを追加します。
2. `id`、`name`、`enabled`、`description`、`conditions`、`references`、`priority`を設定します。
3. `business_regulation_master.json`の`references`へ参照先を追加します。
4. 既存と重複しない優先順位を設定します。
5. JSON検証とRuleResolverテストを実行します。

例：

```json
{
  "id": "NEW_REGULATION",
  "name": "新営業規則",
  "enabled": true,
  "description": "新しい営業規則の説明",
  "conditions": {
    "required_fields": ["business_km"],
    "all": [
      {
        "field": "business_km",
        "operator": "greater_than_or_equal",
        "value": 300
      }
    ],
    "result_key": "new_regulation",
    "applicable_reason": "条件を満たしています。",
    "not_applicable_reason": "条件を満たしていません。",
    "missing_input_reason": "営業キロが必要です。"
  },
  "references": [],
  "priority": 1000
}
```

## UIとデバッグモード

営業規則画面には次を表示します。

- 適用された営業規則
- 適用されなかった営業規則
- 判定理由
- 参照マスター
- 優先順位

URLへ`?debug=1`を付けると、参照したJSONファイル名も表示します。

## Version 3.0 Known limitations

- 全国の駅グループ・経路特例の実データは段階的に追加する必要があります。
- 新しい条件演算子や新しい計算方式そのものを追加する場合はRuleResolverの拡張が必要です。
- 営業規則の具体的な対象駅・区間は正式資料に基づきマスターへ登録してください。



## Version 4.0変更内容

Version 4.0では、全国JR・私鉄・第三セクターへ拡張可能な鉄道マスターデータベースを追加しました。

- 会社マスター
- 路線マスター
- 駅マスター
- 距離マスター
- 普通運賃マスター
- 料金マスター
- RuleResolverの鉄道マスター取得API
- Version 3.0営業規則マスターとの参照統合
- RouteEngine、FareEngine、ChargeEngineのマスター参照化
- 鉄道マスターの重複・参照・孤立検証
- デバッグ画面への会社・路線・駅・距離表示

## 鉄道マスター構造

```text
data/master/
├── company_master.json
├── line_master.json
├── station_master.json
├── distance_master.json
├── fare_master.json
├── charge_master.json
├── business_regulation_master.json
├── station_group_master.json
├── route_rule_master.json
└── validity_rule_master.json
```

全マスター：

```javascript
{
  id,
  name,
  enabled,
  description,
  references,
  priority,
  metadata,
  records
}
```

各レコード：

```javascript
{
  id,
  enabled,
  name,
  description,
  conditions,
  references,
  metadata,
  priority
}
```

## 会社

`company_master.json`は鉄道事業者を管理します。

```javascript
{
  id: 'JRH',
  name: '北海道旅客鉄道',
  metadata: {
    company_type: 'jr',
    country: 'JP'
  }
}
```

全国対応時はJR各社、私鉄、第三セクターを会社ID単位で追加します。

## 路線

`line_master.json`は`company_id`を参照して路線を管理します。運賃計算上の幹線・地方交通線等は`metadata.line_category`で管理します。

## 駅

`station_master.json`は全国共通の`station_id`と`company_id`、主所属路線等を管理します。同名駅はIDで区別します。

## 営業キロ

`distance_master.json`は駅間ごとに以下を管理します。

- `from_station_id`
- `to_station_id`
- `line_id`
- 営業キロ
- 換算キロ
- 運賃計算キロ

## 普通運賃

`fare_master.json`は会社、運賃表、距離帯、大人・小児運賃を管理します。RouteEngineが返した経路区分と距離をFareEngineがマスターへ照会します。

## 料金

`charge_master.json`は以下を管理します。

- 距離制料金
- 特急料金
- 設備料金
- 商品固定料金
- シーズン差額
- ネットワーク別料金表候補
- 料金表名称

## RuleResolver構造

RuleResolverは営業規則だけでなく、次のAPIを提供します。

```javascript
resolver.getMaster('station_master');
resolver.getMetadata('fare_master');
resolver.getRecords('distance_master');
resolver.getRecord('company_master', 'JRH');
resolver.findRecords('fare_master', predicate);
resolver.resolveRailwayContext(route);
```

Version 3.0の営業規則APIである`resolve()`も維持しています。

## Engine構造

```text
RouteEngine
  → RuleResolver.getRecords(station_master)
  → RuleResolver.getRecords(distance_master)

FareEngine
  → RuleResolver.getMetadata(fare_master)
  → RuleResolver.getRecords(fare_master)

ChargeEngine
  → RuleResolver.getMetadata(charge_master)
  → RuleResolver.getRecords(charge_master)

BusinessEngine
  → RuleResolver.resolve()
```

各Engineの責務は変更していません。

## 既存データ互換

新マスターの`metadata.sources`は、Version 3.0までの既存JSONを互換データソースとして参照できます。

```javascript
{
  data_key: 'legacy_stations',
  record_id_field: 'station_id',
  field_map: {
    station_id: 'id',
    station_name: 'name'
  }
}
```

今後の新規データは各マスターの`records`へ直接追加できます。既存JSONから段階的に移行してもEngineの変更は不要です。

## データ追加方法

1. `company_master.json`へ会社を追加します。
2. `line_master.json`へ会社ID付きで路線を追加します。
3. `station_master.json`へ駅を追加します。
4. `distance_master.json`へ駅間距離を追加します。
5. `fare_master.json`へ会社別運賃表を追加します。
6. `charge_master.json`へ料金表を追加します。
7. 必要な営業規則の会社・路線・駅参照IDを追加します。
8. Master validationを実行します。

## 全国対応方法

会社IDを名前空間として、各事業者の路線・駅・距離・運賃・料金を追加します。JR、私鉄、第三セクターでEngineを分岐せず、マスターレコードと参照IDで切り替えます。

## ValidationEngine追加検証

- 会社重複
- 路線重複
- 駅重複
- 営業キロ重複
- 参照整合性
- 孤立駅
- 孤立路線
- 存在しない会社参照
- 存在しない駅参照
- 存在しない路線参照
- 存在しない営業キロ参照

## デバッグ表示

営業規則デバッグ表示では次を確認できます。

- 使用会社
- 使用路線
- 使用駅
- 営業キロ
- 換算キロ
- 運賃計算キロ
- 参照マスター
- 参照JSON

## Version 4.1変更内容

Version 4.1では、営業キロ・換算キロ・運賃計算キロを経路順の単一配列で管理します。

- `distance.sections`を正式な区間モデルとして採用
- `business_sections`と`conversion_sections`を廃止
- 経路順を崩さずに区間情報を保持
- UI、Calculation Log、Debugを同じ`sections`から生成
- 幹線区間は`business_km`だけを保持
- 地方交通線区間は`conversion_km`だけを保持
- Version 4.0互換の`route.business_km`等は維持

## distance正式仕様

```javascript
{
  distance: {
    sections: [
      {
        segment_id,
        from,
        to,
        line,
        line_type,
        business_km,
        conversion_km
      }
    ],
    totals: {
      business_km,
      conversion_km,
      fare_calculation_km
    }
  }
}
```

`sections`は必ず実際の経路順で格納します。

## 幹線区間

```javascript
{
  segment_id: '...',
  from: '札幌',
  to: '旭川',
  line: '函館本線',
  line_type: 'main',
  business_km: 136.8,
  conversion_km: null
}
```

幹線区間では`business_km`だけに値を設定します。

## 地方交通線区間

```javascript
{
  segment_id: '...',
  from: '旭川',
  to: '網走',
  line: '石北本線',
  line_type: 'local',
  business_km: null,
  conversion_km: 261.5
}
```

地方交通線区間では`conversion_km`だけに値を設定します。

## 混在経路

```javascript
{
  sections: [
    {
      from: '札幌',
      to: '旭川',
      line: '函館本線',
      line_type: 'main',
      business_km: 136.8,
      conversion_km: null
    },
    {
      from: '旭川',
      to: '網走',
      line: '石北本線',
      line_type: 'local',
      business_km: null,
      conversion_km: 261.5
    }
  ],
  totals: {
    business_km: 136.8,
    conversion_km: 261.5,
    fare_calculation_km: 398.3
  }
}
```

## 営業キロ表示

`distance.sections`から`line_type === "main"`の区間だけを表示します。

```text
営業キロ
函館本線
札幌→旭川
136.8km
```

## 換算キロ表示

`distance.sections`から`line_type === "local"`の区間だけを表示します。

```text
換算キロ
石北本線
旭川→網走
261.5km
```

## 運賃計算キロ表示

```text
営業キロ 136.8km
換算キロ 261.5km
────────
運賃計算キロ 398.3km
```

## 幹線のみ

```text
営業キロ
函館本線
札幌→小樽
33.8km

運賃計算キロ
33.8km
```

換算キロ欄は表示しません。

## 地方交通線のみ

```text
換算キロ
地方交通線
A駅→B駅
123.4km

運賃計算キロ
123.4km
```

営業キロ欄は表示しません。

## 経路表示

```text
札幌
↓
函館本線（幹線）
↓
旭川
↓
石北本線（地方交通線）
↓
網走
```

経路表示は`distance.sections`を先頭から順番に処理します。

## Calculation Log

Calculation Logは`sections`から以下を経路順に生成します。

- 営業キロ
- 換算キロ
- 運賃計算キロ
- 使用路線
- 使用区間

## Debug

Debugでは`distance.sections`を加工せず、経路順の区間一覧として表示します。

別途`business_sections`および`conversion_sections`は生成しません。

## Version 4.1.1 モジュール読込み不具合修正

コミット：`9ce677e`

### 発生した問題

`engine.js`の`SalesEngine.load()`で、`Promise.all()`の結果を受け取る配列分割代入に`lines`が重複していました。

```javascript
const [
  lines,
  lines,
  stations,
  segments,
  ordinaryFares
] = await Promise.all([
  // ...
]);
```

同じスコープで`lines`を二重宣言したため、ES Moduleの読込み段階で構文エラーとなりました。`app.js`のモジュール本体と`init()`へ到達しなかったため、次の処理も実行されませんでした。

- `setupTheme()`
- マスター読込み
- 初期化完了処理
- 「準備完了」への状態遷移

このため画面は「起動中…」のままとなり、端末がダークモードでもテーマ設定処理が実行されず、端末設定へ追従しませんでした。

### Version 4.1.1での対応

分割代入を次の順序へ修正しました。

```javascript
const [
  lines,
  stations,
  segments,
  ordinaryFares
] = await Promise.all([
  // ...
]);
```

また、`SalesEngine`生成時の引数へ`lines`を追加しました。

```javascript
return new SalesEngine({
  lines,
  stations,
  segments
});
```

これによりES Module読込み、`app.js`の`init()`、テーマ設定、マスター読込み、準備完了への遷移が正常化しました。

## Version 4.1.2 PWA更新・キャッシュ制御改善

Version 4.1.2では、GitHub Pagesへ最新版をデプロイしても通常ブラウザに古いService Workerとキャッシュが残り、旧JavaScriptが実行され続ける問題を改善しました。

### 通常ブラウザとプライベートブラウズで挙動が異なった理由

通常ブラウザには過去に登録したService WorkerとCache Storageが永続的に残ります。そのためデプロイ後も旧Service Workerが旧キャッシュを返す場合があります。

プライベートブラウズは通常ブラウザと別の一時ストレージを使用するため、古いService Workerやキャッシュが存在せず、GitHub Pages上の最新版を直接取得できました。

### Service Worker更新改善

- キャッシュ名を`mars-killer-v4.1.2`へ更新
- install時に必要ファイルを事前キャッシュ
- install時に`self.skipWaiting()`を実行
- activate時に現行バージョン以外のキャッシュを削除
- activate時に`self.clients.claim()`を実行
- `SKIP_WAITING`メッセージを受信可能
- HTML、JavaScript、CSS、JSON、Web ManifestをNetwork First化
- 通信失敗時はキャッシュへフォールバック
- 画像などの静的ファイルはCache First
- `fetch(..., { cache: "no-store" })`でHTTPキャッシュによる旧コード固定を抑制

### 更新通知

`app.js`で次を実装しました。

- Service Worker初回登録
- `updateViaCache: "none"`による更新確認
- `registration.update()`による明示的な更新確認
- `updatefound`と待機中Service Workerの検知
- 新バージョン通知
- 更新ボタン
- 更新処理中表示
- 更新失敗表示
- `controllerchange`後の1回だけの再読込み
- 無限リロード防止フラグ

### 初期化失敗フォールバック

`index.html`にモジュール読込み失敗時のフォールバックを追加しました。

初期表示は「起動中…」とし、一定時間経過しても`app.js`が開始されなければ次を表示します。

```text
アプリの読込みに失敗した可能性があります。
再読込みしても改善しない場合は、
ブラウザのWebサイトデータを削除してください。
```

再読込みボタンも表示します。

`app.js`が正常に実行された場合は、次のグローバルフラグとイベントでフォールバックタイマーを解除します。

```javascript
window.__MARS_KILLER_APP_STARTED__ = true;
window.__MARS_KILLER_APP_READY__ = true;
```

## Version履歴

- Version 4.1.1：モジュール読込み不具合修正（コミット`9ce677e`）
- Version 4.1.2：PWA更新・キャッシュ制御改善

## Version 5.0 実務支援システム完成基盤

Version 5.0は、Version 4.1.2のPWA、`distance.sections`、既存Engine APIを維持し、駅業務向け検索・履歴・候補経路・検証・デバッグをサービス層で統合します。

### 設計思想

- 駅・路線・距離・運賃・料金・規則はJSONで管理する
- 既存Engineの責務を変更しない
- 実務検索は`PracticalOperationPlatform`で統合する
- 会社は`company_id`で分離し、JR各社・第三セクターへ拡張する
- Version 6以降はマスター追加とルール追加を中心に全国対応する
- 未収録の金額・規則を推測して計算しない

### Version 5.0追加機能

- station_masterベースの検索インデックス
- 前方一致、部分一致、かな、漢字、駅コード検索
- 会社指定
- 複数経由駅
- 列車種別、利用日、人数、片道・往復、設備条件
- 検索履歴20件
- お気に入り駅API
- 最近使用した駅API
- 複数経路候補API
- 経由順比較
- 会社境界数
- 入力・結果の循環検出
- エラーログ
- Engine別実行時間付きデバッグログ
- JSONデバッグ表示
- 実務結果カードUI
- Version 5.0 PWAキャッシュ

### Engine構成

既存のRouteEngine、FareEngine、ChargeEngine、DiscountEngine、RefundEngine、ChangeEngine、BusinessEngine、ValidationEngine、RuleResolverを維持します。

Version 5.0では以下のサービスを追加します。

- `StationSearchIndex`
- `PracticalStorage`
- `DebugService`
- `PracticalOperationPlatform`

遠距離逓減、往復割引、団体、特殊企画券、新幹線、寝台、会社跨ぎ、北海道独自規則は、正式なJSONマスターが存在する場合に既存EngineおよびRuleResolverが適用します。

### 変更履歴

- Version 5.0：実務支援システム完成基盤



## Version 5.1 段階実装状況

### Stage 1: 入力・状態モデル基盤

- 旅客グループモデル（大人・小児・介助者）
- 旧 `passenger_count` / `people` 形式の互換変換
- 旅客数集計と基礎Validation
- Version 5.1検索条件モデルへの互換変換
- `distance.sections`から安定した`section_services`を生成
- 駅検索の1文字検索、正規化、順位固定、駅ID検索基盤
- 共通駅オートコンプリートコンポーネント基盤

このStageではFareEngine、ChargeEngine、DiscountEngineの旅客グループ別金額計算はまだ有効化していません。既存APIを維持したまま、次StageでEngine計算へ接続します。


### Version 5.1 Stage 2

画面へ旅客グループ、手続駅、複数経由駅、区間別サービス設定を接続しました。新規入力状態は `passengers`、`procedure_station_id`、`section_services` として保存されます。運賃・料金の旅客グループ別Engine計算は次段階で実装します。

## Version 5.1 Stage 3

`PassengerCalculationService`が既存FareEngine、ChargeEngine、DiscountEngineを変更せずに呼び出し、旅客グループ単位の単価、人数小計、総合計を統合します。距離は旅客共通値として保持し、人数倍しません。正式な料金表・割引規則が存在しない項目は推測せず、警告を返して0円のまま保持します。

## Version 5.1 Stage 4

旅客グループ別計算へ営業規則・RuleResolver・Validationを接続しました。

- `PracticalValidationService`: 入力、経路、距離、旅客、介助者、区間設定、計算合計を構造化検証
- `PassengerRuleService`: 旅客グループごとの規則候補、採用、却下、理由を保持
- Fatal Error発生時は後続処理を停止
- Debug JSONへBusinessEngine、RuleResolver、ValidationEngineを追加
- 旅客カードから営業規則とRuleResolverを展開可能

正式な規則マスターに条文番号が存在しない場合、架空の条文番号は生成しません。規則IDと参照元を表示します。


## Version 5.1 Stage 5

入力内容は120msの遅延後にValidationされ、対象入力欄へエラー状態を表示します。計算済みの経路は、旅客人数、区間サービス、手続駅、旅行日変更時に再利用されます。経路条件が変わった場合のみRouteEngineを再実行します。結果画面とDebug JSONでは各Engineの実行時間と経路再利用の有無を確認できます。検索履歴の「復元」からVersion 5.1形式の入力条件を戻せます。

## Version 5.1受入試験

Node.jsが利用できる環境では、次のコマンドでVersion 5.1の基礎受入試験を実行できます。

```bash
node tests/version51-acceptance.mjs
```

GitHub Pages公開後の確認項目は`RELEASE_CHECKLIST.md`を参照してください。
