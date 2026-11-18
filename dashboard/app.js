// Token Radar — dashboard.
//
// Renders the board data that main.ts wrote into data.js. The page never
// recomputes the model: every number it shows — the implied value, the
// model breakdown, the farm plan — is the value board.json carries. That
// keeps the page and the board in agreement by construction.

(function () {
  var DATA = window.TOKEN_RADAR || { rows: [], live: [], asOf: "", watchlistCount: 0, earlyCount: 0 };
  var rows = DATA.rows || [];
  var live = DATA.live || [];
  var view = "pre"; // "pre" | "live"
  var sortKey = "rank";
  var sortDir = 1;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(v) {
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
    return "$" + Math.round(v);
  }

  function pct(c) {
    if (c === null || c === undefined) return "—";
    return (c >= 0 ? "+" : "") + c.toFixed(2) + "%";
  }

  function age(d) {
    if (d === null || d === undefined) return "—";
    if (d < 365) return d + "d";
    return (d / 365).toFixed(1) + "y";
  }

  // ---- header stats (from the data, so they can never drift) ----
  $("meta").textContent =
    "Snapshot " + DATA.asOf + " · DefiLlama protocol index · radar-2 model";
  $("ledeRows").textContent = rows.length;
  $("ledeEarly").textContent = DATA.earlyCount;
  $("statWatch").textContent = DATA.watchlistCount + " / 40";
  $("statRows").textContent = rows.length;
  $("statEarly").textContent = DATA.earlyCount;
  $("statLive").textContent = live.length;

  // ---- filter controls ----
  function fillSelect(el, values) {
    var cur = el.value;
    el.innerHTML = '<option value="">All</option>';
    values.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      el.appendChild(o);
    });
    el.value = cur;
    if (el.selectedIndex < 0) el.value = "";
  }

  function currentSource() {
    return view === "pre" ? rows : live;
  }

  function refreshFilters() {
    var src = currentSource();
    var cats = [];
    var chains = [];
    src.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
      (r.chains || []).forEach(function (c) {
        if (chains.indexOf(c) < 0) chains.push(c);
      });
    });
    cats.sort();
    chains.sort();
    fillSelect($("cat"), cats);
    fillSelect($("chain"), chains);
  }

  function applyFilters(src) {
    var q = $("q").value.trim().toLowerCase();
    var cat = $("cat").value;
    var chain = $("chain").value;
    var wl = $("wl").checked;
    return src.filter(function (r) {
      if (view === "pre" && wl && !r.watchlist) return false;
      if (cat && r.category !== cat) return false;
      if (chain && (r.chains || []).indexOf(chain) < 0) return false;
      if (q) {
        var hay = [r.name, r.category || "", (r.chains || []).join(" ")]
          .join(" ")
          .toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function sortValue(r, key) {
    if (key === "rank") return r.rank;
    if (key === "tvl") return r.tvl_usd;
    if (key === "chg") return r.change_7d === null ? -Infinity : r.change_7d;
    if (key === "age") return r.age_days === null ? -Infinity : r.age_days;
    if (key === "value") {
      return view === "pre" ? r.implied_value_usd : r.mcap_usd;
    }
    return 0;
  }

  function sorted(src) {
    var out = src.slice();
    out.sort(function (a, b) {
      var d = sortValue(a, sortKey) - sortValue(b, sortKey);
      if (d !== 0) return d * sortDir;
      return a.slug < b.slug ? -1 : 1;
    });
    return out;
  }

  // ---- table ----
  function renderHead() {
    var head = document.querySelector("#board thead tr");
    if (view === "pre") {
      head.innerHTML =
        '<th data-sort="rank">Rank <span class="arrow"></span></th>' +
        "<th>Protocol</th>" +
        '<th class="num" data-sort="tvl">TVL</th>' +
        '<th class="num" data-sort="chg">7d</th>' +
        '<th class="num" data-sort="age">Age</th>' +
        '<th class="num" data-sort="value">Implied value <span class="arrow"></span></th>' +
        "<th>Token</th>";
    } else {
      head.innerHTML =
        '<th data-sort="rank">Rank <span class="arrow"></span></th>' +
        "<th>Protocol</th>" +
        '<th class="num" data-sort="tvl">TVL</th>' +
        '<th class="num" data-sort="chg">7d</th>' +
        '<th class="num" data-sort="age">Age</th>' +
        '<th class="num" data-sort="value">Market cap <span class="arrow"></span></th>' +
        "<th>Token</th>";
    }
    head.querySelectorAll("th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.getAttribute("data-sort");
        if (sortKey === k) {
          sortDir = -sortDir;
        } else {
          sortKey = k;
          sortDir = k === "rank" ? 1 : -1;
        }
        render();
      });
    });
    updateArrows();
  }

  function updateArrows() {
    document.querySelectorAll("#board thead th[data-sort]").forEach(function (th) {
      var arrow = th.querySelector(".arrow");
      if (!arrow) return;
      arrow.textContent =
        th.getAttribute("data-sort") === sortKey
          ? sortDir === 1
            ? "↓"
            : "↑"
          : "";
    });
  }

  function renderRows(list) {
    var max = 0;
    list.forEach(function (r) {
      var v = view === "pre" ? r.implied_value_usd : r.mcap_usd;
      if (v > max) max = v;
    });
    var html = "";
    list.forEach(function (r) {
      var value = view === "pre" ? r.implied_value_usd : r.mcap_usd;
      var pctClass =
        r.change_7d === null ? "" : r.change_7d >= 0 ? "up" : "down";
      var chains = (r.chains || []).slice(0, 2).join(", ");
      var token =
        view === "pre"
          ? '<span class="tok"><i>●</i> no token</span>'
          : '<span class="tok"><i>●</i> ' + esc(r.symbol || "token") + "</span>";
      var badge = view === "pre" && r.watchlist ? '<span class="badge">Watchlist</span>' : "";
      html +=
        '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="rank">' + r.rank + "</td>" +
        "<td><div class=\"pname\">" + esc(r.name) + badge + "</div>" +
        '<div class="psub">' + esc(r.category || "Uncategorised") + " on " + esc(chains) + "</div></td>" +
        '<td class="num">' + money(r.tvl_usd) + "</td>" +
        '<td class="num ' + pctClass + '">' + pct(r.change_7d) + "</td>" +
        '<td class="num">' + age(r.age_days) + "</td>" +
        '<td class="num"><span class="valcell"><span class="bar"><i style="width:' +
        (max ? Math.max(2, Math.round((value / max) * 100)) : 0) +
        '%"></i></span>' + money(value) + "</span></td>" +
        "<td>" + token + "</td></tr>";
    });
    $("rows").innerHTML = html;
    $("rows").querySelectorAll("tr").forEach(function (tr) {
      tr.addEventListener("click", function () {
        openDrawer(tr.getAttribute("data-slug"));
      });
    });
  }

  function render() {
    renderHead();
    var list = sorted(applyFilters(currentSource()));
    renderRows(list);
    $("shown").textContent = list.length + " rows shown";
    $("caption").textContent =
      view === "pre"
        ? "Pre-token protocols, strongest implied value first. Select a row for its model and farm plan."
        : "Live-token protocols, largest market cap first. Select a row for its detail.";
  }

  // ---- detail drawer ----
  function modelRow(label, value, total) {
    return (
      "<div" + (total ? ' class="total"' : "") + "><dt>" +
      esc(label) + "</dt><dd>" + esc(value) + "</dd></div>"
    );
  }

  function openDrawer(slug) {
    var r = null;
    var src = currentSource();
    for (var i = 0; i < src.length; i++) {
      if (src[i].slug === slug) r = src[i];
    }
    if (!r) return;
    var total = view === "pre" ? rows.length : live.length;
    $("dRank").textContent = "Rank " + r.rank + " of " + total;
    $("dName").textContent = r.name;
    $("dSub").textContent =
      (r.category || "Uncategorised") + " on " + (r.chains || []).join(", ");
    var modelHtml = "";
    var note = "";
    if (view === "pre") {
      var m = r.model;
      modelHtml += modelRow("TVL", money(r.tvl_usd));
      modelHtml += modelRow("Size tier multiple", m.tier.toFixed(2));
      modelHtml += modelRow("Seven-day growth", pct(m.growthChange));
      modelHtml += modelRow("Age with no token", age(m.ageDays));
      modelHtml += modelRow("Growth multiplier", m.growth.toFixed(4));
      modelHtml += modelRow("Maturity multiplier", m.maturity.toFixed(4));
      modelHtml += modelRow("Chain breadth multiplier", String(m.breadth));
      modelHtml += modelRow("Implied value", money(r.implied_value_usd), true);
      note =
        "Model radar-2: the same function scores every protocol. The breakdown " +
        "above is the model's own arithmetic for this row, and the implied value " +
        "is the number board.json carries. This is an estimate, not a price.";
    } else {
      modelHtml += modelRow("TVL", money(r.tvl_usd));
      modelHtml += modelRow("Market cap", money(r.mcap_usd));
      modelHtml += modelRow("Token", r.symbol || "—");
      modelHtml += modelRow("Age", age(r.age_days));
      note =
        "This protocol records a token, so it is set aside from the pre-token " +
        "board. The board ranks only protocols that record no token.";
    }
    $("dModel").innerHTML = modelHtml;
    $("dNote").textContent = note;

    var plan = $("dPlan");
    plan.innerHTML = "";
    if (view === "pre" && r.farm_steps) {
      r.farm_steps.forEach(function (step) {
        var li = document.createElement("li");
        var cut = step.indexOf(" Cost: ");
        if (cut >= 0) {
          // Keep the action text byte-for-byte identical to board.json:
          // the space before "Cost:" stays in the text node, the cost
          // itself is only restyled (block, mono) in its own span.
          li.appendChild(document.createTextNode(step.slice(0, cut + 1)));
          var cost = document.createElement("span");
          cost.className = "cost";
          cost.textContent = step.slice(cut + 1);
          li.appendChild(cost);
        } else {
          li.textContent = step;
        }
        plan.appendChild(li);
      });
    } else {
      var li = document.createElement("li");
      li.textContent =
        "No farm plan is scored for a protocol that already records a token.";
      plan.appendChild(li);
    }
    $("drawer").hidden = false;
  }

  $("dClose").addEventListener("click", function () {
    $("drawer").hidden = true;
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") $("drawer").hidden = true;
  });

  $("q").addEventListener("input", render);
  $("cat").addEventListener("change", render);
  $("chain").addEventListener("change", render);
  $("wl").addEventListener("change", render);
  $("tabPre").addEventListener("click", function () {
    view = "pre";
    sortKey = "rank";
    sortDir = 1;
    $("tabPre").classList.add("on");
    $("tabLive").classList.remove("on");
    refreshFilters();
    render();
  });
  $("tabLive").addEventListener("click", function () {
    view = "live";
    sortKey = "rank";
    sortDir = 1;
    $("tabLive").classList.add("on");
    $("tabPre").classList.remove("on");
    refreshFilters();
    render();
  });

  refreshFilters();
  render();
})();
