import crypto from "node:crypto";

export class MemoryStore {
  constructor() {
    this.plans = new Map();
    this.orders = new Map();
  }

  savePlan(plan) {
    this.plans.set(plan.id, plan);
    return plan;
  }

  getPlan(id) {
    const plan = this.plans.get(id);
    if (!plan) throw Object.assign(new Error("Gift plan not found."), { status: 404, code: "PLAN_NOT_FOUND" });
    return plan;
  }

  beginApproval(planId, productId) {
    const plan = this.getPlan(planId);
    if (plan.orderId) return { plan, order: this.getOrder(plan.orderId), repeated: true };
    if (plan.status !== "AWAITING_HUMAN_APPROVAL") {
      throw Object.assign(new Error("This plan cannot enter checkout from its current state."), { status: 409, code: "INVALID_PLAN_STATE" });
    }
    const product = plan.recommendations.find((candidate) => candidate.id === productId);
    if (!product) throw Object.assign(new Error("The selected product is not part of this plan."), { status: 422, code: "INVALID_PRODUCT" });
    plan.status = "CREATING_ORDER";
    plan.selectedProduct = product;
    plan.humanApprovedAt = new Date().toISOString();
    return { plan, product, repeated: false };
  }

  failApproval(planId) {
    const plan = this.getPlan(planId);
    plan.status = "AWAITING_HUMAN_APPROVAL";
    delete plan.selectedProduct;
    delete plan.humanApprovedAt;
  }

  completeApproval(planId, providerOrder, providerName) {
    const plan = this.getPlan(planId);
    const order = {
      id: crypto.randomUUID(),
      planId,
      provider: providerName,
      providerOrderId: providerOrder.id,
      status: providerOrder.status,
      approveUrl: providerOrder.approveUrl,
      item: plan.selectedProduct,
      humanApprovedAt: plan.humanApprovedAt,
      createdAt: new Date().toISOString()
    };
    this.orders.set(order.id, order);
    plan.orderId = order.id;
    plan.status = "PAYPAL_ORDER_CREATED";
    return order;
  }

  getOrder(id) {
    const order = this.orders.get(id);
    if (!order) throw Object.assign(new Error("Checkout order not found."), { status: 404, code: "ORDER_NOT_FOUND" });
    return order;
  }

  markPayerApproved(id, providerStatus) {
    const order = this.getOrder(id);
    order.status = providerStatus;
    order.payerApprovedAt = new Date().toISOString();
    return order;
  }

  markCaptured(id, capture) {
    const order = this.getOrder(id);
    order.status = capture.status;
    order.captureId = capture.captureId;
    order.capturedAt = new Date().toISOString();
    const plan = this.getPlan(order.planId);
    plan.status = "COMPLETED";
    return order;
  }
}
