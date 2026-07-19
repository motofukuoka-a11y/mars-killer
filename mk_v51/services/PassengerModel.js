export const AGE_CATEGORIES = Object.freeze({
  ADULT: 'adult',
  CHILD: 'child',
  ASSISTANT: 'assistant'
});

export const DISCOUNT_TYPES = Object.freeze({
  NONE: 'none',
  STUDENT: 'student',
  DISABILITY_TYPE1: 'disability_type1',
  DISABILITY_TYPE2: 'disability_type2',
  ROUND_TRIP: 'round_trip',
  GROUP: 'group',
  OTHER: 'other',
  ASSISTANT_NORMAL: 'assistant_normal',
  ASSISTANT_TYPE1: 'assistant_type1',
  ASSISTANT_TYPE2: 'assistant_type2'
});

export const MAX_PASSENGER_COUNT = 99;

const DEFINITIONS = Object.freeze([
  ['adult-normal', AGE_CATEGORIES.ADULT, DISCOUNT_TYPES.NONE, '大人', '通常'],
  ['adult-student', AGE_CATEGORIES.ADULT, DISCOUNT_TYPES.STUDENT, '大人', '学割'],
  ['adult-disability-type1', AGE_CATEGORIES.ADULT, DISCOUNT_TYPES.DISABILITY_TYPE1, '大人', '障害者1種'],
  ['adult-disability-type2', AGE_CATEGORIES.ADULT, DISCOUNT_TYPES.DISABILITY_TYPE2, '大人', '障害者2種'],
  ['adult-round-trip', AGE_CATEGORIES.ADULT, DISCOUNT_TYPES.ROUND_TRIP, '大人', '往復割引'],
  ['adult-group', AGE_CATEGORIES.ADULT, DISCOUNT_TYPES.GROUP, '大人', '団体'],
  ['adult-other', AGE_CATEGORIES.ADULT, DISCOUNT_TYPES.OTHER, '大人', 'その他割引'],
  ['child-normal', AGE_CATEGORIES.CHILD, DISCOUNT_TYPES.NONE, '小児', '通常'],
  ['child-disability-type1', AGE_CATEGORIES.CHILD, DISCOUNT_TYPES.DISABILITY_TYPE1, '小児', '障害者1種'],
  ['child-disability-type2', AGE_CATEGORIES.CHILD, DISCOUNT_TYPES.DISABILITY_TYPE2, '小児', '障害者2種'],
  ['child-group', AGE_CATEGORIES.CHILD, DISCOUNT_TYPES.GROUP, '小児', '団体'],
  ['child-other', AGE_CATEGORIES.CHILD, DISCOUNT_TYPES.OTHER, '小児', 'その他割引'],
  ['assistant-normal', AGE_CATEGORIES.ASSISTANT, DISCOUNT_TYPES.ASSISTANT_NORMAL, '介助者', '通常介助者'],
  ['assistant-disability-type1', AGE_CATEGORIES.ASSISTANT, DISCOUNT_TYPES.ASSISTANT_TYPE1, '介助者', '障害者1種介助者'],
  ['assistant-disability-type2', AGE_CATEGORIES.ASSISTANT, DISCOUNT_TYPES.ASSISTANT_TYPE2, '介助者', '障害者2種介助者']
]);

export const PASSENGER_GROUP_DEFINITIONS = Object.freeze(
  DEFINITIONS.map(([passenger_group_id, age_category, discount_type, age_label, discount_label]) =>
    Object.freeze({passenger_group_id, age_category, discount_type, age_label, discount_label})
  )
);

const DEFINITION_BY_ID = new Map(
  PASSENGER_GROUP_DEFINITIONS.map(definition => [definition.passenger_group_id, definition])
);

const toCount = value => {
  if (value === '' || value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
};

export function createPassengerState(source = []) {
  const counts = new Map(
    Array.isArray(source)
      ? source.map(row => [row.passenger_group_id, toCount(row.count)])
      : []
  );

  return PASSENGER_GROUP_DEFINITIONS.map(definition => ({
    ...definition,
    count: Number.isFinite(counts.get(definition.passenger_group_id))
      ? counts.get(definition.passenger_group_id)
      : 0
  }));
}

export function normalizePassengers(input = {}) {
  if (Array.isArray(input.passengers)) {
    return createPassengerState(input.passengers)
      .filter(row => row.count > 0)
      .map(row => ({
        passenger_group_id: row.passenger_group_id,
        age_category: row.age_category,
        discount_type: row.discount_type,
        count: row.count
      }));
  }

  const legacyCount = toCount(input.passenger_count ?? input.people ?? input.passengers);
  if (Number.isInteger(legacyCount) && legacyCount > 0) {
    return [{
      passenger_group_id: 'adult-normal',
      age_category: AGE_CATEGORIES.ADULT,
      discount_type: DISCOUNT_TYPES.NONE,
      count: legacyCount,
      migrated_from_legacy_count: true
    }];
  }

  return [];
}

export function passengerTotals(passengers = []) {
  return passengers.reduce((totals, passenger) => {
    const count = Number(passenger.count) || 0;
    if (passenger.age_category === AGE_CATEGORIES.ADULT) totals.adult_count += count;
    if (passenger.age_category === AGE_CATEGORIES.CHILD) totals.child_count += count;
    if (passenger.age_category === AGE_CATEGORIES.ASSISTANT) totals.assistant_count += count;
    totals.total_count += count;
    return totals;
  }, {
    adult_count: 0,
    child_count: 0,
    assistant_count: 0,
    total_count: 0
  });
}

export function validatePassengers(passengers = []) {
  const errors = [];
  const warnings = [];
  let disabledCount = 0;
  let assistantCount = 0;

  for (const passenger of passengers) {
    const definition = DEFINITION_BY_ID.get(passenger.passenger_group_id);
    if (!definition) {
      errors.push(`存在しない旅客区分です：${passenger.passenger_group_id}`);
      continue;
    }

    const count = Number(passenger.count);
    if (!Number.isInteger(count) || count < 0) {
      errors.push(`${definition.age_label}${definition.discount_label}の人数は0以上の整数で入力してください。`);
    } else if (count > MAX_PASSENGER_COUNT) {
      errors.push(`${definition.age_label}${definition.discount_label}の人数は${MAX_PASSENGER_COUNT}人以下で入力してください。`);
    }

    if (definition.age_category === AGE_CATEGORIES.ASSISTANT) assistantCount += Math.max(count, 0);
    if ([DISCOUNT_TYPES.DISABILITY_TYPE1, DISCOUNT_TYPES.DISABILITY_TYPE2].includes(definition.discount_type)) {
      disabledCount += Math.max(count, 0);
    }
  }

  const totals = passengerTotals(passengers);
  if (totals.total_count === 0) errors.push('大人または小児を1人以上指定してください。');
  if (assistantCount > 0 && disabledCount === 0) errors.push('介助者のみを指定することはできません。');
  if (disabledCount > assistantCount) warnings.push('障害者人数に対して介助者人数が少ない可能性があります。');
  if (assistantCount > disabledCount) warnings.push('障害者人数に対して介助者人数が多い可能性があります。');
  if (totals.total_count >= 50) warnings.push('旅客人数が非常に多いため、団体取扱い等を確認してください。');

  return {errors, warnings, infos: [], isValid: errors.length === 0, passenger_totals: totals};
}
