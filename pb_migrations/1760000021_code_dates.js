/// <reference path="../pb_data/types.d.ts" />
// Nobles Groceries: plan codes for GROCERY plans only, on dates the admin picks.
//   plans.code_open_day / code_close_day   "YYYY-MM-DD" (Lagos calendar): the day the plan's codes come out and their last day.
//                                          Left empty = the codes wait ("not open yet") until the admin sets the day.
//   subscriptions.code_custom              true when a code was given its own dates on a member's page (Reopen, Open now,
//                                          Edit plan, Add existing plans); changing the plan's dates then leaves that code alone.
// Existing data:
//   * every active grocery membership without a code gets one (waiting until the admin sets the plan's code days);
//   * codes on cash / foodie memberships (none are expected) are left as they are but those plans no longer issue new ones;
//   * grocery plans now follow the joining-day schedule (first payment on the joining day, then every 7 days / every day /
//     every month). So that nobody already saving is charged a late penalty because of this change, payments that fall due up
//     to this moment on existing grocery memberships are collected at the normal amount (no_penalty_before = now).
migrate((app) => {
  const plans = app.findCollectionByNameOrId("plans");
  if (!plans.fields.getByName("code_open_day")) plans.fields.add(new TextField({ name: "code_open_day" }));
  if (!plans.fields.getByName("code_close_day")) plans.fields.add(new TextField({ name: "code_close_day" }));
  app.save(plans);
  const subs = app.findCollectionByNameOrId("subscriptions");
  if (!subs.fields.getByName("code_custom")) subs.fields.add(new BoolField({ name: "code_custom" }));
  app.save(subs);

  const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const fresh = () => {
    for (let i = 0; i < 30; i++) {
      const c = "NG-" + $security.randomStringWithAlphabet(4, ABC) + "-" + $security.randomStringWithAlphabet(4, ABC);
      try { app.findFirstRecordByData("subscriptions", "code", c); } catch (_) { return c; }
    }
    throw new Error("Could not create a unique code.");
  };
  const now = new Date().toISOString().replace("T", " ");
  const grocery = {};
  app.findRecordsByFilter("plans", "category = 'grocery'", "", 0, 0).forEach(p => { grocery[p.id] = true; });
  app.findRecordsByFilter("subscriptions", "status = 'active'", "created", 0, 0).forEach(s => {
    if (!grocery[s.getString("plan")]) return;
    let dirty = false;
    if (!s.getString("code")) { s.set("code", fresh()); s.set("code_from", "2999-01-01 00:00:00.000Z"); s.set("code_until", "2999-12-31 00:00:00.000Z"); dirty = true; }
    if (!s.getString("no_penalty_before") && !s.getBool("imported")) { s.set("no_penalty_before", now); dirty = true; }
    s.set("next_collect", "");                                     // the collector works the new schedule out on its next run
    app.saveNoValidate(s);
  });
}, (app) => {
  const plans = app.findCollectionByNameOrId("plans");
  plans.fields.removeByName("code_open_day"); plans.fields.removeByName("code_close_day"); app.save(plans);
  const subs = app.findCollectionByNameOrId("subscriptions");
  subs.fields.removeByName("code_custom"); app.save(subs);
});
