// Pure expense math (no DOM, no storage): who owes what and the minimum transfers to settle up.

/** Amounts owed by each traveler for one expense, in the expense's own currency. */
export function owedMap(e, travelerIds) {
  const m = {};
  if (e.split?.mode === 'exact') {
    const tot = Object.values(e.split.shares).reduce((a, b) => a + (+b || 0), 0) || 1;
    for (const [id, v] of Object.entries(e.split.shares)) m[id] = e.amount * ((+v || 0) / tot);
  } else {
    const among = e.split?.among?.length ? e.split.among : travelerIds;
    among.forEach((id) => { m[id] = e.amount / among.length; });
  }
  return m;
}

/** { travelerId: { paid, owed } } in currency `cur`; `conv(amount, from, to)` converts between currencies. */
export function balances(list, travelerIds, cur, conv) {
  const net = Object.fromEntries(travelerIds.map((id) => [id, { paid: 0, owed: 0 }]));
  for (const e of list) {
    (net[e.paidBy] ||= { paid: 0, owed: 0 }).paid += conv(e.amount, e.currency, cur);
    for (const [id, v] of Object.entries(owedMap(e, travelerIds))) (net[id] ||= { paid: 0, owed: 0 }).owed += conv(v, e.currency, cur);
  }
  return net;
}

/** Greedy settlement: the biggest debtor pays the biggest creditor until everyone is even. */
export function settlements(net) {
  const debtors = [], creditors = [];
  for (const [id, v] of Object.entries(net)) {
    const bal = v.paid - v.owed;
    if (bal < -0.005) debtors.push({ id, amt: -bal }); else if (bal > 0.005) creditors.push({ id, amt: bal });
  }
  debtors.sort((a, b) => b.amt - a.amt); creditors.sort((a, b) => b.amt - a.amt);
  const out = [];
  while (debtors.length && creditors.length) {
    const d = debtors[0], c = creditors[0], x = Math.min(d.amt, c.amt);
    out.push({ from: d.id, to: c.id, amt: x });
    d.amt -= x; c.amt -= x;
    if (d.amt < 0.005) debtors.shift();
    if (c.amt < 0.005) creditors.shift();
  }
  return out;
}

/** Currency converter from a rates table expressed as "units per 1 base currency". */
export const converter = (rates) => (amt, from, to) => amt / (rates[from] || 1) * (rates[to] || 1);
