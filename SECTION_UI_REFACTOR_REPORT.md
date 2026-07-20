# Version 6 指定区画UI修正報告

## 変更範囲

UI層のみを変更した。営業キロ、換算キロ、BusinessEngine、RuleResolver、経路解析ロジックには変更を加えていない。

## 新しい動作

- 経路検索直後に生成する指定区画カードは1件のみ。
- 初期カードは、乗車駅を検索経路の発駅、降車駅を着駅、列車種別を普通、設備・席種をなしに設定する。
- 経路内の全区画はUIへ自動展開しない。
- 経路解析結果は従来どおり `state.route.distance` に保持する。
- 「＋指定区画追加」を押した場合だけカードを追加する。
- 追加カードの乗車駅は、直前カードの降車駅を引き継ぐ。
- 追加カードの降車駅は「未選択」とする。
- 削除後は共通カードコンポーネントの再描画により区画番号を自動採番し直す。

## 変更ファイル

- `ui/SectionCardList.js`
- `ui/Version51StateController.js`
- `tests/version60-ui-card-refactor.mjs`
- `VERSION6_OVERLAY_MANIFEST.json`
- `mk_v51/ui/SectionCardList.js`
- `mk_v51/ui/Version51StateController.js`

## 検証

- ESLint: 0 errors
- Build: PASS
- UIカード受入試験: PASS
- Stage 1〜8および統合・異常系・負荷試験: PASS

完全な歴史リポジトリに含まれるCSS、アイコン、マスター類が当該累積ZIPに含まれていないため、実ブラウザおよびPWAの最終確認は別途必要。
