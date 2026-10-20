/* ==========================================================
   Oppgjør — ønskeliste (egen side)
   Henter «de skylder deg» og «du skylder» fra gjeld-appen
   (localStorage-nøkkel oppgjor:v1). Ønskelisten ligger i
   egen nøkkel, så de to ikke overskriver hverandre.
   ========================================================== */

const KEY = 'oppgjor:wishlist:v1';
const DEBT_KEY = 'oppgjor:v1';

const currencies = {
  USD:{symbol:'$',position:'before'}, AUD:{symbol:'A$',position:'before'}, BRL:{symbol:'R$',position:'before'},
  GBP:{symbol:'£',position:'before'}, DKK:{symbol:'kr',position:'after'},  EUR:{symbol:'€',position:'before'},
  PHP:{symbol:'₱',position:'before'}, HKD:{symbol:'HK$',position:'before'}, INR:{symbol:'₹',position:'before'},
  IDR:{symbol:'Rp',position:'before'}, ISK:{symbol:'kr',position:'after'}, ILS:{symbol:'₪',position:'before'},
  JPY:{symbol:'¥',position:'before'}, CAD:{symbol:'C$',position:'before'}, CNY:{symbol:'¥',position:'before'},
  MYR:{symbol:'RM',position:'before'}, MXN:{symbol:'MX$',position:'before'}, NZD:{symbol:'NZ$',position:'before'},
  NOK:{symbol:'kr',position:'after'}, PLN:{symbol:'zł',position:'after'}, RON:{symbol:'lei',position:'after'},
  RUB:{symbol:'₽',position:'after'}, SGD:{symbol:'S$',position:'before'}, CHF:{symbol:'CHF',position:'before'},
  SEK:{symbol:'kr',position:'after'}, ZAR:{symbol:'R',position:'before'}, KRW:{symbol:'₩',position:'before'},
  THB:{symbol:'฿',position:'before'}, CZK:{symbol:'Kč',position:'after'}, TRY:{symbol:'₺',position:'before'},
  HUF:{symbol:'Ft',position:'after'}, VND:{symbol:'₫',position:'after'}
};

/* Fire kombinasjoner, i samme rekkefølge som boksene */
const SCENARIOS = {
  cash:   { label:'Jeg har nå',           title:'Kun det jeg har nå',     credit:false, debit:false },
  credit: { label:'Når de betaler meg',   title:'Når de har betalt deg',  credit:true,  debit:false },
  debit:  { label:'Etter jeg har betalt', title:'Etter at du har betalt', credit:false, debit:true  },
  all:    { label:'Alt oppgjort',         title:'Alt oppgjort',           credit:true,  debit:true  }
};
const ORDER = ['cash','credit','debit','all'];

const $ = (sel) => document.querySelector(sel);

function cryptoId(){
  if(window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}
function round2(n){ return Math.round(n * 100) / 100; }
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ---------- state ---------- */

function emptyState(){ return { cash:0, scenario:'cash', items:[] }; }

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(raw){
      const p = JSON.parse(raw);
      if(p && Array.isArray(p.items)){
        return {
          cash: Number(p.cash) || 0,
          scenario: SCENARIOS[p.scenario] ? p.scenario : 'cash',
          items: p.items.filter(i => i && typeof i.name === 'string' && Number(i.price) > 0)
        };
      }
    }
  }catch(e){ /* korrupt lagring — start tomt */ }
  return emptyState();
}
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(wl)); }catch(e){ /* privat modus */ }
}
let wl = load();

function debtTotals(){
  try{
    const raw = localStorage.getItem(DEBT_KEY);
    if(raw){
      const s = JSON.parse(raw);
      if(s && Array.isArray(s.entries)){
        let c = 0, d = 0;
        s.entries.forEach(e => {
          if(e.mode === 'credit') c += Number(e.amount) || 0;
          else if(e.mode === 'debit') d += Number(e.amount) || 0;
        });
        return { credit:round2(c), debit:round2(d), currency: s.currency || 'NOK' };
      }
    }
  }catch(e){ /* ingen gjeldsdata */ }
  return { credit:0, debit:0, currency:'NOK' };
}

/* ---------- formatering ---------- */

function cur(){ return currencies[debtTotals().currency] || currencies.NOK; }

