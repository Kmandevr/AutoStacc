// Cart page: prices this browser's cart through the store API (never trusting local prices), shows problems per line,
// sale prices and a promo code's discount (the code is kept for this tab only and checked by the store), takes a guest
// email when nobody is signed in, and starts checkout (one request per click, safe to retry). While creator sales are
// closed, creators' products stay in the cart marked as held and checkout sends only the rest.
// Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, cents, api, cart, track } = window.GS;
  const root = $("#cart-app");
  if (!root) return;
  const sound = (name, el) => document.dispatchEvent(new CustomEvent("gs:sound", { detail: { name, el } }));
  const params = new URLSearchParams(location.search);
  let priced = null, account = null, busy = false;

  // Announcements ("Removed ...") go to one polite live region; the cart itself re-renders silently.
  const live = document.createElement("p");
  live.className = "sr-only";
  live.setAttribute("role", "status");
  root.before(live);
  const say = (text) => { live.textContent = ""; setTimeout(() => (live.textContent = text), 50); };

  // After a re-render, put keyboard focus back where the person was working.
  function refocus(hint) {
    if (!hint) return;
    const target = hint.qty ? $(`[data-qty="${CSS.escape(hint.qty)}"]`, root)
      : root.querySelectorAll("[data-remove]")[hint.index] || root.querySelectorAll("[data-remove]")[hint.index - 1] || $("#checkout-btn", root) || $(".btn", root);
    if (target) target.focus();
  }

  const PROBLEMS = {
    not_found: "This piece isn't in the store anymore.",
    unavailable: "Not for sale right now.",
    owned: "Already in Your Stacc.",
    free: "It's free: claim it on its page instead.",
    quantity: "Too many of these in one order.",
    currency_mismatch: "Mixed currencies can't share one checkout."
  };

  // Why a creator's product can't be checked out yet (the store decides; server/payments/creator-sales.js).
  const HELD = {
    no_key: "Creator checkout isn't open yet: AutoStacc is finishing its payment setup for creators. It stays in your cart.",
    paused: "Creator checkout is paused for now. It stays in your cart."
  };
  const heldIds = () => new Set(((priced && priced.held) || []).map((h) => h.productId));

  const PROMO_PROBLEMS = {
    invalid: "That code doesn't exist.",
    ended: "That code has ended.",
    used_up: "That code has been used up.",
    already_used: "You've already used that code.",
    not_applicable: "That code doesn't cover anything in your cart."
  };
  const promo = {
    get: () => { try { return sessionStorage.getItem("gs:promo") || ""; } catch { return ""; } },
    set: (v) => { try { if (v) sessionStorage.setItem("gs:promo", v); else sessionStorage.removeItem("gs:promo"); } catch {} }
  };

  // A checkout key per cart and code: a second click, a refresh mid-request or the back button reuses the same order;
  // a different cart or code is a different order.
  const signature = (items) => items.map((i) => `${i.productId}x${i.quantity}`).sort().join(",") + `|${promo.get()}`;
  function checkoutKey(items) {
    try {
      const saved = JSON.parse(sessionStorage.getItem("gs:checkout") || "{}");
      if (saved.sig === signature(items) && saved.key) return saved.key;
      const key = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
      sessionStorage.setItem("gs:checkout", JSON.stringify({ sig: signature(items), key }));
      return key;
    } catch {
      return null;
    }
  }
  const forgetKey = () => { try { sessionStorage.removeItem("gs:checkout"); } catch {} };

  const notice = () => params.get("cancelled")
    ? `<p class="msg">Checkout cancelled. Nothing was charged, and your cart is still here.</p>` : "";

  function empty() {
    root.innerHTML = `${notice()}<div class="panel appear"><h2>Your cart is empty</h2><p>Add something from the store and it will show up here.</p>
      <div class="actions"><a class="btn" href="/shop">Browse the store</a><a class="btn ghost" href="/library">Your Stacc</a></div></div>`;
  }

  // During a sale: the catalog price struck through, then the sale price and the sale's name.
  function linePrice(l) {
    const now = escapeHTML(cents(l.lineTotalCents, l.currency));
    if (!l.sale || l.listPriceCents <= l.unitPriceCents) return now;
    return `<s class="price-was">${escapeHTML(cents(l.listPriceCents * l.quantity, l.currency))}</s> ${now} <span class="price-sale">${escapeHTML(l.sale.name)}</span>`;
  }

  // The code box, or the applied code with a way to take it off.
  function promoBox(c) {
    if (c.promoCode) return `<p class="cart-promo">Code <strong>${escapeHTML(c.promoCode)}</strong> applied${c.promotion && c.promotion.name ? ` (${escapeHTML(c.promotion.name)})` : ""}. <button class="link-btn" type="button" data-promo-remove>remove</button></p>`;
    return `<form class="cart-promo" data-promo><label for="promo-code">Promo code</label>
      <input id="promo-code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="32" value="${escapeHTML(promo.get())}">
      <button class="btn ghost" type="submit">Apply</button>
      ${c.promoProblem ? `<span class="cart-problem" role="alert">${escapeHTML(PROMO_PROBLEMS[c.promoProblem] || "That code can't be used.")}</span>` : ""}</form>`;
  }

  function line(l) {
    const qty = l.maxQuantity > 1
      ? `<label class="sr-only" for="q-${escapeHTML(l.productId)}">Quantity</label>
         <select id="q-${escapeHTML(l.productId)}" data-qty="${escapeHTML(l.productId)}">${Array.from({ length: l.maxQuantity }, (_, i) => `<option${i + 1 === l.quantity ? " selected" : ""}>${i + 1}</option>`).join("")}</select>`
      : "";
    return `<li class="cart-line${l.problem ? " has-problem" : ""}">
      <div class="cart-what">
        ${l.title ? `<a href="${escapeHTML(l.path || `/shop/${l.productId}`)}">${escapeHTML(l.title)}</a>` : `<span>${escapeHTML(l.productId)}</span>`}
        ${l.problem ? `<span class="cart-problem">${escapeHTML(PROBLEMS[l.problem] || "Can't be bought right now.")}</span>` : ""}
        ${l.held ? `<span class="cart-held">${escapeHTML(HELD[l.held] || HELD.paused)}</span>` : ""}
      </div>
      <div class="cart-qty">${qty}</div>
      <div class="cart-price">${l.title ? linePrice(l) : ""}</div>
      <button class="link-btn" type="button" data-remove="${escapeHTML(l.productId)}" aria-label="Remove ${escapeHTML(l.title || l.productId)}">remove</button>
    </li>`;
  }

  function render(message = "") {
    const c = priced;
    // A code that can't be used blocks checkout too: paying without the discount someone expected is worse.
    const held = (c.held || []).length;
    const blocked = c.problems.length > 0 || Boolean(c.promoProblem) || held === c.lines.length;
    const who = account && account.user
      ? `<p class="small-print">Checking out as <strong>${escapeHTML(account.user.email)}</strong>. Your files will be in Your Stacc.</p>`
      : `<div class="field"><label for="cart-email">Email for your receipt and files</label>
           <input id="cart-email" type="email" autocomplete="email" inputmode="email" required value="${escapeHTML(sessionValue("gs:email"))}">
           <span class="hint">No account needed. <a href="/login?next=/cart">Log in</a> instead, or create an account with this email later to keep your files.</span></div>`;
    root.innerHTML = `${notice()}${message}
      <ul class="cart-lines">${c.lines.map(line).join("")}</ul>
      <div class="cart-summary panel">
        <dl class="cart-totals"><dt>Subtotal</dt><dd>${cents(c.subtotalCents, c.currency)}</dd>${c.discountCents ? `<dt>Discount (${escapeHTML(c.promoCode)})</dt><dd>−${cents(c.discountCents, c.currency)}</dd>` : ""}<dt>Total</dt><dd class="price">${cents(c.totalCents, c.currency)}</dd></dl>
        ${promoBox(c)}
        ${c.problems.length ? `<p class="msg error">Remove the lines marked above to check out.</p>` : c.promoProblem ? `<p class="msg error">Change or clear the promo code to check out.</p>` : ""}
        ${held && !c.problems.length ? `<p class="msg" role="status">${held === c.lines.length ? "Creators' products can't be checked out yet. They stay in your cart." : "Checkout covers the other items; creators' products stay in your cart for later."}</p>` : ""}
        ${who}
        <div class="actions">
          <button class="btn" type="button" id="checkout-btn"${blocked ? " disabled" : ""}>Checkout</button>
          <a class="btn ghost" href="/shop">Keep browsing</a>
        </div>
        <p class="small-print">Payment happens on Stripe. Prices above come from the store, not from this page. By checking out you agree to the <a href="/terms">terms</a>, the <a href="/refunds">refund policy</a> and each product's <a href="/license">licence</a>.</p>
      </div>`;
  }

  function sessionValue(k) { try { return sessionStorage.getItem(k) || ""; } catch { return ""; } }

  async function load(hint) {
    const items = cart.items();
    if (!items.length) { empty(); return refocus(hint); }
    const [res, acct] = await Promise.all([api("/api/cart/price", { method: "POST", body: { items, promoCode: promo.get() } }), api("/api/account")]);
    account = acct.ok ? acct.data : null;
    if (!res.ok) {
      root.innerHTML = `${notice()}<p class="msg error">${escapeHTML(res.status === 503 ? "The store is offline for maintenance. Your cart is safe in this browser." : res.error.message)}</p>
        <div class="actions"><button class="btn" type="button" data-retry>Try again</button></div>`;
      return;
    }
    priced = res.data.cart;
    render();
    refocus(hint);
  }

  // AutoStacc's own items and creators' items are paid to different Stripe accounts, so they are paid in two steps.
  function splitPanel(groups) {
    const lines = (priced && priced.lines) || [];
    const part = (ids) => {
      const mine = lines.filter((l) => ids.includes(l.productId));
      const total = mine.reduce((s, l) => s + (l.lineTotalCents ?? l.unitPriceCents * l.quantity), 0);
      return { count: mine.length || ids.length, total, names: mine.map((l) => l.title) };
    };
    const group = (account, label) => {
      const g = part(groups[account] || []);
      return `<li><strong>${label}</strong> (${g.count}): ${escapeHTML(g.names.join(", "))}
        <button class="btn" type="button" data-pay-account="${account}"${groups[account] && groups[account].length ? "" : " disabled"}>Pay ${cents(g.total, "USD")}</button></li>`;
    };
    return `<div class="msg" role="status"><p>Your cart has AutoStacc items and items from creators. They're paid separately, one after the other. Pay for one group now; the other stays in your cart.</p>
      <ul class="split-groups">${group("main", "AutoStacc")}${group("marketplace", "Creators")}</ul></div>`;
  }

  async function checkout(btn, account = null) {
    if (busy) return;
    const hold = heldIds();
    const items = cart.items().filter((i) => !hold.has(i.productId));
    const emailInput = $("#cart-email");
    if (emailInput && !emailInput.checkValidity()) {
      emailInput.setAttribute("aria-invalid", "true");
      emailInput.reportValidity();
      return;
    }
    busy = true;
    btn.disabled = true;
    btn.classList.add("busy");
    btn.textContent = "Opening checkout";
    // One account per payment: a key per account, so the second step isn't mistaken for the first.
    const key = checkoutKey(items) && (account ? `${checkoutKey(items)}-${account}` : checkoutKey(items));
    const body = { items, promoCode: promo.get(), ...(account && { account }), ...(emailInput && { email: emailInput.value.trim() }) };
    if (emailInput) try { sessionStorage.setItem("gs:email", body.email); } catch {}
    const res = await api("/api/checkout", { method: "POST", body, headers: key ? { "Idempotency-Key": key } : {}, timeout: 30000 });
    if (res.ok && res.data.url) {
      track("checkout_start");
      location.href = res.data.url;
      return; // keep the button busy while the browser leaves
    }
    busy = false;
    sound("error");
    const err = res.error;
    if (err.code === "checkout_finished") { forgetKey(); return load(); }
    if (err.code === "split_checkout" && err.groups) return render(splitPanel(err.groups));
    if ((err.code === "cart_changed" || err.code === "promo_invalid" || err.code === "creator_sales_closed") && err.cart) { priced = err.cart; return render(`<p class="msg error">${escapeHTML(err.message)}</p>`); }
    const text = res.status === 0 ? "We couldn't reach the store before checkout opened. Nothing was charged; please try again."
      : res.status === 401 || res.status === 403 ? `${escapeHTML(err.message)} <a href="/login?next=/cart">Log in</a>` : escapeHTML(err.message);
    render(`<p class="msg error">${text}</p>`);
  }

  root.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove]");
    if (rm) {
      const index = [...root.querySelectorAll("[data-remove]")].indexOf(rm);
      cart.remove(rm.dataset.remove);
      sound("blip", rm);
      say(`Removed ${rm.getAttribute("aria-label").replace(/^Remove /, "")}.`);
      return load({ index });
    }
    if (e.target.closest("[data-retry]")) return load();
    if (e.target.closest("[data-promo-remove]")) { promo.set(""); return load(); }
    const btn = e.target.closest("#checkout-btn");
    if (btn && !btn.disabled) checkout(btn);
    const pay = e.target.closest("[data-pay-account]");
    if (pay && !pay.disabled) checkout(pay, pay.dataset.payAccount);
  });
  root.addEventListener("submit", (e) => {
    if (!e.target.matches("[data-promo]")) return;
    e.preventDefault();
    promo.set($("#promo-code", root).value.trim().toUpperCase());
    load();
  });
  root.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-qty]");
    if (sel) { cart.setQuantity(sel.dataset.qty, Number(sel.value)); load({ qty: sel.dataset.qty }); }
  });
  // Coming back with the back button (from Stripe or anywhere): unlock the button and re-price.
  // A field stops being marked invalid as soon as it's edited.
  root.addEventListener("input", (e) => e.target.removeAttribute("aria-invalid"));
  addEventListener("pageshow", (e) => { if (e.persisted) { busy = false; load(); } });
  addEventListener("storage", (e) => e.key === "gs:cart" && load());

  load();
})();
