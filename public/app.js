const $ = (selector) => document.querySelector(selector);

const elements = {
  form: $("#gift-form"),
  empty: $("#empty-state"),
  loading: $("#loading-state"),
  results: $("#results"),
  insight: $("#taste-insight"),
  affinities: $("#affinity-list"),
  recommendations: $("#recommendations"),
  review: $("#review-check"),
  approve: $("#approve-button"),
  checkout: $("#checkout-panel"),
  orderStatus: $("#order-status"),
  orderSummary: $("#order-summary"),
  guidance: $("#checkout-guidance"),
  paypalLink: $("#paypal-link"),
  demoPayer: $("#demo-payer-button"),
  capture: $("#capture-button"),
  traceToggle: $("#trace-toggle"),
  tracePanel: $("#trace-panel"),
  traceList: $("#trace-list"),
  status: $("#status-message"),
  error: $("#error-toast"),
  mode: $("#mode-pill")
};

const state = { plan: null, order: null, health: null };

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.code = body.code;
    throw error;
  }
  return body;
}

function announce(message) {
  elements.status.textContent = "";
  window.setTimeout(() => { elements.status.textContent = message; }, 20);
}

function showError(error) {
  elements.error.textContent = error.message;
  elements.error.hidden = false;
  window.setTimeout(() => { elements.error.hidden = true; }, 6500);
}

