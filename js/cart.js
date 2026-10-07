// Cart page: prices this browser's cart through the store API (never trusting local prices), shows problems per line,
// takes a guest email when nobody is signed in, and starts checkout (one request per click, safe to retry).
// Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML, cents, api, cart, track } = window.GS;
  const root = $("#cart-app");
  if (!root) return;
  const sound = (name, el) => document.dispatchEvent(new CustomEvent("gs:sound", { detail: { name, el } }));
  const params = new URLSearchParams(location.search);
  let priced = null, account = null, busy = false;

  const PROBLEMS = {
    not_found: "This piece isn't in the store anymore.",
    unavailable: "Not for sale right now.",
    owned: "Already in your library.",
    free: "It's free: claim it on its page instead.",
    quantity: "Too many of these in one order.",
    currency_mismatch: "Mixed currencies can't share one checkout."
  };

  // A checkout key per cart: a second click, a refresh mid-request or the back button reuses the same order.
  const signature = (items) => items.map((i) => `${i.productId}x${i.quantity}`).sort().join(",");
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
    root.innerHTML = `${notice()}<div class="panel appear"><h2>Empty</h2><p>Nothing stitched in here yet.</p>
      <div class="actions"><a class="btn" href="/shop">Browse the shop</a><a class="btn ghost" href="/library">My library</a></div></div>`;
  }

  function line(l) {
    const qty = l.maxQuantity > 1
      ? `<label class="sr-only" for="q-${escapeHTML(l.productId)}">Quantity</label>
         <select id="q-${escapeHTML(l.productId)}" data-qty="${escapeHTML(l.productId)}">${Array.from({ length: l.maxQuantity }, (_, i) => `<option${i + 1 === l.quantity ? " selected" : ""}>${i + 1}</option>`).join("")}</select>`
      : "";
    return `<li class="cart-line${l.problem ? " has-problem" : ""}">
      <div class="cart-what">
        ${l.title ? `<a href="/shop/${escapeHTML(l.productId)}">${escapeHTML(l.title)}</a>` : `<span>${escapeHTML(l.productId)}</span>`}
        ${l.problem ? `<span class="cart-problem">${escapeHTML(PROBLEMS[l.problem] || "Can't be bought right now.")}</span>` : ""}
      </div>
      <div class="cart-qty">${qty}</div>
      <div class="cart-price">${l.title ? cents(l.lineTotalCents, l.currency) : ""}</div>
      <button class="link-btn" type="button" data-remove="${escapeHTML(l.productId)}" aria-label="Remove ${escapeHTML(l.title || l.productId)}">remove</button>
    </li>`;
  }

  function render(message = "") {
    const c = priced;
    const blocked = c.problems.length > 0;
    const who = account && account.user
      ? `<p class="small-print">Checking out as <strong>${escapeHTML(account.user.email)}</strong>. Your files land in your library.</p>`
      : `<div class="field"><label for="cart-email">Email for your receipt and files</label>
           <input id="cart-email" type="email" autocomplete="email" inputmode="email" required value="${escapeHTML(sessionValue("gs:email"))}">
           <span class="hint">No account needed. <a href="/login?next=/cart">Log in</a> instead, or create an account with this email later to keep your files.</span></div>`;
    root.innerHTML = `${notice()}${message}
      <ul class="cart-lines">${c.lines.map(line).join("")}</ul>
      <div class="cart-summary panel">
        <dl class="cart-totals"><dt>Subtotal</dt><dd>${cents(c.subtotalCents, c.currency)}</dd><dt>Total</dt><dd class="price">${cents(c.totalCents, c.currency)}</dd></dl>
        ${blocked ? `<p class="msg error">Remove the lines marked above to check out.</p>` : ""}
        ${who}
        <div class="actions">
          <button class="btn" type="button" id="checkout-btn"${blocked ? " disabled" : ""}>Checkout</button>
          <a class="btn ghost" href="/shop">Keep browsing</a>
        </div>
        <p class="small-print">Payment happens on Stripe. Prices above come from the store, not from this page.</p>
      </div>`;
  }

  function sessionValue(k) { try { return sessionStorage.getItem(k) || ""; } catch { return ""; } }

  async function load() {
    const items = cart.items();
    if (!items.length) return empty();
    const [res, acct] = await Promise.all([api("/api/cart/price", { method: "POST", body: { items } }), api("/api/account")]);
    account = acct.ok ? acct.data : null;
    if (!res.ok) {
      root.innerHTML = `${notice()}<p class="msg error">${escapeHTML(res.status === 503 ? "The store is offline for maintenance. Your cart is safe in this browser." : res.error.message)}</p>
        <div class="actions"><button class="btn" type="button" data-retry>Try again</button></div>`;
      return;
    }
    priced = res.data.cart;
    render();
  }

  async function checkout(btn) {
    if (busy) return;
    const items = cart.items();
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
    const key = checkoutKey(items);
    const body = { items, ...(emailInput && { email: emailInput.value.trim() }) };
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
    if (err.code === "cart_changed" && err.cart) { priced = err.cart; return render(`<p class="msg error">${escapeHTML(err.message)}</p>`); }
    const text = res.status === 0 ? "Signal lost before checkout opened. Nothing was charged; try again."
      : res.status === 401 || res.status === 403 ? `${escapeHTML(err.message)} <a href="/login?next=/cart">Log in</a>` : escapeHTML(err.message);
    render(`<p class="msg error">${text}</p>`);
  }

  root.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove]");
    if (rm) { cart.remove(rm.dataset.remove); sound("blip", rm); return load(); }
    if (e.target.closest("[data-retry]")) return load();
    const btn = e.target.closest("#checkout-btn");
    if (btn && !btn.disabled) checkout(btn);
  });
  root.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-qty]");
    if (sel) { cart.setQuantity(sel.dataset.qty, Number(sel.value)); load(); }
  });
  // Coming back with the back button (from Stripe or anywhere): unlock the button and re-price.
  addEventListener("pageshow", (e) => { if (e.persisted) { busy = false; load(); } });
  addEventListener("storage", (e) => e.key === "gs:cart" && load());

  load();
})();
