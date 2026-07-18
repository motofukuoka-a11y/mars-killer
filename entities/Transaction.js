/**
 * Transaction
 * 1件のお客様対応を表すエンティティ
 */

export default class Transaction {
  constructor({
    id,
    businessCase,
    context,
    journey,
    products = [],
    tickets = [],
    status = "IN_PROGRESS",
    createdAt = new Date(),
  }) {
    this.id = id;
    this.businessCase = businessCase;

    this.context = context;
    this.journey = journey;

    this.products = products;
    this.tickets = tickets;

    this.status = status;

    this.createdAt = createdAt;
    this.updatedAt = createdAt;

    this.evidence = [];
    this.messages = [];
  }

  addProduct(product) {
    this.products.push(product);
    this.touch();
  }

  addTicket(ticket) {
    this.tickets.push(ticket);
    this.touch();
  }

  addEvidence(evidence) {
    this.evidence.push(evidence);
    this.touch();
  }

  addMessage(message) {
    this.messages.push(message);
    this.touch();
  }

  complete() {
    this.status = "COMPLETED";
    this.touch();
  }

  hold() {
    this.status = "ON_HOLD";
    this.touch();
  }

  discard() {
    this.status = "DISCARDED";
    this.touch();
  }

  touch() {
    this.updatedAt = new Date();
  }
}