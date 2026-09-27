/* ==========================================================================
   FRAMEY.PK — script.js
   Vanilla JS. No frameworks, no build step, no backend.

   HOW TO ADD A PRODUCT: copy any object inside `products` below, change the
   values, and that's it. Everything (featured row, shop grid, filters,
   categories dropdown, cart, checkout) updates automatically.
   ========================================================================== */

/* --------------------------------------------------------------------------
   0. SMALL HELPERS
   -------------------------------------------------------------------------- */

/** Build an Unsplash image URL. `w` is the width in pixels. */
const UNSPLASH = (id, w = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

/** Upgrade a product image to a higher resolution for the details modal. */
const bigImage = (url) => url.replace(/w=\d+/, "w=1400");

/** 1499 -> "Rs. 1,499" */
const rs = (n) => "Rs. " + Math.round(n).toLocaleString("en-US");

/** Product ids may be numbers (built-in catalogue) or slugs (Supabase), so
    every comparison goes through this rather than === on raw values. */
const sameId = (a, b) => String(a) === String(b);

/** Escape text before it goes into innerHTML. The built-in catalogue below is
    authored by hand, but everything that arrives from the database was typed
    by a human in the admin panel, so it counts as untrusted input. */
const esc = (v) =>
  String(v == null ? "" : v).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/** Percentage off, e.g. 17 (null when there is no old price). */const discountOf = (p) =>
  p.oldPrice && p.oldPrice > p.price
    ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100)
    : null;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const DELIVERY_FLAT = 250;
const CART_KEY = "framey_cart_v1";
const MAX_QTY = 10;

/* --------------------------------------------------------------------------
   1. PRODUCT DATA

   This array is the offline fallback. When config.js points at a working
   Supabase project, the live catalogue replaces it after first paint (see
   section 12). Edit this array only if you are NOT using Supabase.

   The `id` values are the SAME slugs used by the products table in
   supabase.sql, and that has to stay true. An order carries the product id, and
   the database refuses to price a product it cannot find, so if you rename an
   id here, change the matching row in Supabase too — otherwise orders placed
   while the site was offline can never be recovered.
   -------------------------------------------------------------------------- */

let products = [
  {
    id: "minimal-black-frame",
    name: "Minimal Black Frame",
    category: "Modern",
    price: 1499,
    oldPrice: 1799,
    rating: 4.8,
    reviews: 214,
    sold: 340,
    material: "Engineered Wood",
    color: "Matte Black",
    colorHex: "#1c1c1c",
    sizes: ["8 × 10 inch", "12 × 16 inch", "16 × 20 inch", "18 × 24 inch"],
    image: UNSPLASH("photo-1601360204725-a50359faad2f"),
    description:
      "A clean, ultra-thin black frame with a crisp rectangular profile. Built for modern interiors, offices and bedrooms, it comes with clear acrylic glazing, an acid-free backing board and hanging hardware already fitted — so all you have to do is pick your spot and hang it."
  },
  {
    id: "golden-luxury-frame",
    name: "Golden Luxury Frame",
    category: "Luxury",
    price: 1999,
    oldPrice: 2499,
    rating: 4.9,
    reviews: 168,
    sold: 275,
    material: "Solid Wood + Gold Leaf",
    color: "Antique Gold",
    colorHex: "#b08d57",
    sizes: ["8 × 10 inch", "12 × 16 inch", "16 × 20 inch", "18 × 24 inch"],
    image: UNSPLASH("photo-1774907432786-900e87e15cfc"),
    description:
      "Statement luxury with a hand-finished gold profile and softly bevelled inner edge. The deep gold tone pairs beautifully with dark walls, velvet sofas and classic artwork. Reinforced backing makes it stable and museum-flat even at 18 × 24 inch."
  },
  {
    id: "modern-family-frame",
    name: "Modern Family Frame",
    category: "Family",
    price: 1699,
    oldPrice: 1999,
    rating: 4.7,
    reviews: 132,
    sold: 210,
    material: "MDF with PVC Wrap",
    color: "Warm White",
    colorHex: "#f2ece1",
    sizes: ["12 × 16 inch", "16 × 20 inch", "18 × 24 inch"],
    image: UNSPLASH("photo-1721825170822-936b26b0b7ac"),
    description:
      "A wider format made for family portraits and group photos. The warm white finish blends into light walls while the deeper mat opening keeps the photo itself the hero. A favourite for living rooms, staircases and entry halls."
  },
  {
    id: "abstract-art-frame",
    name: "Abstract Art Frame",
    category: "Art",
    price: 1299,
    oldPrice: null,
    rating: 4.6,
    reviews: 96,
    sold: 185,
    material: "Premium Wood",
    color: "Natural Oak",
    colorHex: "#c8a97c",
    sizes: ["8 × 10 inch", "12 × 16 inch", "16 × 20 inch", "18 × 24 inch"],
    image: UNSPLASH("photo-1622542796254-5b9c46ab0d2f"),
    description:
      "Designed around bold graphic and abstract prints. The slim natural-oak profile adds warmth without competing with the artwork, and the deep-set glazing gives prints a gallery-style depth. Great for studios, home offices and feature walls."
  },
  {
    id: "wooden-classic-frame",
    name: "Wooden Classic Frame",
    category: "Wooden",
    price: 1799,
    oldPrice: 2199,
    rating: 4.8,
    reviews: 187,
    sold: 260,
    material: "Solid Sheesham Wood",
    color: "Walnut Brown",
    colorHex: "#6b4a2f",
    sizes: ["8 × 10 inch", "12 × 16 inch", "16 × 20 inch", "18 × 24 inch"],
    image: UNSPLASH("photo-1582053628662-c65b0e0544e9"),
    description:
      "Timeless sheesham wood with a hand-rubbed walnut finish and visible grain. Substantial enough to feel like an heirloom, quiet enough for a bedroom wall. Each frame is inspected by hand before it is wrapped and dispatched."
  },
  {
    id: "premium-gallery-set",
    name: "Premium Gallery Set",
    category: "Modern",
    price: 3999,
    oldPrice: 4999,
    rating: 5.0,
    reviews: 74,
    sold: 130,
    material: "Mixed Wood + Metal Detail",
    color: "Assorted Neutral",
    colorHex: "#b8a893",
    sizes: ["8 × 10 inch", "12 × 16 inch", "16 × 20 inch"],
    image: UNSPLASH("photo-1465161191540-aac346fcbaff"),
    description:
      "A coordinated set of six frames in mixed sizes, pre-matched so they hang together without looking identical. The fastest way to turn one empty wall into a full gallery wall. Hanging template and spacers included."
  },
  {
    id: "white-oak-square-frame",
    name: "White Oak Square Frame",
    category: "Wooden",
    price: 1599,
    oldPrice: null,
    rating: 4.7,
    reviews: 58,
    sold: 120,
    material: "Solid Oak",
    color: "Light Oak",
    colorHex: "#d8c1a0",
    sizes: ["8 × 10 inch", "12 × 16 inch", "16 × 20 inch"],
    image: UNSPLASH("photo-1626846116799-ad61f874f99d"),
    description:
      "Square-profile white oak with a soft matte finish. The neutral tone works with both warm and cool palettes, and the square shape is an easy match for portrait, landscape or square prints."
  },
  {
    id: "floral-print-frame",
    name: "Floral Print Frame",
    category: "Art",
    price: 1199,
    oldPrice: 1399,
    rating: 4.5,
    reviews: 81,
    sold: 145,
    material: "Engineered Wood",
    color: "Ivory White",
    colorHex: "#f5f1e8",
    sizes: ["8 × 10 inch", "12 × 16 inch", "16 × 20 inch"],
    image: UNSPLASH("photo-1632258521940-b29d7d2ae9f5"),
    description:
      "A light ivory frame with delicate proportions, made for botanical prints, florals and soft illustrations. Comes with a wide mat window so smaller prints look perfectly centred."
  }
];

