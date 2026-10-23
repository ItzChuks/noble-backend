// Shared payment quote logic: the same checks the old "create payment" hook did, reusable by the Flutterwave routes.
// Throws BadRequestError / ForbiddenError (shown to the member) when the payment is not allowed.
const R = require(`${__hooks}/rules.js`), X = require(`${__hooks}/fees.js`);

function quote(app, uid, sid, amount) {
  X.requireShirt(app, uid);   // unregistered members (t-shirt fee unpaid) cannot make any payment
  let subRec;
  try { subRec = app.findRecordById("subscriptions", sid); } catch (_) { throw new BadRequestError("Subscription not found."); }
  if (subRec.getString("user") !== uid) throw new ForbiddenError("That is not your plan.");
  if (subRec.getString("status") !== "active") throw new BadRequestError("This plan is not active.");
  const planRec = app.findRecordById("plans", subRec.getString("plan"));

  const pays = app.findRecordsByFilter("payments", "subscription = {:s}", "", 0, 0, { s: sid }).map(r => ({
    subscription: sid, status: r.getString("status"), amount: r.getFloat("amount"),
    penalty: r.getFloat("penalty"), installments: r.getInt("installments"),
  }));
  const sub = { id: sid, created: subRec.getString("created") };
  const pl = { amount: planRec.getFloat("amount"), duration: planRec.getInt("duration"), frequency: planRec.getString("frequency") };

  const st = R.planState(sub, pl, pays);
  if (!st.left) throw new BadRequestError("This plan is already fully paid.");
  const q = R.quoteFor(st, amount);
  if (!q.ok) throw new BadRequestError("Wrong amount. The minimum right now is ₦" + q.min + ", and it must be a whole number of payments (late ones include their penalty).");
  return { q, planName: planRec.getString("name") };
}

module.exports = { quote };