function fmt(v){
  v = round2(v);
  const c = cur();
  const n = Math.abs(v).toLocaleString('nb-NO', { maximumFractionDigits:2 });
  const s = c.position === 'before' ? c.symbol + n : n + ' ' + c.symbol;
  return (v < 0 ? '−' : '') + s;
}
function fmtSigned(v){ return (v >= 0 ? '+' : '−') + fmt(Math.abs(v)); }

function parseAmount(str){
  if(!str) return NaN;
  return parseFloat(str.trim().replace(',', '.'));
}
function bindAmountInput(input){
  input.addEventListener('input', () => {
    let v = input.value.replace(/\./g, ',').replace(/[^0-9,]/g, '');
    const i = v.indexOf(',');
    if(i !== -1){
      const head = v.slice(0, i);
      const tail = v.slice(i + 1).replace(/,/g, '').slice(0, 2);
      v = head + ',' + tail;
    }
    input.value = v;
  });
}

/* ---------- regning ---------- */

function available(id){
  const t = debtTotals();
  const s = SCENARIOS[id];
  return round2(wl.cash + (s.credit ? t.credit : 0) - (s.debit ? t.debit : 0));
}

/* Hver ting får «samlet» = summen av den selv og alt over den */
function plan(id){
  const avail = available(id);
  let cum = 0;
  return wl.items.map(item => {
    cum = round2(cum + item.price);
    return { item, cum, left: round2(avail - cum), ok: cum <= avail };
  });
}
function listTotal(){ return round2(wl.items.reduce((s, i) => s + i.price, 0)); }