/** Category tiles. `cat` must match a `category` value in `products` above. */
let categories = [
  { name: "Modern",  cat: "Modern",  image: UNSPLASH("photo-1513519245088-0e12902e5a38", 900) },
  { name: "Wooden",  cat: "Wooden",  image: UNSPLASH("photo-1766579696917-5335e0a82962", 900) },
  { name: "Luxury",  cat: "Luxury",  image: UNSPLASH("photo-1674816926075-dff16b68a24f", 900) },
  { name: "Family",  cat: "Family",  image: UNSPLASH("photo-1680475749670-ec339eab0b3f", 900) },
  { name: "Art",     cat: "Art",     image: UNSPLASH("photo-1714859100411-74b0b9a6bf15", 900) }
];

/* Every display string in `products` and `categories` is HTML-escaped exactly
   once, here and in mapRemoteProduct(). That single rule means the render
   functions below can interpolate them straight into innerHTML, and an admin
   typing "<b>" into a product name cannot inject markup. `id` is deliberately
   left alone — it is a database key, not display text. */
const escapeCatalogue = () => {
  const fields = ["name", "category", "material", "color", "image", "description", "colorHex"];
  products = products.map((p) => {
    const out = Object.assign({}, p);
    fields.forEach((f) => { if (typeof out[f] === "string") out[f] = esc(out[f]); });
    out.sizes = p.sizes.map(esc);
    return out;
  });
  categories = categories.map((c) => ({
    name: esc(c.name),
    cat: esc(c.cat),
    image: esc(c.image)
  }));
};
escapeCatalogue();

/* --------------------------------------------------------------------------
   2. STATE
   -------------------------------------------------------------------------- */

const state = {
  search: "",
  category: "all",
  maxPrice: 5000,
  sort: "popular"
};

let cart = [];            // [{ key, id, size, qty }]
let activeProduct = null; // product currently open in the modal
let lastFocused = null;
let orderInFlight = false; // true between "Place Order" and the send settling
let pendingRetry = null;   // a row the database refused, kept so a retry reuses its order_no

/* Focusable selector used to keep Tab inside an open overlay or drawer. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),' +
  'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusables(container) {
  return $$(FOCUSABLE, container).filter((el) => {
    if (el.disabled || el.getAttribute("aria-hidden") === "true") return false;
    const cs = window.getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  });
}

/* The topmost layer currently on screen — that is the one Tab must stay in. */
function topLayer() {
  const overlays = ["#successOverlay", "#checkoutOverlay", "#productOverlay"];
  for (const sel of overlays) {
    const el = $(sel);
    if (el && !el.hidden) return el;
  }
  const drawer = $("#cartDrawer");
  return drawer && drawer.classList.contains("is-open") ? drawer : null;
}

/* Wrap focus from the last focusable element back to the first and back again. */
function trapTab(e, layer) {
  const items = focusables(layer);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const current = document.activeElement;

  if (e.shiftKey && (current === first || !layer.contains(current))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (current === last || !layer.contains(current))) {
    e.preventDefault();
    first.focus();
  }
}

/* --------------------------------------------------------------------------
   3. TOAST
   -------------------------------------------------------------------------- */

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="m5 12.5 4.5 4.5L19 7.5"/></svg><span></span>';
  $("span", el).textContent = message;

  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("is-show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add("is-out");
    setTimeout(() => { el.hidden = true; el.classList.remove("is-show", "is-out"); }, 320);
  }, 2400);
}

/* --------------------------------------------------------------------------
   4. PRODUCT CARD
   -------------------------------------------------------------------------- */

function productCard(p) {
  const off = discountOf(p);
  const stars = Math.round((p.rating / 5) * 100);
  const badge = off
    ? `<span class="tag tag--sale">-${off}%</span>`
    : p.sold >= 260 ? `<span class="tag tag--new">Bestseller</span>` : "";

  return `
    <article class="card reveal is-in" data-id="${p.id}">
      <div class="card__media">
        ${badge ? `<div class="card__tags">${badge}</div>` : ""}
        <button class="card__wish" type="button" data-wish="${p.id}" aria-label="Save ${p.name} to wishlist">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20Z"/>
          </svg>
        </button>
        <img src="${p.image}" alt="${p.name} — ${p.material} wall frame in ${p.color}" loading="lazy" />
      </div>

      <div class="card__body">
        <p class="card__cat">${p.category}</p>
        <h3 class="card__name">${p.name}</h3>

        <div class="rating">
          <span class="stars"><i style="width:${stars}%">★★★★★</i></span>
          <b>${p.rating.toFixed(1)} (${p.reviews})</b>
        </div>

        <div class="price">
          <span class="price__now">${rs(p.price)}</span>
          ${p.oldPrice ? `<span class="price__was">${rs(p.oldPrice)}</span>` : ""}
        </div>

        <div class="card__actions">
          <button class="btn btn--dark" type="button" data-add="${p.id}">Add to Cart</button>
          <button class="btn btn--view" type="button" data-view="${p.id}">View Details</button>
        </div>
      </div>
    </article>`;
}

/* --------------------------------------------------------------------------
   5. RENDERING
   -------------------------------------------------------------------------- */

/** Featured row — first 6 products. */
function renderFeatured() {
  $("#featuredGrid").innerHTML = products.slice(0, 6).map(productCard).join("");
}

/** Category tiles. Note: every string here is already HTML-escaped (see
    escapeCatalogue / mapRemoteProduct), so it is interpolated as-is. */
