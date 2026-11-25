/// <reference path="../pb_data/types.d.ts" />
// 1) Joining-day schedule: plans.payout_after_days = how many days after joining a payout can be requested (e.g. 30 for a 4-week plan).
//    Existing GROCERY plans get a default (weekly: weeks x 7.5 days, 4 weeks -> 30; daily: days x 1.07; monthly: months x 30.5);
//    edit them in Admin > Plans. Cash and Foodie plans keep their fixed season (1 January to 30 November) and do not use it.
// 2) Several payment providers: users.gateway (the member's provider) and deposits.gateway (the provider used for that deposit).
migrate((app) => {
  const plans = app.findCollectionByNameOrId("plans");
  if (!plans.fields.getByName("payout_after_days")) plans.fields.add(new NumberField({ name: "payout_after_days", min: 0 }));
  app.save(plans);
  app.findRecordsByFilter("plans", "category = 'grocery' && (payout_after_days = 0 || payout_after_days = null)", "", 0, 0).forEach(p => {
    const f = p.getString("frequency"), n = p.getInt("duration");
    const d = f === "monthly" ? Math.round(n * 30.5) : f === "daily" ? Math.round(n * 7.5 / 7) : Math.round((p.getInt("weeks") || n) * 7.5);
    if (d > 0) { p.set("payout_after_days", d); app.saveNoValidate(p); }
  });

  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("gateway")) users.fields.add(new TextField({ name: "gateway" }));
  app.save(users);

  const dep = app.findCollectionByNameOrId("deposits");
  if (!dep.fields.getByName("gateway")) dep.fields.add(new TextField({ name: "gateway" }));
  dep.indexes = (dep.indexes || []).filter(s => !/idx_dep_gateway/.test(s)).concat(["CREATE INDEX idx_dep_gateway ON deposits (gateway, status)"]);
  app.save(dep);
  app.findRecordsByFilter("deposits", "gateway = ''", "", 0, 0).forEach(d => { d.set("gateway", "flutterwave"); app.saveNoValidate(d); });
}, (app) => {
  const plans = app.findCollectionByNameOrId("plans"); plans.fields.removeByName("payout_after_days"); app.save(plans);
  const users = app.findCollectionByNameOrId("users"); users.fields.removeByName("gateway"); app.save(users);
  const dep = app.findCollectionByNameOrId("deposits"); dep.fields.removeByName("gateway"); dep.indexes = (dep.indexes || []).filter(s => !/idx_dep_gateway/.test(s)); app.save(dep);
});
