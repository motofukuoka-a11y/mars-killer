# 指定区画プルダウンイベント修正

## 原因

指定区画カードのプルダウンは、親コンテナに登録したイベント委譲だけで状態更新していました。カードは `innerHTML` により再生成されるため、既存カードと追加カードで確実に `select` の変更イベントを捕捉する専用の再登録処理がなく、UI統合環境によって列車種別・設備席種の変更がSectionデータへ同期されない状態が発生していました。

また、`input` と `change` の両方を同じ委譲ハンドラーで処理しており、selectに必要なイベント経路が明確に分離されていませんでした。

## 修正

- `SectionCardList.afterRender()` を追加。
- カード描画・再描画のたびに、すべての `select[data-card-field]` へ直接 `change` イベントを登録。
- `handleSelectChange()` でカード番号とフィールド名を取得し、`SectionCardList.update()` を通してSectionデータへ反映。
- selectについては親コンテナの `input/change` 委譲との二重処理を防止。
- 指定区画selectへ `pointer-events:auto`、`touch-action:manipulation` を指定し、モバイルでのタップ操作を阻害しないよう補強。
- 既存カードと追加後カードの列車種別・設備席種変更を確認する受入試験を追加。

## 非変更範囲

- 営業キロ計算
- 換算キロ計算
- BusinessEngine
- RuleResolver
- 経路解析
- 払戻計算

## 検証

- ESLint: PASS（0 errors）
- Build: PASS
- UIカード受入試験: PASS
- Stage 1〜8試験: PASS
- 統合・異常系試験: PASS
- 10,000回負荷試験: PASS

実ブラウザ・実機でのネイティブプルダウン表示確認は、完全リポジトリとブラウザ環境が未提供のため未実施です。
