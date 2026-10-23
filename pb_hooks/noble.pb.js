/// <reference path="../pb_data/types.d.ts" />
// Server-side enforcement for Nobles Groceries. The browser calculates penalties for display only;
// these hooks recompute everything, so editing the page (or calling the API directly) cannot dodge a penalty.

// New accounts are always plain members, unregistered (t-shirt fee unpaid), and must accept the Terms and Conditions.
// (Only a superuser can create or promote an admin.)
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    if (!e.record.getBool("terms_accepted")) throw new BadRequestError("You must accept the Terms and Conditions to create an account.");
    e.record.set("role", "user");
    e.record.set("shirt_paid", false);
    e.record.set("terms_accepted_at", new Date().toISOString().replace("T", " "));
  }
  e.next();
}, "users");

// Joining a plan: only open plans, always starts "active".
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  let plan;
  try { plan = $app.findRecordById("plans", e.record.getString("plan")); } catch (_) { throw new BadRequestError("That plan does not exist."); }
  if (!plan.getBool("active")) throw new BadRequestError("That plan is not open for enrolment.");
  require(`${__hooks}/fees.js`).requireShirt($app, e.auth.id);
  e.record.set("status", "active");
  e.next();
}, "subscriptions");

// Payments: recompute amount, penalty, instalments and lateness from the clock and the user's history.
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const R = require(`${__hooks}/rules.js`);
  const uid = e.auth.id, sid = e.record.getString("subscription");

  let subRec, planRec;
  try { subRec = $app.findRecordById("subscriptions", sid); } catch (_) { throw new BadRequestError("Subscription not found."); }
  if (subRec.getString("user") !== uid) throw new ForbiddenError("That is not your plan.");
  if (subRec.getString("status") !== "active") throw new BadRequestError("This plan is not active.");
  planRec = $app.findRecordById("plans", subRec.getString("plan"));

  const pays = $app.findRecordsByFilter("payments", "subscription = {:s}", "", 0, 0, { s: sid }).map(r => ({
    subscription: sid, status: r.getString("status"), amount: r.getFloat("amount"),
    penalty: r.getFloat("penalty"), installments: r.getInt("installments"),
  }));
  const sub = { id: sid, created: subRec.getString("created") };
  const pl = { amount: planRec.getFloat("amount"), duration: planRec.getInt("duration"), frequency: planRec.getString("frequency") };

  const st = R.planState(sub, pl, pays), amount = e.record.getFloat("amount");
  if (!st.left) throw new BadRequestError("This plan is already fully paid.");
  const q = R.quoteFor(st, amount);
  if (!q.ok) throw new BadRequestError("Wrong amount. The minimum right now is ₦" + q.min + ", and it must be a whole number of payments (late ones include their penalty).");

  e.record.set("user", uid);
  e.record.set("status", "pending");
  e.record.set("penalty", q.penalty);
  e.record.set("installments", q.n);
  e.record.set("late_count", q.late);
  e.next();
}, "payments");

// Payout requests are created by the server once the 3000 clearance fee is verified (see fees.js). This guard is a safety net:
// the collection rule already blocks direct member requests, and the same checks apply to anything that gets through.
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const X = require(`${__hooks}/fees.js`), uid = e.auth.id;
  X.requireShirt($app, uid);
  const why = X.payoutProblem($app, uid, e.record.getString("subscription"));
  if (why) throw new BadRequestError(why);
  e.record.set("user", uid);
  e.record.set("status", "pending");
  e.next();
}, "payouts");
