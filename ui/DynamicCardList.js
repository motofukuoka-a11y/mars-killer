export default class DynamicCardList {
  constructor({container, addButton, itemName, onChange}) {
    this.container = container;
    this.addButton = addButton;
    this.itemName = itemName;
    this.onChange = onChange;
    this.items = [];
    this.handleClick = this.handleClick.bind(this);
    this.handleInput = this.handleInput.bind(this);
  }

  init() {
    this.addButton?.addEventListener('click', () => this.add());
    this.container?.addEventListener('click', this.handleClick);
    this.container?.addEventListener('input', this.handleInput);
    this.container?.addEventListener('change', this.handleInput);
    return this;
  }

  setItems(items = []) {
    this.items = items.map(item => ({...item}));
    this.render();
  }

  add(item = this.createDefaultItem()) {
    this.items.push({...item});
    this.changed();
  }

  remove(index) {
    this.items.splice(index, 1);
    this.changed();
  }

  update(index, field, value) {
    const item = this.items[index];
    if (!item) return;
    item[field] = value;
    this.changed(false);
  }

  handleClick(event) {
    const action = event.target.closest('[data-card-action]')?.dataset.cardAction;
    if (!action) return;
    const card = event.target.closest('[data-card-index]');
    const index = Number(card?.dataset.cardIndex);
    if (action === 'remove' && Number.isInteger(index)) this.remove(index);
    if (action === 'decrement' && Number.isInteger(index)) this.adjustCount(index, -1);
    if (action === 'increment' && Number.isInteger(index)) this.adjustCount(index, 1);
  }

  handleInput(event) {
    const field = event.target.dataset.cardField;
    if (!field) return;
    const card = event.target.closest('[data-card-index]');
    const index = Number(card?.dataset.cardIndex);
    if (!Number.isInteger(index)) return;
    this.update(index, field, event.target.value);
  }

  adjustCount() {}

  createDefaultItem() {
    return {};
  }

  changed(render = true) {
    if (render) this.render();
    this.onChange?.(this.items.map(item => ({...item})));
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = this.items.map((item, index) => this.renderCard(item, index)).join('');
    this.afterRender();
  }

  afterRender() {}

  renderCard() {
    return '';
  }

  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }
}
