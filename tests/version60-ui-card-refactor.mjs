import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';
import {PASSENGER_GROUP_DEFINITIONS, createPassengerState, normalizePassengers} from '../services/PassengerModel.js';
import {buildSectionServices} from '../services/SectionServiceManager.js';
import {PASSENGER_TYPE_OPTIONS, DISCOUNT_OPTIONS} from '../ui/PassengerCardList.js';
import {TRAIN_TYPE_OPTIONS, SEAT_TYPE_OPTIONS} from '../ui/SectionCardList.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../ui/Version51StateController.js', import.meta.url), 'utf8');

for (const token of ['id="passengerGroups"', 'id="addPassenger"', '＋旅客追加', 'id="sectionServices"', 'id="addSectionService"', '＋指定区画追加']) {
  assert.ok(html.includes(token), `UI token missing: ${token}`);
}
assert.ok(!html.includes('id="passengerTable"'), 'legacy passenger summary input must be removed');
assert.ok(html.includes('entry-card__fields'), 'responsive card CSS must exist');
assert.equal(PASSENGER_TYPE_OPTIONS.length, 3);
assert.deepEqual(PASSENGER_TYPE_OPTIONS.map(([, label]) => label), ['大人', '小児', '介助者']);
assert.deepEqual(DISCOUNT_OPTIONS.map(([, label]) => label), ['通常', '学割', '障害者1種', '障害者2種', '往復割引', '団体', '障害者1種介助', '障害者2種介助', 'その他割引']);
assert.equal(TRAIN_TYPE_OPTIONS.length, 5);
assert.equal(SEAT_TYPE_OPTIONS.length, 6);
assert.equal(PASSENGER_GROUP_DEFINITIONS.length, PASSENGER_TYPE_OPTIONS.length * DISCOUNT_OPTIONS.length);
assert.equal(new Set(PASSENGER_GROUP_DEFINITIONS.map(row => row.passenger_group_id)).size, PASSENGER_GROUP_DEFINITIONS.length);

const state = createPassengerState([{passenger_group_id: 'adult-normal', count: 2}]);
const normalized = normalizePassengers({passengers: state});
assert.equal(normalized.length, 1);
assert.equal(normalized[0].count, 2);

const services = buildSectionServices([{from: '札幌', to: '小樽', line: '函館線'}]);
assert.equal(services[0].from_station_name, '札幌');
assert.equal(services[0].to_station_name, '小樽');

for (const token of ['setupPassengerCards()', 'setupSectionCards()', 'routeStations()', "emitChange('passengers')", "emitChange('section-services')"]) {
  assert.ok(controller.includes(token), `controller integration missing: ${token}`);
}

console.log('Version 6.0 UI card refactor acceptance: PASS');
