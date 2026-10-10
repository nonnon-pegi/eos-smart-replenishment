/* 靜態展示版：把 backend/main.py 的邏輯搬進瀏覽器，資料存在 localStorage。不需要伺服器，可直接放 GitHub Pages。 */
const MockAPI = (() => {
  const CFG = {
    params: { period_days: 2, z: 1.65, large_order_factor: 5, order_deadline: "23:00" },
    stores: [{ store_id: "TN-0123", name: "統家台南中西門市" }, { store_id: "TP-0456", name: "統家台北信義門市" }, { store_id: "KH-0789", name: "統家高雄左營門市" }],
    users: [
      { username: "tn01", password: "demo1234", name: "王店長", role: "manager", store_id: "TN-0123" },
      { username: "tp01", password: "demo1234", name: "林店長", role: "manager", store_id: "TP-0456" },
      { username: "kh01", password: "demo1234", name: "陳店長", role: "manager", store_id: "KH-0789" },
      { username: "hq01", password: "demo1234", name: "曾可蓮組長", role: "hq", store_id: null }],
    market_factors: [{ category: "雨具", factor: 1.5, label: "颱風外圍環流，預報降雨" }, { category: "飲料", factor: 1.2, label: "週末高溫預報" }],
    products: [
      { product_id: "P001", name: "雨衣（輕便型）", category: "雨具", unit: "件", lot: 1, shelf_days: 0, base_daily: 10 },
      { product_id: "P002", name: "鮮奶 936ml", category: "乳品", unit: "瓶", lot: 6, shelf_days: 5, base_daily: 20 },
      { product_id: "P003", name: "御飯糰（鮪魚）", category: "鮮食", unit: "個", lot: 1, shelf_days: 2, base_daily: 22 },
      { product_id: "P004", name: "礦泉水 600ml", category: "飲料", unit: "瓶", lot: 24, shelf_days: 0, base_daily: 50 },
      { product_id: "P005", name: "咖啡杯蓋", category: "耗材", unit: "個", lot: 50, shelf_days: 0, base_daily: 100 },
      { product_id: "P006", name: "洋芋片（原味）", category: "零食", unit: "包", lot: 12, shelf_days: 0, base_daily: 10 },
      { product_id: "P007", name: "三明治（火腿蛋）", category: "鮮食", unit: "個", lot: 1, shelf_days: 2, base_daily: 11 },
      { product_id: "P008", name: "雨傘（折疊）", category: "雨具", unit: "支", lot: 1, shelf_days: 0, base_daily: 4 }],
  };
  const KEY = "eos_demo_v1", P = CFG.params, WD = [1, 1, 1, 1, 1.2, 1.35, 1.15];
  let RT = { stock: {}, stocktakes: [], orders: [], audit: [], tok: {} };
  try { RT = JSON.parse(localStorage.getItem(KEY)) || RT; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(RT)); } catch (e) {} };
  class Err extends Error { constructor(m, s) { super(m); this.status = s; } }
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const rng = (s) => { let a = 2166136261; for (const c of s) { a ^= c.charCodeAt(0); a = Math.imul(a, 16777619); } a >>>= 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  const history = (sid, p) => { const r = rng(sid + p.product_id), out = [];
    for (let i = 28; i >= 1; i--) { const d = new Date(Date.now() - i * 864e5); out.push(Math.max(0, Math.round(p.base_daily * WD[(d.getDay() + 6) % 7] * (0.75 + r() * 0.5)))); }
    return out; };
  const stockOf = (sid, p) => { const st = (RT.stock[sid] = RT.stock[sid] || {});
    if (!(p.product_id in st)) st[p.product_id] = Math.floor(p.base_daily * (0.1 + rng(sid + p.product_id + "s")() * 0.5));
    return st[p.product_id]; };
  const std = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };

  function calc(sid, p) {
    const h = history(sid, p), wma = h.slice(-7).reduce((s, q, i) => s + (i + 1) * q, 0) / 28;
    const fs = CFG.market_factors.filter((x) => x.category === p.category), f = fs.reduce((x, y) => x * y.factor, 1);
    const fc = wma * P.period_days * f, ss = Math.ceil(P.z * std(h.slice(-14)) * Math.sqrt(P.period_days));
    const stock = stockOf(sid, p), lot = p.lot, raw = fc + ss - stock;
    let q = raw > 0 ? Math.ceil(raw / lot) * lot : 0;
    if (p.shelf_days) q = Math.min(q, Math.max(0, Math.floor((Math.floor(wma * p.shelf_days) - stock) / lot) * lot));
    const avg = Math.round(p.base_daily * P.period_days);
    return { ...p, stock, forecast: Math.round(fc * 10) / 10, factor: Math.round(f * 100) / 100, factor_label: fs.map((x) => x.label).join("、"),
      safety_stock: ss, suggested_qty: q, avg_order_qty: avg, large_threshold: avg * P.large_order_factor, spark: h.slice(-14) };
  }
  const auth = (t) => { const u = RT.tok[t]; if (!u) throw new Err("請先登入", 401); return u; };
  const mgr = (t) => { const u = auth(t); if (u.role !== "manager") throw new Err("此功能僅限門市店長", 403); return u; };
  const rev = (a) => a.slice().reverse();
  const storeName = (id) => CFG.stores.find((s) => s.store_id === id).name;

  async function call(method, path, body, token) {
    path = path.split("?")[0]; const key = method + " " + path; let m;
    if (key === "POST /login") {
      const u = CFG.users.find((x) => x.username === body.username && x.password === body.password);
      if (!u) throw new Err("帳號或密碼錯誤", 401);
      const t = Math.random().toString(16).slice(2) + Date.now().toString(16), { password, ...safe } = u;
      RT.tok[t] = safe; save(); return { token: t, user: safe };
    }
    if (key === "GET /me") { const u = auth(token); return { ...u, store_name: u.store_id ? storeName(u.store_id) : "統家總部" }; }
    if (key === "GET /inventory") { const u = mgr(token); return { params: P, factors: CFG.market_factors, items: CFG.products.map((p) => calc(u.store_id, p)) }; }
    if (key === "POST /stocktake") {
      const u = mgr(token), names = Object.fromEntries(CFG.products.map((p) => [p.product_id, p.name]));
      for (const k in body.counts) if (!names[k] || body.counts[k] < 0) throw new Err("盤點資料有誤：" + k, 400);
      Object.assign((RT.stock[u.store_id] = RT.stock[u.store_id] || {}), body.counts);
      RT.stocktakes.push({ id: Date.now().toString(16), date: ymd(new Date()), timestamp: now(), store_id: u.store_id, operator: u.name,
        counts: Object.entries(body.counts).map(([k, v]) => ({ name: names[k], qty: v })) });
      save(); return { status: "SAVED" };
    }
    if (key === "GET /stocktakes") { const u = mgr(token); return { records: rev(RT.stocktakes).filter((r) => r.store_id === u.store_id).slice(0, 30) }; }
    if (key === "POST /orders") {
      const u = mgr(token), sid = u.store_id, lines = [], oid = "PO" + now().replace(/\D/g, "") + Math.random().toString(16).slice(2, 5).toUpperCase();
      for (const it of body.items) {
        const p = CFG.products.find((x) => x.product_id === it.product_id);
        if (!p) throw new Err("查無商品 " + it.product_id, 404);
        if (!(it.qty > 0)) continue;
        const c = calc(sid, p), big = it.qty > c.large_threshold;
        if (big && !(it.reason && it.reason.trim())) throw new Err(`${p.name} 訂購量 ${it.qty} 超過歷史平均 ${P.large_order_factor} 倍，請填寫大量訂購原因`, 422);
        lines.push({ order_id: oid, timestamp: now(), store_id: sid, operator: u.name, product_id: p.product_id, product_name: p.name, unit: p.unit,
          suggested_qty: c.suggested_qty, final_qty: it.qty, modified: it.qty !== c.suggested_qty, large_order: big, reason: it.reason || null, note: it.note || null });
      }
      if (!lines.length) throw new Err("訂單沒有任何數量大於 0 的品項", 400);
      RT.orders.push({ order_id: oid, store_id: sid, store_name: storeName(sid), operator: u.name, created: now(), status: "SENT", ack_by: null, lines });
      RT.audit.push(...lines); save(); return { order_id: oid, status: "SENT", line_count: lines.length };
    }
    if (key === "GET /orders") { const u = auth(token); return { orders: rev(RT.orders).filter((o) => u.role === "hq" || o.store_id === u.store_id).slice(0, 50) }; }
    if ((m = path.match(/^\/orders\/(.+)\/ack$/)) && method === "POST") {
      if (auth(token).role !== "hq") throw new Err("僅限總部確認訂單", 403);
      const o = RT.orders.find((x) => x.order_id === m[1]); if (!o) throw new Err("查無訂單", 404);
      if (o.status !== "CONFIRMED") { o.lines.forEach((l) => { const p = CFG.products.find((x) => x.product_id === l.product_id); RT.stock[o.store_id][l.product_id] = stockOf(o.store_id, p) + l.final_qty; }); } // 確認後視為到貨，庫存增加
      o.status = "CONFIRMED"; o.ack_by = auth(token).name; save(); return { status: "CONFIRMED" };
    }
    if (key === "GET /audit-logs") { const u = auth(token); return { logs: rev(RT.audit).filter((x) => u.role === "hq" || x.store_id === u.store_id).slice(0, 100) }; }
    if (key === "GET /stores") {
      if (auth(token).role !== "hq") throw new Err("僅限總部", 403); const td = ymd(new Date());
      return { stores: CFG.stores.map((s) => { const os = RT.orders.filter((o) => o.store_id === s.store_id && o.created.slice(0, 10) === td);
        return { ...s, counted_today: RT.stocktakes.some((r) => r.store_id === s.store_id && r.date === td), orders_today: os.length,
          pending_ack: os.filter((o) => o.status === "SENT").length, large_today: os.reduce((n, o) => n + o.lines.filter((l) => l.large_order).length, 0) }; }) };
    }
    throw new Err("找不到功能：" + key, 404);
  }
  return { call, reset: () => { RT = { stock: {}, stocktakes: [], orders: [], audit: [], tok: {} }; save(); } };
})();
if (typeof module !== "undefined") module.exports = MockAPI;
