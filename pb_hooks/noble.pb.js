/// <reference path="../pb_data/types.d.ts" />
// Server-side enforcement for Noble's Groceries. The browser calculates penalties for display only;
// these hooks recompute everything, so editing the page (or calling the API directly) cannot dodge a penalty.

// New accounts are always plain members. (Only a superuser can create or promote an admin.)
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) e.record.set("role", "user");
  e.next();
}, "users");

// Joining a plan: only open plans, always starts "active".
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  let plan;
  try { plan = $app.findRecordById("plans", e.record.getString("plan")); } catch (_) { throw new BadRequestError("That plan does not exist."); }
  if (!plan.getBool("active")) throw new BadRequestError("That plan is not open for enrolment.");
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

// Payout requests: only for a fully saved plan, one open request at a time.
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const uid = e.auth.id, sid = e.record.getString("subscription");
  let subRec;
  try { subRec = $app.findRecordById("subscriptions", sid); } catch (_) { throw new BadRequestError("Subscription not found."); }
  if (subRec.getString("user") !== uid) throw new ForbiddenError("That is not your plan.");
  if (subRec.getString("status") === "cancelled") throw new BadRequestError("This plan was cancelled.");
  const plan = $app.findRecordById("plans", subRec.getString("plan"));

  const saved = $app.findRecordsByFilter("payments", "subscription = {:s} && status = 'confirmed'", "", 0, 0, { s: sid })
    .reduce((a, r) => a + r.getFloat("amount") - r.getFloat("penalty"), 0);
  if (saved < plan.getFloat("amount") * plan.getInt("duration")) throw new BadRequestError("This plan is not fully paid and confirmed yet.");
  const open = $app.findRecordsByFilter("payouts", "subscription = {:s} && status = 'pending'", "", 1, 0, { s: sid });
  if (open.length) throw new BadRequestError("You already have a payout request waiting.");
  e.record.set("user", uid);
  e.record.set("status", "pending");
  e.next();
}, "payouts");
