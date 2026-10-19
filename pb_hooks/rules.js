// Server-side copy of the payment rules in app.js (RULES, firstDue, dueAt, planState, quoteFor).
// KEEP IN SYNC with app.js: if you change RULES there, change it here too.
const RULES = { cutoffHour: 12, lateMultiplier: 2, weeklyDay: 5, monthlyGraceDay: 2 };
const LAGOS = 1;
const toL = d => new Date(d.getTime() + LAGOS * 36e5);
const fromL = (y, m, d, h = 0, mi = 0, s = 0) => new Date(Date.UTC(y, m, d, h, mi, s) - LAGOS * 36e5);
const parseTs = s => { if (s instanceof Date) return s; const t = String(s).trim().replace(' ', 'T'); return new Date(/(Z|[+-]\d\d:?\d\d)$/.test(t) ? t : t + 'Z'); };

function firstDue(freq, joined) {
  const L = toL(joined), y = L.getUTCFullYear(), m = L.getUTCMonth(), d = L.getUTCDate();
  if (freq === 'daily') { const t = fromL(y, m, d, RULES.cutoffHour); return joined < t ? t : fromL(y, m, d + 1, RULES.cutoffHour); }
  if (freq === 'weekly') { const add = (RULES.weeklyDay - L.getUTCDay() + 7) % 7; let t = fromL(y, m, d + add, RULES.cutoffHour); if (joined >= t) t = fromL(y, m, d + add + 7, RULES.cutoffHour); return t; }
  return fromL(y, m + 1, RULES.monthlyGraceDay, 23, 59, 59);
}
function dueAt(freq, first, i) {
  const L = toL(first), y = L.getUTCFullYear(), m = L.getUTCMonth(), d = L.getUTCDate();
  if (freq === 'daily') return fromL(y, m, d + i, RULES.cutoffHour);
  if (freq === 'weekly') return fromL(y, m, d + 7 * i, RULES.cutoffHour);
  return fromL(y, m + i, RULES.monthlyGraceDay, 23, 59, 59);
}
const instOf = (p, pl) => p.installments || Math.max(1, Math.round(((p.amount || 0) - (p.penalty || 0)) / (pl.amount || 1)));

function planState(sub, pl, pays, now = new Date()) {
  const A = pl.amount, pen = A * (RULES.lateMultiplier - 1);
  const paid = pays.filter(p => p.subscription === sub.id && p.status !== 'rejected').reduce((a, p) => a + instOf(p, pl), 0);
  const left = Math.max(0, pl.duration - paid), first = firstDue(pl.frequency, parseTs(sub.created)), due = i => dueAt(pl.frequency, first, i);
  let overdue = 0; while (overdue < left && due(paid + overdue) <= now) overdue++;
  return { A, pen, paid, left, duration: pl.duration, due, overdue, next: left ? due(paid) : null, cost: k => A + (k < overdue ? pen : 0) };
}
function quoteFor(st, amount) {
  const cum = [0];
  for (let k = 0; k < st.left && cum[k] < amount; k++) cum.push(cum[k] + st.cost(k));
  const n = cum.indexOf(amount), c = Math.max(n, 0), late = Math.min(c, st.overdue);
  return { ok: n > 0, n: c, late, penalty: late * st.pen, base: c * st.A, min: st.cost(0) };
}

// when a plan's saving period ends = the deadline of its last instalment (payouts open after this moment)
const termEnd = (sub, pl) => dueAt(pl.frequency, firstDue(pl.frequency, parseTs(sub.created)), pl.duration - 1);

module.exports = { RULES, parseTs, planState, quoteFor, termEnd };
