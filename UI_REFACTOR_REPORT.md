# MARS KILLER Version 6 UIカードリファクタリング

## 実装内容

- 旅客入力を、旅客区分・割引区分・人数を持つ動的カードへ変更。
- 「＋旅客追加」とカード単位の削除を追加。
- 人数の減算・加算・直接入力を維持。
- 指定区画を、乗車駅・降車駅・列車種別・設備席種を持つ動的カードへ変更。
- 「＋指定区画追加」とカード単位の削除を追加。
- カード削除後は配列順に旅客番号・区画番号を自動再採番。
- 乗車駅・降車駅は、計算済み経路の区間から抽出した駅だけを選択肢に使用。
- 既存の旅客配列・section_servicesへ変換し、BusinessEngineおよびRuleResolverの呼出し形式を維持。
- ダークテーマを継承し、スマートフォン優先の1列表示、タブレット・PCの2列表示を追加。

## 追加コンポーネント

- `ui/DynamicCardList.js`
- `ui/PassengerCardList.js`
- `ui/SectionCardList.js`

## 変更ファイル

- `index.html`
- `service-worker.js`
- `ui/Version51StateController.js`
- `services/PassengerModel.js`
- `services/SectionServiceManager.js`
- `VERSION6_OVERLAY_MANIFEST.json`
- `package.json`
- `package-lock.json`
- `eslint.config.js`
- `tests/version60-stage6-ui-integration.mjs`
- `tests/version60-ui-card-refactor.mjs`

`mk_v51/`以下にも同内容の変更ファイルを収録している。

## 検証

- ESLint: 0 errors
- Build: PASS
- UIカード受入試験: PASS
- Version 6 Stage 1〜8および既存統合試験: PASS
- 10,000回負荷試験: PASS

## 未実施

完全リポジトリに存在するCSS・アイコン・全マスターが今回の累積オーバーレイには含まれないため、実機のiPhone・iPad・PCブラウザによる視覚確認とPWAインストール試験は未実施。

## 今後改善できるUI案

- 同じ旅客区分・割引区分の重複カードを画面上で統合する案内。
- 乗車駅より前の駅を降車駅から除外し、逆順指定を防ぐ制御。
- 列車名データが経路結果に含まれる場合の「北斗」「快速エアポート」等の列車名選択。
- カード複製ボタン。
- 入力内容を保持したままカードを並べ替えるドラッグ操作。
