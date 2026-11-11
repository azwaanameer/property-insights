/* VicProp report: skins, reader view, growth scenario calculator. Data injected as DATA. */
(function () {
  var DATA = __DATA__;
  var root = document.documentElement;
  var SKINS = ["ledger", "atlas", "midnight", "eucalypt", "monolith"];
  var VIEWS = ["investor", "renter", "buyer"];
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function setPressed(sel, attr, val) {
    document.querySelectorAll(sel).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute(attr) === val)); });
  }
  function setSkin(s) {
    if (SKINS.indexOf(s) < 0) s = "ledger";
    root.setAttribute("data-skin", s); lsSet("vp-skin", s); setPressed("[data-skin-btn]", "data-skin-btn", s);
    var lab = document.getElementById("skin-name"); if (lab) lab.textContent = DATA.skinNames[s];
  }
  function setView(v) {
    if (VIEWS.indexOf(v) < 0) v = "investor";
    root.setAttribute("data-view", v); lsSet("vp-view", v); setPressed("[data-view-btn]", "data-view-btn", v);
  }
  var startSkin = DATA.pdf ? DATA.skin : lsGet("vp-skin");
  if (!startSkin) startSkin = "midnight";
  setSkin(startSkin); setView(DATA.pdf ? DATA.view : (lsGet("vp-view") || "investor"));
  document.querySelectorAll("[data-skin-btn]").forEach(function (b) { b.addEventListener("click", function () { setSkin(b.getAttribute("data-skin-btn")); drawCalc(); }); });
  document.querySelectorAll("[data-view-btn]").forEach(function (b) { b.addEventListener("click", function () { setView(b.getAttribute("data-view-btn")); }); });

  /* ---------- calculator ---------- */
  function $(id) { return document.getElementById(id); }
  function money(n) { var s = Math.abs(Math.round(n)).toLocaleString("en-AU"); return (n < 0 ? "-$" : "$") + s; }
  function pct(n, d) { var dd = d == null ? 1 : d, r = Math.round(n * Math.pow(10, dd)) / Math.pow(10, dd); if (r === 0) r = 0; return (r > 0 ? "+" : r < 0 ? "-" : "") + Math.abs(r).toFixed(dd) + "%"; }
  function inputs() {
    return { price: +$("c-price").value, dep: +$("c-dep").value / 100, rate: +$("c-rate").value / 100, g: +$("c-growth").value, yrs: +$("c-years").value, costs: +$("c-costs").value, rent: +$("c-rent").value, vac: +$("c-vac").value };
  }
  function run(i, g) {
    var loan = i.price * (1 - i.dep), cash = i.price * i.dep;
    var net = i.rent * (52 - i.vac) - loan * i.rate - i.costs;
    var end = i.price * Math.pow(1 + g / 100, i.yrs);
    var equity = end - loan, gain = equity - cash + net * i.yrs;
    var mult = (cash + gain) / cash;
    var ann = mult > 0 ? (Math.pow(mult, 1 / i.yrs) - 1) * 100 : null;
    return { loan: loan, cash: cash, net: net, end: end, equity: equity, gain: gain, ann: ann };
  }
  function drawCalc() {
    if (!$("c-price")) return;
    var i = inputs(), r = run(i, i.g);
    $("v-growth").textContent = pct(i.g) + " a year"; $("v-years").textContent = i.yrs + " years";
    $("o-end").textContent = money(r.end); $("o-equity").textContent = money(r.equity);
    $("o-net").textContent = money(r.net) + " a year"; $("o-cash").textContent = money(r.cash);
    $("o-gain").textContent = (r.gain >= 0 ? "+" : "") + money(r.gain);
    $("o-ann").textContent = r.ann == null ? "n/a (cash invested is lost)" : pct(r.ann) + " a year on cash invested";
    var list = [-2, DATA.histG, 0, 3, 5].filter(function (v, k, a) { return a.indexOf(v) === k; }).sort(function (a, b) { return a - b; });
    var rows = list.map(function (g) {
      var x = run(i, g), tag = Math.abs(g - DATA.histG) < 0.001 ? " (Docklands 5-year history)" : g === 0 ? " (flat)" : "";
      return "<tr" + (Math.abs(g - DATA.histG) < 0.001 ? ' class="self"' : "") + "><td>" + pct(g) + " a year" + tag + "</td><td class=\"n\">" + money(x.end) + "</td><td class=\"n\">" + money(x.equity) + "</td><td class=\"n\">" + (x.gain >= 0 ? "+" : "") + money(x.gain) + "</td><td class=\"n\">" + (x.ann == null ? "n/a" : pct(x.ann)) + "</td></tr>";
    }).join("");
    $("c-rows").innerHTML = rows;
    chart(i, list);
  }
  function cssv(n) { return getComputedStyle(root).getPropertyValue(n).trim(); }
  function chart(i, list) {
    var W = 640, H = 270, L = 64, R = 70, T = 14, B = 34, ys = i.yrs;
    var series = list.map(function (g) { var pts = []; for (var y = 0; y <= ys; y++) pts.push(i.price * Math.pow(1 + g / 100, y)); return { g: g, pts: pts }; });
    var loan = i.price * (1 - i.dep), all = [loan];
    series.forEach(function (s) { s.pts.forEach(function (v) { all.push(v); }); });
    var lo = Math.floor(Math.min.apply(null, all) / 100000) * 100000, hi = Math.ceil(Math.max.apply(null, all) / 100000) * 100000;
    if (hi === lo) hi = lo + 100000;
    var X = function (y) { return L + (y / ys) * (W - L - R); }, Y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
    var s = "";
    var step = Math.max(100000, Math.ceil((hi - lo) / 5 / 50000) * 50000);
    for (var v = lo; v <= hi + 1; v += step) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--line)"/><text x="' + (L - 8) + '" y="' + (Y(v) + 4) + '" font-size="11" text-anchor="end" fill="var(--ink2)">' + "$" + Math.round(v / 1000) + "k</text>";
    var tickEvery = ys > 12 ? 5 : ys > 6 ? 2 : 1;
    for (var y = 0; y <= ys; y += tickEvery) s += '<text x="' + X(y) + '" y="' + (H - 12) + '" font-size="11" text-anchor="middle" fill="var(--ink2)">' + (y === 0 ? "Buy" : "Yr " + y) + "</text>";
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(loan) + '" y2="' + Y(loan) + '" stroke="var(--con)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="' + (L + 6) + '" y="' + (Y(loan) - 7) + '" font-size="11" fill="var(--con)" stroke="var(--paper)" stroke-width="4" paint-order="stroke">Loan ' + money(loan) + "</text>";
    var ends = series.map(function (se) { return { g: se.g, y: Y(se.pts[ys]) }; }).sort(function (a, b) { return a.y - b.y; });
    for (var k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
    series.forEach(function (se) {
      var isHist = Math.abs(se.g - DATA.histG) < 0.001, isSel = Math.abs(se.g - i.g) < 0.001;
      var d = se.pts.map(function (v, y) { return (y ? "L" : "M") + X(y).toFixed(1) + " " + Y(v).toFixed(1); }).join(" ");
      s += '<path d="' + d + '" fill="none" stroke="' + (isHist ? "var(--accent)" : "var(--ink2)") + '" stroke-width="' + (isHist ? 2.6 : 1.4) + '" opacity="' + (isHist || isSel ? 1 : 0.7) + '"/>';
    });
    var userPath = []; for (var y2 = 0; y2 <= ys; y2++) userPath.push((y2 ? "L" : "M") + X(y2).toFixed(1) + " " + Y(i.price * Math.pow(1 + i.g / 100, y2)).toFixed(1));
    s += '<path d="' + userPath.join(" ") + '" fill="none" stroke="var(--accent2)" stroke-width="3.2" stroke-linecap="round"/><circle cx="' + X(ys) + '" cy="' + Y(i.price * Math.pow(1 + i.g / 100, ys)) + '" r="5" fill="var(--accent2)" stroke="var(--paper)" stroke-width="2"/>';
    ends.forEach(function (e) { s += '<text x="' + (W - R + 8) + '" y="' + (e.y + 4) + '" font-size="11" fill="var(--ink)" stroke="var(--paper)" stroke-width="4" paint-order="stroke">' + pct(e.g) + "</text>"; });
    $("c-chart").innerHTML = s;
  }
  ["c-price", "c-dep", "c-rate", "c-growth", "c-years", "c-costs", "c-rent", "c-vac"].forEach(function (id) { var el = $(id); if (el) el.addEventListener("input", drawCalc); });
  var reset = $("c-hist"); if (reset) reset.addEventListener("click", function () { $("c-growth").value = DATA.histG; drawCalc(); });
  var flat = $("c-flat"); if (flat) flat.addEventListener("click", function () { $("c-growth").value = 0; drawCalc(); });
  if (DATA.pdf && $("c-growth")) $("c-growth").value = DATA.histG;
  drawCalc();

  /* active section in the contents list */
  var links = {}; document.querySelectorAll(".toc a[href^='#']").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && links[e.target.id]) { Object.keys(links).forEach(function (k) { links[k].classList.remove("on"); }); links[e.target.id].classList.add("on"); } });
    }, { rootMargin: "-20% 0px -70% 0px" });
    document.querySelectorAll(".sec").forEach(function (s) { io.observe(s); });
  }
})();
