// ===== CONFIG =====
const PB_URL = 'https://noble-backend-production-16f3.up.railway.app';
const USE_MOCK = false; // false = real PocketBase (default). true = offline demo using localStorage + mock.js.
const pb = USE_MOCK ? createMockPB() : new PocketBase(PB_URL);
pb.autoCancellation?.(false);
const SUPPORT_PHONE = '08037795455';                      // customer-support number (also used on invoices)
// Fees (naira). Display only: the amounts that are actually charged are set on the server (pb_hooks/fees.js, keep them in sync).
const FEES = { shirt: 5000, join: 3000, clearance: 3000 };
const SUPPORT_WHATSAPP = '234' + SUPPORT_PHONE.slice(1);  // same number in international form for WhatsApp // the pages fire several identical requests in parallel; don't let the SDK cancel them

document.head.insertAdjacentHTML('beforeend', '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>body{font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}</style>');

// ===== helpers =====
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const naira = n => '₦' + Number(n || 0).toLocaleString();
const date = d => d ? new Date(d.replace(' ', 'T')).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700';
const btn = 'inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 transition';
const btn2 = 'inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition';
const refresh = () => dispatchEvent(new Event('hashchange'));
const FEE_LABEL = { shirt: 'T-shirt registration', join: 'Joining fee', clearance: 'Payout clearance fee' };
const FQ = { daily: 'day', weekly: 'week', monthly: 'month' };
// A plan's saving period is set in months; the number of payments follows from the frequency (daily ~30.4/month, weekly ~4.35/month, monthly 1/month)
const paymentsFor = (months, f) => f === 'daily' ? Math.round(months * 365 / 12) : f === 'weekly' ? Math.round(months * 52.14 / 12) : months;
const monthsOf = p => p.months > 0 ? p.months : Math.max(1, Math.round(p.duration * (p.frequency === 'daily' ? 12 / 365 : p.frequency === 'weekly' ? 12 / 52.14 : 1)));
const monthsLabel = p => { const m = monthsOf(p); return m + ' month' + (m === 1 ? '' : 's'); };
const ic = d => `<svg class="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z';
const waIcon = (cls = 'w-[18px] h-[18px]') => `<svg class="${cls} shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${WA_PATH}"/></svg>`;
const waLink = () => {
  const u = pb.authStore.record;
  const t = "Hello Nobles Groceries support, I need some help." + (u ? '\nName: ' + (u.name || '') + '\nEmail: ' + (u.email || '') : '');
  return 'https://wa.me/' + SUPPORT_WHATSAPP + '?text=' + encodeURIComponent(t);
};
const IC = { overview: 'M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-3H4z', plans: 'M4 6h16M4 12h16M4 18h10', mine: 'M4 20V10M10 20V4M16 20v-7M22 20H2', payments: 'M3 6h18v12H3zM3 10h18', fees: 'M3 6h18v12H3zM3 10h18', payouts: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14', profile: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', users: 'M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 20v-1a4 4 0 00-3-3.9', subs: 'M9 12l2 2 4-4M5 4h14v16H5z', out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h9', menu: 'M4 6h16M4 12h16M4 18h16', moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z', sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4', rules: 'M9 12h6M9 16h6M7 3h8l4 4v14H7zM15 3v4h4', search: 'M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z' };

// ===== theme (light / dark) =====
const THEME_KEY = 'noble_theme';
const getTheme = () => { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } };
const applyTheme = t => { document.documentElement.classList.toggle('dark', t === 'dark'); };
applyTheme(getTheme() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
window.toggleTheme = () => {
  const t = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  applyTheme(t);
  const b = $('#tg'); if (b) b.innerHTML = ic(t === 'dark' ? IC.sun : IC.moon);
};
document.head.insertAdjacentHTML('beforeend', `<style>
html.dark{color-scheme:dark}
html.dark *{border-color:#24332d}
.dark body.bg-slate-50{background-color:#0a110f;color:#e2ebe7}
.dark .bg-white{background-color:#111c18}
.dark .bg-slate-50{background-color:#0e1814}
.dark .bg-slate-100{background-color:#1a2722}
.dark .bg-slate-900{background-color:#1c2b25}
.dark .bg-slate-50\\/95{background-color:rgba(10,17,15,.95)}
.dark .bg-white\\/90{background-color:rgba(17,28,24,.9)}
.dark .hover\\:bg-slate-50:hover,.dark .hover\\:bg-slate-100:hover,.dark .hover\\:bg-slate-50\\/60:hover{background-color:#1a2722}
.dark .text-slate-900{color:#f1f6f4}
.dark .text-slate-800{color:#e2ebe7}
.dark .text-slate-700{color:#cdd9d4}
.dark .text-slate-600{color:#b4c2bc}
.dark .text-slate-500{color:#8fa19a}
.dark .text-slate-400,.dark input::placeholder{color:#6d7f78}
.dark .text-emerald-800{color:#34d399}
.dark .text-amber-800{color:#fbbf24}
.dark .text-red-700,.dark .text-red-600{color:#f87171}
.dark .text-blue-700{color:#60a5fa}
.dark .bg-emerald-50{background-color:rgba(16,185,129,.14)}
.dark .bg-amber-50{background-color:rgba(245,158,11,.14)}
.dark .bg-red-50{background-color:rgba(239,68,68,.14)}
.dark .bg-blue-50{background-color:rgba(59,130,246,.14)}
.dark .ring-emerald-200{--tw-ring-color:rgba(52,211,153,.3)}
.dark .ring-amber-200{--tw-ring-color:rgba(251,191,36,.3)}
.dark .ring-red-200{--tw-ring-color:rgba(248,113,113,.3)}
.dark .ring-blue-200{--tw-ring-color:rgba(96,165,250,.3)}
.dark .ring-slate-200{--tw-ring-color:#2c3f37}
.dark select option{background-color:#111c18;color:#e2ebe7}
</style>`);

// ===== payment rules (all deadlines use Lagos time, WAT = UTC+1, no daylight saving) =====
// lateMultiplier 2 = a late instalment costs double (e.g. ₦100 becomes ₦200).
const RULES = { cutoffHour: 12, lateMultiplier: 2, weeklyDay: 5 /* Friday */, monthlyGraceDay: 2 };
const LAGOS = 1;
const toL = d => new Date(d.getTime() + LAGOS * 36e5);                       // read Lagos wall-clock with getUTC*()
const fromL = (y, m, d, h = 0, mi = 0, s = 0) => new Date(Date.UTC(y, m, d, h, mi, s) - LAGOS * 36e5);
const parseTs = s => { if (s instanceof Date) return s; const t = String(s).trim().replace(' ', 'T'); return new Date(/(Z|[+-]\d\d:?\d\d)$/.test(t) ? t : t + 'Z'); };
const unit = (n, f) => FQ[f] + (n === 1 ? '' : 's');
const plural = (n, f) => n + ' ' + unit(n, f);
const fmtDue = (f, d) => !d ? 'Fully paid' : d.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + (f === 'monthly' ? ' (end of day)' : ', ' + RULES.cutoffHour + ':00 noon');

// deadline of the very first instalment, from the moment the user joined
function firstDue(freq, joined) {
  const L = toL(joined), y = L.getUTCFullYear(), m = L.getUTCMonth(), d = L.getUTCDate();
  if (freq === 'daily') { const t = fromL(y, m, d, RULES.cutoffHour); return joined < t ? t : fromL(y, m, d + 1, RULES.cutoffHour); }
  if (freq === 'weekly') { const add = (RULES.weeklyDay - L.getUTCDay() + 7) % 7; let t = fromL(y, m, d + add, RULES.cutoffHour); if (joined >= t) t = fromL(y, m, d + add + 7, RULES.cutoffHour); return t; }
  return fromL(y, m + 1, RULES.monthlyGraceDay, 23, 59, 59);               // monthly: 2nd of next month
}
// deadline of instalment number i (0-based)
function dueAt(freq, first, i) {
  const L = toL(first), y = L.getUTCFullYear(), m = L.getUTCMonth(), d = L.getUTCDate();
  if (freq === 'daily') return fromL(y, m, d + i, RULES.cutoffHour);
  if (freq === 'weekly') return fromL(y, m, d + 7 * i, RULES.cutoffHour);
  return fromL(y, m + i, RULES.monthlyGraceDay, 23, 59, 59);
}
// when the saving period ends = deadline of the last instalment; payouts open after this moment
const termEnd = (sub, pl) => dueAt(pl.frequency, firstDue(pl.frequency, parseTs(sub.created)), pl.duration - 1);
const fmtDay = d => d.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' });
// how many instalments a payment record covers (older records without the field are estimated)
const instOf = (p, pl) => p.installments || Math.max(1, Math.round(((p.amount || 0) - (p.penalty || 0)) / (pl.amount || 1)));

// where a subscription stands right now: instalments covered, overdue count, next deadline, cost of each next instalment
function planState(sub, pl, pays, now = new Date()) {
  const A = pl.amount, pen = A * (RULES.lateMultiplier - 1);
  const paid = pays.filter(p => p.subscription === sub.id && p.status !== 'rejected').reduce((a, p) => a + instOf(p, pl), 0);
  const left = Math.max(0, pl.duration - paid), first = firstDue(pl.frequency, parseTs(sub.created)), due = i => dueAt(pl.frequency, first, i);
  let overdue = 0; while (overdue < left && due(paid + overdue) <= now) overdue++;
  return { A, pen, paid, left, duration: pl.duration, due, overdue, next: left ? due(paid) : null, cost: k => A + (k < overdue ? pen : 0) };
}
// validate a typed amount: it must be a whole number of instalments, late ones including their penalty
function quoteFor(st, amount) {
  const cum = [0];
  for (let k = 0; k < st.left && cum[k] < amount; k++) cum.push(cum[k] + st.cost(k));
  const n = cum.indexOf(amount), c = Math.max(n, 0), late = Math.min(c, st.overdue);
  return { ok: n > 0, n: c, cum, total: amount, base: c * st.A, late, penalty: late * st.pen,
    max: st.left * st.A + Math.min(st.overdue, st.left) * st.pen,
    next: n > 0 && st.paid + n < st.duration ? st.due(st.paid + n) : null,
    lower: [...cum].reverse().find(v => v > 0 && v < amount), higher: cum.find(v => v > amount) };
}
// ===== end payment rules =====

const penBadge = p => p.penalty > 0 ? `<span class="inline-flex px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset bg-amber-50 text-amber-800 ring-amber-200">Late · +${naira(p.penalty)}</span>` : '<span class="text-slate-400">—</span>';
const covers = p => { const pl = p.expand?.subscription?.expand?.plan || {}; return pl.frequency ? plural(instOf(p, pl), pl.frequency) : '—'; };
// The fees and registration rules, shown on the landing page, sign-up page, rules pages and the terms page.
const feeRulesHTML = () => {
  const c = (t, d) => `<div class="bg-white border rounded-xl p-5"><h3 class="font-semibold text-slate-900 text-sm">${t}</h3><p class="text-sm text-slate-600 mt-1.5 leading-relaxed">${d}</p></div>`;
  return '<div class="grid md:grid-cols-2 gap-4 max-w-4xl">'
    + c(`T-shirt registration · ${naira(FEES.shirt)}`, `A compulsory <b>one-time</b> payment for your Nobles Groceries t-shirt. Until it is paid you are an <b>unregistered</b> member and cannot join a plan, make a payment or request a payout. Once it is confirmed you become a <b>registered</b> member.`)
    + c(`Joining fee · ${naira(FEES.join)}`, `Before you can join any plan you pay a ${naira(FEES.join)} joining fee. It is paid each time you join a plan, separately from your contributions, and you join the plan as soon as the payment is confirmed.`)
    + c(`Payout clearance fee · ${naira(FEES.clearance)}`, `Every payout request carries a ${naira(FEES.clearance)} clearance fee. Your request is sent to the admin as soon as the fee is confirmed.`)
    + c('Plan length', `Each plan shows its exact number of payments (for example 12 or 13 weeks, or 50 or 52 weeks). You pay for exactly the number of payments shown on the plan you join.`)
    + '</div>';
};
const termsHTML = () => {
  const m = RULES.lateMultiplier, S = (n, t, body) => `<section class="bg-white border rounded-xl p-5 sm:p-6"><h2 class="font-semibold text-slate-900">${n}. ${t}</h2><div class="text-sm text-slate-600 mt-2 leading-relaxed space-y-2">${body}</div></section>`;
  return '<div class="space-y-4">'
    + S(1, 'About these terms', `<p>Nobles Groceries is a budget and isusu savings platform where members contribute daily, weekly or monthly towards a cash or goods payout. By creating an account you confirm that you have read, understood and accepted these Terms and Conditions, including every fee listed below.</p>`)
    + S(2, 'Registration and the t-shirt fee', `<p>Every member must make a compulsory one-time payment of <b>${naira(FEES.shirt)}</b> for the Nobles Groceries t-shirt.</p><p>Until this payment is confirmed your account is <b>unregistered</b>: you cannot join a plan, make a contribution or request a payout. When the payment is confirmed your account becomes <b>registered</b>. The fee is paid once only.</p>`)
    + S(3, 'Joining fee', `<p>Before you can join any plan you must pay a joining fee of <b>${naira(FEES.join)}</b>. It is paid each time you join a plan. It is separate from your contributions and you join the plan once the payment is confirmed.</p>`)
    + S(4, 'Plans', `<p>We offer three kinds of plan: <b>Cash</b>, <b>Groceries</b> and <b>Foodie</b>. Every plan shows its contribution amount, how often you pay, its saving period, the number of payments and the payout. The number of payments can differ between plans (for example 12 or 13 weeks, or 50 or 52 weeks) and you pay for exactly the number of payments shown on the plan you join.</p>`)
    + S(5, 'Contributions, deadlines and late penalties', `<p>All deadlines use Lagos time (WAT). Daily plans are due before <b>${RULES.cutoffHour}:00 noon</b> each day. Weekly plans are due by <b>Friday ${RULES.cutoffHour}:00 noon</b>. Monthly plans are due by the <b>${RULES.monthlyGraceDay}nd day of the following month</b>.</p><p>A late payment costs double (for example ${naira(100)} becomes ${naira(100 * m)}). The extra amount is a penalty: it does not count towards your savings or payout. You may pay several instalments in advance.</p>`)
    + S(6, 'Payouts and the clearance fee', `<p>You can request a payout only when your plan is fully paid and its saving period has ended. Every payout request carries a clearance fee of <b>${naira(FEES.clearance)}</b>. Your request is sent as soon as the clearance fee is confirmed.</p>`)
    + S(7, 'Payments', `<p>Payments are made securely through Flutterwave and are confirmed automatically once they go through. You can see every payment, fee and payout on your dashboard.</p>`)
    + S(8, 'Questions', `<p>For any question about these terms, contact customer support on <b>${SUPPORT_PHONE}</b>.</p>`)
    + '</div>';
};
const rulesHTML = () => {
  const m = RULES.lateMultiplier, c = (t, d) => `<div class="bg-white border rounded-xl p-5"><h3 class="font-semibold text-slate-900 text-sm">${t}</h3><p class="text-sm text-slate-600 mt-1.5 leading-relaxed">${d}</p></div>`;
  return '<h2 class="text-sm font-semibold text-slate-900 mb-3">Fees and registration</h2>' + feeRulesHTML() + '<h2 class="text-sm font-semibold text-slate-900 mt-8 mb-3">Payments and deadlines</h2><div class="grid md:grid-cols-2 gap-4 max-w-4xl">'
    + c('Daily plans', `Pay before <b>${RULES.cutoffHour}:00 noon</b> each day. After noon the payment is doubled: ${naira(100)} becomes ${naira(100 * m)}.`)
    + c('Weekly plans', `Pay any time from Monday up to <b>Friday ${RULES.cutoffHour}:00 noon</b>. After that the week's payment is doubled.`)
    + c('Monthly plans', `Each month's payment is due by the <b>${RULES.monthlyGraceDay}nd day of the following month</b>. After that it is doubled.`)
    + c('Late penalty', `The payment form will not accept a late payment without its penalty. If several payments were missed, each one carries its own penalty. A penalty is a fee: it does not count towards your savings or payout.`)
    + c('Paying ahead', `You can pay more than one instalment at once. On a ${naira(100)} daily plan, paying ${naira(500)} covers 5 days. The form shows how many it covers and when your next payment is due. The amount must be a whole number of instalments.`)
    + c('Your first payment', `Daily: today before noon if you join before noon, otherwise tomorrow before noon. Weekly: the coming Friday noon (or the one after, if it has passed). Monthly: the 2nd of next month.`)
    + c('Admin visibility', `Every payment that includes a penalty is flagged to the admin, with the penalty amount shown.`)
    + c('Time and confirmation', `All deadlines use Lagos time (WAT), whatever your device clock says. Payments are made through Flutterwave and are confirmed automatically as soon as the payment goes through.`) + '</div>';
};

// Pays a fee through Flutterwave: the server decides the amount, we just say which fee (see pb_hooks/flutterwave.pb.js).
// body: { type: 'shirt' } | { type: 'join', plan } | { type: 'clearance', subscription, details }
async function payFee(body) {
  const r = await pb.send('/api/noble/fee/init', { method: 'POST', body });
  if (r.link) { toast('Taking you to Flutterwave…'); location.href = r.link; await new Promise(() => { }); }   // stay put until the browser leaves
  return r;
}

function toast(m, err, ms = 3000) {
  const t = document.createElement('div');
  t.className = 'fixed bottom-24 right-4 sm:bottom-6 sm:right-24 z-[60] px-4 py-2.5 rounded-lg text-sm text-white shadow-lg ' + (err ? 'bg-red-700' : 'bg-slate-900');
  t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}
function guard(role) {
  if (!pb.authStore.isValid) { location.href = 'auth.html'; return false; }
  if (role === 'admin' && pb.authStore.record.role !== 'admin') { location.href = 'dashboard.html'; return false; }
  // re-check with the server: picks up role changes and deleted accounts, and renews the token
  pb.collection('users').authRefresh().then(() => {
    if (role === 'admin' && pb.authStore.record.role !== 'admin') location.href = 'dashboard.html';
  }).catch(e => { if ([401, 403, 404].includes(e.status)) { pb.authStore.clear(); location.href = 'auth.html'; } });
  return true;
}
function logout() { pb.authStore.clear(); location.href = 'index.html'; }

const badge = s => `<span class="inline-flex px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset ${({ active: 'bg-emerald-50 text-emerald-800 ring-emerald-200', confirmed: 'bg-emerald-50 text-emerald-800 ring-emerald-200', pending: 'bg-amber-50 text-amber-800 ring-amber-200', rejected: 'bg-red-50 text-red-700 ring-red-200', cancelled: 'bg-slate-50 text-slate-600 ring-slate-200', completed: 'bg-blue-50 text-blue-700 ring-blue-200' })[s] || 'bg-slate-50 text-slate-600 ring-slate-200'}">${cap(s)}</span>`;
const head = (t, sub, action = '') => `<div class="flex flex-wrap items-end justify-between gap-3 mb-6"><div><h1 class="text-xl font-semibold text-slate-900">${t}</h1><p class="text-sm text-slate-500 mt-0.5">${sub || ''}</p></div><div class="flex gap-2">${action}</div></div>`;
const stat = (l, v, s = '') => `<div class="bg-white border rounded-xl p-4 sm:p-5 min-w-0"><p class="text-[11px] sm:text-xs font-medium uppercase tracking-wide text-slate-500">${l}</p><p class="text-xl sm:text-2xl font-semibold text-slate-900 mt-1.5 sm:mt-2 break-words">${v}</p>${s ? `<p class="text-xs text-slate-500 mt-1">${s}</p>` : ''}</div>`;
const table = (heads, rows) => {
  if (!rows.length) return `<div class="bg-white border border-dashed rounded-xl p-10 text-center text-slate-500 text-sm">Nothing here yet.</div>`;
  const desk = `<div class="hidden md:block bg-white border rounded-xl overflow-x-auto"><table class="w-full text-sm text-left"><thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>${heads.map(h => h === 'SEL' ? '<th class="pl-4 pr-0 py-3 w-8"></th>' : `<th class="px-4 py-3 font-medium whitespace-nowrap">${h}</th>`).join('')}</tr></thead><tbody class="divide-y">${rows.map(r => `<tr class="hover:bg-slate-50/60">${r.map(c => `<td class="px-4 py-3 whitespace-nowrap">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const cards = `<div class="md:hidden space-y-3">${rows.map(r => {
    const si = heads.indexOf('SEL');
    const body = r.map((c, i) => heads[i] && i !== si && c !== '' ? `<div class="flex items-start justify-between gap-4 py-1.5 text-sm"><dt class="text-slate-500 shrink-0">${heads[i]}</dt><dd class="text-right min-w-0 break-words text-slate-800">${c}</dd></div>` : '').join('');
    const acts = r.filter((c, i) => !heads[i] && c !== '').join('');
    return `<div class="bg-white border rounded-xl p-4">${si >= 0 ? `<div class="flex items-center justify-between pb-2 mb-1 border-b text-xs font-medium text-slate-500"><span>Select</span>${r[si]}</div>` : ''}<dl class="divide-y">${body}</dl>${acts ? `<div class="flex flex-wrap gap-2 pt-3 mt-2 border-t">${acts}</div>` : ''}</div>`;
  }).join('')}</div>`;
  return desk + cards;
};
const fld = (label, name, val = '', type = 'text', extra = '') => `<label class="block text-sm"><span class="text-slate-600">${label}</span><input name="${name}" type="${type}" value="${esc(val)}" ${extra} class="${inp} mt-1"></label>`;
const sel = (label, name, opts, val) => `<label class="block text-sm"><span class="text-slate-600">${label}</span><select name="${name}" class="${inp} mt-1">${opts.map(o => `<option ${o == val ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;

function modal(title, body, onSubmit, cta = 'Save') {
  const d = document.createElement('div');
  d.className = 'fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4'; d.setAttribute('data-ui', 'modal');
  d.innerHTML = `<form class="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-3 max-h-[90dvh] overflow-y-auto"><h3 class="font-semibold text-slate-900">${title}</h3>${body}<div class="flex justify-end gap-2 pt-2"><button type="button" class="c ${btn2}">Cancel</button><button class="${btn}">${cta}</button></div></form>`;
  document.body.appendChild(d);
  $('.c', d).onclick = () => d.remove();
  $('form', d).onsubmit = async e => {
    e.preventDefault();
    try { await onSubmit(Object.fromEntries(new FormData(e.target))); d.remove(); refresh(); }
    catch (x) { toast(x.message, 1); }
  };
}

// Styled replacement for the browser's confirm(). Resolves true when confirmed, false when cancelled (button, Esc or click outside).
function confirmBox({ title, message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false, items = [] }) {
  return new Promise(res => {
    const d = document.createElement('div');
    d.setAttribute('data-ui', 'confirm'); d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true');
    d.className = 'fixed inset-0 z-[70] bg-slate-900/50 flex items-center justify-center p-4 opacity-0 transition-opacity duration-150';
    const list = items.length ? `<ul class="mt-4 text-sm text-slate-700 bg-slate-50 border rounded-lg divide-y max-h-36 overflow-y-auto">${items.slice(0, 6).map(x => `<li class="px-3 py-1.5 truncate">${esc(x)}</li>`).join('')}${items.length > 6 ? `<li class="px-3 py-1.5 text-slate-500">and ${items.length - 6} more…</li>` : ''}</ul>` : '';
    d.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 scale-95 transition-transform duration-150"><div class="flex items-start gap-4"><div class="w-10 h-10 rounded-full grid place-items-center shrink-0 ${danger ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-800'}">${ic(danger ? 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5' : 'M12 8v5M12 16h.01M12 3a9 9 0 100 18 9 9 0 000-18z')}</div><div class="min-w-0"><h3 class="font-semibold text-slate-900">${esc(title)}</h3><p class="text-sm text-slate-500 mt-1 leading-relaxed">${esc(message)}</p></div></div>${list}<div class="flex justify-end gap-2 mt-6"><button type="button" data-no class="${btn2}">${esc(cancelText)}</button><button type="button" data-yes class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-white transition ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-800 hover:bg-emerald-900'}">${esc(confirmText)}</button></div></div>`;
    const done = v => { removeEventListener('keydown', key, true); d.classList.add('opacity-0'); setTimeout(() => d.remove(), 150); res(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    addEventListener('keydown', key, true);
    d.onclick = e => { if (e.target === d) done(false); };
    $('[data-no]', d).onclick = () => done(false); $('[data-yes]', d).onclick = () => done(true);
    document.body.appendChild(d);
    requestAnimationFrame(() => { d.classList.remove('opacity-0'); d.firstElementChild.classList.remove('scale-95'); });
    $('[data-no]', d).focus();
  });
}

// ===== plan explorer: search, filters, sort, detail drawer with previous/next =====
const PS = { q: '', cat: 'all', freq: 'all', bud: 'all', sort: 'amount-asc' };
const BUD = { all: ['Any budget', () => true], a: ['Up to ₦500', p => p.amount <= 500], b: ['₦501 – ₦2,000', p => p.amount > 500 && p.amount <= 2000], c: ['Above ₦2,000', p => p.amount > 2000] };
const SORT = { 'amount-asc': ['Amount: low to high', (a, b) => a.amount - b.amount], 'amount-desc': ['Amount: high to low', (a, b) => b.amount - a.amount], 'payout-desc': ['Payout: high to low', (a, b) => b.payout - a.payout], name: ['Name: A to Z', (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })] };
const matchQ = (p, q) => [p.name, p.description, p.category, p.frequency, p.amount].join(' ').toLowerCase().includes(q.toLowerCase());
const filterPlans = l => l.filter(p => (PS.cat === 'all' || p.category === PS.cat) && (PS.freq === 'all' || p.frequency === PS.freq) && BUD[PS.bud][1](p) && (!PS.q.trim() || matchQ(p, PS.q.trim()))).sort(SORT[PS.sort][1]);
const opts = (o, v) => Object.entries(o).map(([k, x]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${Array.isArray(x) ? x[0] : x}</option>`).join('');

const planCard = (p, i, quick = '') => `<div onclick="openPlan(${i})" class="cursor-pointer bg-white border rounded-xl p-5 flex flex-col hover:border-emerald-700 hover:shadow-sm transition">
  <div class="flex items-center justify-between"><span class="text-xs font-medium uppercase tracking-wide text-slate-500">${p.category} · ${p.frequency}</span>${p.active === false ? badge('cancelled').replace('Cancelled', 'Hidden') : ''}</div>
  <h3 class="font-semibold text-slate-900 mt-2">${esc(p.name)}</h3>
  <p class="mt-3 text-2xl font-semibold text-slate-900">${naira(p.amount)}<span class="text-sm font-normal text-slate-500"> / ${FQ[p.frequency]}</span></p>
  <dl class="mt-3 text-sm space-y-1"><div class="flex justify-between"><dt class="text-slate-500">Duration</dt><dd class="text-right">${monthsLabel(p)} · ${p.duration} payments</dd></div><div class="flex justify-between"><dt class="text-slate-500">Total payout</dt><dd class="font-medium">${naira(p.payout)}</dd></div></dl>
  ${p.description ? `<p class="mt-3 text-xs text-slate-500 line-clamp-2">${esc(p.description)}</p>` : ''}
  <div class="mt-auto pt-4 flex gap-2" onclick="event.stopPropagation()">${quick}</div></div>`;

function explorer(m, all, o = {}) {
  const n = k => all.filter(p => p.category === k).length;
  m.innerHTML = `<div class="md:sticky md:top-16 md:z-10 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3 mb-5 bg-slate-50/95 backdrop-blur border-b space-y-3">
    <div class="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
      <div class="relative col-span-2 sm:flex-1 sm:min-w-[220px]"><span class="absolute left-3 top-2.5 text-slate-400">${ic(IC.search)}</span><input id="pq" value="${esc(PS.q)}" placeholder="Search by name, amount or item…" class="${inp} pl-10"></div>
      <select id="pf" class="${inp} sm:!w-auto">${opts({ all: 'All frequencies', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }, PS.freq)}</select>
      <select id="pb" class="${inp} sm:!w-auto">${opts(BUD, PS.bud)}</select>
      <select id="ps" class="${inp} col-span-2 sm:col-auto sm:!w-auto">${opts(SORT, PS.sort)}</select></div>
    <div class="flex items-center justify-between gap-3"><div id="pt" class="flex gap-1.5 overflow-x-auto min-w-0">${[['all', 'All plans', all.length], ['grocery', 'Grocery', n('grocery')], ['cash', 'Cash savings', n('cash')], ['foodie', 'Foodie', n('foodie')]].map(c => `<button data-c="${c[0]}" class="whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium border">${c[1]} <span class="opacity-60">${c[2]}</span></button>`).join('')}</div>
    <p class="text-sm text-slate-500 whitespace-nowrap"><span id="pc"></span> <button id="px" class="ml-2 text-emerald-800 font-medium hover:underline">Clear</button></p></div></div><div id="pr"></div>`;
  const paint = () => {
    const l = window._pl = filterPlans(all);
    document.querySelectorAll('#pt button').forEach(b => { const on = b.dataset.c === PS.cat; b.className = 'whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium border ' + (on ? 'bg-emerald-800 text-white border-emerald-800' : 'bg-white text-slate-600 hover:bg-slate-100'); });
    $('#pc').textContent = `Showing ${l.length} of ${all.length}`;
    $('#px').classList.toggle('hidden', !PS.q && PS.cat === 'all' && PS.freq === 'all' && PS.bud === 'all');
    $('#pr').innerHTML = !l.length ? '<div class="bg-white border border-dashed rounded-xl p-12 text-center text-sm text-slate-500">No plans match your search. Try clearing a filter.</div>'
      : o.cols ? table(o.cols.heads, l.map(o.cols.row))
      : `<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">${l.map((p, i) => planCard(p, i, o.quick ? o.quick(p) : '')).join('')}</div>`;
    if (o.onPaint) o.onPaint(l);
  };
  $('#pq').oninput = e => { PS.q = e.target.value; paint(); };
  [['pf', 'freq'], ['pb', 'bud'], ['ps', 'sort']].forEach(([id, k]) => $('#' + id).onchange = e => { PS[k] = e.target.value; paint(); });
  $('#pt').onclick = e => { const b = e.target.closest('button'); if (b) { PS.cat = b.dataset.c; paint(); } };
  $('#px').onclick = () => { Object.assign(PS, { q: '', cat: 'all', freq: 'all', bud: 'all' }); explorer(m, all, o); };
  paint();
}

const dBtn = 'w-9 h-9 rounded-lg border grid place-items-center text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white';
window.closePlan = () => $('#dr')?.remove();
window.openPlan = i => {
  const L = window._pl || [], p = L[i]; if (!p) return;
  closePlan();
  const d = document.createElement('div'); d.id = 'dr'; d.className = 'fixed inset-0 z-50 flex justify-end';
  const row = (k, v) => `<div class="flex justify-between py-3 text-sm"><dt class="text-slate-500">${k}</dt><dd class="font-medium text-slate-900 text-right">${v}</dd></div>`;
  const nb = (j, lab) => L[j] ? `<button onclick="openPlan(${j})" class="text-left flex-1 border rounded-lg p-3 hover:bg-slate-50"><span class="block text-xs text-slate-500">${lab}</span><span class="block text-sm font-medium truncate">${esc(L[j].name)}</span></button>` : '<span class="flex-1"></span>';
  d.innerHTML = `<div class="absolute inset-0 bg-slate-900/40" onclick="closePlan()"></div><aside class="relative w-full max-w-md bg-white h-full shadow-xl flex flex-col">
    <div class="h-16 px-5 border-b flex items-center justify-between shrink-0"><div class="flex items-center gap-2"><button onclick="openPlan(${i - 1})" ${i ? '' : 'disabled'} class="${dBtn}" aria-label="Previous plan">‹</button><button onclick="openPlan(${i + 1})" ${i < L.length - 1 ? '' : 'disabled'} class="${dBtn}" aria-label="Next plan">›</button><span class="ml-1 text-sm text-slate-500">Plan ${i + 1} of ${L.length}</span></div><button onclick="closePlan()" class="${dBtn}" aria-label="Close">✕</button></div>
    <div class="flex-1 overflow-y-auto p-6"><p class="text-xs font-medium uppercase tracking-wide text-slate-500">${p.category} · ${p.frequency}</p><h2 class="text-xl font-semibold text-slate-900 mt-1">${esc(p.name)}</h2>
      <p class="mt-4 text-3xl font-semibold">${naira(p.amount)}<span class="text-base font-normal text-slate-500"> / ${FQ[p.frequency]}</span></p>
      <dl class="mt-5 divide-y border-y">${row('Saving period', monthsLabel(p))}${row('Number of payments', p.duration)}${row('Total you contribute', naira(p.amount * p.duration))}${row('Total payout', naira(p.payout))}${row('Status', p.active === false ? 'Hidden' : 'Open for enrolment')}</dl>
      ${p.description ? `<h3 class="mt-6 text-sm font-semibold">What's included</h3><p class="mt-2 text-sm text-slate-600 leading-relaxed">${esc(p.description)}</p>` : ''}
      <div class="mt-8 flex gap-2">${nb(i - 1, '← Previous')}${nb(i + 1, 'Next →')}</div></div>
    <div class="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t shrink-0">${(window.PLAN_ACTION || (() => ''))(p)}</div></aside>`;
  document.body.appendChild(d);
};

// ===== app shell: sidebar, top bar with global plan search, keyboard shortcuts =====
function layout({ brand, nav, views, alias = {}, support = false, badges = null, live = [], onLive = null }) {
  const u = pb.authStore.record, ini = (u.name || u.email || '?').trim()[0].toUpperCase();
  $('#app').innerHTML = `<div class="min-h-screen lg:flex">
  <div id="ov" class="fixed inset-0 bg-slate-900/40 z-30 hidden lg:hidden"></div>
  <aside id="sb" class="fixed lg:sticky top-0 z-40 h-[100dvh] w-60 shrink-0 bg-white border-r flex flex-col -translate-x-full lg:translate-x-0 transition-transform">
    <a href="index.html" class="h-16 px-5 flex items-center gap-3 border-b"><img src="logo.jpeg" alt="" class="w-8 h-8 rounded-md object-cover"><span class="font-semibold text-slate-900 text-[15px]">${brand}</span></a>
    <nav class="flex-1 p-3 space-y-0.5 overflow-y-auto">${nav.map(n => `<a href="#${n[0]}" data-id="${n[0]}" class="nl flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">${ic(IC[n[0]] || IC.overview)}${n[1]}<span data-b="${n[0]}" class="hidden ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-semibold items-center justify-center"></span></a>`).join('')}</nav>
    <div class="p-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:pb-3 border-t space-y-0.5">${support ? `<a href="${waLink()}" target="_blank" rel="noopener" class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-600 hover:bg-slate-100"><span class="text-[#25D366]">${waIcon()}</span>Customer support</a>` : ''}<button onclick="logout()" class="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-slate-600 hover:bg-slate-100">${ic(IC.out)}Log out</button></div>
  </aside>
  <div class="flex-1 min-w-0">
    <header class="sticky top-0 z-20 h-16 bg-white/90 backdrop-blur border-b flex items-center gap-3 px-4 sm:px-8">
      <button id="mb" class="relative lg:hidden p-2 -ml-2 text-slate-600" aria-label="Menu">${ic(IC.menu)}<span id="mbd" class="hidden absolute top-1.5 right-1 w-2.5 h-2.5 rounded-full bg-red-600"></span></button>
      <span id="ttl" class="hidden md:block text-sm font-medium text-slate-900 w-44 shrink-0"></span>
      <div class="relative flex-1 max-w-md"><span class="absolute left-3 top-2.5 text-slate-400">${ic(IC.search)}</span><input id="gs" autocomplete="off" placeholder="Jump to a plan…  ( / )" class="${inp} pl-10 bg-slate-50"><div id="gr" class="hidden absolute left-0 right-0 top-11 bg-white border rounded-xl shadow-lg overflow-hidden divide-y"></div></div>
      <div class="ml-auto flex items-center gap-3"><button id="tg" onclick="toggleTheme()" class="p-2 rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Switch between light and dark mode" title="Light / dark mode">${ic(document.documentElement.classList.contains('dark') ? IC.sun : IC.moon)}</button><div class="hidden sm:block text-right leading-tight"><p class="text-sm font-medium text-slate-900">${esc(u.name || u.email)}</p><p class="text-xs text-slate-500">${u.role === 'admin' ? 'Administrator' : 'Member'}</p></div><div class="w-9 h-9 rounded-full bg-emerald-800 text-white grid place-items-center text-sm font-semibold">${esc(ini)}</div></div>
    </header>
    <main id="main" class="p-4 pb-28 sm:p-8 sm:pb-10 max-w-6xl mx-auto"></main>
  </div></div>${support ? `<a href="${waLink()}" target="_blank" rel="noopener" aria-label="Customer support on WhatsApp" title="Customer support" class="fixed right-4 sm:right-6 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6 z-[25] h-14 w-14 sm:w-auto sm:px-5 rounded-full bg-[#25D366] text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition flex items-center justify-center gap-2">${waIcon('w-7 h-7')}<span class="hidden sm:inline text-sm font-semibold">Customer support</span></a>` : ''}`;
  const tog = () => { $('#sb').classList.toggle('-translate-x-full'); $('#ov').classList.toggle('hidden'); };
  $('#mb').onclick = tog; $('#ov').onclick = tog;

  let ALL = null;
  const loadAll = async () => ALL || (ALL = (await pb.collection('plans').getFullList({ sort: 'category,frequency,amount' })).filter(p => u.role === 'admin' || p.active !== false));
  const gs = $('#gs'), gr = $('#gr');
  gs.oninput = async () => {
    const q = gs.value.trim(); if (!q) return gr.classList.add('hidden');
    const all = await loadAll(), m = all.filter(p => matchQ(p, q)).slice(0, 8);
    gr.innerHTML = m.length ? m.map(p => `<button data-id="${p.id}" class="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex justify-between gap-3 text-sm"><span class="truncate">${esc(p.name)}</span><span class="text-slate-500 whitespace-nowrap">${naira(p.amount)}/${FQ[p.frequency]}</span></button>`).join('') : '<p class="px-4 py-3 text-sm text-slate-500">No matching plans</p>';
    gr.classList.remove('hidden');
    gr.querySelectorAll('button').forEach(b => b.onclick = () => { window._pl = all; openPlan(all.findIndex(p => p.id === b.dataset.id)); gr.classList.add('hidden'); gs.value = ''; });
  };
  gs.onkeydown = e => { if (e.key === 'Enter') gr.querySelector('button')?.click(); if (e.key === 'Escape') { gr.classList.add('hidden'); gs.blur(); } };
  addEventListener('click', e => { if (!e.target.closest('#gs,#gr')) gr.classList.add('hidden'); });
  addEventListener('keydown', e => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName), cur = window._cur;
    if (e.key === '/' && !typing) { e.preventDefault(); ($('#pq') || gs).focus(); }
    if (!$('#dr')) return;
    if (e.key === 'Escape') closePlan();
    if (!typing && e.key === 'ArrowLeft' && cur > 0) openPlan(cur - 1);
    if (!typing && e.key === 'ArrowRight') openPlan(cur + 1);
  });
  const _open = window.openPlan; window.openPlan = i => { if ((window._pl || [])[i]) { window._cur = i; _open(i); } };

  const go = async () => {
    const [rawId, qs = ''] = (location.hash || '#' + nav[0][0]).slice(1).split('?'), v = views[rawId] ? rawId : nav[0][0], navId = alias[v] || v;
    const same = location.hash === window._lh, y = scrollY;                       // refresh() keeps the page where it was
    if (!same) { window._lh = location.hash; window._hf = {}; window._sel = new Set(); }                   // moving to another page forgets its filters
    document.querySelectorAll('.nl').forEach(a => { const on = a.dataset.id === navId; a.classList.toggle('bg-emerald-50', on); a.classList.toggle('text-emerald-800', on); a.classList.toggle('text-slate-600', !on); });
    $('#ttl').textContent = (nav.find(n => n[0] === navId) || nav[0])[1];
    ALL = null; closePlan(); if (!same) scrollTo(0, 0);
    if (!$('#ov').classList.contains('hidden')) tog();
    const m = $('#main'); if (!same) m.innerHTML = '<p class="text-sm text-slate-400">Loading…</p>';
    try { await views[v](m, new URLSearchParams(qs)); if (same) scrollTo(0, y); } catch (e) { m.innerHTML = `<p class="text-red-600 text-sm">${esc(e.message)}</p>`; }
    updBadges();
  };

  // red counters beside navigation links (e.g. pending payments) + a dot on the phone menu button + a count in the tab title
  const updBadges = async () => {
    if (!badges) return;
    try {
      const c = await badges(); let tot = 0;
      document.querySelectorAll('[data-b]').forEach(el => { const n = c[el.dataset.b] || 0; tot += n; el.textContent = n > 99 ? '99+' : n; el.classList.toggle('hidden', !n); el.classList.toggle('inline-flex', !!n); });
      $('#mbd').classList.toggle('hidden', !tot);
      document.title = (tot ? '(' + tot + ') ' : '') + document.title.replace(/^[(]\d+[)]\s*/, '');
    } catch (e) { /* counters are a convenience; never break the page */ }
  };

  // real time: PocketBase pushes every change; the page re-renders itself, but never while someone is typing or has a pop-up open
  let lt, bt;
  const typing = () => { const a = document.activeElement; return !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|number|tel|email|password|url)$/.test(a.type))); };
  const busyUI = () => $('[data-ui]') || $('#dr') || typing();
  const kick = () => { clearTimeout(lt); lt = setTimeout(function run() { if (busyUI()) { lt = setTimeout(run, 2000); return; } refresh(); }, 500); };
  live.forEach(c => { const p = pb.collection(c).subscribe?.('*', e => { try { onLive?.(c, e); } catch (x) { } clearTimeout(bt); bt = setTimeout(updBadges, 300); kick(); }); p?.catch?.(() => { }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });   // catch up after the tab slept
  setInterval(() => { if (!document.hidden) kick(); }, 90000);                              // safety net if a network blocks the live connection

  addEventListener('hashchange', go); go();
}

// ===== transaction history: payments + payouts in one list, date filters, PDF invoices and statements =====
const CO = { name: "Nobles Groceries", phone: SUPPORT_PHONE };
const lagosDay = s => toL(parseTs(s)).toISOString().slice(0, 10);                      // YYYY-MM-DD on the Lagos calendar
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const todayL = () => lagosDay(new Date().toISOString());
const uname = x => esc(x?.name || x?.email || '—');
const ulink = x => x ? `<a href="#user?id=${x.id}" class="font-medium text-emerald-800 hover:underline">${uname(x)}</a>` : '—';

// one normalised record for a payment or a payout (payouts carry the plan's payout value as their amount)
const txFrom = (r, kind) => {
  const pay = kind === 'payment', pl = r.expand?.subscription?.expand?.plan || {};
  return { key: kind + ':' + r.id, kind, id: r.id, created: r.created, at: parseTs(r.created), status: r.status, plan: pl.name || '—', frequency: pl.frequency || '',
    amount: pay ? r.amount : (pl.payout || 0), penalty: pay ? (r.penalty || 0) : 0, late: pay ? (r.late_count || 0) : 0,
    covers: pay && pl.frequency ? plural(instOf(r, pl), pl.frequency) : '', note: r.note || '', ref: r.tx_ref || '', user: r.expand?.user || null };
};
const invNo = t => (t.kind === 'payment' ? 'INV' : 'PAYOUT') + '-' + lagosDay(t.created).replace(/-/g, '') + '-' + String(t.id).slice(-5).toUpperCase();
window.TX = {};

// jsPDF is fetched only when someone asks for a PDF; pdf.js (this folder) draws the documents
let _logo;
const logoData = () => _logo || (_logo = fetch('logo.jpeg').then(r => r.blob()).then(b => new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); })).catch(() => null));
const loadPDF = async () => {
  if (!window.jspdf) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the PDF tool. Check your internet connection and try again.')); document.head.appendChild(s); });
  return window.jspdf.jsPDF;
};
window.dlInvoice = async key => {
  const t = TX[key]; if (!t) return;
  try { toast('Preparing your PDF…'); const [J, logo] = await Promise.all([loadPDF(), logoData()]); buildInvoice(J, t, t.user || window.TXCUST || {}, logo, CO).save(t.no + '.pdf'); }
  catch (e) { toast(e.message, 1); }
};

// o: { txs, cust (the member the history belongs to, or null for everyone), showUser, key (remembers filters across refreshes), extra(t) (extra action buttons), kinds }
function txHistory(m, o) {
  const { txs, cust = null, showUser = false, key = 'tx', extra = () => '', kinds = ['payment', 'payout'] } = o, multi = kinds.length > 1;
  window.TXCUST = cust; txs.forEach(t => { t.no = invNo(t); TX[t.key] = t; });
  if (!txs.length) { m.innerHTML = table([], []); return; }
  window._hf = window._hf || {};
  const F = window._hf[key] || (window._hf[key] = { from: '', to: '', status: 'all', kind: 'all', q: '' });
  const PRE = { all: ['All time', () => ['', '']], today: ['Today', () => [todayL(), todayL()]], 7: ['Last 7 days', () => [addDays(todayL(), -6), todayL()]], 30: ['Last 30 days', () => [addDays(todayL(), -29), todayL()]], month: ['This month', () => [todayL().slice(0, 8) + '01', todayL()]] };
  const lab = 'block text-xs font-medium text-slate-500';
  m.innerHTML = `<div class="bg-white border rounded-xl p-4 mb-4 space-y-3">
    <div id="hp" class="flex gap-1.5 overflow-x-auto pb-0.5">${Object.entries(PRE).map(([k, v]) => `<button type="button" data-p="${k}" class="whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium border">${v[0]}</button>`).join('')}</div>
    <div class="grid grid-cols-2 ${multi ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-2">
      <label class="${lab}">From<input id="hf" type="date" value="${F.from}" class="${inp} mt-1"></label>
      <label class="${lab}">To<input id="ht" type="date" value="${F.to}" class="${inp} mt-1"></label>
      ${multi ? `<label class="${lab}">Type<select id="hk" class="${inp} mt-1">${opts({ all: 'All types', payment: 'Payments', payout: 'Payouts' }, F.kind)}</select></label>` : ''}
      <label class="${lab}">Status<select id="hs" class="${inp} mt-1">${opts({ all: 'All statuses', pending: 'Pending', confirmed: 'Confirmed', rejected: 'Rejected' }, F.status)}</select></label>
    </div>
    <div class="flex flex-wrap items-center gap-3"><div class="relative flex-1 min-w-[200px]"><span class="absolute left-3 top-2.5 text-slate-400">${ic(IC.search)}</span><input id="hq" value="${esc(F.q)}" placeholder="Search plan, reference or invoice no…" class="${inp} pl-10"></div><button type="button" id="hx" class="text-sm font-medium text-emerald-800 hover:underline">Clear filters</button></div></div>
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3"><p id="hc" class="text-sm text-slate-500"></p><button type="button" id="hd" class="${btn2}">Download statement (PDF)</button></div><div id="hr"></div>`;
  const heads = ['Date', ...(showUser ? ['Member'] : []), ...(multi ? ['Type'] : []), 'Plan', 'Amount', 'Covers', 'Penalty', 'Note', 'Status', ''];
  const row = t => [date(t.created), ...(showUser ? [ulink(t.user)] : []), ...(multi ? [t.kind === 'payment' ? 'Payment' : 'Payout'] : []), esc(t.plan), naira(t.amount), t.covers || '—', t.penalty ? penBadge({ penalty: t.penalty }) : '—', esc(t.note) || '—', badge(t.status),
    extra(t) + `<button type="button" onclick="dlInvoice('${t.key}')" class="px-2.5 py-1 text-xs rounded-md border font-medium bg-white text-slate-700 hover:bg-slate-50">${t.kind === 'payment' ? 'Invoice' : 'Receipt'} (PDF)</button>`];
  let cur = [];
  const paint = () => {
    const q = F.q.trim().toLowerCase();
    cur = txs.filter(t => { const d = lagosDay(t.created); return (!F.from || d >= F.from) && (!F.to || d <= F.to) && (F.status === 'all' || t.status === F.status) && (F.kind === 'all' || t.kind === F.kind) && (!q || [t.plan, t.note, t.no, t.user?.name, t.user?.email].join(' ').toLowerCase().includes(q)); });
    document.querySelectorAll('#hp button').forEach(b => { const [f, t] = PRE[b.dataset.p][1](), on = f === F.from && t === F.to; b.className = 'whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium border ' + (on ? 'bg-emerald-800 text-white border-emerald-800' : 'bg-white text-slate-600 hover:bg-slate-100'); });
    const saved = cur.filter(t => t.kind === 'payment' && t.status === 'confirmed').reduce((a, t) => a + t.amount - t.penalty, 0);
    $('#hc').innerHTML = `<b class="text-slate-700">${cur.length}</b> of ${txs.length} transactions` + (cur.some(t => t.kind === 'payment') ? ` · Confirmed savings <b class="text-slate-700">${naira(saved)}</b>` : '');
    $('#hr').innerHTML = cur.length ? table(heads, cur.map(row)) : '<div class="bg-white border border-dashed rounded-xl p-10 text-center text-slate-500 text-sm">No transactions match. Try a wider date range or clear the filters.</div>';
  };
  $('#hp').onclick = e => { const b = e.target.closest('button'); if (!b) return; [F.from, F.to] = PRE[b.dataset.p][1](); $('#hf').value = F.from; $('#ht').value = F.to; paint(); };
  $('#hf').onchange = e => { F.from = e.target.value; if (F.to && F.from > F.to) { F.to = F.from; $('#ht').value = F.to; } paint(); };
  $('#ht').onchange = e => { F.to = e.target.value; if (F.from && F.from > F.to && F.to) { F.from = F.to; $('#hf').value = F.from; } paint(); };
  $('#hs').onchange = e => { F.status = e.target.value; paint(); };
  if (multi) $('#hk').onchange = e => { F.kind = e.target.value; paint(); };
  $('#hq').oninput = e => { F.q = e.target.value; paint(); };
  $('#hx').onclick = () => { Object.assign(F, { from: '', to: '', status: 'all', kind: 'all', q: '' }); txHistory(m, o); };
  $('#hd').onclick = async () => {
    if (!cur.length) return toast('There are no transactions in this range to download.', 1);
    try {
      toast('Preparing your PDF…'); const [J, logo] = await Promise.all([loadPDF(), logoData()]);
      buildStatement(J, { txs: cur, cust, showUser, from: F.from, to: F.to }, logo, CO).save('Statement-' + (cust?.name || 'all-members').replace(/[^a-z0-9]+/gi, '-') + '-' + todayL() + '.pdf');
    } catch (e) { toast(e.message, 1); }
  };
  paint();
}
