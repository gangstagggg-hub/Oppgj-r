/* ==========================================================
   Oppgjør — app.js
   Data lagres i localStorage slik at ingenting forsvinner
   mellom økter, selv om appen kjøres helt uten nett.
   ========================================================== */

const STORAGE_KEY = 'oppgjor:v1';

function cryptoId(){
  if(window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

const currencies = {
  USD: { symbol:'$',   position:'before' },
  AUD: { symbol:'A$',  position:'before' },
  BRL: { symbol:'R$',  position:'before' },
  GBP: { symbol:'£',   position:'before' },
  DKK: { symbol:'kr',  position:'after'  },
  EUR: { symbol:'€',   position:'before' },
  PHP: { symbol:'₱',   position:'before' },
  HKD: { symbol:'HK$', position:'before' },
  INR: { symbol:'₹',   position:'before' },
  IDR: { symbol:'Rp',  position:'before' },
  ISK: { symbol:'kr',  position:'after'  },
  ILS: { symbol:'₪',   position:'before' },
  JPY: { symbol:'¥',   position:'before' },
  CAD: { symbol:'C$',  position:'before' },
  CNY: { symbol:'¥',   position:'before' },
  MYR: { symbol:'RM',  position:'before' },
  MXN: { symbol:'MX$', position:'before' },
  NZD: { symbol:'NZ$', position:'before' },
  NOK: { symbol:'kr',  position:'after'  },
  PLN: { symbol:'zł',  position:'after'  },
  RON: { symbol:'lei', position:'after'  },
  RUB: { symbol:'₽',   position:'after'  },
  SGD: { symbol:'S$',  position:'before' },
  CHF: { symbol:'CHF', position:'before' },
  SEK: { symbol:'kr',  position:'after'  },
  ZAR: { symbol:'R',   position:'before' },
  KRW: { symbol:'₩',   position:'before' },
  THB: { symbol:'฿',   position:'before' },
  CZK: { symbol:'Kč',  position:'after'  },
  TRY: { symbol:'₺',   position:'before' },
  HUF: { symbol:'Ft',  position:'after'  },
  VND: { symbol:'₫',   position:'after'  }
};

/* ---------- state ---------- */

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && Array.isArray(parsed.entries)) return parsed;
    }
  }catch(e){ /* korrupt lagring — start på nytt */ }
  const fresh = { currency:'NOK', entries: [] };
  saveState(fresh);
  return fresh;
}

function saveState(s){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }catch(e){ /* lagring kan feile i privat nettlesing — appen funker fortsatt i økten */ }
}

let state = loadState();

/* ---------- hjelpefunksjoner ---------- */

function formatAmount(value, code){
  const cur = currencies[code] || currencies.NOK;
  const num = Number(Math.abs(value)).toLocaleString('nb-NO', { maximumFractionDigits: 2 });
  return cur.position === 'before' ? cur.symbol + num : num + ' ' + cur.symbol;
}

function parseAmountInput(str){
  if(!str) return NaN;
  const normalized = str.trim().replace(',', '.');
  return parseFloat(normalized);
}