function moveItem(arr, from, to){
  if(from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const [it] = arr.splice(from, 1);
  arr.splice(to, 0, it);
  return arr;
}

/* ---------- rendering ---------- */

function render(){
  renderBoxes();
  renderList();
}

function renderBoxes(){
  const t = debtTotals();
  ORDER.forEach(id => {
    const box = document.querySelector(`.box[data-scenario="${id}"]`);
    box.querySelector('.box-amount').textContent = fmt(available(id));
    const active = wl.scenario === id;
    box.classList.toggle('active', active);
    box.setAttribute('aria-pressed', String(active));
  });
  const sub = (id, html) => { document.querySelector(`.box[data-scenario="${id}"] .box-sub`).innerHTML = html; };
  sub('credit', `<span class="pos">+${fmt(t.credit)}</span> fra andre`);
  sub('debit',  `<span class="neg">−${fmt(t.debit)}</span> til andre`);
  const net = round2(t.credit - t.debit);
  sub('all', `netto <span class="${net >= 0 ? 'pos' : 'neg'}">${fmtSigned(net)}</span>`);
}

function renderList(){
  const container = $('#wishList');
  container.innerHTML = '';
  $('#listTotal').textContent = fmt(listTotal());

  const avail = available(wl.scenario);
  $('#caption').innerHTML = wl.items.length
    ? `Regner med <b>${SCENARIOS[wl.scenario].label.toLowerCase()}</b> · ${fmt(avail)} tilgjengelig`
    : '';

  if(wl.items.length === 0){
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Legg til ting du vil kjøpe, i den rekkefølgen du ønsker dem. Da ser du hva du trenger før hver enkelt.';
    container.appendChild(empty);
    return;
  }

  const p = plan(wl.scenario);
  const lastOk = p.reduce((a, r, i) => r.ok ? i : a, -1);

  p.forEach((r, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'wl-wrap';
    wrap.dataset.id = r.item.id;
    wrap.innerHTML = `
      <div class="wl-delete-bg"><button class="wl-delete-btn" type="button">Slett</button></div>
      <div class="wl-row ${r.ok ? 'ok' : 'no'}">
        <div class="wl-handle" aria-label="Dra for å flytte">
          <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor" aria-hidden="true">
            <circle cx="4" cy="4" r="1.6"/><circle cx="10" cy="4" r="1.6"/>
            <circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/>
            <circle cx="4" cy="16" r="1.6"/><circle cx="10" cy="16" r="1.6"/>
          </svg>
        </div>
        <div class="wl-index">${i + 1}</div>
        <div class="wl-body">
          <div class="wl-name">${escapeHtml(r.item.name)}</div>
          <div class="wl-meta">${fmt(r.item.price)} · ${
            r.ok ? `<span class="ok-t">igjen ${fmt(r.left)}</span>`
                 : `<span class="no-t">mangler ${fmt(-r.left)}</span>`}</div>
        </div>
        <div class="wl-cum">
          <div class="wl-cum-amount">${fmt(r.cum)}</div>
          <div class="wl-cum-label">samlet</div>
        </div>
      </div>`;
    container.appendChild(wrap);
    attachSwipe(wrap, r.item);
    attachDrag(wrap.querySelector('.wl-handle'), wrap, i);

    if(i === lastOk && lastOk < p.length - 1){
      const div = document.createElement('div');
      div.className = 'wl-divider';
      div.textContent = 'Pengene rekker hit';
      container.appendChild(div);
    }
  });
}

/* ---------- sveip for å slette ---------- */

const SWIPE_OPEN_X = -84;
let openRow = null;

function closeOpenRow(){
  if(openRow){
    const row = openRow.querySelector('.wl-row');
    row.style.transform = 'translateX(0px)';
    row.dataset.open = 'false';
    openRow = null;
  }
}

function attachSwipe(wrap, item){
  const row = wrap.querySelector('.wl-row');
  const del = wrap.querySelector('.wl-delete-btn');
  let startX = 0, startY = 0, baseX = 0, swiping = false, tracking = false;

  row.addEventListener('pointerdown', (e) => {
    if(e.target.closest('.wl-handle')) return;
    if(openRow && openRow !== wrap) closeOpenRow();
    tracking = true;
    swiping = false;
    startX = e.clientX;
    startY = e.clientY;
    baseX = row.dataset.open === 'true' ? SWIPE_OPEN_X : 0;
    row.style.transition = 'none';
    row.setPointerCapture(e.pointerId);
  });
  row.addEventListener('pointermove', (e) => {
    if(!tracking) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if(!swiping && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) swiping = true;
    if(swiping){
      const x = Math.min(0, Math.max(SWIPE_OPEN_X, baseX + dx));
      row.style.transform = `translateX(${x}px)`;
    }
  });
  function finish(e){
    if(!tracking) return;
    tracking = false;
    row.style.transition = '';
    if(swiping){
      const x = Math.min(0, Math.max(SWIPE_OPEN_X, baseX + (e.clientX - startX)));
      if(x < SWIPE_OPEN_X / 2){
        row.style.transform = `translateX(${SWIPE_OPEN_X}px)`;
        row.dataset.open = 'true';
        openRow = wrap;
      } else {
        row.style.transform = 'translateX(0px)';
        row.dataset.open = 'false';
        if(openRow === wrap) openRow = null;
      }
      swiping = false;
    } else if(row.dataset.open === 'true'){
      closeOpenRow();
    }
  }
  row.addEventListener('pointerup', finish);
  row.addEventListener('pointercancel', finish);

  del.addEventListener('click', () => {
    wl.items = wl.items.filter(i => i.id !== item.id);
    openRow = null;
    save();
    render();
  });
}
document.addEventListener('pointerdown', (e) => {
  if(openRow && !openRow.contains(e.target)) closeOpenRow();
});

/* ---------- dra for å sortere ---------- */

function attachDrag(handle, wrap, index){
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    closeOpenRow();
    const wraps = Array.from($('#wishList').querySelectorAll('.wl-wrap'));
    const rects = wraps.map(w => w.getBoundingClientRect());
    const h = rects[index].height;
    const startY = e.clientY;
    let target = index;

    wrap.classList.add('dragging');
    wraps.forEach(w => { if(w !== wrap) w.style.transition = 'transform .18s ease'; });
    handle.setPointerCapture(e.pointerId);

    function onMove(ev){
      const dy = ev.clientY - startY;
      wrap.style.transform = `translateY(${dy}px)`;
      const center = rects[index].top + h / 2 + dy;
      let ni = 0;
      wraps.forEach((w, j) => {
        if(j === index) return;
        if(rects[j].top + rects[j].height / 2 < center) ni++;
      });
      target = ni;
      wraps.forEach((w, j) => {
        if(j === index) return;
        let shift = 0;
        if(index < target && j > index && j <= target) shift = -h;
        else if(target < index && j >= target && j < index) shift = h;
        w.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    }
    function onEnd(){
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      if(target !== index){
        moveItem(wl.items, index, target);
        save();
      }
      render();
    }
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  });
}

/* ---------- bokser: trykk = velg, dobbelttrykk = detaljer ---------- */

let lastTap = { id:null, t:0 };

document.querySelectorAll('.box').forEach(box => {
  const id = box.dataset.scenario;
  box.addEventListener('click', (e) => {
    if(e.target.closest('.box-edit')) return;
    const now = Date.now();
    const isDouble = lastTap.id === id && now - lastTap.t < 450;
    lastTap = isDouble ? { id:null, t:0 } : { id, t:now };
    wl.scenario = id;
    save();
    render();
    if(isDouble) openCombos(id);
  });
  box.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      wl.scenario = id;
      save();
      render();
      openCombos(id);
    }
  });
});

