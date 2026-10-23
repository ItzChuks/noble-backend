// Flutterwave (v3) helpers. Secrets come from environment variables, never from the browser:
//   FLW_SECRET_KEY    your Flutterwave secret key (FLWSECK-...)
//   FLW_WEBHOOK_HASH  the "secret hash" you set in Flutterwave > Settings > Webhooks (any long random string)
//   FRONTEND_URL      where the site is hosted, e.g. https://noblesgroceries.com (no trailing slash)
const CURRENCY = "NGN";
const base = () => $os.getenv("FLW_BASE_URL") || "https://api.flutterwave.com/v3"; // override only for local testing

function cfg() {
  return {
    secret: $os.getenv("FLW_SECRET_KEY"),
    hash: $os.getenv("FLW_WEBHOOK_HASH"),
    front: ($os.getenv("FRONTEND_URL") || "").replace(/\/+$/, ""),
  };
}

function api(method, path, payload) {
  const c = cfg();
  if (!c.secret) throw new Error("FLW_SECRET_KEY is not set on the server.");
  const r = $http.send({
    url: base() + path, method, timeout: 30,
    headers: { Authorization: "Bearer " + c.secret, "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : "",
  });
  if (r.statusCode >= 500) throw new Error("Flutterwave is unavailable right now (" + r.statusCode + ").");
  return r.json || {};
}

// A tx_ref belongs either to a contribution payment ("payments") or to a fee ("fees": t-shirt, joining, clearance).
function lookup(app, ref) {
  for (const c of ["payments", "fees"]) {
    try { return { coll: c, rec: app.findFirstRecordByData(c, "tx_ref", ref) }; } catch (_) { /* not in this collection */ }
  }
  return null;
}

// Moves a payment out of "pending" exactly once (safe if the webhook and the browser return arrive together).
// verified = Flutterwave's verify response (or null). abandon = the checkout was cancelled / timed out, so anything not
// successful is rejected. Returns the payment's resulting status: confirmed | pending | rejected | unknown.
function settle(txRef, verified, abandon) {
  let out = "pending";
  $app.runInTransaction((tx) => {
    const hit = lookup(tx, txRef);
    if (!hit) { out = "unknown"; return; }
    const rec = hit.rec, st = rec.getString("status");
    // a payment we auto-rejected as abandoned can still be revived if Flutterwave later reports it paid
    const revivable = st === "rejected" && rec.getString("note").startsWith("AUTO:");
    out = st;
    if (st !== "pending" && !revivable) return;

    const d = verified && verified.status === "success" ? verified.data : null;
    if (d && d.status === "successful") {
      const ok = d.tx_ref === txRef && d.currency === CURRENCY && Number(d.amount) >= rec.getFloat("amount");
      if (ok) {
        rec.set("status", "confirmed");
        rec.set("flw_id", String(d.id));
        rec.set("note", "Flutterwave · " + txRef);
      } else {
        // money moved but doesn't match what we asked for: never auto-confirm, flag it for an admin
        rec.set("status", "pending");
        rec.set("note", "REVIEW: Flutterwave reports " + d.amount + " " + d.currency + ", expected " + rec.getFloat("amount") + " " + CURRENCY + " (id " + d.id + ")");
      }
      tx.save(rec);
      out = rec.getString("status");
      // a verified fee does its job in the same transaction: register the member, join the plan, or send the payout request
      if (hit.coll === "fees" && out === "confirmed") require(`${__hooks}/fees.js`).apply(tx, rec);
      return;
    }
    if (abandon && st === "pending") {
      rec.set("status", "rejected");
      rec.set("note", "AUTO: payment not completed");
      tx.save(rec);
      out = "rejected";
    }
  });
  return out;
}

// Asks Flutterwave directly what happened to this reference (never trusts the browser or the webhook body), then settles.
function verifyAndSettle(txRef, abandon) {
  const j = api("GET", "/transactions/verify_by_reference?tx_ref=" + encodeURIComponent(txRef));
  return settle(txRef, j, !!abandon);
}

module.exports = { cfg, api, lookup, settle, verifyAndSettle, CURRENCY };