function initialsFromName(name){
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if(parts.length === 0) return '?';
  if(parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}

function relativeTime(timestamp){
  const diffMs = Date.now() - timestamp;
  const day = 24*60*60*1000;
  const days = Math.floor(diffMs / day);
  if(days <= 0) return 'i dag';
  if(days === 1) return 'i går';
  if(days < 7) return days + ' dager siden';
  const weeks = Math.floor(days / 7);
  if(weeks === 1) return '1 uke siden';
  if(weeks < 5) return weeks + ' uker siden';
  const months = Math.floor(days / 30);
  if(months <= 1) return '1 måned siden';
  return months + ' måneder siden';
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- rendering ---------- */

function groupByName(entries){
  const map = new Map();
  entries.forEach(e => {
    const key = e.name.trim().toLowerCase();
    if(!map.has(key)){
      map.set(key, { key, name: e.name.trim(), mode: e.mode, total: 0, items: [] });
    }
    const g = map.get(key);
    g.total += e.amount;
    g.items.push(e);
  });
  const groups = Array.from(map.values());
  groups.forEach(g => g.items.sort((a,b) => b.createdAt - a.createdAt));
  groups.sort((a,b) => b.items[0].createdAt - a.items[0].createdAt);
  return groups;
}

function render(){
  const creditEntries = state.entries.filter(e => e.mode === 'credit');
  const debitEntries  = state.entries.filter(e => e.mode === 'debit');

  const creditTotal = creditEntries.reduce((sum, e) => sum + e.amount, 0);
  const debitTotal  = debitEntries.reduce((sum, e) => sum + e.amount, 0);
  const net = creditTotal - debitTotal;

  renderGroupList('creditList', groupByName(creditEntries), 'credit', 'Ingen skylder deg noe akkurat nå.');
  renderGroupList('debitList', groupByName(debitEntries), 'debit', 'Du skylder ingen noe. Bra jobbet.');

  setAmount('creditBubble', creditTotal);
  setAmount('debitBubble', debitTotal);
  setAmount('creditTotal', creditTotal);
  setAmount('debitTotal', debitTotal);

  const netEl = document.getElementById('netAmount');
  netEl.setAttribute('data-net-amount', net);
  const sign = net >= 0 ? '+' : '−';
  netEl.textContent = sign + formatAmount(net, state.currency);

  updateCurrencyChrome();

  /* hold sveip-tilstand og evt. åpent bunnark i sync med ny data */
  if(sheetLockedKey){
    const stillExists = state.entries.some(e => e.name.trim().toLowerCase() === sheetLockedKey && e.mode === sheetLockedMode);
    if(stillExists){
      renderBreakdown(sheetLockedKey, sheetLockedMode);
    } else {
      closeSheet();
    }
  }
}

function setAmount(id, value){
  const el = document.getElementById(id);
  el.setAttribute('data-amount', value);
  el.textContent = formatAmount(value, state.currency);
}

function renderGroupList(containerId, groups, mode, emptyText){
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if(groups.length === 0){
    const hint = document.createElement('div');
    hint.className = 'col-empty-hint';
    hint.textContent = emptyText;
    container.appendChild(hint);
    return;
  }

  groups.forEach(group => {
    const wrap = document.createElement('div');
    wrap.className = 'entry-wrap';
    wrap.dataset.key = group.key;

    const metaText = group.items.length > 1
      ? `${group.items.length} poster · sist ${relativeTime(group.items[0].createdAt)}`
      : `${escapeHtml(group.items[0].desc || 'Gjeld')} · ${relativeTime(group.items[0].createdAt)}`;

    wrap.innerHTML = `
      <div class="entry-delete-bg">
        <button class="entry-delete-btn" type="button">Slett</button>
      </div>
      <div class="entry ${mode}" data-open="false">
        <div class="entry-avatar">${escapeHtml(initialsFromName(group.name))}</div>
        <div class="entry-body">
          <div class="entry-name">${escapeHtml(group.name)}</div>
          <div class="entry-meta">${metaText}</div>
        </div>
        <div class="entry-amount" data-amount="${group.total}">${formatAmount(group.total, state.currency)}</div>
      </div>
    `;

    container.appendChild(wrap);
    attachEntryInteraction(wrap, group);
  });
}

/* ---------- sveip for å slette / dobbelttrykk for å legge til ---------- */

const SWIPE_OPEN_X = -84;
let openEntryWrap = null;

function closeOpenEntry(){
  if(openEntryWrap){
    const row = openEntryWrap.querySelector('.entry');
    row.style.transform = 'translateX(0px)';
    row.dataset.open = 'false';
    openEntryWrap = null;
  }
}

function attachEntryInteraction(wrap, group){
  const row = wrap.querySelector('.entry');
  const deleteBtn = wrap.querySelector('.entry-delete-btn');

  let startX = 0, startY = 0, baseX = 0, dragging = false, isTap = true;
  let lastTapTime = 0;

  row.addEventListener('pointerdown', (e) => {
    if(openEntryWrap && openEntryWrap !== wrap) closeOpenEntry();
    startX = e.clientX;
    startY = e.clientY;
    baseX = row.dataset.open === 'true' ? SWIPE_OPEN_X : 0;
    dragging = false;
    isTap = true;
    row.style.transition = 'none';
    row.setPointerCapture(e.pointerId);
  });

  row.addEventListener('pointermove', (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if(!dragging && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)){
      dragging = true;
      isTap = false;
    }
    if(dragging){
      const x = Math.min(0, Math.max(SWIPE_OPEN_X, baseX + dx));
      row.style.transform = `translateX(${x}px)`;
    }
  });

  function finishDrag(){
    row.style.transition = '';
    if(dragging){
      const currentX = new DOMMatrix(getComputedStyle(row).transform).m41;
      if(currentX < SWIPE_OPEN_X / 2){
        row.style.transform = `translateX(${SWIPE_OPEN_X}px)`;
        row.dataset.open = 'true';
        openEntryWrap = wrap;
      } else {
        row.style.transform = 'translateX(0px)';
        row.dataset.open = 'false';
        if(openEntryWrap === wrap) openEntryWrap = null;
      }
      dragging = false;
      return;
    }

    if(!isTap) return;

    if(row.dataset.open === 'true'){
      closeOpenEntry();
      return;
    }

    const now = Date.now();
    if(now - lastTapTime < 320){
      lastTapTime = 0;
      openSheetForGroup(group);
    } else {
      lastTapTime = now;
    }
  }

  row.addEventListener('pointerup', finishDrag);
  row.addEventListener('pointercancel', finishDrag);

  deleteBtn.addEventListener('click', () => {
    state.entries = state.entries.filter(e => !(e.name.trim().toLowerCase() === group.key && e.mode === group.mode));
    saveState(state);
    if(openEntryWrap === wrap) openEntryWrap = null;
    render();
  });
}

/* ---------- bunnark: låst "legg til på person" ---------- */

let sheetLockedKey = null;
let sheetLockedMode = null;
let sheetLockedName = null;

function renderBreakdown(key, entryMode){
  const items = state.entries
    .filter(e => e.name.trim().toLowerCase() === key && e.mode === entryMode)
    .sort((a,b) => b.createdAt - a.createdAt);

  const container = document.getElementById('sheetBreakdown');

  if(items.length === 0){
    container.innerHTML = '';
    return;
  }

  const rows = items.map(item => `
    <div class="breakdown-row" data-id="${item.id}">
      <div class="breakdown-info">
        <div class="breakdown-desc">${escapeHtml(item.desc || 'Gjeld')}</div>
        <div class="breakdown-date">${relativeTime(item.createdAt)}</div>
      </div>
      <div class="breakdown-amount">${formatAmount(item.amount, state.currency)}</div>
      <button class="breakdown-delete" type="button" data-id="${item.id}" aria-label="Slett post">×</button>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="breakdown-label">${entryMode === 'credit' ? 'Skylder deg' : 'Du skylder'} — tidligere beløp</div>
    <div class="breakdown-list">${rows}</div>
  `;

  container.querySelectorAll('.breakdown-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      state.entries = state.entries.filter(e => e.id !== id);
      saveState(state);
      render();
    });
  });
}

