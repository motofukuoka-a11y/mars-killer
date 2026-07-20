import assert from 'node:assert/strict';
import fs from 'node:fs';
import ChargeAmountResolver from '../services/ChargeAmountResolver.js';

const master = JSON.parse(fs.readFileSync(new URL('../data/rules/charge_amount_overrides.json', import.meta.url), 'utf8'));
const resolver = new ChargeAmountResolver(master);

assert.equal(resolver.resolve({
  tableId: 'JRH_A_EXPRESS_RESERVED',
  start: '札幌',
  goal: '苫小牧',
  passenger: 'adult',
  calculatedAmount: 1730
}), 1680);
assert.equal(resolver.resolve({
  tableId: 'JRH_A_EXPRESS_RESERVED',
  start: '苫小牧',
  goal: '札幌',
  passenger: 'adult',
  calculatedAmount: 1730
}), 1680);
assert.equal(resolver.resolve({
  tableId: 'JRH_A_EXPRESS_RESERVED',
  start: '札幌',
  goal: '苫小牧',
  passenger: 'child',
  calculatedAmount: 870
}), 840);
assert.equal(resolver.resolve({
  tableId: 'JRH_A_EXPRESS_RESERVED',
  start: '札幌',
  goal: '函館',
  passenger: 'adult',
  calculatedAmount: 3170
}), 3170);


const nestedComponent = resolver.apply({
  component: 'limited_express_reserved',
  amount_yen: 1730,
  breakdown: [{
    table_id: 'JRH_A_EXPRESS_RESERVED',
    amount_yen: 1730,
    base_amount_yen: 1730,
    season_adjustment_yen: 0
  }]
}, {start: '札幌', goal: '苫小牧', passenger: 'adult'});
assert.equal(nestedComponent.amount_yen, 1680);
assert.equal(nestedComponent.breakdown[0].amount_yen, 1680);
assert.equal(nestedComponent.master_adjustment.table_id, 'JRH_A_EXPRESS_RESERVED');

const controller = fs.readFileSync(new URL('../ui/Version51StateController.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const platform = fs.readFileSync(new URL('../services/PracticalOperationPlatform.js', import.meta.url), 'utf8');
const passengerCalculation = fs.readFileSync(new URL('../services/PassengerCalculationService.js', import.meta.url), 'utf8');
const engine = fs.readFileSync(new URL('../engine.js', import.meta.url), 'utf8');

assert.match(controller, /setupTicketTypeTransitions\(\)/);
assert.match(controller, /this\.root\.addEventListener\('click'/);
assert.match(controller, /closest\?\.\('\[data-ticket-type\]'\)/);
assert.match(controller, /addEventListener\('click'/);
assert.match(controller, /ticket_type: this\.state\.calculation\.ticket_type/);
assert.match(app, /ticketType: v51\.ticketType \|\| v51\.ticket_type \|\| 'ordinary'/);
assert.match(platform, /ticket_type: options\.ticketType \|\| options\.ticket_type \|\| 'ordinary'/);
assert.match(passengerCalculation, /chargeAmountResolver\.apply/);
assert.match(engine, /charge_amount_overrides\.json/);
assert.match(engine, /refundTargetAmount/);

console.log('Version 6 ticket tab and charge amount fix: PASS');
