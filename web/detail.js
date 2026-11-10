/* ==========================================================
   Oppgjør — detail.js
   Detaljark for én gjeldspost: betalingslogg (kan redigeres)
   og interaktiv nedbetalingsberegner.
   Bruker globale: state, saveState, render, formatAmount,
   parseAmountInput, escapeHtml, showToast, Loan.
   ========================================================== */
const Detail = (function(){
  const sheetEl = document.getElementById('detail');
  const overlayEl = document.getElementById('detailOverlay');
  const bodyEl = document.getElementById('detailBody');
  const dragEl = document.getElementById('detailDrag');

  let entryId = null;
  let tab = 'log';
  let editing = null;      /* id på betaling som redigeres, 'new' eller 'start' */
  let calc = null;         /* { type, rate, payment, dom } */

  const entry = () => state.entries.find(e => e.id === entryId);
  const money = v => formatAmount(v, state.currency);
  const fmtNum = v => String(Math.round(v * 100) / 100).replace('.', ',');
  const monthName = day => Loan.dateOfDay(day).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const dateName = day => Loan.dateOfDay(day).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const isoOf = day => Loan.dateOfDay(day).toISOString().slice(0, 10);
  const dayFromIso = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : NaN; };
  const num = s => parseAmountInput(String(s || ''));
  const clean = el => { el.value = el.value.replace(/\./g, ',').replace(/[^0-9,]/g, '').replace(/,(?=.*,)/g, ''); };

  function open(id){
    entryId = id;
    const e = entry();
    if(!e) return;
    Loan.normalize(e);
    tab = 'log';
    editing = null;
    calc = defaultCalc(e);
    draw();
    overlayEl.classList.add('open');
    sheetEl.classList.add('open');
  }
  function close(){
    overlayEl.classList.remove('open');
    sheetEl.classList.remove('open');
    sheetEl.style.transform = '';
    entryId = null;
  }

  function defaultCalc(e){
    const b = Loan.currentBalance(e);
    const auto = e.auto && e.auto.enabled ? e.auto : null;
    const guess = Math.max(1, Math.round(b / 12 / 100) * 100 || Math.ceil(b / 12));
    return {
      type: e.rateType, rate: e.rate || 0,
      payment: auto ? auto.amount : guess,
      dom: auto ? auto.dom : Math.min(28, new Date().getDate())
    };
  }

  /* ---------------- hovedtegning ---------------- */
  function draw(){
    const e = entry();
    if(!e) return close();
    const sim = Loan.simulate(e, Loan.todayDay(), { rows: true });
    const b = sim.balance;
    const chips = [];
    if(e.rateType === 'yearly') chips.push(fmtNum(e.rate) + ' % årlig');
    if(e.rateType === 'daily') chips.push(fmtNum(e.rate) + ' % løpende');
    if(e.auto && e.auto.enabled) chips.push(money(e.auto.amount) + ' den ' + e.auto.dom + '.');

    bodyEl.innerHTML = `
      <div class="d-head ${e.mode}">
        <div class="d-who">${escapeHtml(e.name)} · ${escapeHtml(e.desc || 'Gjeld')}</div>
        <div class="d-bal">${b <= 0 ? 'Nedbetalt' : money(b)}</div>
        <div class="d-sub">${e.mode === 'credit' ? 'skylder deg' : 'du skylder'}${Math.abs(b - e.amount) > 0.005 ? ' · opprinnelig ' + money(e.amount) : ''}</div>
        <div class="d-chips">${chips.map(c => `<span>${escapeHtml(c)}</span>`).join('')}</div>
        <button type="button" class="d-more" id="dMore">+ Legg til mer på ${escapeHtml(e.name)}</button>
      </div>
      <div class="d-stats">
        <div><b>${money(sim.paid)}</b><span>betalt</span></div>
        <div><b>${money(sim.interest)}</b><span>renter lagt på</span></div>
      </div>
      <div class="seg d-tabs" id="dTabs">
        <button type="button" data-t="log" class="${tab === 'log' ? 'on' : ''}">Betalinger</button>
        <button type="button" data-t="plan" class="${tab === 'plan' ? 'on' : ''}">Nedbetaling</button>
      </div>
      <div id="dPane"></div>`;
    bodyEl.querySelector('#dMore').addEventListener('click', () => {
      const key = e.name.trim().toLowerCase();
      const g = groupByName(state.entries).find(x => x.key === key && x.mode === e.mode);
      close();
      if(g) openSheetForGroup(g);
    });
    bodyEl.querySelectorAll('#dTabs button').forEach(btn => btn.addEventListener('click', () => {
      tab = btn.dataset.t; editing = null; draw();
    }));
    if(tab === 'log') drawLog(sim); else drawPlan();
  }

  /* ---------------- betalingslogg ---------------- */
  function drawLog(sim){
    const e = entry();
    const pane = bodyEl.querySelector('#dPane');
    const rows = sim.rows.slice().reverse();
    const today = Loan.todayDay();

    const html = [];
    html.push(`<button type="button" class="d-add" id="dAdd">+ Registrer betaling</button>`);
    if(editing === 'new') html.push(editForm({ id: 'new', day: today, amount: '' }, true));

    rows.forEach(r => {
      if(r.type === 'interest'){
        html.push(`<div class="log-row interest"><div class="log-main"><div class="log-t">Renter ${r.kind === 'yearly' ? 'nyttår ' + (Loan.parts(r.day).y) : monthName(r.day)}</div><div class="log-d">${r.kind === 'yearly' ? 'Årlig rente' : 'Løpende rente'}</div></div><div class="log-a plus">+${money(r.amount)}</div></div>`);
        return;
      }
      const p = r.payment;
      if(editing === p.id){ html.push(editForm(p, false)); return; }
      const clipped = r.amount + 0.005 < r.entered;
      html.push(`<button type="button" class="log-row pay" data-id="${p.id}"><div class="log-main"><div class="log-t">${p.auto ? 'Autotrekk' : 'Betaling'}${p.auto ? '<i>auto</i>' : ''}</div><div class="log-d">${dateName(r.day)}${clipped ? ' · bare ' + money(r.amount) + ' trengtes' : ''}</div></div><div class="log-a minus">−${money(r.entered)}</div></button>`);
    });

    if(editing === 'start') html.push(editForm({ id: 'start', day: Loan.startDayOf(e), amount: e.amount }, false, true));
    else html.push(`<button type="button" class="log-row start" id="dStart"><div class="log-main"><div class="log-t">Opprettet</div><div class="log-d">${dateName(Loan.startDayOf(e))}</div></div><div class="log-a">${money(e.amount)}</div></button>`);

    if(!sim.rows.some(r => r.type === 'payment')) html.push(`<div class="d-empty">Ingen betalinger ennå. Registrer en, eller sett opp autotrekk under «Nedbetaling».</div>`);
    pane.innerHTML = html.join('');

    pane.querySelector('#dAdd').addEventListener('click', () => { editing = 'new'; draw(); });
    pane.querySelectorAll('.log-row.pay').forEach(el => el.addEventListener('click', () => { editing = el.dataset.id; draw(); }));
    const st = pane.querySelector('#dStart');
    if(st) st.addEventListener('click', () => { editing = 'start'; draw(); });
    wireEditForm(pane);
  }

  function editForm(p, isNew, isStart){
    return `<div class="log-edit" data-id="${p.id}">
      <div class="two">
        <div class="field amount-field"><label>${isStart ? 'Opprinnelig beløp' : 'Beløp'}</label><input type="text" class="ed-amt" inputmode="decimal" value="${p.amount === '' ? '' : fmtNum(p.amount)}" placeholder="0"><span class="amount-suffix">${escapeHtml(currencies[state.currency].symbol)}</span></div>
        <div class="field"><label>Dato</label><input type="date" class="ed-date" value="${isoOf(p.day)}"></div>
      </div>
      <div class="ed-btns">
        ${isNew || isStart ? '' : '<button type="button" class="ed-del">Slett</button>'}
        <button type="button" class="ed-cancel">Avbryt</button>
        <button type="button" class="ed-save">Lagre</button>
      </div></div>`;
  }

  function wireEditForm(pane){
    const f = pane.querySelector('.log-edit');
    if(!f) return;
    const e = entry();
    const id = f.dataset.id;
    const amt = f.querySelector('.ed-amt'), date = f.querySelector('.ed-date');
    amt.addEventListener('input', () => clean(amt));
    f.querySelector('.ed-cancel').addEventListener('click', () => { editing = null; draw(); });
    f.querySelector('.ed-save').addEventListener('click', () => {
      const a = num(amt.value), d = dayFromIso(date.value);
      if(!(a > 0)){ amt.focus(); return; }
      if(isNaN(d)){ date.focus(); return; }
      if(id === 'new') e.payments.push({ id: cryptoId(), day: d, amount: a, auto: false });
      else if(id === 'start'){ e.amount = a; e.startDay = d; e.rateHistory[0].day = d; }
      else { const p = e.payments.find(x => x.id === id); if(p){ p.amount = a; p.day = d; } }
      editing = null; commit();
    });
    const del = f.querySelector('.ed-del');
    if(del) del.addEventListener('click', () => {
      const idx = e.payments.findIndex(x => x.id === id);
      if(idx < 0) return;
      const [removed] = e.payments.splice(idx, 1);
      editing = null; commit();
      showToast(removed.auto ? 'Autotrekket er fjernet' : 'Betalingen er slettet', () => {
        const ent = state.entries.find(x => x.id === entryId || x === e);
        if(ent){ ent.payments.push(removed); saveState(state); render(); if(entryId === ent.id) draw(); }
      });
    });
  }

  function commit(){
    saveState(state);
    render();
    draw();
  }

  /* ---------------- nedbetalingsberegner ---------------- */
  function drawPlan(){
    const e = entry();
    const pane = bodyEl.querySelector('#dPane');
    const b = Loan.currentBalance(e);
    if(b <= 0){ pane.innerHTML = '<div class="d-empty">Denne posten er nedbetalt. Ingenting mer å beregne.</div>'; return; }
    const sym = escapeHtml(currencies[state.currency].symbol);
    pane.innerHTML = `
      <div class="calc">
        <div class="calc-result" id="cRes"></div>
        <div class="calc-chart" id="cChart"></div>
        <div class="calc-split" id="cSplit"></div>

        <div class="c-block">
          <div class="c-row"><span class="c-lab">Månedlig betaling</span>
            <div class="stepper"><button type="button" data-step="pay-">−</button><div class="amount-field"><input type="text" id="cPay" inputmode="decimal"><span class="amount-suffix">${sym}</span></div><button type="button" data-step="pay+">+</button></div></div>
          <input type="range" id="cPaySl" min="0" max="${Math.max(100, Math.ceil(b))}" step="50" aria-label="Månedlig betaling">
          <div class="chips" id="cQuick"></div>
        </div>

        <div class="c-block">
          <div class="c-row"><span class="c-lab">Rente</span>
            <div class="seg seg-sm" id="cType"><button type="button" data-v="none">Ingen</button><button type="button" data-v="yearly">Årlig</button><button type="button" data-v="daily">Løpende</button></div></div>
          <div id="cRateWrap">
            <div class="c-row"><span class="c-lab">Rente per år</span>
              <div class="stepper"><button type="button" data-step="rate-">−</button><div class="amount-field"><input type="text" id="cRate" inputmode="decimal"><span class="amount-suffix">%</span></div><button type="button" data-step="rate+">+</button></div></div>
            <input type="range" id="cRateSl" min="0" max="30" step="0.25" aria-label="Rente">
          </div>
        </div>

        <div class="c-block">
          <div class="c-row"><span class="c-lab">Trekkes den</span>
            <div class="stepper"><button type="button" data-step="dom-">−</button><div class="amount-field"><input type="text" id="cDom" inputmode="numeric"></div><button type="button" data-step="dom+">+</button></div></div>
        </div>

        <div class="calc-cmp" id="cCmp"></div>
        <div class="c-actions">
          <button type="button" class="ed-cancel" id="cReset">Tilbakestill</button>
          <button type="button" class="ed-save" id="cSave">Bruk som plan</button>
        </div>
        <button type="button" class="c-off" id="cOff" hidden>Slå av autotrekk</button>
      </div>`;
    wireCalc();
    syncInputs();
    updateCalc();
  }

  function wireCalc(){
    const $ = id => bodyEl.querySelector(id);
    const e = entry();
    const b = Loan.currentBalance(e);
    const maxPay = () => Math.max(100, Math.ceil(b));

    $('#cPay').addEventListener('input', () => { clean($('#cPay')); calc.payment = num($('#cPay').value) || 0; syncInputs('cPay'); updateCalc(); });
    $('#cPaySl').addEventListener('input', () => { calc.payment = +$('#cPaySl').value; syncInputs('cPaySl'); updateCalc(); });
    $('#cRate').addEventListener('input', () => { clean($('#cRate')); calc.rate = num($('#cRate').value) || 0; syncInputs('cRate'); updateCalc(); });
    $('#cRateSl').addEventListener('input', () => { calc.rate = +$('#cRateSl').value; syncInputs('cRateSl'); updateCalc(); });
    $('#cDom').addEventListener('input', () => { $('#cDom').value = $('#cDom').value.replace(/\D/g, '').slice(0, 2); calc.dom = Math.min(28, Math.max(1, +$('#cDom').value || 1)); updateCalc(); });
    $('#cDom').addEventListener('blur', syncInputs);
    $('#cType').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      calc.type = btn.dataset.v;
      if(calc.type !== 'none' && !calc.rate) calc.rate = 5;
      syncInputs(); updateCalc();
    }));
    bodyEl.querySelectorAll('[data-step]').forEach(btn => {
      const [k, dir] = [btn.dataset.step.slice(0, -1), btn.dataset.step.slice(-1) === '+' ? 1 : -1];
      let timer = null, hold = null;
      const apply = () => {
        if(k === 'pay'){ const step = calc.payment >= 10000 ? 500 : calc.payment >= 2000 ? 250 : 100; calc.payment = Math.max(0, calc.payment + dir * step); }
        if(k === 'rate') calc.rate = Math.min(60, Math.max(0, Math.round((calc.rate + dir * 0.25) * 100) / 100));
        if(k === 'dom') calc.dom = Math.min(28, Math.max(1, calc.dom + dir));
        syncInputs(); updateCalc();
      };
      btn.addEventListener('pointerdown', () => { apply(); hold = setTimeout(() => { timer = setInterval(apply, 90); }, 420); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, () => { clearTimeout(hold); clearInterval(timer); }));
    });
    $('#cReset').addEventListener('click', () => { calc = defaultCalc(entry()); syncInputs(); updateCalc(); });
    $('#cSave').addEventListener('click', () => savePlan());
    $('#cOff').addEventListener('click', () => {
      const ent = entry(); const prev = ent.auto ? { ...ent.auto } : null;
      ent.auto.enabled = false; saveState(state); render(); draw();
      showToast('Autotrekk er slått av', () => { ent.auto = prev; saveState(state); render(); if(entryId === ent.id) draw(); });
    });
  }

  function syncInputs(skip){
    const $ = id => bodyEl.querySelector(id);
    if(!$('#cPay')) return;
    const b = Loan.currentBalance(entry());
    const sl = $('#cPaySl'); sl.max = Math.max(100, Math.ceil(b), Math.ceil(calc.payment));
    if(skip !== 'cPay') $('#cPay').value = calc.payment ? fmtNum(calc.payment) : '';
    if(skip !== 'cPaySl') sl.value = calc.payment;
    if(skip !== 'cRate') $('#cRate').value = fmtNum(calc.rate);
    if(skip !== 'cRateSl') $('#cRateSl').value = calc.rate;
    if(skip !== 'cDom') $('#cDom').value = calc.dom;
    $('#cType').querySelectorAll('button').forEach(btn => btn.classList.toggle('on', btn.dataset.v === calc.type));
    $('#cRateWrap').style.display = calc.type === 'none' ? 'none' : '';
    paintSlider(sl); paintSlider($('#cRateSl'));
  }
  function paintSlider(sl){
    const pct = (sl.value - sl.min) / ((sl.max - sl.min) || 1) * 100;
    sl.style.setProperty('--p', pct + '%');
  }

  function updateCalc(){
    const $ = id => bodyEl.querySelector(id);
    if(!$('#cRes')) return;
    const e = entry();
    const b = Loan.currentBalance(e);
    const type = calc.type, rate = type === 'none' ? 0 : calc.rate;
    const p = Loan.project({ balance: b, type, rate, payment: calc.payment, dom: calc.dom });

    if(p.never){
      $('#cRes').innerHTML = calc.payment <= 0
        ? `<div class="r-big warn">Legg inn en månedlig betaling</div><div class="r-sub">Så ser du hvor lenge det varer og hva renten koster.</div>`
        : `<div class="r-big warn">Betalingen dekker ikke renten</div><div class="r-sub">Gjelden vokser. Øk betalingen, eller senk renten.</div>`;
      $('#cChart').innerHTML = ''; $('#cSplit').innerHTML = '';
    } else {
      $('#cRes').innerHTML = `
        <div class="r-lab">Ferdig om</div>
        <div class="r-big">${Loan.describeMonths(p.months)}</div>
        <div class="r-sub">sist betaling ${monthName(p.endDay)}</div>
        <div class="r-grid">
          <div><b>${money(p.interest)}</b><span>renter totalt</span></div>
          <div><b>${money(p.paid)}</b><span>betalt totalt</span></div>
        </div>`;
      $('#cChart').innerHTML = chartSvg(p, e);
      const principal = Math.max(0, p.paid - p.interest);
      const ip = p.paid > 0 ? (p.interest / p.paid * 100) : 0;
      $('#cSplit').innerHTML = `<div class="split-bar"><i style="width:${100 - ip}%"></i><i class="int" style="width:${ip}%"></i></div>
        <div class="split-leg"><span><u></u>Avdrag ${money(principal)}</span><span><u class="int"></u>Renter ${money(p.interest)} (${Math.round(ip)} %)</span></div>`;
    }

    /* hurtigvalg: ferdig på N år */
    const q = $('#cQuick');
    if(!q.dataset.built){
      q.dataset.built = '1';
      q.innerHTML = [1, 2, 3, 5, 10].map(y => `<button type="button" data-y="${y}">${y} år</button>`).join('');
      q.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
        const months = +btn.dataset.y * 12;
        const t = calc.type, r = t === 'none' ? 0 : calc.rate;
        calc.payment = Loan.paymentFor(Loan.currentBalance(entry()), t, r, months, calc.dom);
        syncInputs(); updateCalc();
      }));
    }

    /* sammenligning mot lagret plan */
    const saved = savedPlan(e, b);
    const cmp = $('#cCmp');
    const same = saved && saved.type === type && Math.abs(saved.rate - rate) < 0.001 && Math.abs(saved.payment - calc.payment) < 0.005 && saved.dom === calc.dom;
    if(saved && !same && !p.never && !saved.res.never){
      const dm = p.months - saved.res.months, di = p.interest - saved.res.interest;
      const mTxt = dm === 0 ? 'like lang tid' : Loan.describeMonths(Math.abs(dm)) + (dm < 0 ? ' raskere' : ' lengre');
      const iTxt = Math.abs(di) < 0.5 ? 'samme rentekostnad' : money(Math.abs(di)) + (di < 0 ? ' mindre renter' : ' mer renter');
      cmp.innerHTML = `<b>Mot lagret plan:</b> ${mTxt}, ${iTxt}.`;
      cmp.hidden = false;
    } else if(saved && same){
      cmp.innerHTML = 'Dette er den lagrede planen.'; cmp.hidden = false;
    } else { cmp.hidden = true; }

    const hasAuto = e.auto && e.auto.enabled;
    $('#cSave').textContent = same ? 'Lagret' : (hasAuto ? 'Oppdater plan' : 'Bruk som plan');
    $('#cSave').disabled = !!same || calc.payment <= 0;
    $('#cOff').hidden = !hasAuto;
  }

  function savedPlan(e, b){
    if(!(e.auto && e.auto.enabled)) return null;
    const rate = e.rateType === 'none' ? 0 : e.rate;
    const res = Loan.project({ balance: b, type: e.rateType, rate, payment: e.auto.amount, dom: e.auto.dom });
    return { type: e.rateType, rate, payment: e.auto.amount, dom: e.auto.dom, res };
  }

  function savePlan(){
    const e = entry();
    if(!(calc.payment > 0)) return;
    const rateChanged = calc.type !== e.rateType || (calc.type !== 'none' && Math.abs(calc.rate - e.rate) > 0.0001);
    if(rateChanged) Loan.setRate(e, calc.type, calc.rate);   /* gjelder fra i dag, historikken beholdes */
    const wasOn = e.auto && e.auto.enabled;
    e.auto = {
      enabled: true, amount: calc.payment, dom: calc.dom,
      from: wasOn ? e.auto.from : Loan.todayDay(),
      cursor: wasOn ? e.auto.cursor : null
    };
    Loan.catchUp(e);
    editing = null;
    saveState(state); render();
    tab = 'plan'; draw();
    showToast('Planen er lagret. Autotrekk er på.');
  }

  function chartSvg(p, e){
    const W = 320, H = 150, L = 6, R = 6, T = 10, B = 22;
    const s = p.series;
    if(s.length < 2) return '';
    const d0 = s[0].day, d1 = s[s.length - 1].day;
    const maxY = Math.max(...s.map(x => x.balance), 1);
    const X = d => L + (d - d0) / ((d1 - d0) || 1) * (W - L - R);
    const Y = v => T + (1 - v / maxY) * (H - T - B);
    const pts = s.map(x => `${X(x.day).toFixed(1)},${Y(x.balance).toFixed(1)}`);
    const line = 'M' + pts.join('L');
    const area = line + `L${X(d1).toFixed(1)},${(H - B).toFixed(1)}L${X(d0).toFixed(1)},${(H - B).toFixed(1)}Z`;
    const col = e.mode === 'credit' ? 'var(--moss-deep)' : 'var(--rust)';
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo over tid" preserveAspectRatio="none">
      <path d="${area}" fill="${col}" opacity=".14"/>
      <path d="${line}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="rgba(29,42,34,.2)"/>
    </svg>
    <div class="chart-ax"><span>${monthName(d0)}</span><span>${monthName(d1)}</span></div>`;
  }

  /* ---------------- lukke: sveip ned / overlay ---------------- */
  overlayEl.addEventListener('click', close);
  let dy0 = 0, dy = 0, dragging = false;
  dragEl.addEventListener('pointerdown', ev => { dragging = true; dy0 = ev.clientY; dy = 0; sheetEl.classList.add('dragging'); dragEl.setPointerCapture(ev.pointerId); });
  dragEl.addEventListener('pointermove', ev => { if(!dragging) return; dy = Math.max(0, ev.clientY - dy0); sheetEl.style.transform = `translateY(${dy}px)`; });
  function endDrag(){
    if(!dragging) return; dragging = false; sheetEl.classList.remove('dragging');
    if(dy > sheetEl.offsetHeight * 0.25 || dy > 140) close(); else sheetEl.style.transform = 'translateY(0)';
  }
  dragEl.addEventListener('pointerup', endDrag);
  dragEl.addEventListener('pointercancel', endDrag);

  return { open, close, isOpen: () => sheetEl.classList.contains('open') };
})();
