# Version 6 Ticket Tab / Charge Amount Fix v2

## 原因

1. 券種タブのイベントが初期表示時の要素へ個別登録される方式で、画面切替やDOM差替え後のタブを捕捉できない経路があった。
2. `limitedExpressCharge()`の料金表IDはトップレベルではなく`breakdown[].table_id`に格納されるが、料金補正処理がトップレベルだけを参照していた。そのため札幌―苫小牧の1680円補正が払戻計算経路で適用されず、1730円が残る場合があった。

## 修正

- `Version51StateController`の券種切替をルート要素のclick/changeイベント委譲へ変更。
- 既存タブ、後から生成・差替えされたタブ、radio/select/hidden入力を同じ状態へ同期。
- `ticketType`/`ticket_type`は既存の`getOptions()`からBusinessEngine評価コンテキストへ渡す。
- `ChargeAmountResolver`が`component.breakdown[].table_id`も参照し、補正後金額をトップレベルと該当breakdownの双方へ反映。
- 札幌―苫小牧 A特急指定席は大人1680円、小児840円。

## 非変更範囲

営業キロ、換算キロ、経路解析、RuleResolver、UIデザイン。

## 検証

- ESLint: 0 errors
- Build: PASS
- UI card test: PASS
- ticket/charge regression test: PASS
