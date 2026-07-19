# CHANGELOG
## Version 5.1 Stage 5

- 入力変更時のリアルタイムValidationと入力欄付近のエラー表示を追加。
- 旅客・料金・席種・手続駅変更時に経路結果を再利用する差分再計算を追加。
- RouteEngineを含むEngine実行時間とキャッシュ利用状態を結果・Debug JSONへ追加。
- Fatal Errorの発生Engineを画面ステータスへ表示。
- 検索履歴から駅・経由駅・旅客・手続駅・区間サービスを復元できる操作を追加。


## Version 5.1 Stage 1 - 2026-07-19

### 追加
- 旅客グループ・介助者を含むPassengerModel
- Version 5.1検索条件互換アダプター
- 区間サービス状態管理基盤
- 共通駅オートコンプリート基盤

### 修正
- ひらがな1文字から検索可能なStationSearchIndex
- 駅検索順位と文字列正規化
- PracticalOperationPlatformのVersion 5.1状態保持
- Service Workerの新規モジュールキャッシュ

### 削除
- なし

### 既知問題
- 旅客グループ別の運賃・料金・割引計算はStage 2で実装予定
- 新UIへの共通オートコンプリート接続はStage 2で実装予定


## Version 5.1 Stage 2 - 2026-07-19

### 追加
- 手続駅入力
- 複数経由駅の追加・削除・並べ替え
- 大人・小児・介助者の旅客入力UI
- 区間別列車種別・設備設定UI
- Version 5.1画面状態の保存・復元

### 修正
- 単一利用人数入力を新しい旅客グループ状態へ移行
- 全区間共通列車種別を区間別設定へ移行

## Version 5.1 Stage 3 - 2026-07-19

### 追加
- 旅客グループ別の普通運賃・区間料金・割引・小計計算
- 旅客別`formula_steps`と全旅客合計
- 旅客別料金カードと計算式表示

### 修正
- 人数を最終段階で一括乗算するVersion 5.0方式を廃止
- 人数・片道／往復を各旅客グループの小計へ反映

### 既知問題
- 正式マスターに未収録の急行・寝台・グランクラス・団体・その他割引は推測計算しない
- BusinessEngine・RuleResolverの旅客グループ別判定は次段階

## Version 5.1 Stage 4

### 追加

- 旅客グループ別営業規則結果
- RuleResolver候補・採用・却下結果
- 介助者組合せValidation
- 入力・経路・距離・計算結果の構造化Validation
- Fatal Error時の後続Engine停止
- BusinessEngine、RuleResolver、ValidationEngineのDebug JSON

### 修正

- 旅客別小計と総合計の整合性検証を追加
- 営業キロ取得失敗時に後続計算を停止

### 既知問題

- 正式マスターに存在しない条文番号は表示しません。
- 未収録の割引・料金は引き続き推測計算しません。

## Version 5.1 Final integration

- PWAキャッシュ名を`mars-killer-v5.1-final`へ更新。
- 乗車日の固定値を廃止し、起動日の初期値を使用。
- Version 5.1受入試験スクリプトを追加。
- 最終リリース確認表を追加。
- Stage 1〜5の変更ファイルを統合した最終パッケージを作成。
