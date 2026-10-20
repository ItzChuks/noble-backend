/// <reference path="../pb_data/types.d.ts" />
// Flutterwave routes. NOTE: PocketBase handlers are isolated, so shared code is loaded with require() inside each handler.

// 1) Member clicks "Pay": validate the amount with the plan rules, record a pending payment, get a Flutterwave checkout link.
routerAdd("POST", "/api/noble/pay/init", (e) => {
  const F = require(`${__hooks}/flutterwave.js`), P = require(`${__hooks}/payments.js`);
  const c = F.cfg();
  if (!c.front) throw new Error("FRONTEND_URL is not set on the server.");

  const body = e.requestInfo().body || {};
  const uid = e.auth.id, sid = String(body.subscription || ""), amount = Number(body.amount);

  // a member who starts a new payment abandons their earlier unfinished ones for this plan (unless those were actually paid)
  $app.findRecordsByFilter("payments", "subscription = {:s} && user = {:u} && status = 'pending' && tx_ref != ''", "", 0, 0, { s: sid, u: uid })
    .forEach(r => { if (!r.getString("note").startsWith("REVIEW")) F.verifyAndSettle(r.getString("tx_ref"), true); });

  const { q, planName } = P.quote($app, uid, sid, amount);
  const txRef = "NOBLE-" + $security.randomStringWithAlphabet(14, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");

  const rec = new Record($app.findCollectionByNameOrId("payments"));
  rec.set("user", uid);
  rec.set("subscription", sid);
  rec.set("amount", amount); // quote() already proved this is a whole number of instalments incl. penalties
  rec.set("status", "pending");
  rec.set("penalty", q.penalty);
  rec.set("installments", q.n);
  rec.set("late_count", q.late);
  rec.set("tx_ref", txRef);
  rec.set("note", "Flutterwave · " + txRef);
  $app.save(rec);

  const u = e.auth;
  const customer = { email: u.getString("email"), name: u.getString("name") || u.getString("email") };
  if (u.getString("phone")) customer.phonenumber = u.getString("phone");

  let j;
  try {
    j = F.api("POST", "/payments", {
      tx_ref: txRef, amount: rec.getFloat("amount"), currency: F.CURRENCY,
      redirect_url: c.front + "/dashboard.html",
      customer,
      customizations: { title: "Noble's Groceries", description: planName + " payment" },
      meta: { payment_id: rec.id, user: uid },
    });
  } catch (err) { $app.delete(rec); throw err; }

  if (j.status !== "success" || !j.data || !j.data.link) {
    $app.delete(rec);
    throw new BadRequestError("Could not start the payment: " + (j.message || "unknown error from Flutterwave"));
  }
  return e.json(200, { link: j.data.link, tx_ref: txRef });
}, $apis.requireAuth());

// 2) Webhook: Flutterwave calls this when a charge completes. This is what confirms payments automatically.
//    The body is never trusted: we check the signature, then ask Flutterwave to verify the transaction itself.
routerAdd("POST", "/api/noble/flw-webhook", (e) => {
  const F = require(`${__hooks}/flutterwave.js`);
  const c = F.cfg();
  const sig = e.request.header.get("verif-hash") || "";
  if (!c.hash || !$security.equal(sig, c.hash)) return e.json(401, { message: "Invalid signature" });

  const body = e.requestInfo().body || {};
  const txRef = body.data && body.data.tx_ref;
  if (body.event === "charge.completed" && typeof txRef === "string" && txRef.startsWith("NOBLE-")) {
    F.verifyAndSettle(txRef, false); // throws on a Flutterwave outage -> 500 -> Flutterwave retries the webhook later
  }
  return e.json(200, { ok: true });
});

// 3) Browser comes back from Flutterwave: verify right away so the member sees the result without waiting for the webhook.
routerAdd("POST", "/api/noble/pay/verify", (e) => {
  const F = require(`${__hooks}/flutterwave.js`);
  const body = e.requestInfo().body || {};
  const txRef = String(body.tx_ref || "");
  let rec;
  try { rec = $app.findFirstRecordByData("payments", "tx_ref", txRef); } catch (_) { throw new BadRequestError("Payment not found."); }
  if (rec.getString("user") !== e.auth.id) throw new ForbiddenError("That is not your payment.");
  const status = F.verifyAndSettle(txRef, body.cancelled === true || body.cancelled === "true");
  return e.json(200, { status });
}, $apis.requireAuth());

// 4) Safety net every 5 minutes: settle payments whose webhook never arrived, and reject checkouts abandoned for 30+ minutes.
cronAdd("noble_flw_sweep", "*/5 * * * *", () => {
  const F = require(`${__hooks}/flutterwave.js`);
  if (!F.cfg().secret) return;
  const stale = new Date(Date.now() - 30 * 60000).toISOString().replace("T", " ");
  $app.findRecordsByFilter("payments", "status = 'pending' && tx_ref != '' && created < {:t}", "created", 100, 0, { t: stale }).forEach(r => {
    if (r.getString("note").startsWith("REVIEW")) return;
    try { F.verifyAndSettle(r.getString("tx_ref"), true); } catch (err) { console.log("noble sweep:", r.getString("tx_ref"), String(err)); }
  });
});
