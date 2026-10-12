// Split expenses: stored locally, multi-currency, equal or exact splits, who-pays-whom, export/import to sync between phones.
import { D, I, kv, settings } from '../store.js';
import { esc, uid, toast, openModal, fmtMoney, fmtShort, download, closeModal } from '../util.js';
import { tripPhase } from '../tripstate.js';
import { register } from '../ui.js';

const CATS = { comida: '🍜 Comida', transporte: '🚆 Transporte', alojamiento: '🏨 Alojamiento', entradas: '🎟️ Entradas', compras: '🛍️ Compras', otros: '🧾 Otros' };
let filterDay = null;

const all = () => kv.get('expenses', []);
const live = () => all().filter((e) => !e.deleted);
const save = (list) => kv.set('expenses', list);
const rates = () => ({ ...D.trip.currencies.rates, ...settings.get('rates', {}) });
export const baseCur = () => D.trip.currencies.base;
export const settleCur = () => settings.get('settleCur', baseCur());
const rate = (c) => rates()[c] || 1;
/** Convert `amt` of currency `from` into currency `to` through the base currency. */
const conv = (amt, from, to) => amt / rate(from) * rate(to);

function owedMap(e) {
  const m = {};
  if (e.split.mode === 'exact') {
    const tot = Object.values(e.split.shares).reduce((a, b) => a + (+b || 0), 0) || 1;
    for (const [id, v] of Object.entries(e.split.shares)) m[id] = e.amount * ((+v || 0) / tot);
  } else {
    const among = e.split.among?.length ? e.split.among : D.travelers.map((t) => t.id);
    among.forEach((id) => { m[id] = e.amount / among.length; });
  }
  return m;                                    // in the expense's own currency
}

export function balances(list = live(), cur = settleCur()) {
  const net = Object.fromEntries(D.travelers.map((t) => [t.id, { paid: 0, owed: 0 }]));
  for (const e of list) {
    (net[e.paidBy] ||= { paid: 0, owed: 0 }).paid += conv(e.amount, e.currency, cur);
    for (const [id, v] of Object.entries(owedMap(e))) (net[id] ||= { paid: 0, owed: 0 }).owed += conv(v, e.currency, cur);
  }
  return net;
}
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

const tName = (id) => I.traveler[id]?.name || id;

export async function dayTotalText(dayId) {
  const list = live().filter((e) => e.dayId === dayId);
  if (!list.length) return '<span class="muted">Sin gastos cargados.</span>';
  const byCur = {};
  list.forEach((e) => { byCur[e.currency] = (byCur[e.currency] || 0) + e.amount; });
  const tot = list.reduce((s, e) => s + conv(e.amount, e.currency, settleCur()), 0);
  return `<b>${Object.entries(byCur).map(([c, v]) => fmtMoney(v, c)).join(' + ')}</b> <span class="muted">(≈ ${fmtMoney(tot, settleCur())}) · ${list.length} gasto${list.length > 1 ? 's' : ''}</span>`;
}

function expRow(e) {
  const owed = owedMap(e), ids = Object.keys(owed);
  const split = e.split.mode === 'exact' ? 'a medida' : ids.length === D.travelers.length ? 'entre todos' : `entre ${ids.map(tName).join(', ')}`;
  const base = e.currency !== settleCur() ? ` <small class="muted">≈ ${fmtMoney(conv(e.amount, e.currency, settleCur()), settleCur())}</small>` : '';
  return `<li class="exp" data-id="${e.id}"><div><b>${esc(e.desc)}</b>
    <small>${esc(CATS[e.category] || '')} · pagó ${esc(tName(e.paidBy))} · ${split}${e.dayId ? ` · Día ${I.day[e.dayId]?.n}` : ''}</small></div>
    <div class="amt">${fmtMoney(e.amount, e.currency)}${base}</div>
    <div class="row-actions"><button class="btn tiny" data-act="exp-edit" data-id="${e.id}">Editar</button><button class="btn tiny danger" data-act="exp-del" data-id="${e.id}">Borrar</button></div></li>`;
}