function openSheetForGroup(group){
  sheetLockedKey = group.key;
  sheetLockedMode = group.mode;
  sheetLockedName = group.name;

  fName.value = group.name;
  fName.readOnly = true;
  fAmount.value = '';
  fDesc.value = '';

  setMode(group.mode);
  toggleLocked = true;
  toggle.classList.add('locked');

  sheetTitle.textContent = group.name;
  renderBreakdown(sheetLockedKey, sheetLockedMode);

  openSheet();
  fAmount.focus();
}

function unlockSheet(){
  sheetLockedKey = null;
  sheetLockedMode = null;
  sheetLockedName = null;
  fName.readOnly = false;
  toggleLocked = false;
  toggle.classList.remove('locked');
  sheetTitle.textContent = 'Registrer ny gjeld';
  document.getElementById('sheetBreakdown').innerHTML = '';
}

/* ---------- valutavelger ---------- */

const currencyBtn = document.getElementById('currencyBtn');
const currencyBtnLabel = document.getElementById('currencyBtnLabel');
const currencyMenu = document.getElementById('currencyMenu');
const currencyOptions = document.querySelectorAll('.currency-option');
const amountSuffix = document.getElementById('amountSuffix');

function updateCurrencyChrome(){
  const code = state.currency;
  amountSuffix.textContent = currencies[code].symbol;
  currencyBtnLabel.textContent = currencies[code].symbol + ' ' + code;
  currencyOptions.forEach(opt => {
    opt.classList.toggle('selected', opt.getAttribute('data-code') === code);
  });
}

