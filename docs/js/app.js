const API = location.protocol === "file:" ? "http://localhost:8000" : "";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const REASONS = ["區域大型活動（如園遊會、運動會）", "促銷或檔期備貨", "天候或颱風備貨", "客戶／團體預訂", "其他（請說明）"];
const TABS = [["order", "補貨建議", "manager"], ["count", "今日盤點", "manager"], ["products", "商品管理", "manager"], ["orders", "訂單履歷", "all"], ["counts", "盤點履歷", "manager"], ["audit", "稽核日誌", "all"], ["hq", "總部總覽", "hq"]];
const STATUS = { SENT: "待總部確認", CONFIRMED: "總部已確認" };
const ts = (t) => esc(t.replace("T", " "));
const spark = (a) => { const m = Math.max(...a, 1); return a.map((v) => "▁▂▃▄▅▆▇█"[Math.min(7, Math.floor((v / m) * 7.99))]).join(""); };
let S = { token: sessionStorage.getItem("t"), user: null, items: [], factor: 5, large: [] };

async function api(path, o = {}) {
  try { return await MockAPI.call(o.method || "GET", path, o.body, S.token); }
  catch (e) { if (e.status === 401 && S.token) logout(); throw e; }
}
function toast(m) { const t = $("toast"); t.textContent = m; t.hidden = false; setTimeout(() => (t.hidden = true), 4000); }

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const d = await api("/login", { method: "POST", body: { username: $("u").value.trim(), password: $("pw").value } });
    S.token = d.token; sessionStorage.setItem("t", d.token); $("pw").value = ""; boot();
  } catch (err) { $("lerr").textContent = err.message; $("lerr").hidden = false; }
});
function logout() { document.body.classList.remove("hq"); S.token = null; sessionStorage.removeItem("t"); $("app").hidden = true; $("login").hidden = false; }
$("logout").addEventListener("click", logout);

async function boot() {
  try { S.user = await api("/me"); } catch { return logout(); }
  $("login").hidden = true; $("app").hidden = false; document.body.classList.toggle("hq", S.user.role === "hq");
  $("storeInfo").textContent = `${S.user.store_name}｜${S.user.name}`;
  const tabs = TABS.filter((t) => t[2] === "all" || t[2] === S.user.role);
  $("tabs").innerHTML = tabs.map((t) => `<button data-t="${t[0]}">${t[1]}</button>`).join("");
  $("tabs").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => show(b.dataset.t)));
  show(tabs[0][0]);
}

const LOAD = { order: loadOrder, count: loadCount, products: loadProducts, orders: loadOrders, counts: loadCounts, audit: loadAudit, hq: loadHq };
async function show(name) {
  document.querySelectorAll("[data-tab]").forEach((s) => (s.hidden = s.id !== "t-" + name));
  $("tabs").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.t === name));
  try { await LOAD[name](); } catch (e) { toast(e.message); }
}