export function render(params, ctx) {
  if (params.day) filterDay = params.day;
  const list = live().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const shown = list.filter((e) => !filterDay || e.dayId === filterDay);
  const cur = settleCur(), net = balances(list, cur), sets = settlements(net);
  const total = list.reduce((s, e) => s + conv(e.amount, e.currency, cur), 0);
  ctx.title = 'Gastos';
  return `<header class="pagehead"><h1>💸 Gastos compartidos</h1>
    <p class="muted">Anotá quién pagó y entre quiénes se divide. Todo queda en este dispositivo; exportá el archivo para juntar las cuentas de todos.</p></header>
  <section class="card">
    <div class="card-head"><h3>Resumen</h3>
      <select data-change="settle-cur" aria-label="Moneda del resumen">${D.trip.currencies.list.map((c) => `<option ${c === cur ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <p class="bignum">${fmtMoney(total, cur)} <small>gastado en total</small></p>
    <table class="bal"><thead><tr><th></th><th>Pagó</th><th>Le toca</th><th>Saldo</th></tr></thead><tbody>
      ${Object.entries(net).map(([id, v]) => { const b = v.paid - v.owed; return `<tr><td>${esc(tName(id))}</td><td>${fmtMoney(v.paid, cur)}</td><td>${fmtMoney(v.owed, cur)}</td>
        <td class="${b > 0.005 ? 'pos' : b < -0.005 ? 'neg' : ''}">${b > 0.005 ? '+' : ''}${fmtMoney(b, cur)}</td></tr>`; }).join('')}</tbody></table>
    ${sets.length ? `<h4>Para quedar a mano</h4><ul class="settle">${sets.map((s) => `<li><b>${esc(tName(s.from))}</b> le paga <b>${fmtMoney(s.amt, cur)}</b> a <b>${esc(tName(s.to))}</b></li>`).join('')}</ul>`
      : list.length ? '<p class="ok-line">✔ Están a mano.</p>' : ''}
  </section>
  <div class="row-actions"><button class="btn primary" data-act="exp-add">＋ Agregar gasto</button>
    <button class="btn" data-act="exp-export">⬆ Exportar</button>
    <label class="btn">⬇ Importar<input type="file" accept="application/json,.json" hidden data-change="exp-import"></label></div>
  <div class="chips"><button class="chip ${!filterDay ? 'on' : ''}" data-act="exp-filter" data-day="">Todos</button>
    ${[...new Set(list.map((e) => e.dayId).filter(Boolean))].sort().map((d) => `<button class="chip ${filterDay === d ? 'on' : ''}" data-act="exp-filter" data-day="${d}">Día ${I.day[d].n}</button>`).join('')}</div>
  <ul class="explist">${shown.map(expRow).join('') || '<li class="muted center">Todavía no hay gastos.</li>'}</ul>`;
}

function form(e = {}) {
  const st = tripPhase();
  const dayId = e.dayId !== undefined ? e.dayId : (filterDay || (st.phase === 'during' ? st.day.id : ''));
  const among = new Set(e.split?.among || D.travelers.map((t) => t.id));
  const mode = e.split?.mode || 'equal';
  return `<h3>${e.id ? 'Editar gasto' : 'Nuevo gasto'}</h3>
  <form data-submit="exp-save" class="form">
    <input type="hidden" name="id" value="${esc(e.id || '')}">
    <label class="field">Descripción<input name="desc" required maxlength="80" value="${esc(e.desc || '')}" placeholder="Cena de xiaolongbao"></label>
    <div class="two">
      <label class="field">Monto<input name="amount" type="number" inputmode="decimal" step="0.01" min="0" required value="${e.amount ?? ''}"></label>
      <label class="field">Moneda<select name="currency">${D.trip.currencies.list.map((c) => `<option ${c === (e.currency || settings.get('lastCur', baseCur())) ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    </div>
    <label class="field">Pagó<select name="paidBy">${D.travelers.map((t) => `<option value="${t.id}" ${t.id === (e.paidBy || settings.get('lastPayer', D.travelers[0].id)) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    <fieldset class="field"><legend>Se divide</legend>
      <label class="radio"><input type="radio" name="mode" value="equal" ${mode === 'equal' ? 'checked' : ''}> En partes iguales entre</label>
      <div class="among">${D.travelers.map((t) => `<label class="check"><input type="checkbox" name="among" value="${t.id}" ${among.has(t.id) ? 'checked' : ''}><span>${esc(t.name)}</span></label>`).join('')}</div>
      <label class="radio"><input type="radio" name="mode" value="exact" ${mode === 'exact' ? 'checked' : ''}> Montos a medida</label>
      <div class="exact">${D.travelers.map((t) => `<label class="field">${esc(t.name)}<input name="share-${t.id}" type="number" step="0.01" min="0" inputmode="decimal" value="${e.split?.shares?.[t.id] ?? ''}"></label>`).join('')}</div>
    </fieldset>
    <div class="two">
      <label class="field">Categoría<select name="category">${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k === (e.category || 'comida') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field">Día<select name="dayId"><option value="">—</option>${D.days.map((d) => `<option value="${d.id}" ${d.id === dayId ? 'selected' : ''}>Día ${d.n} · ${esc(fmtShort(d.date))}</option>`).join('')}</select></label>
    </div>
    <div class="row-actions"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" data-act="close-modal">Cancelar</button></div>
  </form>`;
}

register({
  'exp-add': () => openModal(form()),
  'exp-edit': (el) => openModal(form(all().find((e) => e.id === el.dataset.id))),
  'exp-del': (el, _, app) => {
    if (!confirm('¿Borrar este gasto?')) return;
    save(all().map((e) => e.id === el.dataset.id ? { ...e, deleted: true, updatedAt: Date.now() } : e)); app.rerender();
  },
  'exp-filter': (el, _, app) => { filterDay = el.dataset.day || null; app.rerender(); },
  'settle-cur': (el, _, app) => { settings.set('settleCur', el.value); app.rerender(); },
  'exp-save': (form, ev, app) => {
    const f = new FormData(form);
    const amount = parseFloat(f.get('amount'));
    if (!(amount >= 0)) return toast('Monto inválido');
    const mode = f.get('mode');
    let split;
    if (mode === 'exact') {
      const shares = {};
      D.travelers.forEach((t) => { const v = parseFloat(f.get('share-' + t.id)); if (v > 0) shares[t.id] = v; });
      if (!Object.keys(shares).length) return toast('Cargá al menos un monto');
      split = { mode, shares };
    } else {
      const among = f.getAll('among');
      if (!among.length) return toast('Elegí entre quiénes se divide');
      split = { mode: 'equal', among };
    }
    const id = f.get('id') || uid('ex');
    const rec = { id, desc: f.get('desc').trim(), amount, currency: f.get('currency'), paidBy: f.get('paidBy'), split,
      category: f.get('category'), dayId: f.get('dayId') || null, updatedAt: Date.now() };
    const list = all(), i = list.findIndex((e) => e.id === id);
    if (i >= 0) list[i] = { ...list[i], ...rec }; else list.push({ ...rec, createdAt: Date.now() });
    save(list);
    settings.set('lastCur', rec.currency); settings.set('lastPayer', rec.paidBy);
    closeModal(form); app.rerender();
  },
  'exp-export': async () => {
    const data = { app: 'travell', tripId: D.trip.id, exportedAt: new Date().toISOString(), travelers: D.travelers, expenses: all() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const file = new File([blob], `gastos-${D.trip.id}.json`, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Gastos del viaje' }); return; } catch { /* cancelled */ } }
    download(file.name, blob);
  },
  'exp-import': async (el, _, app) => {
    const file = el.files[0]; el.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.tripId !== D.trip.id || !Array.isArray(data.expenses)) throw new Error('otro viaje');
      const cur = new Map(all().map((e) => [e.id, e]));
      let added = 0, updated = 0;
      for (const e of data.expenses) {
        const mine = cur.get(e.id);
        if (!mine) { cur.set(e.id, e); added++; } else if ((e.updatedAt || 0) > (mine.updatedAt || 0)) { cur.set(e.id, e); updated++; }
      }
      save([...cur.values()]);
      toast(`Importado: ${added} nuevos, ${updated} actualizados`); app.rerender();
    } catch { toast('Archivo inválido o de otro viaje'); }
  },
});