function toggleCurrencyMenu(open){
  const willOpen = open !== undefined ? open : !currencyMenu.classList.contains('open');
  currencyMenu.classList.toggle('open', willOpen);
  currencyBtn.classList.toggle('open', willOpen);
  currencyBtn.setAttribute('aria-expanded', String(willOpen));
}

currencyBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCurrencyMenu();
});

currencyOptions.forEach(opt => {
  opt.addEventListener('click', () => {
    state.currency = opt.getAttribute('data-code');
    saveState(state);
    render();
    toggleCurrencyMenu(false);
  });
});

document.addEventListener('click', (e) => {
  if(!currencyMenu.contains(e.target) && e.target !== currencyBtn){
    toggleCurrencyMenu(false);
  }
});

document.addEventListener('pointerdown', (e) => {
  if(openEntryWrap && !openEntryWrap.contains(e.target)){
    closeOpenEntry();
  }
});

/* ---------- bunnark: ny gjeld ---------- */

const fab = document.getElementById('fabOpen');
const overlay = document.getElementById('overlay');
const sheet = document.getElementById('sheet');
const sheetTitle = document.getElementById('sheetTitle');
const dragZone = document.getElementById('dragZone');
const btnDebit = document.getElementById('btnDebit');
const btnCredit = document.getElementById('btnCredit');
const fName = document.getElementById('fName');
const fAmount = document.getElementById('fAmount');
const fDesc = document.getElementById('fDesc');
const sheetSubmit = document.getElementById('sheetSubmit');

function openSheet(){
  overlay.classList.add('open');
  sheet.classList.add('open');
}
function closeSheet(){
  overlay.classList.remove('open');
  sheet.classList.remove('open');
  sheet.style.transform = '';
  unlockSheet();
}
function resetForm(){
  fName.value = '';
  fAmount.value = '';
  fDesc.value = '';
  setMode('debit');
}

fab.addEventListener('click', () => { unlockSheet(); resetForm(); openSheet(); });
overlay.addEventListener('click', closeSheet);

const toggle = document.getElementById('toggle');
const toggleSlider = document.getElementById('toggleSlider');
let mode = 'debit';
let toggleLocked = false;

function setMode(newMode){
  mode = newMode;
  toggleSlider.style.transform = mode === 'debit' ? 'translateX(0%)' : 'translateX(100%)';
  toggleSlider.style.background = mode === 'debit' ? 'var(--rust)' : 'var(--moss)';
  btnDebit.classList.toggle('active', mode === 'debit');
  btnCredit.classList.toggle('active', mode === 'credit');
}

btnDebit.addEventListener('click', () => { if(!toggleLocked) setMode('debit'); });
btnCredit.addEventListener('click', () => { if(!toggleLocked) setMode('credit'); });

/* sveip mellom "du skylder" og "skylder deg" */
let toggleDragging = false;
let toggleStartX = 0;
let toggleHalfWidth = 0;

toggle.addEventListener('pointerdown', (e) => {
  if(toggleLocked) return;
  toggleDragging = true;
  toggleStartX = e.clientX;
  toggleHalfWidth = toggle.offsetWidth / 2;
  toggleSlider.style.transition = 'none';
  toggle.setPointerCapture(e.pointerId);
});

toggle.addEventListener('pointermove', (e) => {
  if(!toggleDragging) return;
  const delta = e.clientX - toggleStartX;
  const base = mode === 'debit' ? 0 : toggleHalfWidth;
  const px = Math.min(Math.max(base + delta, 0), toggleHalfWidth);
  const percent = (px / toggleHalfWidth) * 100;
  toggleSlider.style.transform = `translateX(${percent}%)`;
  toggleSlider.style.background = percent > 50 ? 'var(--moss)' : 'var(--rust)';
});

function endToggleDrag(e){
  if(!toggleDragging) return;
  toggleDragging = false;
  toggleSlider.style.transition = '';
  const delta = e.clientX - toggleStartX;
  const base = mode === 'debit' ? 0 : toggleHalfWidth;
  const px = Math.min(Math.max(base + delta, 0), toggleHalfWidth);
  setMode(px > toggleHalfWidth / 2 ? 'credit' : 'debit');
}

