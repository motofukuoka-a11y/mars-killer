import DynamicCardList from './DynamicCardList.js';

export const PASSENGER_TYPE_OPTIONS = Object.freeze([
  ['adult', '大人'],
  ['child', '小児'],
  ['assistant', '介助者']
]);

export const DISCOUNT_OPTIONS = Object.freeze([
  ['none', '通常'],
  ['student', '学割'],
  ['disability_type1', '障害者1種'],
  ['disability_type2', '障害者2種'],
  ['round_trip', '往復割引'],
  ['group', '団体'],
  ['assistant_type1', '障害者1種介助'],
  ['assistant_type2', '障害者2種介助'],
  ['other', 'その他割引']
]);

const clampCount = value => Math.max(1, Math.min(99, Number(value) || 1));

export default class PassengerCardList extends DynamicCardList {
  createDefaultItem() {
    return {age_category: 'adult', discount_type: 'none', count: 1};
  }

  adjustCount(index, delta) {
    const item = this.items[index];
    if (!item) return;
    item.count = clampCount(Number(item.count) + delta);
    this.changed();
  }

  update(index, field, value) {
    super.update(index, field, field === 'count' ? clampCount(value) : value);
  }

  renderCard(item, index) {
    const number = index + 1;
    return `
      <article class="entry-card passenger-entry-card" data-card-index="${index}">
        <div class="entry-card__header">
          <h3>旅客${number}</h3>
          <button class="entry-card__delete" type="button" data-card-action="remove" aria-label="旅客${number}を削除">削除</button>
        </div>
        <div class="entry-card__fields">
          <label>旅客区分
            <select data-card-field="age_category">
              ${this.options(PASSENGER_TYPE_OPTIONS, item.age_category)}
            </select>
          </label>
          <label>割引区分
            <select data-card-field="discount_type">
              ${this.options(DISCOUNT_OPTIONS, item.discount_type)}
            </select>
          </label>
          <div class="entry-card__full">
            <span class="field-label">人数</span>
            <div class="count-stepper" role="group" aria-label="旅客${number}の人数">
              <button type="button" data-card-action="decrement" aria-label="1人減らす">−</button>
              <input type="number" min="1" max="99" step="1" inputmode="numeric" data-card-field="count" value="${clampCount(item.count)}" aria-label="人数">
              <button type="button" data-card-action="increment" aria-label="1人増やす">＋</button>
            </div>
          </div>
        </div>
      </article>`;
  }

  options(rows, selected) {
    return rows.map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
  }
}
