// Fees and registration rules, enforced on the server.
//   shirt      ₦5,000  one time. Members can use the dashboard, join plans and pay contributions without it;
//                      it is only required when they request a payout ("unregistered" members cannot request payouts)
//   join       ₦3,000  paid every time a member joins a plan; the plan is joined automatically once the payment is verified
//   clearance  ₦3,000  paid with every payout request; the request is sent automatically once the payment is verified
// A payout request also needs ANOTHER plan of the same member to be actively running (see runningElsewhere).
// KEEP IN SYNC with FEES in the frontend app.js (that copy is for display only).
const FEES = { shirt: 5000, join: 3000, clearance: 3000 };
const R = require(`${__hooks}/rules.js`);
const SHIRT_MSG = "Please pay the one-time ₦5,000 t-shirt fee before you request a payout.";
const NEED_PLAN_MSG = "To request a payout you must have another plan actively running. Join a new plan first, then request this payout.";

const isRegistered = (app, uid) => app.findRecordById("users", uid).getBool("shirt_paid");

// True when the member has another plan (not the one being paid out) that is still running:
// status active and its saving period has not ended yet.
function runningElsewhere(app, uid, sid) {
  const now = new Date();
  return app.findRecordsByFilter("subscriptions", "user = {:u} && status = 'active' && id != {:s}", "", 0, 0, { u: uid, s: sid }).some(s => {
    try {
      const plan = app.findRecordById("plans", s.getString("plan"));
      return now < R.termEnd({ created: s.getString("created") }, { frequency: plan.getString("frequency"), duration: plan.getInt("duration") });
    } catch (_) { return false; }
  });
}

// Returns a member-facing reason why a payout cannot be requested right now, or "" when it can.
function payoutProblem(app, uid, sid) {
  let subRec;
  try { subRec = app.findRecordById("subscriptions", sid); } catch (_) { return "Subscription not found."; }
  if (subRec.getString("user") !== uid) return "That is not your plan.";
  if (subRec.getString("status") === "cancelled") return "This plan was cancelled.";
  const plan = app.findRecordById("plans", subRec.getString("plan"));

  const saved = app.findRecordsByFilter("payments", "subscription = {:s} && status = 'confirmed'", "", 0, 0, { s: sid })
    .reduce((a, r) => a + r.getFloat("amount") - r.getFloat("penalty"), 0);
  if (saved < plan.getFloat("amount") * plan.getInt("duration")) return "This plan is not fully paid and confirmed yet.";

  const end = R.termEnd({ created: subRec.getString("created") }, { frequency: plan.getString("frequency"), duration: plan.getInt("duration") });
  if (new Date() < end) return "Payouts open when your saving period ends, on " + end.toISOString().slice(0, 10) + ".";

  if (app.findRecordsByFilter("payouts", "subscription = {:s} && status = 'confirmed'", "", 1, 0, { s: sid }).length) return "This plan has already been paid out.";
  if (app.findRecordsByFilter("payouts", "subscription = {:s} && status = 'pending'", "", 1, 0, { s: sid }).length) return "You already have a payout request waiting.";

  if (!runningElsewhere(app, uid, sid)) return NEED_PLAN_MSG;   // another plan must be actively running
  if (!isRegistered(app, uid)) return SHIRT_MSG;                // the t-shirt fee is only needed for payouts
  return "";
}

// Validates a fee request and says what to charge. Throws a member-facing error when it is not allowed.
function prepare(app, user, type, body) {
  if (!FEES[type]) throw new BadRequestError("Unknown fee.");
  if (type === "shirt") {
    if (user.getBool("shirt_paid")) throw new BadRequestError("You have already paid the t-shirt fee.");
    return { amount: FEES.shirt, title: "T-shirt registration fee" };
  }

  if (type === "join") {
    let plan;
    try { plan = app.findRecordById("plans", String(body.plan || "")); } catch (_) { throw new BadRequestError("That plan does not exist."); }
    if (!plan.getBool("active")) throw new BadRequestError("That plan is not open for enrolment.");
    return { amount: FEES.join, plan: plan.id, title: "Joining fee · " + plan.getString("name") };
  }

  const sid = String(body.subscription || ""), details = String(body.details || "").trim();
  const why = payoutProblem(app, user.id, sid);
  if (why) throw new BadRequestError(why);
  if (!details) throw new BadRequestError("Enter your delivery or bank details.");
  return { amount: FEES.clearance, subscription: sid, details, title: "Payout clearance fee" };
}

// Runs once, inside the settle transaction, when a fee payment has been verified as paid.
function apply(app, rec) {
  const type = rec.getString("type"), uid = rec.getString("user");
  const flag = msg => { rec.set("note", "REVIEW: " + msg); app.save(rec); };

  if (type === "shirt") {
    const u = app.findRecordById("users", uid);
    if (!u.getBool("shirt_paid")) {
      u.set("shirt_paid", true);
      u.set("shirt_paid_at", new Date().toISOString().replace("T", " "));
      app.save(u);
    }
    return;
  }
  if (type === "join") {
    if (rec.getString("subscription")) return;
    let plan;
    try { plan = app.findRecordById("plans", rec.getString("plan")); } catch (_) { return flag("the plan no longer exists, so it could not be joined"); }
    if (!plan.getBool("active")) return flag("the plan is no longer open, so it could not be joined");
    const sub = new Record(app.findCollectionByNameOrId("subscriptions"));
    sub.set("user", uid); sub.set("plan", plan.id); sub.set("status", "active");
    app.save(sub);
    rec.set("subscription", sub.id);
    app.save(rec);
    return;
  }
  if (type === "clearance") {
    const sid = rec.getString("subscription"), why = payoutProblem(app, uid, sid);
    if (why) return flag("payout request not sent: " + why);
    const po = new Record(app.findCollectionByNameOrId("payouts"));
    po.set("user", uid); po.set("subscription", sid); po.set("note", rec.getString("details")); po.set("status", "pending");
    app.save(po);
  }
}

module.exports = { FEES, SHIRT_MSG, NEED_PLAN_MSG, payoutProblem, runningElsewhere, prepare, apply };
