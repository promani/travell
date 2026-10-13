// Split expenses: data/expenses.json (Claude, through the MCP) + what is loaded in the app, multi-currency, equal or exact splits, who-pays-whom, export/import to sync between phones.
import { D, I, cols, settings } from '../store.js';
import { exportShared, importShared } from '../share.js';
import { esc, ic, uid, toast, openModal, fmtMoney, fmtShort, closeModal } from '../util.js';
import { tripPhase } from '../tripstate.js';
import { register } from '../ui.js';
import { owedMap as owedMapOf, balances as balancesOf, settlements, converter } from '../money.js';

const CATS = { comida: ['bowl-food', 'Comida'], transporte: ['train', 'Transporte'], alojamiento: ['hotel', 'Alojamiento'], entradas: ['ticket', 'Entradas'], compras: ['bag-shopping', 'Compras'], otros: ['receipt', 'Otros'] };
let filterDay = null;

const live = () => D.expenses;
const rates = () => ({ ...D.trip.currencies.rates, ...settings.get('rates', {}) });
export const baseCur = () => D.trip.currencies.base;
export const settleCur = () => settings.get('settleCur', baseCur());
const ids = () => D.travelers.map((t) => t.id);
/** Convert `amt` of currency `from` into currency `to` through the base currency. */
const conv = (amt, from, to) => converter(rates())(amt, from, to);
const owedMap = (e) => owedMapOf(e, ids());
export const balances = (list = live(), cur = settleCur()) => balancesOf(list, ids(), cur, conv);
export { settlements };

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
    <small>${CATS[e.category] ? `${ic(CATS[e.category][0])} ${esc(CATS[e.category][1])}` : ''} · pagó ${esc(tName(e.paidBy))} · ${split}${e.dayId ? ` · Día ${I.day[e.dayId]?.n}` : ''}</small></div>
    <div class="amt">${fmtMoney(e.amount, e.currency)}${base}</div>
    <div class="row-actions"><button class="btn tiny" data-act="exp-edit" data-id="${e.id}">Editar</button><button class="btn tiny danger" data-act="exp-del" data-id="${e.id}">Borrar</button></div></li>`;
}

export function render(params, ctx) {
  if (params.day) filterDay = params.day;
  const list = [...live()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const shown = list.filter((e) => !filterDay || e.dayId === filterDay);
  const cur = settleCur(), net = balances(list, cur), sets = settlements(net);
  const total = list.reduce((s, e) => s + conv(e.amount, e.currency, cur), 0);
  ctx.title = 'Gastos';
  return `<header class="pagehead"><h1>${ic('money-bill-wave')} Gastos compartidos</h1>
    <p class="muted">Anotá quién pagó y entre quiénes se divide. Todo queda en este dispositivo; exportá el archivo para juntar las cuentas de todos.</p></header>
  <section class="card">
    <div class="card-head"><h3>Resumen</h3>
      <select data-change="settle-cur" aria-label="Moneda del resumen">${D.trip.currencies.list.map((c) => `<option ${c === cur ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <p class="bignum">${fmtMoney(total, cur)} <small>gastado en total</small></p>
    <table class="bal"><thead><tr><th></th><th>Pagó</th><th>Le toca</th><th>Saldo</th></tr></thead><tbody>
      ${Object.entries(net).map(([id, v]) => { const b = v.paid - v.owed; return `<tr><td>${esc(tName(id))}</td><td>${fmtMoney(v.paid, cur)}</td><td>${fmtMoney(v.owed, cur)}</td>
        <td class="${b > 0.005 ? 'pos' : b < -0.005 ? 'neg' : ''}">${b > 0.005 ? '+' : ''}${fmtMoney(b, cur)}</td></tr>`; }).join('')}</tbody></table>
    ${sets.length ? `<h4>Para quedar a mano</h4><ul class="settle">${sets.map((s) => `<li><b>${esc(tName(s.from))}</b> le paga <b>${fmtMoney(s.amt, cur)}</b> a <b>${esc(tName(s.to))}</b></li>`).join('')}</ul>`
      : list.length ? `<p class="ok-line">${ic('check')} Están a mano.</p>` : ''}
  </section>
  <div class="row-actions"><button class="btn primary" data-act="exp-add">${ic('plus')} Agregar gasto</button>
    <button class="btn" data-act="exp-export">${ic('file-export')} Exportar</button>
    <label class="btn">${ic('file-import')} Importar<input type="file" accept="application/json,.json" hidden data-change="exp-import"></label></div>
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
      <label class="field">Categoría<select name="category">${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k === (e.category || 'comida') ? 'selected' : ''}>${v[1]}</option>`).join('')}</select></label>
      <label class="field">Día<select name="dayId"><option value="">—</option>${D.days.map((d) => `<option value="${d.id}" ${d.id === dayId ? 'selected' : ''}>Día ${d.n} · ${esc(fmtShort(d.date))}</option>`).join('')}</select></label>
    </div>
    <div class="row-actions"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" data-act="close-modal">Cancelar</button></div>
  </form>`;
}

register({
  'exp-add': () => openModal(form()),
  'exp-edit': (el) => openModal(form(live().find((e) => e.id === el.dataset.id))),
  'exp-del': (el, _, app) => {
    if (!confirm('¿Borrar este gasto?')) return;
    cols.del('expenses', el.dataset.id); app.rerender();
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
    const prev = live().find((e) => e.id === id);
    cols.put('expenses', { ...(prev ? { createdAt: prev.createdAt } : { createdAt: Date.now() }), ...rec });
    settings.set('lastCur', rec.currency); settings.set('lastPayer', rec.paidBy);
    closeModal(form); app.rerender();
  },
  'exp-export': () => exportShared(['expenses', 'travelers']),
  'exp-import': async (el, _, app) => {
    const file = el.files[0]; el.value = '';
    if (!file) return;
    try { await importShared(file); app.rerender(); } catch (e) { toast(e.message || 'Archivo inválido'); }
  },
});