/* ---------- bunnark (felles) ---------- */

const overlay = $('#overlay');
const sheet = $('#sheet');
const sheetBody = $('#sheetBody');
const dragZone = $('#dragZone');

function showSheet(html){
  sheetBody.innerHTML = html;
  sheetBody.scrollTop = 0;
  overlay.classList.add('open');
  sheet.classList.add('open');
}
function closeSheet(){
  overlay.classList.remove('open');
  sheet.classList.remove('open');
  sheet.style.transform = '';
}
overlay.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closeSheet(); });

let dStartY = 0, dCurY = 0, dDragging = false;
dragZone.addEventListener('pointerdown', (e) => {
  dDragging = true; dStartY = e.clientY; dCurY = 0;
  sheet.classList.add('dragging');
  dragZone.setPointerCapture(e.pointerId);
});
dragZone.addEventListener('pointermove', (e) => {
  if(!dDragging) return;
  dCurY = Math.max(0, e.clientY - dStartY);
  sheet.style.transform = `translateY(${dCurY}px)`;
});
function endSheetDrag(){
  if(!dDragging) return;
  dDragging = false;
  sheet.classList.remove('dragging');
  if(dCurY > sheet.offsetHeight * 0.28 || dCurY > 140) closeSheet();
  else sheet.style.transform = 'translateY(0)';
}
dragZone.addEventListener('pointerup', endSheetDrag);
dragZone.addEventListener('pointercancel', endSheetDrag);

/* ---------- ny ting ---------- */

function openAddSheet(){
  showSheet(`
    <div class="sheet-title">Ny ting på ønskelisten</div>
    <div class="field">
      <label for="sName">Hva vil du kjøpe</label>
      <input type="text" id="sName" placeholder="F.eks. Vinterjakke" autocomplete="off">
    </div>
    <div class="field amount-field">
      <label for="sPrice">Pris</label>
      <input type="text" id="sPrice" placeholder="0" inputmode="decimal">
      <span class="amount-suffix">${cur().symbol}</span>
    </div>
    <button class="sheet-submit" id="sSubmit" type="button">Legg nederst på listen</button>
  `);
  const nameEl = $('#sName'), priceEl = $('#sPrice');
  bindAmountInput(priceEl);
  $('#sSubmit').addEventListener('click', () => {
    const name = nameEl.value.trim();
    const price = parseAmount(priceEl.value);
    if(!name){ nameEl.focus(); return; }
    if(!price || price <= 0){ priceEl.focus(); return; }
    wl.items.push({ id:cryptoId(), name, price:round2(price) });
    save();
    render();
    closeSheet();
  });
  setTimeout(() => nameEl.focus(), 350);
}
$('#fabAdd').addEventListener('click', openAddSheet);

/* ---------- endre «jeg har nå» ---------- */

