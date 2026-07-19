import assert from 'node:assert/strict';
import {
  createPassengerState,
  normalizePassengers,
  passengerTotals,
  validatePassengers
} from '../services/PassengerModel.js';
import {
  buildSectionServices,
  validateSectionServices
} from '../services/SectionServiceManager.js';
import StationSearchIndex from '../services/StationSearchIndex.js';
import {normalizeSearchConditions} from '../services/SearchConditionAdapter.js';

const stations = [
  {station_id: 'S01', station_name: '札幌', station_name_kana: 'さっぽろ', station_code: '01'},
  {station_id: 'S02', station_name: '新札幌', station_name_kana: 'しんさっぽろ', station_code: '02'},
  {station_id: 'S03', station_name: '小樽', station_name_kana: 'おたる', station_code: '03'}
];

const index = new StationSearchIndex(stations);
assert.equal(index.search('さ')[0].station_id, 'S01', 'ひらがな1文字検索');
assert.equal(index.search('０２')[0].station_id, 'S02', '全角駅コード検索');
assert.equal(index.getById('S03').station_name, '小樽', 'station_id検索');

const passengers = normalizePassengers({
  passengers: [
    {passenger_group_id: 'adult-normal', count: 2},
    {passenger_group_id: 'child-normal', count: 1}
  ]
});
assert.deepEqual(passengerTotals(passengers), {
  adult_count: 2,
  child_count: 1,
  assistant_count: 0,
  total_count: 3
});
assert.equal(validatePassengers(passengers).isValid, true, '旅客Validation');
assert.equal(validatePassengers([
  {passenger_group_id: 'assistant-normal', age_category: 'assistant', discount_type: 'assistant_normal', count: 1}
]).isValid, false, '介助者のみを拒否');

const first = buildSectionServices([
  {segment_id: 'SEG-1', from_station_id: 'S01', to_station_id: 'S02'}
]);
first[0].train_type = 'limited_express';
first[0].seat_type = 'reserved';
const restored = buildSectionServices([
  {segment_id: 'SEG-1', from_station_id: 'S01', to_station_id: 'S02'}
], first);
assert.equal(restored[0].train_type, 'limited_express', '区間設定引継ぎ');
assert.equal(restored[0].seat_type, 'reserved', '席種引継ぎ');
assert.equal(validateSectionServices(restored).isValid, true, '区間Validation');

const normalized = normalizeSearchConditions({
  start: '札幌',
  goal: '小樽',
  via: ['新札幌'],
  passenger_count: 2
});
assert.equal(normalized.passengers[0].count, 2, '旧人数形式の互換変換');
assert.equal(normalized.passenger_totals.total_count, 2, '互換人数集計');

assert.equal(createPassengerState().length >= 15, true, '旅客区分定義');
console.log('Version 5.1 acceptance tests: PASS');