function renderCategories() {
  $("#catGrid").innerHTML = categories.map((c) => `
    <a class="cat reveal is-in" href="#shop" data-cat="${c.cat}" data-scroll>
      <img src="${c.image}" alt="${c.name} wall frame collection" loading="lazy" />
      <div class="cat__body">
        <h3 class="cat__name">${c.name}</h3>
        <span class="cat__shop">Shop Now
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h13M12 5l7 7-7 7"/>
          </svg>
        </span>
      </div>
    </a>`).join("");

  // REPLACE the options rather than appending: renderCategories() also runs
  // after the catalogue sync, and appending a second time would leave the
  // dropdown with every category listed twice.
  const select = $("#shopCategory");
  select.innerHTML =
    '<option value="all">All Categories</option>' +
    categories.map((c) => `<option value="${c.cat}">${c.name}</option>`).join("");

  // Keep whatever the shopper had chosen if that category still exists.
  if (state.category !== "all" && !categories.some((c) => c.cat === state.category)) {
    state.category = "all";
  }
  select.value = state.category;
}

/** Main shop grid — renders whatever filterProducts() puts in `state.results`. */
function renderProducts(list) {
  const grid = $("#shopGrid");
  const empty = $("#shopEmpty");

  grid.innerHTML = list.map(productCard).join("");
  empty.hidden = list.length > 0;
  grid.hidden = list.length === 0;

  // "Nothing matches your filters" and "the shop is empty" are different
  // problems and deserve different words. Once the owner deletes every product
  // in the admin panel, telling shoppers to adjust their filters would be
  // nonsense, so the reset button is hidden too.
  const shopIsEmpty = products.length === 0;
  $("#shopEmptyTitle").textContent = shopIsEmpty
    ? "No frames available right now"
    : "No frames match your filters";
  $("#shopEmptyText").textContent = shopIsEmpty
    ? "Every frame is currently sold out or hidden. Please check back soon."
    : "Try a different category, raise the price limit, or clear your search.";
  $("#emptyReset").hidden = shopIsEmpty;

  // Featured and the category tiles have nothing to show in an empty shop.
  $("#featured").hidden = shopIsEmpty;
  $("#categories").hidden = shopIsEmpty;

  $("#shopCount").textContent = shopIsEmpty
    ? "Out of stock"
    : list.length === products.length
      ? `${list.length} frames in stock`
      : `${list.length} of ${products.length} frames`;

  renderChips();
}

/* --------------------------------------------------------------------------
   6. FILTER · SEARCH · SORT
   -------------------------------------------------------------------------- */

function filterProducts() {
  const q = state.search.trim().toLowerCase();

  let list = products.filter((p) => {
    const matchText =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.material.toLowerCase().includes(q) ||
      p.color.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q);

    const matchCat = state.category === "all" || p.category === state.category;
    const matchPrice = p.price <= state.maxPrice;

    return matchText && matchCat && matchPrice;
  });

  const sorters = {
    low:    (a, b) => a.price - b.price,
    high:   (a, b) => b.price - a.price,
    rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
    name:   (a, b) => a.name.localeCompare(b.name),
    popular:(a, b) => b.sold - a.sold
  };
  list = [...list].sort(sorters[state.sort] || sorters.popular);

  renderProducts(list);
  return list;
}

/** Type-to-search, used by both the navbar search bar and the shop field. */
function searchProducts(term, from = "shop") {
  state.search = term;

  // Mirror the term into the other box so the two never disagree. Only assign
  // when it actually differs — writing the same value back into the focused
  // input would move the caret to the end mid-word.
  const set = (el) => { if (el && el.value !== term) el.value = term; };
  set($("#shopSearch"));
  set($("#navSearchInput"));

  const list = filterProducts();
  if (from === "nav") updateSearchCount(term, list.length);

  return list;
}

function updateSearchCount(term, count) {
  const el = $("#navSearchCount");
  const q = term.trim();
  if (!q) { el.textContent = ""; return; }
  el.textContent = typeof count === "number" ? `${count} result${count === 1 ? "" : "s"}` : "…";
}

/** Active filter chips under the toolbar. */
function renderChips() {
  const wrap = $("#activeChips");
  const list = $("#chipList");
  const chips = [];

  if (state.search.trim()) chips.push({ key: "search", label: `“${state.search.trim()}”` });
  if (state.category !== "all") chips.push({ key: "category", label: state.category });
  if (state.maxPrice < 5000) chips.push({ key: "price", label: `Under ${rs(state.maxPrice)}` });

  list.innerHTML = chips.map(
    (c) => `<span class="chip">${c.label}<button type="button" data-chip="${c.key}" aria-label="Remove ${c.label} filter">&times;</button></span>`
  ).join("");

  wrap.hidden = chips.length === 0;
}

function resetFilters() {
  state.search = "";
  state.category = "all";
  state.maxPrice = 5000;
  state.sort = "popular";

  $("#shopSearch").value = "";
  $("#navSearchInput").value = "";
  $("#shopCategory").value = "all";
  $("#shopSort").value = "popular";
  syncPriceSlider();
  filterProducts();
}

function syncPriceSlider() {
  const slider = $("#shopPrice");
  const pct = (state.maxPrice / Number(slider.max)) * 100;
  slider.value = state.maxPrice;
  slider.style.setProperty("--pct", pct + "%");
  $("#shopPriceOut").textContent = "Rs. " + state.maxPrice.toLocaleString("en-US");
}

/* --------------------------------------------------------------------------
   7. PRODUCT DETAILS MODAL
   -------------------------------------------------------------------------- */