function list(value) {
  return String(value || "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

function money(value, currency) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function glyph(category) {
  const marks = { music: "♪", outdoors: "△", home: "⌂", food: "◌", art: "◇", technology: "⌁", games: "✦", wellness: "∿", photography: "◎", books: "≡", travel: "↗" };
  return marks[String(category).toLowerCase()] || "✧";
}

function renderRecommendations() {
  elements.recommendations.replaceChildren();
  state.plan.recommendations.forEach((product, index) => {
    const label = node("label", "product-option");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "gift-choice";
    radio.value = product.id;
    radio.checked = index === 0;
    radio.addEventListener("change", updateApprovalButton);

    const card = node("article", "product-card");
    const visual = node("div", "product-visual");
    visual.style.setProperty("--accent", product.accent || "#82aaa0");
    visual.append(node("span", "product-glyph", glyph(product.category)), node("span", "fit-score", `${product.fitScore}% fit`));
    const body = node("div", "product-body");
    const meta = node("div", "product-meta");
    meta.append(node("span", "", product.brand), node("span", "", money(product.price, product.currency)));
    body.append(meta, node("h3", "", product.title), node("p", "", product.reason));
    card.append(visual, body);
    label.append(radio, card);
    elements.recommendations.append(label);
  });
}

function renderTrace() {
  elements.traceList.replaceChildren();
  state.plan.trace.forEach((entry, index) => {
    const item = node("li");
    const main = node("div", "trace-main");
    main.append(node("strong", "", entry.action), node("span", "", `${entry.provider} · ${entry.output}`));
    item.append(node("span", "trace-index", String(index + 1).padStart(2, "0")), main, node("span", "trace-time", `${entry.durationMs} ms`));
    elements.traceList.append(item);
  });
}

function renderPlan() {
  elements.insight.textContent = state.plan.tasteProfile.insight;
  elements.affinities.replaceChildren(...state.plan.tasteProfile.affinities.slice(0, 7).map((affinity) => node("span", "affinity-chip", `${affinity.name} · ${affinity.domain}`)));
  renderRecommendations();
  renderTrace();
  elements.review.checked = false;
  elements.checkout.hidden = true;
  elements.results.hidden = false;
  elements.empty.hidden = true;
  elements.loading.hidden = true;
  updateApprovalButton();
  announce(`${state.plan.recommendations.length} gift recommendations are ready for review.`);
}

function selectedProduct() {
  const selected = document.querySelector('input[name="gift-choice"]:checked');
  return state.plan?.recommendations.find((product) => product.id === selected?.value);
}

function updateApprovalButton() {
  elements.approve.disabled = !state.plan || !selectedProduct() || !elements.review.checked;
}

function renderOrder() {
  const order = state.order;
  elements.checkout.hidden = false;
  elements.orderStatus.textContent = order.status;
  elements.orderSummary.replaceChildren(node("span", "", order.item.title), node("span", "", money(order.item.price, order.item.currency)));
  const demo = order.provider === "paypal-demo";
  elements.paypalLink.hidden = demo || !order.approveUrl;
  if (!elements.paypalLink.hidden) elements.paypalLink.href = order.approveUrl;
  elements.demoPayer.hidden = !demo || order.status !== "CREATED";
  elements.capture.disabled = order.status === "COMPLETED";
  elements.capture.hidden = order.status === "COMPLETED";
  elements.guidance.textContent = order.status === "COMPLETED"
    ? "Capture completed. In demo mode no money moved."
    : demo
      ? "Demo mode mirrors the PayPal state machine. Payer approval is a separate required step before capture."
      : "Open PayPal Sandbox, approve as the test payer, return here, then ask the server to verify and capture.";
  elements.checkout.scrollIntoView({ behavior: "smooth", block: "nearest" });
  announce(`PayPal order status: ${order.status}.`);
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.error.hidden = true;
  if (!elements.form.reportValidity()) return;
  const data = new FormData(elements.form);
  const payload = {
    recipient: data.get("recipient"),
    relationship: data.get("relationship"),
    occasion: data.get("occasion"),
    tastes: list(data.get("tastes")),
    avoid: list(data.get("avoid")),
    note: data.get("note"),
    budget: Number(data.get("budget")),
    currency: data.get("currency")
  };
  elements.empty.hidden = true;
  elements.results.hidden = true;
  elements.loading.hidden = false;
  try {
    state.plan = await api("/api/plans", { method: "POST", body: JSON.stringify(payload) });
    state.order = null;
    renderPlan();
  } catch (error) {
    elements.loading.hidden = true;
    elements.empty.hidden = false;
    showError(error);
  }
});

elements.review.addEventListener("change", updateApprovalButton);

elements.approve.addEventListener("click", async () => {
  const product = selectedProduct();
  if (!product || !elements.review.checked) return;
  elements.approve.disabled = true;
  try {
    state.order = await api(`/api/plans/${encodeURIComponent(state.plan.id)}/approve`, {
      method: "POST",
      body: JSON.stringify({
        productId: product.id,
        approvalToken: state.plan.approvalToken,
        confirmation: "I APPROVE THIS PURCHASE"
      })
    });
    renderOrder();
  } catch (error) {
    showError(error);
    updateApprovalButton();
  }
});

elements.demoPayer.addEventListener("click", async () => {
  elements.demoPayer.disabled = true;
  try {
    state.order = await api(`/api/demo/orders/${encodeURIComponent(state.order.id)}/payer-approve`, { method: "POST", body: "{}" });
    renderOrder();
  } catch (error) {
    showError(error);
    elements.demoPayer.disabled = false;
  }
});

elements.capture.addEventListener("click", async () => {
  elements.capture.disabled = true;
  try {
    state.order = await api(`/api/orders/${encodeURIComponent(state.order.id)}/capture`, { method: "POST", body: "{}" });
    renderOrder();
  } catch (error) {
    showError(error);
    elements.capture.disabled = false;
  }
});

elements.traceToggle.addEventListener("click", () => {
  const expanded = elements.traceToggle.getAttribute("aria-expanded") === "true";
  elements.traceToggle.setAttribute("aria-expanded", String(!expanded));
  elements.traceToggle.textContent = expanded ? "View agent trace" : "Hide agent trace";
  elements.tracePanel.hidden = expanded;
});

async function initialize() {
  try {
    state.health = await api("/api/health", { headers: {} });
    const modes = Object.values(state.health.adapters);
    const live = modes.some((mode) => mode === "live");
    elements.mode.classList.toggle("live", live);
    elements.mode.lastChild.textContent = live ? " Mixed / live adapters" : " Deterministic demo mode";
  } catch (error) {
    elements.mode.lastChild.textContent = " Backend unavailable";
    showError(error);
  }
}

initialize();
