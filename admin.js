/* ============================================================================
   FRAMEY.PK — admin panel
   No credentials or keys live in this file. Auth is handled by Supabase and
   every read/write is authorised by Row Level Security on the server.
   ============================================================================ */

(function () {
  "use strict";

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var STATUSES = ["new", "confirmed", "shipped", "delivered", "cancelled"];

  var PROVINCES = [
    "Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan",
    "Gilgit-Baltistan", "Azad Jammu & Kashmir", "Islamabad Capital Territory"
  ];

  var VIEWS = {
    dashboard:  { title: "Dashboard",  sub: "Store performance at a glance." },
    orders:     { title: "Orders",     sub: "Every Cash on Delivery order, newest first." },
    products:   { title: "Products",   sub: "The catalogue shown on the storefront." },
    categories: { title: "Categories", sub: "The collections the shop is grouped into." }
  };

  var state = { view: "dashboard", orders: [], products: [], categories: [], stats: null, isAdmin: true };
  var client = window.FrameySupabase.get();
  var lastFocused = null;
  var openOrderId = null;      // which order the modal is currently editing
  var openCategorySlug = null; // which category the modal is currently editing

  /* ============================ helpers ============================ */

  function rs(n) {
    return "Rs. " + Math.round(Number(n) || 0).toLocaleString("en-US");
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function slugify(s) {
    return String(s).toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  function when(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    if (mins < 1440) return Math.round(mins / 60) + "h ago";
    if (mins < 43200) return Math.round(mins / 1440) + "d ago";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function itemCount(order) {
    return (order.items || []).reduce(function (n, i) { return n + (Number(i.qty) || 0); }, 0);
  }

  function note(node, text) {
    if (!node) return;
    if (!text) { node.hidden = true; node.textContent = ""; return; }
    node.hidden = false;
    node.textContent = text;
  }

  function statusPill(s) {
    return '<span class="pill pill--' + esc(s) + '">' + esc(s) + "</span>";
  }

  function toast(message, kind) {
    var box = $("#toasts");
    var el = document.createElement("div");
    el.className = "toast toast--" + (kind || "ok");
    var icon = kind === "err"
      ? '<path d="M12 8v5m0 3.5v.01"/><circle cx="12" cy="12" r="9"/>'
      : '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
    el.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icon + "</svg>" +
      "<span></span>";
    $("span", el).textContent = message;
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add("is-out");
      setTimeout(function () { el.remove(); }, 320);
    }, 3200);
  }

  /* ============================ auth gate ============================ */

  if (!client) {
    document.body.innerHTML =
      '<main class="gate"><div class="gate__card"><h1 class="gate__title">Cannot reach the backend</h1>' +
      '<p class="gate__sub">' + esc(window.FrameySupabase.reason()) + "</p>" +
      '<div class="gate__foot"><a href="admin-access.html">Back to sign in</a></div></div></main>';
    return;
  }

  function bail(message) {
    document.body.innerHTML =
      '<main class="gate"><div class="gate__card"><h1 class="gate__title">Not allowed</h1>' +
      '<p class="gate__sub">' + esc(message) + "</p>" +
      '<div class="gate__foot"><a href="admin-access.html">Back to sign in</a>' +
      '<a href="index.html">&larr; Back to the store</a></div></div></main>';
  }

  client.auth.getSession().then(function (res) {
    if (res.error) { bail(res.error.message); return; }
    if (!res.data.session) { location.replace("admin-access.html"); return; }
    start(res.data.session);
  });

  // A sign-out or expiry anywhere (another tab, revoked session) bounces us out.
  client.auth.onAuthStateChange(function (event, session) {
    if (event === "SIGNED_OUT" || !session) location.replace("admin-access.html");
  });

  function start(session) {
    $("#panel").hidden = false;
    var user = session.user || {};
    // Supabase exposes custom fields under user_metadata, not email_metadata.
    var meta = user.user_metadata || {};
    $("#whoName").textContent = meta.full_name || meta.name || "Admin";
    $("#whoEmail").textContent = user.email || "—";

    wireUI();
    refreshAll();
  }

  $("#signOutBtn") && $("#signOutBtn").addEventListener("click", function () {
    client.auth.signOut().then(function () { location.replace("admin-access.html"); });
  });

  /* ============================ data ============================ */

  function refreshAll() {
    setSub("Loading…");
    clearError();
    return Promise.all([loadOrders(), loadProducts(), loadCategories(), loadStats(), loadAdminStatus()])
      .then(renderAll)
      .catch(function (err) { showError(err.message || String(err)); });
  }

  /* An error has to be shown where the user is looking. Everything renders
     from one shared cache, so a failure while the Products tab is open used to
     surface on the Dashboard instead, where nobody sees it. */
  function showError(message) {
    var target =
      state.view === "products"   ? $("#productsError") :
      state.view === "categories" ? $("#categoriesError") :
      state.view === "orders"     ? $("#ordersError")   : $("#dashError");
    note(target, message);
  }

  function clearError() {
    ["#dashError", "#ordersError", "#productsError", "#categoriesError"].forEach(function (sel) {
      note($(sel), "");
    });
  }

  function loadOrders() {
    return client.from("orders").select("*").order("created_at", { ascending: false }).limit(500)
      .then(function (res) { if (res.error) throw res.error; state.orders = res.data || []; });
  }

  function loadProducts() {
    return client.from("products").select("*").order("created_at", { ascending: true })
      .then(function (res) { if (res.error) throw res.error; state.products = res.data || []; });
  }

  function loadCategories() {
    return client.from("categories").select("*").order("sort_order", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        state.categories = res.data || [];
      });
  }

  function loadStats() {
    return client.from("order_stats").select("*").limit(1)
      .then(function (res) {
        if (res.error) { state.stats = null; return; }
        state.stats = (res.data && res.data[0]) || null;
      });
  }

  /* RLS silently returns zero rows/zeros for non-admins, which is
     indistinguishable from an admin who simply has no orders yet. Ask the
     database who you actually are instead of guessing from the data. */
  function loadAdminStatus() {
    if (!client || typeof client.rpc !== "function") return Promise.resolve();
    return client.rpc("is_admin")
      .then(function (res) { state.isAdmin = !(res.error) && res.data === true; })
      .catch(function () { state.isAdmin = false; })
      .then(function () { renderAdminGate(); });
  }

  /* A non-admin must be blocked, not quietly shown an empty panel. RLS returns
     zero rows rather than an error, so "0 orders" and "0 orders you may not
     see" look identical — and a DELETE that matches nothing reports success.
     The only honest signal is is_admin(), so gate the whole UI on it. */
  function renderAdminGate() {
    var gate = $("#notAdminGate");
    if (!gate) return;
    if (state.isAdmin) {
      gate.hidden = true;
      return;
    }
    gate.hidden = false;
    var email = $("#whoEmail");
    $("#gateEmail").textContent = (email && email.textContent) || "unknown";
  }

  function loadTopProducts() {
    return client.from("top_products").select("*").limit(6)
      .then(function (res) {
        var body = $("#topProducts");
        if (res.error || !res.data || !res.data.length) {
          body.innerHTML = '<tr><td colspan="3" class="dim">No sales yet.</td></tr>';
          return;
        }
        body.innerHTML = res.data.map(function (p) {
          return "<tr>" +
            '<td><div class="cellProduct"><b>' + esc(p.name) + "</b></div></td>" +
            '<td class="num strong">' + Number(p.units_ordered || 0) + "</td>" +
            '<td class="num dim">' + esc(rs(p.price)) + "</td>" +
            "</tr>";
        }).join("");
      });
  }

  /* ============================ rendering ============================ */

  function setSub(text) { $("#viewSub").textContent = text; }

  function renderAll() {
    var s = state.stats;

    renderAdminGate();

    // A signed-in non-admin sees an empty, read-only panel — say so plainly
    // rather than showing a dashboard full of zeros.
    $("#dashNotAdmin").hidden = state.isAdmin;

    var newCount = s ? Number(s.new_orders || 0) : 0;
    var badge = $("#navNewOrders");
    badge.hidden = !newCount;
    badge.textContent = newCount;

    var revenue = s ? Number(s.revenue || 0) : 0;
    var delivered = s ? Number(s.delivered_orders || 0) : 0;
    var avg = s && Number(s.total_orders) > 0
      ? Math.round(revenue / Number(s.total_orders)) : 0;

    $("#statCards").innerHTML = [
      card("Orders", s ? Number(s.total_orders || 0) : 0, "All time", "M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z"),
      card("Awaiting action", newCount, "New, not yet confirmed", "M12 8v5m0 3.5v.01M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"),
      card("Revenue", rs(revenue), delivered + " delivered", "M12 3v18M7 8h7a3 3 0 0 1 0 6H7m0 6h8"),
      card("Average order", rs(avg), "Excluding cancelled", "M4 7h16M4 12h16M4 17h10")
    ].join("");

    renderRecent();
    renderOrders();
    renderProducts();
    renderCategoryList();
    loadTopProducts();
    fillCategoryControls();
    setSub(VIEWS[state.view].sub);
  }

  function card(label, value, foot, path) {
    return '<div class="stat"><div class="stat__k">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      "<path d=\"" + path + "\"/></svg>" + esc(label) + "</div>" +
      '<div class="stat__v">' + esc(value) + "</div>" +
      '<div class="stat__foot">' + esc(foot) + "</div></div>";
  }

  function renderRecent() {
    var body = $("#recentOrders");
    if (!state.orders.length) {
      body.innerHTML = '<tr><td colspan="6" class="dim">No orders yet.</td></tr>';
      return;
    }
    body.innerHTML = state.orders.slice(0, 10).map(function (o) {
      return "<tr>" +
        '<td class="mono strong">' + esc(o.order_no) + "</td>" +
        "<td>" + esc(o.name) + "</td>" +
        '<td class="dim">' + esc(o.city) + "</td>" +
        '<td class="num strong">' + esc(rs(o.total)) + "</td>" +
        "<td>" + statusPill(o.status) + "</td>" +
        '<td class="dim nowrap">' + esc(when(o.created_at)) + "</td>" +
        "</tr>";
    }).join("");
  }

  function visibleOrders() {
    var q = $("#orderSearch").value.trim().toLowerCase();
    var status = $("#orderStatus").value;
    var days = Number($("#orderRange").value || 0);
    var floor = days ? Date.now() - days * 86400000 : 0;

    return state.orders.filter(function (o) {
      if (status && o.status !== status) return false;
      if (floor && new Date(o.created_at).getTime() < floor) return false;
      if (!q) return true;
      return [o.order_no, o.name, o.phone, o.city, o.email, o.province]
        .join(" ").toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderOrders() {
    var rows = visibleOrders();
    var body = $("#ordersBody");
    $("#ordersEmpty").hidden = rows.length > 0;

    body.innerHTML = rows.map(function (o) {
      return "<tr>" +
        '<td class="mono strong">' + esc(o.order_no) + "</td>" +
        "<td>" + esc(o.name) + '<br /><span class="dim" style="font-size:.74rem">' + esc(o.province) + "</span></td>" +
        '<td class="nowrap">' + esc(o.phone) + "</td>" +
        '<td class="dim">' + esc(o.city) + "</td>" +
        '<td class="num">' + itemCount(o) + "</td>" +
        '<td class="num strong">' + esc(rs(o.total)) + "</td>" +
        '<td>' + selectFor(o) + "</td>" +
        '<td class="dim nowrap">' + esc(when(o.created_at)) + "</td>" +
        '<td><div class="rowActions">' +
          '<button class="iconBtn" data-view-order="' + esc(o.id) + '" type="button" title="View order" aria-label="View order ' + esc(o.order_no) + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>' +
          "</button></div></td>" +
        "</tr>";
    }).join("");
  }

  function selectFor(o) {
    return '<select class="statusSel" data-set-status="' + esc(o.id) + '" aria-label="Status for ' + esc(o.order_no) + '">' +
      STATUSES.map(function (s) {
        return '<option value="' + s + '"' + (o.status === s ? " selected" : "") + ">" + s + "</option>";
      }).join("") + "</select>";
  }

  function renderProducts() {
    var q = $("#productSearch").value.trim().toLowerCase();
    var cat = $("#productCategory").value;
    var flag = $("#productFlag").value;

    var rows = state.products.filter(function (p) {
      if (cat && p.category !== cat) return false;
      if (flag === "active" && !p.active) return false;
      if (flag === "inactive" && p.active) return false;
      if (flag === "featured" && !p.featured) return false;
      if (!q) return true;
      return [p.name, p.id, p.material, p.color].join(" ").toLowerCase().indexOf(q) !== -1;
    });

    var body = $("#productsBody");
    $("#productsEmpty").hidden = rows.length > 0;

    body.innerHTML = rows.map(function (p) {
      return "<tr>" +
        '<td><div class="cellProduct">' +
          '<img class="thumb" src="' + esc(p.image) + '" alt="" loading="lazy" />' +
          "<span><b>" + esc(p.name) + "</b><span>" + esc(p.id) + "</span></span>" +
        "</div></td>" +
        '<td class="dim">' + esc(p.category || "—") + "</td>" +
        '<td class="num strong">' + esc(rs(p.price)) +
          (p.old_price ? '<br /><span class="dim" style="font-size:.74rem;text-decoration:line-through">' + esc(rs(p.old_price)) + "</span>" : "") +
        "</td>" +
        '<td class="num">' + Number(p.sold || 0) + "</td>" +
        "<td>" +
          (p.active ? '<span class="pill pill--confirmed">active</span>' : '<span class="pill pill--off">hidden</span>') +
          (p.featured ? ' <span class="pill pill--new">featured</span>' : "") +
        "</td>" +
        '<td><div class="rowActions">' +
          '<button class="iconBtn" data-edit-product="' + esc(p.id) + '" type="button" title="Edit" aria-label="Edit ' + esc(p.name) + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5V20Z"/></svg>' +
          "</button>" +
          '<button class="iconBtn iconBtn--danger" data-toggle-active="' + esc(p.id) + '" type="button" title="' + (p.active ? "Hide" : "Show") + '" aria-label="' + (p.active ? "Hide " : "Show ") + esc(p.name) + '">' +
            (p.active
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.2A9.7 9.7 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.2 4.1M6.3 8.3A17 17 0 0 0 2.5 12S6 19 12 19a9.5 9.5 0 0 0 3.6-.7"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>') +
          "</button>" +
          '<button class="iconBtn iconBtn--danger" data-delete-product="' + esc(p.id) + '" type="button" title="Delete permanently" aria-label="Delete ' + esc(p.name) + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>' +
          "</button>" +
        "</div></td>" +
        "</tr>";
    }).join("");
  }

  function fillCategoryControls() {
    var filter = $("#productCategory");
    var form = $("#pCategory");
    if (!filter || !form) return;

    var options = state.categories.map(function (c) {
      return '<option value="' + esc(c.slug) + '">' + esc(c.name) + "</option>";
    }).join("");

    var keepFilter = filter.value;
    filter.innerHTML = '<option value="">All categories</option>' + options;
    if (keepFilter) filter.value = keepFilter;

    // The product form gets a "new category" escape hatch, so a product is
    // never blocked by a missing collection.
    var keepForm = form.value;
    form.innerHTML = options + '<option value="__new__">+ New category…</option>';
    if (keepForm) form.value = keepForm;
  }

  /* ============================ views ============================ */

  function show(view) {
    state.view = VIEWS[view] ? view : "dashboard";
    $$(".view").forEach(function (v) { v.classList.toggle("is-active", v.id === "view-" + state.view); });
    $$(".side__link[data-view]").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.view === state.view);
    });
    $("#viewTitle").textContent = VIEWS[state.view].title;
    setSub(VIEWS[state.view].sub);
    renderActions();
  }

  function renderActions() {
    var box = $("#viewActions");

    var links = { dashboard: ["orders", "products", "categories"],
                  orders: ["dashboard", "products", "categories"],
                  products: ["dashboard", "orders", "categories"],
                  categories: ["dashboard", "orders", "products"] };

    var html = (links[state.view] || []).map(function (v) {
      return '<button class="btn btn--ghost btn--sm" data-goto="' + v + '" type="button">' +
        VIEWS[v].title + "</button>";
    }).join("");

    if (state.view === "products") {
      html += '<button class="btn btn--gold btn--sm" id="addProductBtn" type="button">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' +
        "Add product</button>";
    }
    if (state.view === "categories") {
      html += '<button class="btn btn--gold btn--sm" id="addCategoryTopBtn" type="button">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' +
        "Add category</button>";
    }

    html += '<button class="btn btn--ghost btn--sm" id="refreshBtn" type="button" title="Reload from the database">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 5v6h-6"/></svg>' +
      '<span class="srOnly">Refresh</span></button>';

    box.innerHTML = html;

    var addP = $("#addProductBtn");
    if (addP) addP.addEventListener("click", function () { openProduct(null); });

    var addC = $("#addCategoryTopBtn");
    if (addC) addC.addEventListener("click", function () { openCategory(null); });

    var refresh = $("#refreshBtn");
    if (refresh) refresh.addEventListener("click", function () {
      refresh.disabled = true;
      refreshAll().then(function () { refresh.disabled = false; },
                       function () { refresh.disabled = false; });
    });
  }

  /* ============================ order detail ============================ */

  /* Pakistani numbers arrive as 0300… / 0300… (11 digits), 300… (10 digits) or
     +92300… — normalise all of them to the 92XXXXXXXXX form WhatsApp expects. */
  function waNumber(phone) {
    var d = String(phone || "").replace(/[^0-9]/g, "");
    if (d.length === 10) d = "0" + d;   // 3001234567 -> 03001234567
    d = d.replace(/^0/, "");            // 0300…   -> 300…
    d = d.replace(/^92/, "");           // 92300…  -> 300…
    return d.length >= 10 && d.length <= 13 ? "92" + d : "";
  }

  function openOrder(id) {
    var o = state.orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;

    lastFocused = document.activeElement;
    openOrderId = id;
    note($("#orderFormError"), "");
    $$("#orderForm .has-error").forEach(function (r) { r.classList.remove("has-error"); });

    var items = (o.items || []).map(function (i) {
      return '<div class="lineItem">' +
        "<span class=\"lineItem__n\"><b>" + esc(i.name || i.id) + "</b>" +
        "<span>" + esc(i.size || "—") + " &middot; Qty " + esc(i.qty) + "</span></span>" +
        '<span class="lineItem__p">' + esc(rs((Number(i.price) || 0) * (Number(i.qty) || 0))) + "</span>" +
        "</div>";
    }).join("");

    $("#orderModalTitle").textContent = "Order " + o.order_no;
    $("#orderModalBody").innerHTML =
      '<p class="note note--err" id="orderFormError" hidden></p>' +

      '<div class="lineItems">' + (items || '<p class="dim">No line items.</p>') + "</div>" +
      '<div class="totals">' +
        "<div><span>Subtotal</span><span>" + esc(rs(o.subtotal)) + "</span></div>" +
        "<div><span>Delivery</span><span>" + esc(rs(o.delivery)) + "</span></div>" +
        '<div class="grand"><span>Total</span><b>' + esc(rs(o.total)) + "</b></div>" +
      "</div>" +
      '<p class="note" style="margin:14px 0 0">The items and the money above are fixed ' +
      "when the order was placed. You can correct the customer's details and notes, " +
      "but the price is server-owned.</p>" +

      '<h3 class="subHead">Status</h3>' +
      '<div class="form">' +
        '<div class="full">' +
          '<label for="oStatus">Order status</label>' +
          '<select class="select" id="oStatus">' +
            STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (o.status === s ? " selected" : "") + ">" + s + "</option>";
            }).join("") +
          "</select>" +
        "</div>" +
      "</div>" +

      '<h3 class="subHead">Customer</h3>' +
      '<div class="form">' +
        field("oName", "Full name", o.name) +
        field("oPhone", "Phone", o.phone, "tel", true) +
        field("oEmail", "Email", o.email || "", "email", true) +
        '<div class="full"><label for="oAddress">Address</label>' +
          '<textarea class="textarea" id="oAddress">' + esc(o.address) + "</textarea>" +
          '<p class="err">Please enter the complete address.</p></div>' +
        field("oCity", "City", o.city, "text", true) +
        '<div><label for="oProvince">Province</label>' +
          '<select class="select" id="oProvince">' +
            PROVINCES.map(function (p) {
              return '<option value="' + esc(p) + '"' + (o.province === p ? " selected" : "") + ">" + esc(p) + "</option>";
            }).join("") +
            (PROVINCES.indexOf(o.province) === -1
              ? '<option value="' + esc(o.province) + '" selected>' + esc(o.province) + "</option>"
              : "") +
          "</select></div>" +
        field("oPostal", "Postal code", o.postal || "", "text", true) +
        '<div class="full"><label>Payment</label>' +
          '<input class="input" value="' + esc(o.payment || "COD") + '" disabled />' +
          '<p class="err">This store is Cash on Delivery only.</p></div>' +
        '<div class="full"><label for="oNotes">Order notes</label>' +
          '<textarea class="textarea" id="oNotes">' + esc(o.notes || "") + "</textarea></div>" +
      "</div>" +

      '<p class="dim mono" style="margin-top:16px">Placed ' +
        esc(new Date(o.created_at).toLocaleString()) + " &middot; last updated " +
        esc(o.updated_at ? new Date(o.updated_at).toLocaleString() : "—") + "</p>";

    var wa = waNumber(o.phone);
    var link = $("#orderWhatsApp");
    if (wa) {
      link.href = "https://wa.me/" + wa + "?text=" +
        encodeURIComponent("Assalam-o-Alaikum " + o.name + ", your FRAMEY.PK order " + o.order_no + " is ready. Total: " + rs(o.total));
      link.hidden = false;
    } else {
      link.href = "#";
      link.hidden = true;
    }

    openModal($("#orderModal"));
  }

  /** One labelled form field. `half` puts it in one column of the 2-up grid. */
  function field(id, label, value, type, half) {
    return '<div' + (half ? "" : ' class="full"') + '><label for="' + id + '">' + esc(label) + "</label>" +
      '<input class="input" id="' + id + '" type="' + (type || "text") + '" value="' + esc(value) + '" />' +
      '<p class="err">Enter a valid ' + esc(label.toLowerCase()) + ".</p></div>";
  }

  /* ---- order validation ---- */

  var orderRules = {
    oName:    function (v) { return v.trim().length >= 2 || "Please enter the customer's name."; },
    oPhone:   function (v) {
      var d = v.replace(/[^\d]/g, "");
      return (d.length >= 10 && d.length <= 13) || "Enter a valid phone number, e.g. 03001234567.";
    },
    oEmail:   function (v) { return !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || "Enter a valid email address."; },
    oAddress: function (v) { return v.trim().length >= 5 || "Please enter the complete address."; },
    oCity:    function (v) { return v.trim().length >= 2 || "Please enter a city."; }
  };

  function readOrderForm() {
    var bad = [];
    Object.keys(orderRules).forEach(function (id) {
      var input = $("#" + id);
      if (!input) return;
      var msg = orderRules[id](input.value);
      if (msg) {
        var wrap = input.closest(".form > div");
        if (wrap) wrap.classList.add("has-error");
        input.setAttribute("aria-invalid", "true");
        bad.push(id);
      }
    });
    if (bad.length) { $("#" + bad[0]).focus(); return null; }

    return {
      status: $("#oStatus").value,
      name: $("#oName").value.trim(),
      phone: $("#oPhone").value.trim(),
      email: $("#oEmail").value.trim() || null,
      address: $("#oAddress").value.trim(),
      city: $("#oCity").value.trim(),
      province: $("#oProvince").value,
      postal: $("#oPostal").value.trim() || null,
      notes: $("#oNotes").value.trim() || null
    };
  }

  function saveOrder(e) {
    e.preventDefault();
    var id = openOrderId;
    if (!id) return;

    var row = readOrderForm();
    if (!row) { note($("#orderFormError"), "Check the highlighted fields."); return; }
    note($("#orderFormError"), "");

    if (STATUSES.indexOf(row.status) === -1) row.status = "new";

    var btn = $("#orderSave");
    btn.disabled = true;

    // Only the editable columns are sent. subtotal/delivery/total/items are
    // stripped by a database trigger on every update, so there is no point
    // pretending we can change them.
    client.from("orders").update(row).eq("id", id).select().single()
      .then(function (res) {
        btn.disabled = false;
        if (res.error) { note($("#orderFormError"), res.error.message); return; }

        var fresh = res.data || row;
        state.orders.forEach(function (o) {
          if (o.id !== id) return;
          Object.keys(fresh).forEach(function (k) { o[k] = fresh[k]; });
        });

        closeModal($("#orderModal"));
        toast("Order " + fresh.order_no + " updated.");
        return refreshAll();
      })
      .catch(function (err) {
        btn.disabled = false;
        note($("#orderFormError"), err.message || String(err));
      });
  }

  function setStatus(id, value, el) {
    if (STATUSES.indexOf(value) === -1) return;
    var before = el.value;
    el.disabled = true;
    client.from("orders").update({ status: value }).eq("id", id).select().single()
      .then(function (res) {
        el.disabled = false;
        if (res.error) { el.value = before; toast(res.error.message, "err"); return; }
        state.orders.forEach(function (o) { if (o.id === id) o.status = value; });
        toast("Order marked " + value + ".");
        // The dashboard counts and the new-orders badge come from the
        // database, so re-read rather than recomputing here.
        return refreshAll();
      })
      .catch(function (err) {
        el.disabled = false;
        el.value = before;
        toast(err.message || String(err), "err");
      });
  }

  /* ============================ CSV ============================ */

  function toCsv(rows) {
    var head = ["Order no", "Placed", "Status", "Customer", "Phone", "Email",
                "Address", "City", "Province", "Postal", "Notes",
                "Items", "Subtotal", "Delivery", "Total"];
    var body = rows.map(function (o) {
      var items = (o.items || []).map(function (i) {
        return (i.name || i.id) + " / " + (i.size || "-") + " x" + i.qty;
      }).join(" | ");
      return [o.order_no, o.created_at, o.status, o.name, o.phone, o.email || "",
              o.address, o.city, o.province, o.postal || "", o.notes || "",
              items, o.subtotal, o.delivery, o.total];
    });
    return [head].concat(body).map(function (r) {
      return r.map(function (cell) {
        var s = String(cell == null ? "" : cell);
        // Guard against spreadsheet formula injection from user-supplied fields.
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(",");
    }).join("\r\n");
  }

  function exportCsv() {
    var rows = visibleOrders();
    if (!rows.length) { toast("Nothing to export with the current filters.", "err"); return; }
    // BOM so Excel opens UTF-8 (Rs. and names) correctly.
    var blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "framey-orders-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast("Exported " + rows.length + " order" + (rows.length === 1 ? "" : "s") + ".");
  }

  /* ============================ categories ============================ */

  function productsIn(slug) {
    return state.products.filter(function (p) { return p.category === slug; });
  }

  function renderCategoryList() {
    var q = ($("#categorySearch").value || "").trim().toLowerCase();
    var rows = state.categories.filter(function (c) {
      if (!q) return true;
      return [c.name, c.slug].join(" ").toLowerCase().indexOf(q) !== -1;
    });

    var body = $("#categoriesBody");
    $("#categoriesEmpty").hidden = rows.length > 0;

    body.innerHTML = rows.map(function (c) {
      var count = productsIn(c.slug).length;
      return "<tr>" +
        '<td class="strong">' + esc(c.name) + "</td>" +
        '<td class="mono">' + esc(c.slug) + "</td>" +
        '<td class="num">' + count + "</td>" +
        "<td>" + (c.image
          ? '<img class="thumb thumb--wide" src="' + esc(c.image) + '" alt="" loading="lazy" />'
          : '<span class="dim">No image</span>') + "</td>" +
        '<td class="num">' + Number(c.sort_order || 0) + "</td>" +
        '<td><div class="rowActions">' +
          '<button class="iconBtn" data-edit-category="' + esc(c.slug) + '" type="button" title="Edit" aria-label="Edit ' + esc(c.name) + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5V20Z"/></svg>' +
          "</button>" +
          '<button class="iconBtn iconBtn--danger" data-delete-category="' + esc(c.slug) + '" type="button" title="Delete" aria-label="Delete ' + esc(c.name) + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>' +
          "</button>" +
        "</div></td>" +
        "</tr>";
    }).join("");
  }

  function openCategory(c) {
    lastFocused = document.activeElement;
    openCategorySlug = c ? c.slug : null;
    note($("#categoryFormError"), "");
    $$("#categoryForm .has-error").forEach(function (r) { r.classList.remove("has-error"); });
    $$("#categoryForm [aria-invalid]").forEach(function (i) { i.removeAttribute("aria-invalid"); });

    $("#categoryModalTitle").textContent = c ? "Edit " + c.name : "Add category";
    $("#cName").value = c ? c.name : "";
    $("#cSlug").value = c ? c.slug : "";
    $("#cImage").value = c && c.image ? c.image : "";
    $("#cSort").value = c ? Number(c.sort_order || 0) : state.categories.length + 1;
    delete $("#cSlug").dataset.touched;

    openModal($("#categoryModal"));
    setTimeout(function () { $("#cName").focus(); }, 60);
  }

  function readCategoryForm() {
    var name = $("#cName").value.trim();
    var slug = slugify($("#cSlug").value.trim() || name);
    var image = $("#cImage").value.trim();
    var sort = Number($("#cSort").value);
    var isEdit = !!openCategorySlug;

    var bad = [];
    if (!name) bad.push({ id: "#cName" });
    if (!slug) bad.push({ id: "#cSlug" });
    if (image && !/^https:\/\//i.test(image)) bad.push({ id: "#cImage" });

    if (bad.length) {
      bad.forEach(function (b) {
        var el = $(b.id);
        el.setAttribute("aria-invalid", "true");
        var wrap = el.closest(".form > div");
        if (wrap) wrap.classList.add("has-error");
      });
      $(bad[0].id).focus();
      return null;
    }

    return {
      row: {
        name: name,
        slug: slug,
        image: image || null,
        sort_order: Number.isFinite(sort) ? Math.round(sort) : 0
      },
      isEdit: isEdit,
      originalSlug: openCategorySlug || ""
    };
  }

  function saveCategory(e) {
    e.preventDefault();
    var got = readCategoryForm();
    if (!got) { note($("#categoryFormError"), "Check the highlighted fields."); return; }

    var btn = $("#categorySave");
    btn.disabled = true;

    // products.category is a foreign key with ON UPDATE CASCADE, so changing
    // the slug re-links every product in the category on its own.
    var request = got.isEdit
      ? client.from("categories").update(got.row).eq("slug", got.originalSlug).select().single()
      : client.from("categories").insert(got.row).select().single();

    request.then(function (res) {
      btn.disabled = false;
      if (res.error) {
        if (res.error.code === "23505") {
          note($("#categoryFormError"), "A category with that URL id already exists.");
        } else {
          note($("#categoryFormError"), res.error.message);
        }
        return;
      }
      closeModal($("#categoryModal"));
      toast(got.isEdit ? "Category updated." : "Category added.");
      return loadCategories()
        .then(loadProducts)
        .then(renderAll)
        .catch(function (err) { showError(err.message || String(err)); });
    }).catch(function (err) {
      btn.disabled = false;
      note($("#categoryFormError"), err.message || String(err));
    });
  }

  function deleteCategory(slug, el) {
    var c = state.categories.filter(function (x) { return x.slug === slug; })[0];
    if (!c) return;

    var used = productsIn(slug);
    var others = state.categories.filter(function (x) { return x.slug !== slug; });

    // A product must belong to a category, so a category can only go away once
    // its products have somewhere else to sit. Reassign rather than cascade.
    if (used.length && !others.length) {
      toast("Add a second category first — \"" + c.name + "\" still holds " +
            used.length + " product" + (used.length === 1 ? "" : "s") + ".", "err");
      return;
    }

    var target = others.length ? others[0].slug : null;
    var msg = used.length
      ? "Delete the category \"" + c.name + "\"?\n\n" +
        used.length + " product" + (used.length === 1 ? "" : "s") +
        " will move to \"" + target + "\". No product is deleted."
      : "Delete the category \"" + c.name + "\"?";

    if (!window.confirm(msg)) return;

    el.disabled = true;
    var step = used.length
      ? client.from("products").update({ category: target }).eq("category", slug).select("id")
      : Promise.resolve({ data: [], error: null });

    step.then(function (moved) {
      if (moved && moved.error) throw moved.error;
      /* Ask for the deleted row back so an RLS-filtered delete cannot masquerade
         as success — see deleteProduct(). */
      return client.from("categories").delete().eq("slug", slug).select("slug");
    }).then(function (res) {
      el.disabled = false;
      if (res.error) throw res.error;
      if (!res.data || !res.data.length) {
        throw new Error("Nothing was deleted — your account cannot delete categories. See the notice on this page.");
      }
      toast("Category deleted.");
      return loadCategories()
        .then(loadProducts)
        .then(renderAll)
        .catch(function (err) { showError(err.message || String(err)); });
    }).catch(function (err) {
      el.disabled = false;
      toast(err.message || String(err), "err");
    });
  }

  /* ============================ product form ============================ */

  function openProduct(p) {
    lastFocused = document.activeElement;
    note($("#productFormError"), "");
    $$("#productForm .has-error").forEach(function (r) { r.classList.remove("has-error"); });
    $$("#productForm [aria-invalid]").forEach(function (i) { i.removeAttribute("aria-invalid"); });

    $("#productModalTitle").textContent = p ? "Edit " + p.name : "Add product";
    $("#productForm").dataset.id = p ? p.id : "";
    $("#pName").value    = p ? p.name : "";
    $("#pSlug").value    = p ? p.id : "";
    // Forgets the "the user typed a slug" flag from the last product, which
    // otherwise stops the slug auto-filling for the next new product.
    delete $("#pSlug").dataset.touched;
    $("#pCategory").value= p ? p.category || "" : "";
    $("#pPrice").value   = p ? p.price : "";
    $("#pOldPrice").value= p && p.old_price ? p.old_price : "";
    $("#pColour").value  = p ? p.color || "" : "";
    $("#pColourHex").value = p && p.color_hex ? p.color_hex : "#b08d57";
    $("#pMaterial").value= p ? p.material || "" : "";
    $("#pSizes").value   = p ? (p.sizes || []).join(", ") : "";
    $("#pImage").value   = p ? p.image : "";
    $("#pDescription").value = p ? p.description || "" : "";
    $("#pFeatured").checked = p ? !!p.featured : false;
    $("#pActive").checked   = p ? !!p.active : true;

    openModal($("#productModal"));
    setTimeout(function () { $("#pName").focus(); }, 60);
  }

  /* The product form offers "+ New category…". Create it on the spot so a
     product is never stuck waiting on somebody to visit another tab. */
  function createCategoryInline() {
    var answer = window.prompt("Name for the new category:");
    if (answer === null) { $("#pCategory").value = ""; return; }

    var name = answer.trim();
    var slug = slugify(name);
    if (!name || !slug) { toast("That name does not make a usable id.", "err"); return; }

    $("#productSave").disabled = true;
    client.from("categories").insert({ name: name, slug: slug, sort_order: state.categories.length + 1 })
      .select()
      .single()
      .then(function (res) {
        $("#productSave").disabled = false;
        if (res.error) {
          toast(res.error.code === "23505"
            ? "The category “" + name + "” already exists."
            : res.error.message, "err");
          return;
        }
        state.categories.push(res.data);
        fillCategoryControls();
        $("#pCategory").value = slug;
        toast("Category “" + name + "” added.");
      })
      .catch(function (err) {
        $("#productSave").disabled = false;
        toast(err.message || String(err), "err");
      });
  }

  function readProductForm() {
    var name = $("#pName").value.trim();
    var slug = slugify($("#pSlug").value.trim() || name);
    var price = Number($("#pPrice").value);
    var oldRaw = $("#pOldPrice").value.trim();
    var oldPrice = oldRaw === "" ? null : Number(oldRaw);
    var sizes = $("#pSizes").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var image = $("#pImage").value.trim();
    var category = $("#pCategory").value;
    var isEdit = !!$("#productForm").dataset.id;

    var bad = [];

    if (category === "__new__") {
      toast("Choose a category, or use “+ New category…” to make one.");
      $("#pCategory").focus();
      return null;
    }

    if (!name) bad.push("#pName");
    if (!slug) bad.push("#pSlug");
    if (!category) bad.push("#pCategory");
    if (!Number.isFinite(price) || price < 0 || $("#pPrice").value === "") bad.push("#pPrice");
    if (oldPrice !== null && oldPrice <= price) bad.push("#pOldPrice");
    if (!sizes.length) bad.push("#pSizes");
    if (!/^https:\/\//i.test(image)) bad.push("#pImage");

    if (bad.length) {
      bad.forEach(function (id) {
        var input = $(id);
        input.setAttribute("aria-invalid", "true");
        var wrap = input.closest(".full, .form > div") || input.parentElement;
        if (wrap) wrap.classList.add("has-error");
      });
      $(bad[0]).focus();
      return null;
    }

    return {
      row: {
        id: slug, name: name, category: category, price: Math.round(price),
        old_price: oldPrice, image: image,
        material: $("#pMaterial").value.trim() || null,
        color: $("#pColour").value.trim() || null,
        color_hex: $("#pColourHex").value || null,
        sizes: sizes,
        description: $("#pDescription").value.trim() || null,
        featured: $("#pFeatured").checked,
        active: $("#pActive").checked
      },
      isEdit: isEdit,
      originalId: $("#productForm").dataset.id || ""
    };
  }

  function saveProduct(e) {
    e.preventDefault();
    var got = readProductForm();
    if (!got) return;

    var btn = $("#productSave");
    btn.disabled = true;

    var request = got.isEdit
      ? client.from("products").update(got.row).eq("id", got.originalId).select().single()
      : client.from("products").insert(got.row).select().single();

    request.then(function (res) {
      btn.disabled = false;
      if (res.error) {
        note($("#productFormError"), res.error.message);
        return;
      }
      closeModal($("#productModal"));
      toast(got.isEdit ? "Product updated." : "Product added.");
      return loadProducts().then(renderAll);
    }).catch(function (err) {
      btn.disabled = false;
      note($("#productFormError"), err.message || String(err));
    });
  }

  function toggleActive(id, el) {
    var p = state.products.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    el.disabled = true;
    client.from("products").update({ active: !p.active }).eq("id", id).select().single()
      .then(function (res) {
        el.disabled = false;
        if (res.error) { toast(res.error.message, "err"); return; }
        toast(p.name + (p.active ? " hidden from the storefront." : " is live again."));
        return loadProducts().then(renderAll);
      })
      .catch(function (err) {
        el.disabled = false;
        toast(err.message || String(err), "err");
      });
  }

  /* Deleting is permanent, so warn that hiding is usually the better option and
     require an explicit confirmation. Past orders keep their own name/price
     snapshot, so removing a product never rewrites order history. */
  function deleteProduct(id, el) {
    var p = state.products.filter(function (x) { return x.id === id; })[0];
    if (!p) return;

    var sold = Number(p.sold || 0);
    var msg = 'Delete "' + p.name + '" permanently?\n\n' +
      "It will be removed from the storefront and the product list. " +
      "Past orders keep their own copy of the name and price, so order history is unaffected." +
      (sold ? "\n\nThis product has " + sold + " recorded sale(s). Hiding it instead keeps the history tidy." : "");
    if (!window.confirm(msg)) { hideInstead(id, el); return; }

    el.disabled = true;
    /* .select() is essential: RLS makes a DELETE that matches nothing return
       { data: null, error: null } — a "success" that deleted nothing. Asking
       for the row back is the only way to prove the delete really happened. */
    client.from("products").delete().eq("id", id).select("id")
      .then(function (res) {
        el.disabled = false;
        if (res.error) { toast(res.error.message, "err"); return; }
        if (!res.data || !res.data.length) {
          toast("Nothing was deleted — your account cannot delete products. See the notice on this page.", "err");
          return;
        }
        state.products = state.products.filter(function (x) { return x.id !== id; });
        renderAll();
        toast(p.name + " was deleted.");
      })
      .catch(function (err) {
        el.disabled = false;
        toast(err.message || String(err), "err");
      });
  }

  /* The cancel path on the delete prompt: same effect, reversible. */
  function hideInstead(id, el) {
    var p = state.products.filter(function (x) { return x.id === id; })[0];
    if (!p || !p.active) return;
    el.disabled = true;
    client.from("products").update({ active: false }).eq("id", id).select().single()
      .then(function (res) {
        el.disabled = false;
        if (res.error) { toast(res.error.message, "err"); return; }
        return loadProducts().then(renderAll);
      })
      .catch(function (err) {
        el.disabled = false;
        toast(err.message || String(err), "err");
      });
  }

  /* ============================ modals ============================ */

  function openModal(m) {
    lastFocused = document.activeElement;
    m.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal(m) {
    m.hidden = true;
    if (!$(".modal:not([hidden])")) document.body.style.overflow = "";
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /* ============================ wiring ============================ */

  function wireUI() {
    $$(".side__link[data-view]").forEach(function (b) {
      b.addEventListener("click", function () { show(b.dataset.view); });
    });

    document.addEventListener("click", function (e) {
      var goto = e.target.closest("[data-goto]");
      if (goto) show(goto.dataset.goto);

      var close = e.target.closest("[data-close]");
      if (close) closeModal(close.closest(".modal"));

      var viewOrder = e.target.closest("[data-view-order]");
      if (viewOrder) openOrder(viewOrder.dataset.viewOrder);

      var edit = e.target.closest("[data-edit-product]");
      if (edit) {
        var p = state.products.filter(function (x) { return x.id === edit.dataset.editProduct; })[0];
        if (p) openProduct(p);
      }

      var toggle = e.target.closest("[data-toggle-active]");
      if (toggle) toggleActive(toggle.dataset.toggleActive, toggle);

      var del = e.target.closest("[data-delete-product]");
      if (del) deleteProduct(del.dataset.deleteProduct, del);

      var editCat = e.target.closest("[data-edit-category]");
      if (editCat) {
        var c = state.categories.filter(function (x) { return x.slug === editCat.dataset.editCategory; })[0];
        if (c) openCategory(c);
      }

      var delCat = e.target.closest("[data-delete-category]");
      if (delCat) deleteCategory(delCat.dataset.deleteCategory, delCat);
    });

    document.addEventListener("change", function (e) {
      var sel = e.target.closest("[data-set-status]");
      if (sel) setStatus(sel.dataset.setStatus, sel.value, sel);
    });

    document.addEventListener("input", function (e) {
      if (e.target.id === "orderSearch") renderOrders();
      if (e.target.id === "productSearch") renderProducts();
      if (e.target.id === "categorySearch") renderCategoryList();
    });

    $("#orderStatus").addEventListener("change", renderOrders);
    $("#orderRange").addEventListener("change", renderOrders);
    $("#productCategory").addEventListener("change", renderProducts);
    $("#productFlag").addEventListener("change", renderProducts);
    $("#exportCsv").addEventListener("click", exportCsv);
    $("#productForm").addEventListener("submit", saveProduct);
    $("#orderForm").addEventListener("submit", saveOrder);
    $("#categoryForm").addEventListener("submit", saveCategory);
    $("#addCategoryBtn").addEventListener("click", function () { openCategory(null); });

    // "I have run the SQL — re-check" must ask the database again, not just
    // unhide the panel: the whole point is that the previous answer was a lie
    // caused by RLS returning empty data instead of an error.
    var recheck = $("#gateRecheckBtn");
    if (recheck) recheck.addEventListener("click", function () {
      recheck.disabled = true;
      recheck.textContent = "Checking…";
      loadAdminStatus()
        .then(function () { return refreshAll(); })
        .then(function () {
          recheck.disabled = false;
          recheck.textContent = "I have run the SQL — re-check";
          if (state.isAdmin) toast("Access granted. Welcome back.");
        })
        .catch(function (err) {
          recheck.disabled = false;
          recheck.textContent = "I have run the SQL — re-check";
          toast(err.message || String(err), "err");
        });
    });

    // Picking "+ New category…" in the product form creates it straight away.
    $("#pCategory").addEventListener("change", function () {
      if (this.value === "__new__") createCategoryInline();
    });

    // Same live-clear treatment as the product form, for the other two.
    ["#orderForm", "#categoryForm"].forEach(function (sel) {
      $(sel).addEventListener("input", function (e) {
        var field = e.target;
        if (!field.id) return;
        field.removeAttribute("aria-invalid");
        var wrap = field.closest(".full, .form > div");
        if (wrap) wrap.classList.remove("has-error");
      });
    });

    $("#cName").addEventListener("input", function () {
      if ($("#cSlug").dataset.touched) return;
      $("#cSlug").value = slugify($("#cName").value);
    });
    $("#cSlug").addEventListener("input", function () { this.dataset.touched = "1"; });

    // Live-clear a field's error as soon as it is corrected.
    $("#productForm").addEventListener("input", function (e) {
      var field = e.target;
      if (!field.id) return;
      field.removeAttribute("aria-invalid");
      var wrap = field.closest(".full, .form > div");
      if (wrap) wrap.classList.remove("has-error");
    });

    // Keep the slug in step with the name while creating a new product.
    $("#pName").addEventListener("input", function () {
      var form = $("#productForm");
      if (form.dataset.id) return;
      var slug = $("#pSlug");
      if (!slug.dataset.touched) slug.value = slugify($("#pName").value);
    });
    $("#pSlug").addEventListener("input", function () { this.dataset.touched = "1"; });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var open = $(".modal:not([hidden])");
        if (open) { closeModal(open); return; }
      }
      if (e.key === "Tab") {
        var open = $(".modal:not([hidden]) .modal__box");
        if (open) {
          var items = $$('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', open)
            .filter(function (el) {
              var cs = window.getComputedStyle(el);
              return cs.display !== "none" && cs.visibility !== "hidden";
            });
          if (!items.length) return;
          var first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    });

    // Click on the backdrop closes.
    $$(".modal").forEach(function (m) {
      m.addEventListener("mousedown", function (e) { if (e.target === m) closeModal(m); });
    });

    $("#productNote").hidden = false;
  }
})();
