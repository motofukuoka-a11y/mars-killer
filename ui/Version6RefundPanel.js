import Version6RefundController from './Version6RefundController.js';

const operation = document.getElementById('operation');
const panel = document.getElementById('version6Options');
const result = document.getElementById('result');
const calc = document.getElementById('calc');
const debug = document.getElementById('debugMode');

if (operation && panel && result && calc) {
  const controller = new Version6RefundController({root:panel,result,debug:debug?.checked});
  window.__MARS_KILLER_V6_CONTROLLER__ = controller;

  const sync = () => {
    const active = ['passenger_refund','accident_handling'].includes(operation.value);
    panel.hidden = !active;
    if (active) {
      document.getElementById('refundOptions').hidden = true;
      document.getElementById('businessOptions').hidden = true;
      calc.textContent = operation.value === 'accident_handling' ? '事故取扱を判定' : '旅客払戻を計算';
    }
    const accident = operation.value === 'accident_handling';
    panel.querySelector('[data-v6-accident]').hidden = !accident;
  };

  operation.addEventListener('change', sync);
  debug?.addEventListener('change', () => controller.setDebug(debug.checked));
  panel.querySelector('[name="ticket_type"]')?.addEventListener('change', event => {
    panel.dataset.ticketType = event.target.value;
  });
  sync();
}