function openCashSheet(){
  showSheet(`
    <div class="sheet-title">Hva har du å rutte med nå?</div>
    <div class="field amount-field">
      <label for="sCash">Beløp</label>
      <input type="text" id="sCash" placeholder="0" inputmode="decimal"
             value="${wl.cash ? String(wl.cash).replace('.', ',') : ''}">
      <span class="amount-suffix">${cur().symbol}</span>
    </div>
    <button class="sheet-submit" id="sSave" type="button">Lagre</button>
  `);
  const el = $('#sCash');
  bindAmountInput(el);
  $('#sSave').addEventListener('click', () => {
    const v = el.value.trim() === '' ? 0 : parseAmount(el.value);
    if(isNaN(v) || v < 0){ el.focus(); return; }
    wl.cash = round2(v);
    save();
    render();
    closeSheet();
  });
  setTimeout(() => { el.focus(); el.select(); }, 350);
}
$('#cashEdit').addEventListener('click', (e) => { e.stopPropagation(); openCashSheet(); });

/* ---------- kombinasjoner (dobbelttrykk på boks) ---------- */

function openCombos(id){
  const s = SCENARIOS[id];
  const t = debtTotals();
  const avail = available(id);
  const p = plan(id);
  const total = listTotal();
  const nOk = p.filter(r => r.ok).length;

  /* regnestykket */
  let rows = `<div class="formula-row"><span>Jeg har nå</span><span>${fmt(wl.cash)}</span></div>`;
  if(s.credit) rows += `<div class="formula-row"><span>+ De skylder deg</span><span class="pos">${fmt(t.credit)}</span></div>`;
  if(s.debit)  rows += `<div class="formula-row"><span>− Du skylder</span><span class="neg">${fmt(t.debit)}</span></div>`;
  rows += `<div class="formula-row"><span>= Til rådighet</span><span>${fmt(avail)}</span></div>`;

  /* hva pengene rekker til */
  let items;
  if(p.length === 0){
    items = '<div class="combo-empty">Ingen ting på listen ennå.</div>';
  } else {
    items = p.map((r, i) => `
      <div class="combo-item ${r.ok ? 'ok' : 'no'}">
        <span class="dot">${r.ok ? '✓' : i + 1}</span>
        <span class="nm">${escapeHtml(r.item.name)}</span>
        <span class="rt">${r.ok ? 'igjen ' + fmt(r.left) : 'mangler ' + fmt(-r.left)}</span>
      </div>`).join('');
  }

  let summary = '';
  if(p.length){
    if(nOk === p.length){
      summary = `Du har råd til alt på listen og sitter igjen med <b>${fmt(avail - total)}</b>.`;
    } else if(nOk === 0){
      summary = `Du har ikke råd til første ting ennå. Det mangler <b>${fmt(p[0].cum - avail)}</b>.`;
    } else {
      summary = `Du har råd til <b>${nOk} av ${p.length}</b> og sitter igjen med <b>${fmt(p[nOk - 1].left)}</b>. ` +
                `Neste ting mangler <b>${fmt(p[nOk].cum - avail)}</b>, og hele listen mangler <b>${fmt(total - avail)}</b>.`;
    }
  }

  /* sammenligning av alle kombinasjoner */
  const compare = ORDER.map(k => {
    const a = available(k);
    const n = plan(k).filter(r => r.ok).length;
    return `
      <button type="button" class="compare-row ${k === id ? 'current' : ''}" data-id="${k}">
        <span class="nm">${SCENARIOS[k].label}</span>
        <span class="cnt">${p.length ? n + ' av ' + p.length : ''}</span>
        <span class="amt ${a < 0 ? 'neg' : ''}">${fmt(a)}</span>
      </button>`;
  }).join('');

  showSheet(`
    <div class="sheet-title">${s.title}</div>
    <div class="combo-big ${avail < 0 ? 'neg' : ''}">${fmt(avail)}</div>
    <div class="combo-sub">til rådighet i denne kombinasjonen</div>
    <div class="formula">${rows}</div>
    <div class="section-label">Dette rekker pengene til</div>
    <div class="combo-list">${items}</div>
    <p class="combo-summary">${summary}</p>
    <div class="section-label">Alle kombinasjoner</div>
    <div class="compare">${compare}</div>
  `);

  sheetBody.querySelectorAll('.compare-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.id;
      wl.scenario = k;
      save();
      render();
      openCombos(k);
    });
  });
}

/* ---------- tilbake-knappen i Android-appen ---------- */

window.onAndroidBack = function(){
  if(sheet.classList.contains('open')){ closeSheet(); return true; }
  if(openRow){ closeOpenRow(); return true; }
  return false;
};

/* ---------- init ---------- */
render();
