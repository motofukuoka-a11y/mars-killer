import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';
import {PASSENGER_GROUP_DEFINITIONS, createPassengerState, normalizePassengers} from '../services/PassengerModel.js';
import {buildSectionServices} from '../services/SectionServiceManager.js';
import {PASSENGER_TYPE_OPTIONS, DISCOUNT_OPTIONS} from '../ui/PassengerCardList.js';
import SectionCardList, {TRAIN_TYPE_OPTIONS, SEAT_TYPE_OPTIONS} from '../ui/SectionCardList.js';

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

const sectionCards = Object.create(SectionCardList.prototype);
sectionCards.stations = [
  {station_id: 'S01', station_name: '札幌'},
  {station_id: 'S02', station_name: '小樽'},
  {station_id: 'S03', station_name: '倶知安'},
  {station_id: 'S04', station_name: '長万部'}
];
sectionCards.items = [];
const initialSection = sectionCards.createInitialItem();
assert.equal(initialSection.from_station_name, '札幌');
assert.equal(initialSection.to_station_name, '長万部');
assert.equal(initialSection.train_type, 'local');
assert.equal(initialSection.seat_type, 'none');
sectionCards.items = [initialSection];
const addedSection = sectionCards.createDefaultItem();
assert.equal(addedSection.from_station_name, '長万部');
assert.equal(addedSection.to_station_name, '');
assert.equal(addedSection.to_station_id, null);
assert.ok(sectionCards.stationOptions('name:', true).includes('未選択'));

for (const token of ['setupPassengerCards()', 'setupSectionCards()', 'routeStations()', 'createInitialItem()', "emitChange('passengers')", "emitChange('section-services')"]) {
  assert.ok(controller.includes(token), `controller integration missing: ${token}`);
}

assert.ok(!controller.includes('buildSectionServices(sections, [])'), 'route search must not expand all route sections into UI cards');


// 指定区画のselectは再描画後に直接changeイベントを登録する。
const eventSectionCards = Object.create(SectionCardList.prototype);
eventSectionCards.stations = sectionCards.stations;
eventSectionCards.items = [initialSection, addedSection];
let changedCount = 0;
eventSectionCards.changed = render => {
  assert.equal(render, false);
  changedCount += 1;
};
eventSectionCards.handleSelectChange = SectionCardList.prototype.handleSelectChange.bind(eventSectionCards);

const listeners = [];
const fakeSelects = [
  {field: 'train_type', value: 'limited_express', index: 0},
  {field: 'seat_type', value: 'reserved', index: 0},
  {field: 'train_type', value: 'rapid', index: 1},
  {field: 'seat_type', value: 'non_reserved', index: 1}
].map(definition => ({
  dataset: {cardField: definition.field},
  value: definition.value,
  closest: selector => selector === '[data-card-index]'
    ? {dataset: {cardIndex: String(definition.index)}}
    : null,
  addEventListener: (type, listener) => listeners.push({type, listener, definition})
}));
eventSectionCards.container = {
  querySelectorAll: selector => selector === 'select[data-card-field]' ? fakeSelects : []
};
SectionCardList.prototype.afterRender.call(eventSectionCards);
assert.equal(listeners.length, 4, 'existing and dynamically added cards must receive select change events');
for (const {type, listener, definition} of listeners) {
  assert.equal(type, 'change');
  listener({currentTarget: fakeSelects.find(select => select.dataset.cardField === definition.field && select.value === definition.value && select.closest('[data-card-index]').dataset.cardIndex === String(definition.index))});
}
assert.equal(eventSectionCards.items[0].train_type, 'limited_express');
assert.equal(eventSectionCards.items[0].seat_type, 'reserved');
assert.equal(eventSectionCards.items[1].train_type, 'rapid');
assert.equal(eventSectionCards.items[1].seat_type, 'non_reserved');
assert.equal(changedCount, 4);
assert.equal(eventSectionCards.items[0].charge_applicable, true);
assert.equal(eventSectionCards.items[1].charge_applicable, true);

console.log('Version 6.0 UI card refactor acceptance: PASS');
