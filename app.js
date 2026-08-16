/* ==========================================================
   Oppgjør — app.js
   Data lagres i localStorage slik at ingenting forsvinner
   mellom økter, selv om appen kjøres helt uten nett.
   ========================================================== */

const STORAGE_KEY = 'oppgjor:v1';

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

function seedEntries(){
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return [
    { id: cryptoId(), mode:'credit', name:'Kari Nordmann', desc:'Bursdagsmiddag', amount:450, createdAt: now - 3*day },
    { id: cryptoId(), mode:'credit', name:'Ola Hansen',    desc:'Kinobilletter',  amount:180, createdAt: now - 7*day },
    { id: cryptoId(), mode:'credit', name:'Mari Berg',     desc:'Strøm januar',   amount:620, createdAt: now - 14*day },
    { id: cryptoId(), mode:'debit',  name:'Per Olsen',     desc:'Hyttetur, bensin', amount:300, createdAt: now - 5*day },
    { id: cryptoId(), mode:'debit',  name:'Lisa Dahl',     desc:'Take-away torsdag', amount:210, createdAt: now - 7*day }
  ];
}

function cryptoId(){
  if(window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && Array.isArray(parsed.entries)) return parsed;
    }
  }catch(e){ /* korrupt lagring — start på nytt */ }
  const fresh = { currency:'NOK', entries: seedEntries() };
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
  const num = Math.round(Math.abs(value)).toLocaleString('nb-NO');
  return cur.position === 'before' ? cur.symbol + num : num + ' ' + cur.symbol;
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

function render(){
  const credit = state.entries.filter(e => e.mode === 'credit').sort((a,b) => b.createdAt - a.createdAt);
  const debit  = state.entries.filter(e => e.mode === 'debit').sort((a,b) => b.createdAt - a.createdAt);

  const creditTotal = credit.reduce((sum, e) => sum + e.amount, 0);
  const debitTotal  = debit.reduce((sum, e) => sum + e.amount, 0);
  const net = creditTotal - debitTotal;

  renderList('creditList', credit, 'credit', 'Ingen skylder deg noe akkurat nå.');
  renderList('debitList', debit, 'debit', 'Du skylder ingen noe. Bra jobbet.');

  setAmount('creditBubble', creditTotal);
  setAmount('debitBubble', debitTotal);
  setAmount('creditTotal', creditTotal);
  setAmount('debitTotal', debitTotal);

  const netEl = document.getElementById('netAmount');
  netEl.setAttribute('data-net-amount', net);
  const sign = net >= 0 ? '+' : '−';
  netEl.textContent = sign + formatAmount(net, state.currency);

  updateCurrencyChrome();
}

function setAmount(id, value){
  const el = document.getElementById(id);
  el.setAttribute('data-amount', value);
  el.textContent = formatAmount(value, state.currency);
}

function renderList(containerId, entries, mode, emptyText){
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if(entries.length === 0){
    const hint = document.createElement('div');
    hint.className = 'col-empty-hint';
    hint.textContent = emptyText;
    container.appendChild(hint);
    return;
  }

  entries.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'entry ' + mode;
    row.innerHTML = `
      <div class="entry-avatar">${escapeHtml(initialsFromName(entry.name))}</div>
      <div class="entry-body">
        <div class="entry-name">${escapeHtml(entry.name)}</div>
        <div class="entry-meta">${escapeHtml(entry.desc || 'Gjeld')} · ${relativeTime(entry.createdAt)}</div>
      </div>
      <div class="entry-amount" data-amount="${entry.amount}">${formatAmount(entry.amount, state.currency)}</div>
    `;
    container.appendChild(row);
  });
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

/* ---------- bunnark: ny gjeld ---------- */

const fab = document.getElementById('fabOpen');
const overlay = document.getElementById('overlay');
const sheet = document.getElementById('sheet');
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
}
function resetForm(){
  fName.value = '';
  fAmount.value = '';
  fDesc.value = '';
  setMode('debit');
}

fab.addEventListener('click', () => { resetForm(); openSheet(); });
overlay.addEventListener('click', closeSheet);

const toggle = document.getElementById('toggle');
const toggleSlider = document.getElementById('toggleSlider');
let mode = 'debit';

function setMode(newMode){
  mode = newMode;
  toggleSlider.style.transform = mode === 'debit' ? 'translateX(0%)' : 'translateX(100%)';
  toggleSlider.style.background = mode === 'debit' ? 'var(--rust)' : 'var(--moss)';
  btnDebit.classList.toggle('active', mode === 'debit');
  btnCredit.classList.toggle('active', mode === 'credit');
}

btnDebit.addEventListener('click', () => setMode('debit'));
btnCredit.addEventListener('click', () => setMode('credit'));

/* sveip mellom "du skylder" og "skylder deg" */
let toggleDragging = false;
let toggleStartX = 0;
let toggleHalfWidth = 0;

toggle.addEventListener('pointerdown', (e) => {
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

/* legg til ny gjeld */
sheetSubmit.addEventListener('click', () => {
  const name = fName.value.trim();
  const amount = parseInt(fAmount.value.replace(/\D/g, ''), 10);

  if(!name){
    fName.focus();
    return;
  }
  if(!amount || amount <= 0){
    fAmount.focus();
    return;
  }

  state.entries.push({
    id: cryptoId(),
    mode,
    name,
    desc: fDesc.value.trim(),
    amount,
    createdAt: Date.now()
  });
  saveState(state);
  render();
  closeSheet();
  resetForm();
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
