/**
 * RefundEngine
 *
 * 払戻計算専用
 */

export default class RefundEngine {

  calculate(ticket) {

    const result = {
      refund: 0,
      fee: 0,
      evidence: []
    };

    if (!ticket)
        throw new Error("Ticket is required.");

    switch (ticket.type) {

      case "乗車券":
        result.fee = 220;
        break;

      case "自由席特急券":
        result.fee = 220;
        break;

      case "指定席特急券":

        if (ticket.beforeDeparture === true) {

            if (ticket.daysBefore >= 2) {

                result.fee = 340;

            } else {

                result.fee = Math.max(
                    340,
                    Math.floor(ticket.price * 0.3)
                );

            }

        } else {

            throw new Error("列車出発後は払戻できません。");

        }

        break;

      default:
        throw new Error("未対応の券種です。");

    }

    result.refund = Math.max(
        0,
        ticket.price - result.fee
    );

    result.evidence.push({
        rule: "払戻手数料",
        fee: result.fee
    });

    return result;

  }

}