toggle.addEventListener('pointerup', endToggleDrag);
toggle.addEventListener('pointercancel', endToggleDrag);

/* sveip ned for å lukke arket */
let startY = 0;
let currentY = 0;
let dragging = false;

dragZone.addEventListener('pointerdown', (e) => {
  dragging = true;
  startY = e.clientY;
  currentY = 0;
  sheet.classList.add('dragging');
  dragZone.setPointerCapture(e.pointerId);
});

dragZone.addEventListener('pointermove', (e) => {
  if(!dragging) return;
  currentY = Math.max(0, e.clientY - startY);
  sheet.style.transform = `translateY(${currentY}px)`;
});

function endDrag(){
  if(!dragging) return;
  dragging = false;
  sheet.classList.remove('dragging');
  const sheetHeight = sheet.offsetHeight;
  if(currentY > sheetHeight * 0.28 || currentY > 140){
    closeSheet();
  } else {
    sheet.style.transform = 'translateY(0)';
  }
}

dragZone.addEventListener('pointerup', endDrag);
dragZone.addEventListener('pointercancel', endDrag);

/* tillat komma eller punktum som desimalskilletegn i beløpsfeltet */
fAmount.addEventListener('input', () => {
  let v = fAmount.value;
  v = v.replace(/\./g, ',');
  v = v.replace(/[^0-9,]/g, '');
  const firstComma = v.indexOf(',');
  if(firstComma !== -1){
    v = v.slice(0, firstComma + 1) + v.slice(firstComma + 1).replace(/,/g, '');
    const parts = v.split(',');
    if(parts[1] && parts[1].length > 2) parts[1] = parts[1].slice(0, 2);
    v = parts[0] + ',' + (parts[1] !== undefined ? parts[1] : '');
  }
  fAmount.value = v;
});

/* legg til gjeld */
sheetSubmit.addEventListener('click', () => {
  const name = sheetLockedName || fName.value.trim();
  const entryMode = sheetLockedKey ? sheetLockedMode : mode;
  const amount = parseAmountInput(fAmount.value);

  if(!sheetLockedKey && !name){
    fName.focus();
    return;
  }
  if(!amount || amount <= 0){
    fAmount.focus();
    return;
  }

  state.entries.push({
    id: cryptoId(),
    mode: entryMode,
    name,
    desc: fDesc.value.trim(),
    amount,
    createdAt: Date.now()
  });
  saveState(state);
  render();

  if(sheetLockedKey){
    /* behold arket åpent slik at flere beløp kan legges til fortløpende */
    fAmount.value = '';
    fDesc.value = '';
    renderBreakdown(sheetLockedKey, sheetLockedMode);
    fAmount.focus();
  } else {
    closeSheet();
    resetForm();
  }
});

/* ---------- PWA: installasjon ---------- */

const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');
const installDismiss = document.getElementById('installDismiss');
const installSub = document.getElementById('installSub');

const DISMISS_KEY = 'oppgjor:installDismissed';
let deferredPrompt = null;

function isStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS(){
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
}
function wasDismissed(){
  return localStorage.getItem(DISMISS_KEY) === 'true';
}

function showInstallBanner(){
  if(isStandalone() || wasDismissed()) return;
  installBanner.classList.add('show');
}
function hideInstallBanner(){
  installBanner.classList.remove('show');
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = '';
  installSub.textContent = 'Bruk appen som en vanlig app, også uten nett.';
  showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  hideInstallBanner();
  deferredPrompt = null;
});

installBtn.addEventListener('click', async () => {
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  hideInstallBanner();
});

installDismiss.addEventListener('click', () => {
  localStorage.setItem(DISMISS_KEY, 'true');
  hideInstallBanner();
});

/* iOS Safari støtter ikke beforeinstallprompt — vis manuell veiledning i stedet */
if(isIOS() && !isStandalone() && !wasDismissed()){
  installBtn.style.display = 'none';
  installSub.textContent = 'Trykk Del-ikonet nederst i Safari, og velg "Legg til på Hjem-skjerm".';
  setTimeout(showInstallBanner, 1200);
}

/* ---------- service worker (offline-støtte) ---------- */

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline-støtte er valgfritt */ });
  });
}

/* ---------- init ---------- */
render();
