// A tiny stand-in for the Stripe API, for tests only: creates and returns Checkout Sessions (honouring idempotency
// keys) and lets a test mark one paid. The store's Stripe SDK talks to it through STRIPE_API_BASE (dev/test only).
// Webhooks are signed by the tests themselves with the real Stripe library (see client.js).
import http from "node:http";
import crypto from "node:crypto";

export function startFakeStripe(port) {
  const sessions = new Map();
  const byIdem = new Map();
  const refunds = []; // refund requests received
  let refundFails = false;
  const accounts = new Map(); // connected (payout) accounts
  const transfersByIdem = new Map();
  const transfers = []; // transfers received
  let balanceCents = 1_000_000; // the marketplace account's available balance
  let transferFails = false;
  const created = []; // every create call, so tests can check what the store asked Stripe to charge

  function parseForm(body) {
    const out = {};
    for (const [k, v] of new URLSearchParams(body)) {
      const path = k.replace(/\]/g, "").split("[");
      let o = out;
      path.forEach((p, i) => {
        if (i === path.length - 1) o[p] = v;
        else o = o[p] = o[p] || {};
      });
    }
    return out;
  }

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const send = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (!/^Bearer sk_test_/.test(req.headers.authorization || "")) return send(401, { error: { message: "bad key" } });
      if (req.method === "POST" && req.url === "/v1/checkout/sessions") {
        const idem = req.headers["idempotency-key"];
        if (idem && byIdem.has(idem)) return send(200, sessions.get(byIdem.get(idem)));
        const p = parseForm(body);
        // Stripe's real rule: a session may expire between 30 minutes and 24 hours after Stripe receives the request,
        // so a timestamp computed before the network call at exactly 30 minutes is refused (this once broke live checkout).
        const expiresIn = Number(p.expires_at) - Date.now() / 1000;
        if (p.expires_at !== undefined && (!(expiresIn >= 1800) || expiresIn > 86400)) {
          return send(400, { error: { type: "invalid_request_error", message: "The `expires_at` timestamp must be between 30 minutes and 24 hours from now." } });
        }
        const items = Object.values(p.line_items || {});
        // The live account uses Managed Payments: every line needs an eligible product tax code (this once broke live checkout).
        const untaxed = items.findIndex((i) => !/^txcd_\d+$/.test((i.price_data.product_data || {}).tax_code || ""));
        if (untaxed >= 0) return send(400, { error: { type: "invalid_request_error", message: `Invalid line_items[${untaxed}]: the product tax code is missing.` } });
        const amount = items.reduce((s, i) => s + Number(i.price_data.unit_amount) * Number(i.quantity), 0);
        const id = "cs_test_" + crypto.randomBytes(12).toString("hex");
        const s = {
          id, object: "checkout.session", url: `http://127.0.0.1:${port}/pay/${id}`, amount_subtotal: amount, amount_total: amount + Math.round(amount * 0.07), // 7% tax, as Managed Payments adds
          
          currency: items[0] ? items[0].price_data.currency : "usd", metadata: p.metadata || {}, client_reference_id: p.client_reference_id,
          customer_email: p.customer_email, payment_intent: null, payment_status: "unpaid", status: "open", livemode: false,
          success_url: p.success_url, cancel_url: p.cancel_url
        };
        sessions.set(id, s);
        if (idem) byIdem.set(idem, id);
        created.push({ session: s, form: p, key: req.headers.authorization });
        return send(200, s);
      }
      // Stripe Connect on the marketplace account: payout accounts, onboarding links and transfers.
      if (req.method === "POST" && req.url === "/v1/accounts") {
        const idem = req.headers["idempotency-key"];
        if (idem && byIdem.has(idem)) return send(200, accounts.get(byIdem.get(idem)));
        const p = parseForm(body);
        const id = "acct_" + crypto.randomBytes(8).toString("hex");
        const a = { id, object: "account", type: p.type, country: p.country, payouts_enabled: false, details_submitted: false, capabilities: { transfers: "inactive" },
          requirements: { currently_due: ["external_account", "individual.id_number"] }, form: p, key: req.headers.authorization };
        accounts.set(id, a);
        if (idem) byIdem.set(idem, id);
        return send(200, a);
      }
      if (req.method === "POST" && req.url === "/v1/account_links") {
        const p = parseForm(body);
        if (!accounts.has(p.account)) return send(404, { error: { type: "invalid_request_error", message: "No such account." } });
        return send(200, { object: "account_link", url: `http://127.0.0.1:${port}/onboard/${p.account}` });
      }
      const acct = req.url.match(/^\/v1\/accounts\/(acct_\w+)$/);
      if (req.method === "GET" && acct) return accounts.has(acct[1]) ? send(200, accounts.get(acct[1])) : send(404, { error: { type: "invalid_request_error", message: "No such account." } });
      if (req.method === "POST" && req.url === "/v1/transfers") {
        const idem = req.headers["idempotency-key"];
        if (idem && transfersByIdem.has(idem)) return send(200, transfersByIdem.get(idem));
        const p = parseForm(body);
        if (transferFails) return send(400, { error: { type: "invalid_request_error", message: "transfer refused" } });
        if (!accounts.has(p.destination)) return send(400, { error: { type: "invalid_request_error", message: "No such destination." } });
        if (Number(p.amount) > balanceCents) return send(400, { error: { type: "invalid_request_error", code: "balance_insufficient", message: "You have insufficient funds in your Stripe account for this transfer." } });
        balanceCents -= Number(p.amount);
        const t = { id: "tr_" + crypto.randomBytes(8).toString("hex"), object: "transfer", amount: Number(p.amount), currency: p.currency, destination: p.destination, transfer_group: p.transfer_group, key: req.headers.authorization };
        transfers.push(t);
        if (idem) transfersByIdem.set(idem, t);
        return send(200, t);
      }
      if (req.method === "POST" && req.url === "/v1/refunds") {
        const p = parseForm(body);
        refunds.push({ ...p, key: req.headers.authorization });
        if (refundFails) return send(402, { error: { type: "invalid_request_error", message: "refund refused" } });
        return send(200, { id: "re_" + crypto.randomBytes(8).toString("hex"), object: "refund", status: "succeeded", payment_intent: p.payment_intent });
      }
      const m = req.url.match(/^\/v1\/checkout\/sessions\/([\w]+)/);
      if (req.method === "GET" && m) return sessions.has(m[1]) ? send(200, sessions.get(m[1])) : send(404, { error: { message: "no such session" } });
      send(404, { error: { message: "not faked" } });
    });
  });

  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({
    url: `http://127.0.0.1:${port}`,
    sessions,
    created,
    refunds,
    accounts,
    transfers,
    // The connected account finished Stripe's onboarding, so payouts to it work.
    completeOnboarding(id) { Object.assign(accounts.get(id), { payouts_enabled: true, details_submitted: true, capabilities: { transfers: "active" }, requirements: { currently_due: [] } }); },
    setBalance(c) { balanceCents = c; },
    failTransfers(on) { transferFails = on; },
    failRefunds(on) { refundFails = on; },
    // Marks a session paid the way Stripe would, and returns it (for building the webhook event).
    pay(id) {
      const s = sessions.get(id);
      Object.assign(s, { payment_status: "paid", status: "complete", payment_intent: "pi_" + crypto.randomBytes(10).toString("hex") });
      return { ...s };
    },
    close: () => new Promise((r) => server.close(r))
  })));
}