function openProductModal(id, size) {
  const p = products.find((x) => sameId(x.id, id));
  if (!p) return;

  activeProduct = p;
  lastFocused = document.activeElement;

  const off = discountOf(p);
  const stars = Math.round((p.rating / 5) * 100);
  const defaultSize = p.sizes[0];

  $("#productModalBody").innerHTML = `
    <div class="pd">
      <div class="pd__media">
        <img src="${bigImage(p.image)}" alt="${p.name} — ${p.material} wall frame in ${p.color}" />
      </div>

      <div class="pd__info">
        <div class="pd__badges">
          <span class="tag tag--sale">${p.category}</span>
          ${off ? `<span class="tag tag--sale">-${off}% OFF</span>` : ""}
        </div>

        <h3 class="pd__name" id="pmName">${p.name}</h3>

        <div class="rating">
          <span class="stars"><i style="width:${stars}%">★★★★★</i></span>
          <b>${p.rating.toFixed(1)} · ${p.reviews} reviews</b>
        </div>

        <div class="pd__price">
          <span class="price__now">${rs(p.price)}</span>
          ${p.oldPrice ? `<span class="price__was">${rs(p.oldPrice)}</span>` : ""}
        </div>

        <p class="pd__desc">${p.description}</p>

        <dl class="specs">
          <div class="spec">
            <dt>Sizes</dt>
            <dd>
              <div class="size-list">
                ${p.sizes.map((s, i) => `
                  <label>
                    <input type="radio" name="pmSize" value="${s}" ${(size || defaultSize) === s ? "checked" : ""} />
                    <span>${s}</span>
                  </label>`).join("")}
              </div>
            </dd>
          </div>
          <div class="spec"><dt>Material</dt><dd>${p.material}</dd></div>
          <div class="spec">
            <dt>Colour</dt>
            <dd>${p.color}</dd>
          </div>
          <div class="spec"><dt>Quantity</dt><dd>
            <span class="qty">
              <button type="button" data-pmqty="-" aria-label="Decrease quantity">&minus;</button>
              <input type="number" id="pmQty" value="1" min="1" max="${MAX_QTY}" aria-label="Quantity" />
              <button type="button" data-pmqty="+" aria-label="Increase quantity">+</button>
            </span>
          </dd></div>
        </dl>

        <div class="pd__buy">
          <button class="btn btn--gold" type="button" id="pmAdd">Add to Cart</button>
          <button class="btn btn--ghost" type="button" id="pmBuyNow">Buy Now</button>
        </div>

        <ul class="pd__perks">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg> Cash on Delivery</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg> 3–5 working days</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg> Hanging hardware included</li>
        </ul>
      </div>
    </div>`;

  const overlay = $("#productOverlay");
  overlay.hidden = false;
  document.body.classList.add("is-locked");
  $("#pmAdd").focus();
}

function closeProductModal() {
  closeOverlay($("#productOverlay"));
}

function pmQuantity(delta) {
  const input = $("#pmQty");
  if (!input) return;
  const next = Math.min(MAX_QTY, Math.max(1, (Number(input.value) || 1) + delta));
  input.value = next;
}

/* --------------------------------------------------------------------------
   8. CART
   -------------------------------------------------------------------------- */

const cartKeyOf = (id, size) => `${id}__${size}`;

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Keep only items whose product still exists, and repair bad quantities.
    cart = parsed
      .filter((it) => it && products.some((p) => sameId(p.id, it.id)))
      .map((it) => ({
        key: cartKeyOf(it.id, it.size),
        id: it.id,
        size: it.size,
        qty: Math.min(MAX_QTY, Math.max(1, Number(it.qty) || 1))
      }));
  } catch {
    cart = [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart.map(({ id, size, qty }) => ({ id, size, qty }))));
  } catch {
    /* storage full or blocked — the cart still works for this session */
  }
}

function addToCart(id, size, qty = 1) {
  const p = products.find((x) => sameId(x.id, id));
  if (!p) return;

  const chosen = size || p.sizes[0];
  const key = cartKeyOf(p.id, chosen);
  const line = cart.find((it) => it.key === key);

  if (line) {
    line.qty = Math.min(MAX_QTY, line.qty + qty);
  } else {
    cart.push({ key, id: p.id, size: chosen, qty: Math.min(MAX_QTY, Math.max(1, qty)) });
  }

  saveCart();
  updateCart();
  toast(`${p.name} added to cart`);
}

function removeFromCart(key) {
  const item = cart.find((it) => it.key === key);
  cart = cart.filter((it) => it.key !== key);
  saveCart();
  updateCart();
  if (item) {
    const p = products.find((x) => sameId(x.id, item.id));
    toast(`${p ? p.name : "Item"} removed from cart`);
  }
}

function setQty(key, qty) {
  const line = cart.find((it) => it.key === key);
  if (!line) return;

  const next = Number(qty);
  if (!Number.isFinite(next) || next < 1) return removeFromCart(key);

  line.qty = Math.min(MAX_QTY, next);
  saveCart();
  updateCart();
}

const cartCount = () => cart.reduce((n, it) => n + it.qty, 0);
const cartSubtotal = () => cart.reduce((sum, it) => {
  const p = products.find((x) => sameId(x.id, it.id));
  return sum + (p ? p.price * it.qty : 0);
}, 0);