/* ---- 補貨建議 ---- */
async function loadOrder() {
  const d = await api("/inventory");
  S.items = d.items; S.factor = d.params.large_order_factor; $("deadline").textContent = d.params.order_deadline;
  $("banners").innerHTML = d.factors.map((f) => `<div class="banner">${esc(f.category)}：${esc(f.label)}，預估銷量已乘以 ${f.factor}</div>`).join("");
  $("tbody").innerHTML = S.items.map((p) => `
    <tr data-id="${esc(p.product_id)}">
      <td>${esc(p.name)}<br><small>${esc(p.category)}・${esc(p.unit)}${p.lot > 1 ? "・" + p.lot + "入一箱" : ""}</small></td>
      <td class="r">${p.stock}</td><td class="r">${p.forecast}${p.factor !== 1 ? `<br><small>×${p.factor}</small>` : ""}</td>
      <td class="r">${p.safety_stock}</td><td class="r">${p.avg_order_qty}</td>
      <td class="r" title="預估${p.forecast}＋安全${p.safety_stock}－庫存${p.stock}"><strong>${p.suggested_qty}</strong></td>
      <td class="r"><input type="number" min="0" step="1" inputmode="numeric" value="${p.suggested_qty}" aria-label="${esc(p.name)}訂購量"></td>
      <td class="spark">${spark(p.spark)}</td><td><span class="badge ok">依建議</span></td>
    </tr>`).join("");
  $("tbody").querySelectorAll("input").forEach((i) => i.addEventListener("input", refresh));
  refresh();
}
const qtyOf = (r) => Math.max(0, parseInt(r.querySelector("input").value, 10) || 0);
const isLarge = (p, q) => q > p.large_threshold;
function refresh() {
  let pending = 0, total = 0, count = 0;
  $("tbody").querySelectorAll("tr").forEach((row) => {
    const p = S.items.find((x) => x.product_id === row.dataset.id), q = qtyOf(row), b = row.querySelector(".badge");
    total += q; if (q > 0) count++;
    row.classList.toggle("is-large", isLarge(p, q));
    if (isLarge(p, q)) { b.className = "badge large"; b.textContent = "大額・需說明"; pending++; }
    else if (q !== p.suggested_qty) { b.className = "badge mod"; b.textContent = "已手動調整"; pending++; }
    else { b.className = "badge ok"; b.textContent = "依建議"; }
  });
  $("cTotal").textContent = count; $("cPending").textContent = pending; $("cQty").textContent = total;
}
$("resetBtn").addEventListener("click", () => { $("tbody").querySelectorAll("tr").forEach((r) => { r.querySelector("input").value = S.items.find((x) => x.product_id === r.dataset.id).suggested_qty; }); refresh(); });
const collect = () => [...$("tbody").querySelectorAll("tr")].map((r) => ({ p: S.items.find((x) => x.product_id === r.dataset.id), qty: qtyOf(r) }));
$("submitBtn").addEventListener("click", () => { S.large = collect().filter((l) => isLarge(l.p, l.qty)); S.large.length ? openModal() : send({}); });
function openModal() {
  $("mBody").innerHTML = S.large.map((l, i) => `<div class="m-item" data-i="${i}">
    <strong>${esc(l.p.name)}：訂購 ${l.qty} ${esc(l.p.unit)}（歷史平均 ${l.p.avg_order_qty}，約 ${(l.qty / l.p.avg_order_qty).toFixed(1)} 倍）</strong>
    <label>大量訂購原因<select><option value="">請選擇原因</option>${REASONS.map((r) => `<option>${esc(r)}</option>`).join("")}</select></label>
    <label>補充說明<textarea rows="2" placeholder="例如：活動日期、預計人數"></textarea></label></div>`).join("");
  $("mError").hidden = true; $("modal").hidden = false;
}
$("mCancel").addEventListener("click", () => ($("modal").hidden = true));
$("mConfirm").addEventListener("click", () => {
  const rs = {};
  for (const box of $("mBody").querySelectorAll(".m-item")) {
    const l = S.large[box.dataset.i], reason = box.querySelector("select").value, note = box.querySelector("textarea").value.trim();
    if (!reason || (reason.startsWith("其他") && !note)) { $("mError").textContent = `請填寫「${l.p.name}」的大量訂購原因${reason ? "與補充說明" : ""}。`; $("mError").hidden = false; return; }
    rs[l.p.product_id] = { reason, note };
  }
  $("modal").hidden = true; send(rs);
});
async function send(rs) {
  const items = collect().filter((l) => l.qty > 0).map((l) => ({ product_id: l.p.product_id, qty: l.qty, reason: rs[l.p.product_id]?.reason || null, note: rs[l.p.product_id]?.note || null }));
  $("submitBtn").disabled = true;
  try { const o = await api("/orders", { method: "POST", body: { items } }); toast(`補貨單 ${o.order_id} 已送出（${o.line_count} 品項）`); show("orders"); }
  catch (e) { toast(e.message); }
  $("submitBtn").disabled = false;
}

/* ---- 盤點 ---- */
async function loadCount() {
  const d = await api("/inventory"); S.items = d.items;
  $("countBody").innerHTML = d.items.map((p) => `<tr data-id="${esc(p.product_id)}"><td>${esc(p.name)}</td><td class="r">${p.stock}</td>
    <td class="r"><input type="number" min="0" step="1" value="${p.stock}" aria-label="${esc(p.name)}實際盤點"></td></tr>`).join("");
}
$("saveCount").addEventListener("click", async () => {
  const counts = {}; $("countBody").querySelectorAll("tr").forEach((r) => (counts[r.dataset.id] = Math.max(0, parseInt(r.querySelector("input").value, 10) || 0)));
  try { await api("/stocktake", { method: "POST", body: { counts } }); toast("盤點已儲存，建議補貨量已更新"); show("order"); } catch (e) { toast(e.message); }
});