/** Re-render the cart drawer, the navbar badge, the totals and the summary. */
function updateCart() {
  const count = cartCount();
  const subtotal = cartSubtotal();
  const delivery = cart.length ? DELIVERY_FLAT : 0;
  const total = subtotal + delivery;

  // Navbar badge
  const badge = $("#cartCount");
  badge.textContent = count;
  badge.hidden = count === 0;
  $("#drawerCount").textContent = count ? `(${count} item${count === 1 ? "" : "s"})` : "";

  // Drawer items
  const wrap = $("#cartItems");
  const foot = $("#cartFoot");

  if (!cart.length) {
    wrap.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 7h12l-1.1 11.2a2 2 0 0 1-2 1.8H9.1a2 2 0 0 1-2-1.8Z"/><path d="M9 7a3 3 0 0 1 6 0"/>
          </svg>
        </div>
        <h4>Your cart is empty</h4>
        <p>Pick a frame you love and it will show up right here.</p>
        <button class="btn btn--dark" type="button" data-close-cart>Browse frames</button>
      </div>`;
    foot.hidden = true;
  } else {
    wrap.innerHTML = cart.map((it) => {
      const p = products.find((x) => sameId(x.id, it.id));
      if (!p) return "";
      return `
        <div class="citem">
          <img src="${p.image}" alt="${p.name}" loading="lazy" />
          <div>
            <div class="citem__top">
              <h4 class="citem__name">${p.name}</h4>
              <span class="citem__price">${rs(p.price * it.qty)}</span>
            </div>
            <p class="citem__meta">${p.category} · ${it.size}</p>
            <div class="citem__row">
              <span class="qty qty--sm">
                <button type="button" data-cart-dec="${it.key}" aria-label="Decrease quantity of ${p.name}">&minus;</button>
                <input type="number" value="${it.qty}" min="1" max="${MAX_QTY}" data-cart-qty="${it.key}" aria-label="Quantity of ${p.name}" />
                <button type="button" data-cart-inc="${it.key}" aria-label="Increase quantity of ${p.name}">+</button>
              </span>
              <button class="citem__rm" type="button" data-cart-rm="${it.key}">Remove</button>
            </div>
          </div>
        </div>`;
    }).join("");
    foot.hidden = false;
  }

  // Totals (drawer + checkout summary)
  $("#sumSubtotal").textContent = rs(subtotal);
  $("#sumDelivery").textContent = rs(delivery);
  $("#sumTotal").textContent = rs(total);
  $("#sumSubtotal2").textContent = rs(subtotal);
  $("#sumDelivery2").textContent = rs(delivery);
  $("#sumTotal2").textContent = rs(total);

  // Checkout summary lines
  $("#summaryItems").innerHTML = cart.length
    ? cart.map((it) => {
        const p = products.find((x) => sameId(x.id, it.id));
        if (!p) return "";
        return `
          <div class="sitem">
            <img src="${p.image}" alt="${p.name}" loading="lazy" />
            <div>
              <p class="sitem__name">${p.name}</p>
              <p class="sitem__meta">${it.size} · Qty ${it.qty}</p>
            </div>
            <span class="sitem__price">${rs(p.price * it.qty)}</span>
          </div>`;
      }).join("")
      : `<p class="sitem__meta">Your cart is empty.</p>`;
}

/* --------------------------------------------------------------------------
   9. DRAWER + OVERLAY PLUMBING
   -------------------------------------------------------------------------- */

function openOverlay(overlay) {
  lastFocused = document.activeElement;
  overlay.hidden = false;
  overlay.classList.remove("is-closing");
  document.body.classList.add("is-locked");
}

function closeOverlay(overlay) {
  if (overlay.hidden) return;
  overlay.classList.add("is-closing");
  setTimeout(() => {
    overlay.hidden = true;
    overlay.classList.remove("is-closing");
    if (!$$(".overlay:not([hidden]), .drawer.is-open").length) {
      document.body.classList.remove("is-locked");
    }
    if (lastFocused) lastFocused.focus();
  }, 220);
}

function openCart() {
  const scrim = $("#cartScrim");
  const drawer = $("#cartDrawer");
  scrim.hidden = false;
  scrim.classList.remove("is-closing");
  requestAnimationFrame(() => drawer.classList.add("is-open"));
  drawer.setAttribute("aria-hidden", "false");
  $("#cartToggle").setAttribute("aria-expanded", "true");
  document.body.classList.add("is-locked");
  setTimeout(() => $("#cartClose").focus(), 260);
}

function closeCart() {
  const scrim = $("#cartScrim");
  const drawer = $("#cartDrawer");
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  scrim.classList.add("is-closing");
  setTimeout(() => { scrim.hidden = true; scrim.classList.remove("is-closing"); }, 250);
  $("#cartToggle").setAttribute("aria-expanded", "false");
  if (!$$(".overlay:not([hidden])").length) document.body.classList.remove("is-locked");
  $("#cartToggle").focus();
}

/* --------------------------------------------------------------------------
   10. CHECKOUT
   -------------------------------------------------------------------------- */

function checkout() {
  if (!cart.length) {
    closeCart();
    toast("Your cart is empty — add a frame first");
    return;
  }
  closeCart();
  setTimeout(() => {
    openOverlay($("#checkoutOverlay"));
    setTimeout(() => $("#coName").focus(), 200);
  }, 240);
}

const PROVINCES = [
  "Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan",
  "Gilgit-Baltistan", "Azad Jammu & Kashmir", "Islamabad Capital Territory"
];

/** Field rules — easy to tweak. Returns an error string or "" when valid. */
const validators = {
  coName: (v) =>
    v.trim().length < 3 ? "Please enter your full name." : "",
  coPhone: (v) => {
    const digits = v.replace(/[\s-]/g, "");
    if (!digits) return "Phone number is required.";
    if (!/^(\+?92|0)3\d{9}$/.test(digits)) return "Enter a valid Pakistani number, e.g. 03001234567.";
    return "";
  },
  coEmail: (v) =>
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "Enter a valid email address." : "",
  coAddress: (v) =>
    v.trim().length < 10 ? "Please enter your complete address." : "",
  coCity: (v) =>
    v.trim().length < 2 ? "Please enter your city." : "",
  coProvince: (v) =>
    !PROVINCES.includes(v) ? "Please select your province." : "",
  coPostal: (v) =>
    !/^\d{4,6}$/.test(v.trim()) ? "Postal code must be 4–6 digits."
  : ""
};

function validateCheckout() {
  let ok = true;

  Object.keys(validators).forEach((id) => {
    const input = $("#" + id);
    const row = input.closest(".form-row");
    const err = $(".err", row);
    const message = validators[id](input.value);

    row.classList.toggle("has-error", !!message);
    err.textContent = message;
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (message) ok = false;
  });

  if (!ok) {
    const firstError = $(".form-row.has-error input, .form-row.has-error select, .form-row.has-error textarea");
    if (firstError) firstError.focus();
  }
  return ok;
}

/** FR-YYMMDD-XXXX */
function generateOrderNumber() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate());
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `FR-${stamp}-${rand}`;
}

/** Everything the order row is built from. Two attempts that share a signature
 *  describe the same order, so a retry can reuse the original row — and with it
 *  the order_no — instead of minting a second number for one purchase. */
function orderSignature(fields) {
  return JSON.stringify([fields, cart.map((it) => [it.id, it.size, it.qty])]);
}

function showCheckoutError(message) {
  const el = $("#checkoutError");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function clearCheckoutError() {
  const el = $("#checkoutError");
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
}

/** Turn a Supabase error into something a customer can act on, while keeping the
 *  raw detail in the console for the owner. Never say the order was received. */
function orderFailureReason(err) {
  console.warn("FRAMEY.PK: the order was NOT stored.", err);
  const code = String((err && err.code) || "");

  if (code === "42501") {
    return "Our order system is temporarily rejecting requests. Please try again in a moment.";
  }
  if (code.startsWith("22")) {
    // The lock_order_on_insert trigger refused the row: an item id that is not
    // on sale, or a quantity it will not accept. Only the database can fix it.
    return "One of the items in your cart is no longer available in that quantity. Please review your cart and try again.";
  }
  if (!navigator.onLine) {
    return "You appear to be offline, so the order could not be sent. Reconnect and press Try Again.";
  }
  return "We could not reach our order system, so your order has NOT been received yet. Please press Try Again — your cart and details have been kept.";
}

function placeOrder(event) {
  event.preventDefault();

  // Guard against a double click or an impatient Enter key: without this the
  // customer can place the same order twice and nobody can tell which is real.
  if (orderInFlight) return;

  if (!validateCheckout()) {
    toast("Please fix the highlighted fields");
    return;
  }

  // Snapshot the form and cart first — both are cleared once the send settles.
  const fields = {
    name: $("#coName").value.trim(),
    phone: $("#coPhone").value.trim(),
    email: $("#coEmail").value.trim(),
    address: $("#coAddress").value.trim(),
    city: $("#coCity").value.trim(),
    province: $("#coProvince").value,
    postal: $("#coPostal").value.trim(),
    notes: $("#coNotes").value.trim()
  };

  // Build the row HERE, synchronously, while the cart still exists. The retry
  // queue reuses this exact object much later, after the cart has been
  // emptied — rebuilding it then would send an order with no items.
  const sig = orderSignature(fields);
  let row;
  if (pendingRetry && pendingRetry.sig === sig) {
    row = pendingRetry.row;
  } else {
    const orderNumber = generateOrderNumber();
    const total = cartSubtotal() + DELIVERY_FLAT;
    row = buildOrderRow(fields, orderNumber, total);
  }

  orderInFlight = true;
  clearCheckoutError();
  const btn = $("#placeOrder");
  if (btn) { btn.disabled = true; btn.textContent = "Placing order…"; }

  /* The success screen used to open the instant the button was pressed, which
   * meant a rejected insert still told the customer "Order Placed Successfully"
   * while the order sat in a localStorage retry queue that nobody would ever
   * read. Every lost order looked like a sale. Now the panel only claims success
   * once the database has actually accepted the row, and a failure keeps the
   * cart and the form so the customer can fix it with one tap. */
  deliverOrder(row).then(
    () => {
      pendingRetry = null;
      releaseOrderLock();
      closeOverlay($("#checkoutOverlay"));

      $("#orderNumber").textContent = row.order_no;
      $("#orderTotal").textContent = rs(row.total);

      // Hand the customer a direct link to tracking, with their order number
      // already filled in. The phone number is still required — pre-filling the
      // number is a convenience, not a way around the second check.
      const trackLink = $("#trackLink");
      if (trackLink) trackLink.href = "track-order.html?order=" + encodeURIComponent(row.order_no);

      setTimeout(() => {
        openOverlay($("#successOverlay"));
      }, 240);

      cart = [];
      saveCart();
      updateCart();
      $("#checkoutForm").reset();
      $$(".form-row").forEach((r) => r.classList.remove("has-error"));
    },
    (err) => {
      pendingRetry = { sig, row };
      releaseOrderLock();
      const btn2 = $("#placeOrder");
      if (btn2) btn2.textContent = "Try Again";
      showCheckoutError(orderFailureReason(err));
    }
  );
}

function releaseOrderLock() {
  orderInFlight = false;
  const btn = $("#placeOrder");
  if (btn) { btn.disabled = false; btn.textContent = "Place Order"; }
}

/* --------------------------------------------------------------------------
   11. NAV BEHAVIOUR
   -------------------------------------------------------------------------- */

function initNav() {
  const nav = $("#nav");
  const burger = $("#burger");
  const links = $("#navLinks");

  // Blurred / solid navbar once the page scrolls.
  const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Mobile menu
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });

  links.addEventListener("click", (e) => {
    if (e.target.closest("a")) {
      nav.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
    }
  });

  // Highlight the section currently in view.
  if (!("IntersectionObserver" in window)) return;
  const sections = ["home", "featured", "categories", "shop", "about"].map((id) => $("#" + id));
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        $$(".nav__link").forEach((a) =>
          a.classList.toggle("is-active", a.getAttribute("href") === "#" + entry.target.id)
        );
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  sections.forEach((s) => s && spy.observe(s));
}

/** Open or close the collapsible navbar search bar. */
function setSearchOpen(open) {
  const panel = $("#navSearch");
  const input = $("#navSearchInput");
  const toggle = $("#searchToggle");

  panel.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));

  if (open) {
    $("#nav").classList.remove("is-open");
    setTimeout(() => input.focus(), 60);
  } else {
    toggle.focus();
  }
}

function initSearch() {
  const toggle = $("#searchToggle");
  const input = $("#navSearchInput");

  toggle.addEventListener("click", () => setSearchOpen($("#navSearch").hidden));
  $("#navSearchClose").addEventListener("click", () => setSearchOpen(false));

  input.addEventListener("input", () => searchProducts(input.value, "nav"));

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    setSearchOpen(false);
    scrollToSection("#shop");
  });
}

/** Smooth scroll that respects the fixed navbar height. */
function scrollToSection(selector) {
  const el = $(selector);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - ($("#nav").offsetHeight + 16);
  window.scrollTo({ top, behavior: "smooth" });
}

function initSmoothScroll() {
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute("href");
    if (id.length < 2 || !$(id)) return;

    e.preventDefault();
    $("#nav").classList.remove("is-open");
    $("#burger").setAttribute("aria-expanded", "false");
    scrollToSection(id);
    history.replaceState(null, "", id);
  });
}

/** Fade elements in as they scroll into view. */
function initReveal() {
  const targets = $$(".reveal");
  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        obs.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  targets.forEach((el) => io.observe(el));
}

/* --------------------------------------------------------------------------
   12. GLOBAL CLICK HANDLER (event delegation)
   -------------------------------------------------------------------------- */

function initEvents() {
  document.addEventListener("click", (e) => {
    const t = e.target;

    // --- product actions ---
    const add = t.closest("[data-add]");
    if (add) { addToCart(add.dataset.add); openCart(); return; }

    const view = t.closest("[data-view]");
    if (view) { openProductModal(view.dataset.view); return; }

    const wish = t.closest("[data-wish]");
    if (wish) { toast("Saved to your wishlist"); return; }

    // --- category tiles filter the shop ---
    const cat = t.closest("[data-cat]");
    if (cat) {
      state.category = cat.dataset.cat;
      $("#shopCategory").value = state.category;
      filterProducts();
      $$(".cat").forEach((c) => c.classList.toggle("is-active", c === cat));
      toast(`Showing ${state.category} frames`);
      return;
    }

    // --- modal quantity ---
    const pmq = t.closest("[data-pmqty]");
    if (pmq) { pmQuantity(pmq.dataset.pmqty === "+" ? 1 : -1); return; }

    if (t.closest("#pmAdd") && activeProduct) {
      const qty = Number($("#pmQty").value) || 1;
      addToCart(activeProduct.id, $('input[name="pmSize"]:checked')?.value, qty);
      closeProductModal();
      openCart();
      return;
    }

    if (t.closest("#pmBuyNow") && activeProduct) {
      const qty = Number($("#pmQty").value) || 1;
      addToCart(activeProduct.id, $('input[name="pmSize"]:checked')?.value, qty);
      closeProductModal();
      checkout();
      return;
    }

    // --- cart lines ---
    const inc = t.closest("[data-cart-inc]");
    if (inc) { setQty(inc.dataset.cartInc, (cart.find((i) => i.key === inc.dataset.cartInc)?.qty || 0) + 1); return; }

    const dec = t.closest("[data-cart-dec]");
    if (dec) { setQty(dec.dataset.cartDec, (cart.find((i) => i.key === dec.dataset.cartDec)?.qty || 0) - 1); return; }

    const rm = t.closest("[data-cart-rm]");
    if (rm) { removeFromCart(rm.dataset.cartRm); return; }

    // --- filter chips ---
    const chip = t.closest("[data-chip]");
    if (chip) {
      const key = chip.dataset.chip;
      if (key === "search") { state.search = ""; $("#shopSearch").value = ""; $("#navSearchInput").value = ""; }
      if (key === "category") { state.category = "all"; $("#shopCategory").value = "all"; }
      if (key === "price") { state.maxPrice = 5000; syncPriceSlider(); }
      filterProducts();
      return;
    }

    // --- overlays / drawer ---
    if (t.closest("#cartToggle")) { openCart(); return; }
    if (t.closest("#cartClose") || t.closest("[data-close-cart]")) { closeCart(); return; }
    if (t.closest("#keepShopping")) { closeCart(); scrollToSection("#shop"); return; }
    if (t.closest("#cartScrim")) { closeCart(); return; }
    if (t.closest("#toCheckout")) { checkout(); return; }

    const closer = t.closest("[data-close]");
    if (closer) { closeOverlay(closer.closest(".overlay")); return; }
    if (t.classList.contains("overlay")) { closeOverlay(t); return; }
  });

  // Cart quantity inputs (typing)
  document.addEventListener("change", (e) => {
    const input = e.target.closest("[data-cart-qty]");
    if (input) setQty(input.dataset.cartQty, input.value);
  });

  // Clear error styling as the customer types.
  document.addEventListener("input", (e) => {
    const row = e.target.closest(".form-row.has-error");
    if (row && validators[e.target.id] && !validators[e.target.id](e.target.value)) {
      row.classList.remove("has-error");
      $(".err", row).textContent = "";
      e.target.removeAttribute("aria-invalid");
    }
  });

  // Escape closes the topmost layer; Tab stays trapped inside it.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      const layer = topLayer();
      if (layer) trapTab(e, layer);
      return;
    }
    if (e.key !== "Escape") return;
    if (!$("#navSearch").hidden) return setSearchOpen(false);
    if (!$("#successOverlay").hidden) return closeOverlay($("#successOverlay"));
    if (!$("#checkoutOverlay").hidden) return closeOverlay($("#checkoutOverlay"));
    if (!$("#productOverlay").hidden) return closeProductModal();
    if ($("#cartDrawer").classList.contains("is-open")) return closeCart();
  });

  // --- toolbar wiring ---
  $("#shopSearch").addEventListener("input", (e) => searchProducts(e.target.value));

  $("#shopCategory").addEventListener("change", (e) => {
    state.category = e.target.value;
    $$(".cat").forEach((c) => c.classList.toggle("is-active", c.dataset.cat === state.category));
    filterProducts();
  });

  $("#shopSort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    filterProducts();
  });

  $("#shopPrice").addEventListener("input", (e) => {
    state.maxPrice = Number(e.target.value);
    syncPriceSlider();
    filterProducts();
  });

  $("#clearFilters").addEventListener("click", resetFilters);
  $("#emptyReset").addEventListener("click", resetFilters);

  // --- checkout form ---
  $("#checkoutForm").addEventListener("submit", placeOrder);
}

/* --------------------------------------------------------------------------
   13. BOOT
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   12. SUPABASE  (optional — the store works fully without it)

   Everything here fails soft. If config.js is unconfigured, the CDN is
   blocked, or the network is down, the built-in catalogue keeps serving and
   orders are queued in localStorage to be retried later.
   -------------------------------------------------------------------------- */

const PENDING_KEY = "framey_pending_orders_v1";

/** How long checkout waits for the database before calling it a failure. */
const ORDER_SEND_TIMEOUT_MS = 15000;

/** Reject `promise` if it has not settled within `ms`. */
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(message);
      err.code = "TIMEOUT";
      reject(err);
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/** Supabase row (snake_case) -> the shape the rest of script.js expects.
    Display text is escaped here, at the boundary, so every innerHTML below
    can interpolate it safely. The id is left raw on purpose: it is used for
    cart keys and for the order payload, and the database has to be able to
    match it against products.id. It is escaped where it is rendered instead. */
function mapRemoteProduct(row) {
  return {
    id: String(row.id == null ? "" : row.id),
    name: esc(row.name),
    category: esc(row.category || "Modern"),
    price: Number(row.price) || 0,
    oldPrice: row.old_price == null ? null : Number(row.old_price),
    rating: Number(row.rating) || 4.5,
    reviews: Number(row.reviews) || 0,
    sold: Number(row.sold) || 0,
    material: esc(row.material || ""),
    color: esc(row.color || ""),
    colorHex: esc(row.color_hex || "#b08d57"),
    sizes: (Array.isArray(row.sizes) && row.sizes.length ? row.sizes : ["8 × 10 inch"]).map(esc),
    image: esc(row.image),
    description: esc(row.description || "")
  };
}

/** Pull the live catalogue. Resolves to true when the products were replaced. */
function syncFromSupabase() {
  const cfg = window.FRAMEY_CONFIG;
  if (!cfg || !cfg.useRemoteProducts) return Promise.resolve(false);

  const sb = window.FrameySupabase;
  const client = sb && sb.get();
  if (!client) return Promise.resolve(false);

  return client
    .from("products")
    .select("*")
    .eq("active", true)
    .order("sold", { ascending: false })
    .then((res) => {
      if (res.error) throw res.error;
      // A successful response is the truth, INCLUDING zero rows. An empty
      // table is the normal result of deleting every product in the admin
      // panel, so it must blank the shop — otherwise the built-in fallback
      // silently resurrects frames the owner just deleted on every refresh.
      // The built-in catalogue is only for when the fetch genuinely fails.
      products = (res.data || []).map(mapRemoteProduct);

      return client
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .then((catRes) => {
          if (!catRes.error) {
            categories = (catRes.data || []).map((c) => ({
              name: esc(c.name),
              cat: esc(c.slug),
              image: esc(c.image || "")
            }));
          }
        })
        .catch(() => {})
        .then(() => true);
    })
    .then((synced) => {
      if (!synced) return false;

      // Stretch the price slider so a more expensive catalogue stays reachable.
      const ceiling = Math.max(5000, ...products.map((p) => p.price));
      const slider = $("#shopPrice");
      if (slider && Number(slider.max) !== ceiling) {
        slider.max = String(ceiling);
        state.maxPrice = ceiling;
      }

      // Drop anything in the cart that no longer exists, then repaint.
      cart = cart.filter((it) => products.some((p) => sameId(p.id, it.id)));
      saveCart();

      renderCategories();
      renderFeatured();
      syncPriceSlider();
      filterProducts();
      updateCart();
      return true;
    })
    .catch((err) => {
      console.warn("FRAMEY.PK: catalogue sync failed, using the built-in products.", err);
      return false;
    });
}

/** Queue an order that could not be sent, so it is retried on the next visit. */
function queueOrder(payload) {
  try {
    const queue = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    queue.push(payload);
    localStorage.setItem(PENDING_KEY, JSON.stringify(queue.slice(-50)));
  } catch (err) {
    console.warn("FRAMEY.PK: could not queue the order.", err);
  }
}

/** Insert one order row.
 *
 *  NEVER ask for the inserted row back. `return=representation` (which is what
 *  .select() adds) makes Postgres run INSERT ... RETURNING, and RETURNING
 *  needs SELECT privilege on the table. The anonymous storefront deliberately
 *  has no SELECT on `orders`, so the whole INSERT is rejected with 42501 and
 *  the order is thrown away — even though the customer already saw a success
 *  screen. The server still recomputes the money in a trigger, so the admin
 *  panel always shows the authoritative total.
 */
function insertOrder(client, payload) {
  return client.from("orders").insert(payload).then((res) => {
    if (!res.error) return "saved";
    // A retry of an order that actually landed before the connection dropped
    // trips the unique order_no. That is a success, not something to retry.
    if (res.error.code === "23505") return "duplicate";

    // SQLSTATE class 22 is a data exception, and that is what the
    // lock_order_on_insert trigger raises with (errcode 22023) when an item id
    // is not on sale or the quantity is out of range. Re-sending the identical
    // row can never satisfy it, so flag it as permanent — otherwise every page
    // load burns another attempt on an order only the database can repair.
    if (String(res.error.code || "").startsWith("22")) {
      res.error.permanent = true;
    }
    throw res.error;
  });
}

/** Retry anything that failed to send earlier. */
function flushPendingOrders() {
  const sb = window.FrameySupabase;
  const client = sb && sb.get();
  if (!client) return;

  let queue;
  try {
    queue = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
  } catch (err) {
    return;
  }
  if (!Array.isArray(queue) || !queue.length) return;

  // Take ownership of the queue straight away, so an order placed while this
  // retry runs is queued separately instead of being wiped when we finish.
  localStorage.removeItem(PENDING_KEY);

  const attempts = queue.map((payload) =>
    insertOrder(client, payload)
      .then(() => null)                                  // saved (or already was)
      .catch(() => payload)                              // failed, keep it
  );

  // Wait for every attempt rather than guessing a timeout: a slow request must
  // never have its order silently dropped.
  Promise.all(attempts).then((results) => {
    const failed = results.filter(Boolean);
    if (!failed.length) return;
    try {
      const existing = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
      const merged = (Array.isArray(existing) ? existing : []).concat(failed);
      localStorage.setItem(PENDING_KEY, JSON.stringify(merged.slice(-50)));
    } catch (err) {
      console.warn("FRAMEY.PK: could not save the retry queue.", err);
    }
  });
}

/** Send one already-built order row. Resolves on success, rejects on failure.
 *  A rejection carrying `permanent: true` is one the database will refuse no
 *  matter how often it is retried, so the caller must not put it back in the
 *  queue — otherwise every page load burns a fresh order_no forever. */
function sendOrder(row) {
  const cfg = window.FRAMEY_CONFIG;
  if (!cfg || !cfg.sendOrdersToSupabase) return Promise.resolve();
  if (!row || !Array.isArray(row.items) || !row.items.length) {
    // Nothing usable to send. Dropping it quietly beats filling the retry
    // queue with a row the database will reject forever.
    const err = new Error("order has no items");
    err.permanent = true;
    return Promise.reject(err);
  }

  const sb = window.FrameySupabase;
  const client = sb && sb.get();
  if (!client) return Promise.reject(new Error("backend unavailable"));

  return insertOrder(client, row);
}

/** Never let a Supabase hiccup break checkout, and never lose the order. */
function deliverOrder(row) {
  let sending;
  try {
    sending = sendOrder(row);
  } catch (err) {
    console.warn("FRAMEY.PK: order was not sent.", err);
    return Promise.reject(err);
  }
  // Checkout now waits for the database before claiming success, so a request
  // that never comes back would otherwise leave the customer staring at a
  // disabled button forever. A stall is treated as a failure, which puts the
  // order in the retry queue below. If the late request does land, the next
  // boot recognises the order_no and drops it, so this cannot double-order.
  sending = withTimeout(sending, ORDER_SEND_TIMEOUT_MS, "the database did not answer in time");

  return sending.catch((err) => {
    if (err && err.permanent) {
      console.warn("FRAMEY.PK: order rejected as invalid, not queued for retry.", err);
      throw err;
    }
    console.warn("FRAMEY.PK: order not sent, queued for retry.", err);
    queueOrder(row);
    throw err;
  });
}

function buildOrderRow(f, orderNumber, total) {
  return {
    order_no: orderNumber,
    name: f.name,
    phone: f.phone,
    email: f.email || null,
    address: f.address,
    city: f.city,
    province: f.province,
    postal: f.postal || null,
    notes: f.notes || null,
    payment: "COD",
    items: cart.map((it) => {
      const p = products.find((x) => sameId(x.id, it.id)) || {};
      return {
        id: it.id,
        name: p.name || it.id,
        size: it.size,
        qty: it.qty,
        price: p.price || 0
      };
    }),
    subtotal: cartSubtotal(),
    delivery: DELIVERY_FLAT,
    total: total,
    status: "new"
  };
}

function init() {
  // Each step runs independently, so one unsupported feature can never
  // take the rest of the store down with it.
  const safe = (fn) => { try { fn(); } catch (err) { console.warn("FRAMEY.PK:", err); } };

  safe(loadCart);

  safe(renderCategories);
  safe(renderFeatured);
  safe(syncPriceSlider);
  safe(filterProducts);   // paints the shop grid, totals, chips and the cart
  safe(updateCart);

  safe(initNav);
  safe(initSearch);
  safe(initSmoothScroll);
  safe(initReveal);
  safe(initEvents);

  // Remote work last: the store is already usable, so a slow or failing
  // request never delays first paint.
  safe(flushPendingOrders);
  safe(syncFromSupabase);
}

/* Run init exactly once. Registering the listener AND calling init() whenever
   the document is not "loading" double-fires during readyState "interactive":
   the listener is still pending, so init runs again and every delegated event
   handler gets bound a second time — one click on "Add to cart" would then add
   two frames. */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