/* ---- 履歷 ---- */
const dt = (t) => `${esc(t.slice(0, 10))}<small>${esc(t.slice(11, 16))}</small>`;
const sum = (a, k) => a.reduce((n, x) => n + x[k], 0);
const orderHtml = (o, ack) => {
  const big = o.lines.filter((l) => l.large_order).length, mod = o.lines.filter((l) => l.modified && !l.large_order).length;
  return `<details class="oc"><summary><span>${dt(o.created)}</span><span>${esc(o.order_id)}<small>${esc(o.store_name)}・${esc(o.operator)}</small></span>
    <span>${o.lines.length} 品項<small>共 ${sum(o.lines, "final_qty")}</small></span>
    <span>${big ? `<span class="badge large">大額 ${big}</span> ` : ""}${mod ? `<span class="badge mod">調整 ${mod}</span>` : ""}</span>
    <span class="badge ${o.status === "SENT" ? "large" : "ok"}">${STATUS[o.status]}</span></summary>
    <div class="table-wrap"><table class="mini"><thead><tr><th>商品</th><th class="r">建議</th><th class="r">送出</th><th class="r">差異</th><th>說明</th></tr></thead><tbody>
    ${o.lines.map((l) => { const d = l.final_qty - l.suggested_qty; return `<tr class="${l.large_order ? "is-large" : ""}"><td>${esc(l.product_name)}</td><td class="r">${l.suggested_qty}</td><td class="r"><strong>${l.final_qty}</strong> ${esc(l.unit)}</td><td class="r">${d ? (d > 0 ? "+" : "") + d : "–"}</td><td>${l.large_order ? esc(l.reason) + (l.note ? "（" + esc(l.note) + "）" : "") : l.modified ? "手動調整" : "依建議"}</td></tr>`; }).join("")}</tbody></table></div>
    ${o.ack_by ? `<p class="hint">確認人：${esc(o.ack_by)}</p>` : ""}
    ${ack && o.status === "SENT" ? `<div class="actions"><button class="btn primary" data-ack="${esc(o.order_id)}">確認此訂單</button></div>` : ""}</details>`;
};
let ORD = [];
const drawOrders = () => {
  const f = $("ordFilter").value, rows = ORD.filter((o) => !f || o.status === f);
  $("ordSummary").textContent = `共 ${ORD.length} 張｜待總部確認 ${ORD.filter((o) => o.status === "SENT").length}｜已確認 ${ORD.filter((o) => o.status === "CONFIRMED").length}`;
  $("ordersList").innerHTML = rows.length ? rows.map((o) => orderHtml(o, false)).join("") : '<p class="hint">沒有符合的訂單。</p>';
};
async function loadOrders() { ORD = (await api("/orders")).orders; drawOrders(); }
$("ordFilter").addEventListener("change", drawOrders);
async function loadCounts() {
  const { records } = await api("/stocktakes");
  $("countsList").innerHTML = records.length ? records.map((r) => `<details class="oc"><summary><span>${dt(r.timestamp)}</span><span>盤點<small>${esc(r.operator)}</small></span>
    <span>${r.counts.length} 品項<small>合計 ${sum(r.counts, "qty")}</small></span><span></span><span class="badge ok">已完成</span></summary>
    <div class="table-wrap"><table class="mini"><thead><tr><th>商品</th><th class="r">盤點數量</th></tr></thead><tbody>${r.counts.map((c) => `<tr><td>${esc(c.name)}</td><td class="r">${c.qty}</td></tr>`).join("")}</tbody></table></div></details>`).join("")
    : '<p class="hint">尚無盤點紀錄。請先到「今日盤點」儲存。</p>';
}
async function loadProducts() {
  const { items } = await api("/products");
  $("prodBody").innerHTML = items.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${esc(p.unit)}</td><td class="r">${p.lot}</td><td class="r">${p.base_daily}</td><td class="r">${p.stock}</td>
    <td><button class="btn" data-del="${esc(p.product_id)}" data-name="${esc(p.name)}">停售</button></td></tr>`).join("");
  $("prodBody").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(`確定停售「${b.dataset.name}」？歷史紀錄會保留。`)) return;
    try { await api("/products/" + b.dataset.del, { method: "DELETE" }); toast("已停售"); loadProducts(); } catch (e) { toast(e.message); }
  }));
}
$("addProd").addEventListener("click", async () => {
  const n = $("pn").value.trim(); if (!n) return toast("請輸入商品名稱");
  try {
    await api("/products", { method: "POST", body: { name: n, category: $("pc").value, unit: $("pu").value, lot: +$("pl").value, base_daily: +$("pb").value, shelf_days: +$("ps").value, stock: +$("pk").value } });
    toast("已新增：" + n); $("pn").value = ""; loadProducts();
  } catch (e) { toast(e.message); }
});
async function loadAudit() {
  const { logs } = await api("/audit-logs");
  $("auditBody").innerHTML = logs.length ? logs.map((l) => `<tr><td>${ts(l.timestamp)}</td><td>${esc(l.store_id)}</td><td>${esc(l.product_name)}</td><td class="r">${l.suggested_qty}</td><td class="r">${l.final_qty}</td>
    <td>${l.large_order ? "大額：" + esc(l.reason) + (l.note ? "（" + esc(l.note) + "）" : "") : l.modified ? "手動調整" : "依建議"}</td></tr>`).join("") : '<tr><td colspan="6" class="hint">尚無紀錄。</td></tr>';
}

/* ---- 總部 ---- */
async function loadHq() {
  const [{ stores }, { orders }] = await Promise.all([api("/stores"), api("/orders")]);
  $("hqStores").innerHTML = stores.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.counted_today ? "已盤點" : "尚未盤點"}</td><td class="r">${s.orders_today}</td><td class="r">${s.pending_ack}</td><td class="r">${s.large_today}</td></tr>`).join("");
  const pend = orders.filter((o) => o.status === "SENT");
  $("hqOrders").innerHTML = pend.length ? pend.map((o) => orderHtml(o, true)).join("") : '<p class="hint">目前沒有待確認的訂單。</p>';
  $("hqOrders").querySelectorAll("[data-ack]").forEach((b) => b.addEventListener("click", async () => { try { await api(`/orders/${b.dataset.ack}/ack`, { method: "POST" }); toast("已確認訂單"); loadHq(); } catch (e) { toast(e.message); } }));
}

if (S.token) boot();
