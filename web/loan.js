/* ==========================================================
   Oppgjør — loan.js
   Beregningsmotor for saldo, autotrekk, renter og nedbetaling.
   Alt regnes ut fra dagnummer (UTC-dager), og saldoen utledes
   alltid fra postens hendelser. Da gir en redigert eller slettet
   betaling automatisk riktig saldo og riktige renter.
   ========================================================== */
(function(root){
  const DAY_MS = 86400000;
  const MAX_DAYS = 365 * 100;

  function dayOf(date){
    const d = date || new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
  }
  function todayDay(){ return dayOf(new Date()); }
  function dateOfDay(day){ return new Date(day * DAY_MS); }           /* UTC-felt */
  function parts(day){
    const d = dateOfDay(day);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
  }
  function daysInMonth(y, m){ return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
  function monthIndex(day){ const p = parts(day); return p.y * 12 + p.m; }
  function payDayFor(mi, dom){
    const y = Math.floor(mi / 12), m = mi % 12;
    return Math.floor(Date.UTC(y, m, Math.min(dom, daysInMonth(y, m))) / DAY_MS);
  }
  function r2(x){ return Math.round(x * 100) / 100; }
  function startDayOf(e){
    return typeof e.startDay === 'number' ? e.startDay : dayOf(new Date(e.createdAt || Date.now()));
  }

  /* sørger for at en post har alle låne-feltene (gamle poster får "ingen rente, ingen betalinger") */
  function normalize(e){
    if(!Array.isArray(e.payments)) e.payments = [];
    if(!e.rateType) e.rateType = 'none';
    if(typeof e.rate !== 'number' || !isFinite(e.rate)) e.rate = 0;
    if(!Array.isArray(e.rateHistory) || !e.rateHistory.length){
      e.rateHistory = [{ day: startDayOf(e), rate: e.rate }];
    }
    if(!e.auto) e.auto = null;
    return e;
  }

  function rateAt(e, day){
    let r = e.rateHistory[0].rate;
    for(const h of e.rateHistory){ if(h.day <= day) r = h.rate; else break; }
    return r;
  }

  /* Endrer renten fra og med en gitt dag uten å skrive om historikken. */
  function setRate(e, type, rate, fromDay){
    normalize(e);
    e.rateType = type;
    e.rate = type === 'none' ? 0 : rate;
    const day = fromDay === undefined ? todayDay() : fromDay;
    if(day <= startDayOf(e)){
      e.rateHistory = [{ day: startDayOf(e), rate: e.rate }];
    } else {
      e.rateHistory = e.rateHistory.filter(h => h.day < day);
      e.rateHistory.push({ day, rate: e.rate });
    }
  }

  /*
    Spiller av hele historikken til og med untilDay.
    Rekkefølge hver dag: (nyttårsrente) → betalinger → (daglig rente).
    Årsrenten legges til ved overgangen 31. des → 1. jan, med full årsrente
    på saldoen akkurat da. Daglig rente = årsrente / 365 per dag.
    opts: { rows, stopAtZero }
  */
  function simulate(e, untilDay, opts){
    opts = opts || {};
    normalize(e);
    const start = startDayOf(e);
    const pays = e.payments.slice().sort((a, b) => a.day - b.day);
    let bal = r2(Number(e.amount) || 0);
    let interest = 0, paid = 0, pi = 0;
    const rows = opts.rows ? [] : null;
    let monthAcc = 0, monthKey = null;

    function flushMonth(day){
      if(rows && monthAcc > 0){
        rows.push({ type: 'interest', kind: 'daily', day, amount: r2(monthAcc) });
      }
      monthAcc = 0;
    }

    const last = Math.min(untilDay, start + MAX_DAYS);
    for(let d = start; d <= last; d++){
      const p = parts(d);

      if(e.rateType === 'yearly' && d > start && p.m === 0 && p.d === 1 && bal > 0){
        const add = r2(bal * rateAt(e, d - 1) / 100);
        if(add > 0){
          bal = r2(bal + add); interest = r2(interest + add);
          if(rows) rows.push({ type: 'interest', kind: 'yearly', day: d - 1, amount: add });
        }
      }

      while(pi < pays.length && pays[pi].day <= d){
        const pay = pays[pi++];
        const applied = Math.min(Math.max(0, Number(pay.amount) || 0), bal);
        bal = r2(bal - applied); paid = r2(paid + applied);
        if(rows) rows.push({ type: 'payment', day: Math.max(pay.day, start), amount: applied, entered: Number(pay.amount) || 0, payment: pay });
      }

      if(e.rateType === 'daily' && d > start && bal > 0){
        const mk = p.y * 12 + p.m;
        if(monthKey !== null && mk !== monthKey){ flushMonth(d - 1); }
        monthKey = mk;
        const add = r2(bal * rateAt(e, d) / 100 / 365);
        if(add > 0){ bal = r2(bal + add); interest = r2(interest + add); monthAcc += add; }
      }

      if(opts.stopAtZero && bal <= 0 && pi >= pays.length) break;
    }
    if(e.rateType === 'daily') flushMonth(last);
    if(rows) rows.sort((a, b) => a.day - b.day || (a.type === 'interest' ? -1 : 1));
    return { balance: bal, interest, paid, rows: rows || [] };
  }

  function currentBalance(e, day){
    return simulate(e, day === undefined ? todayDay() : day).balance;
  }

  /*
    Autotrekk: legger inn de betalingene som er forfalt siden sist.
    Markøren (auto.cursor) husker siste behandlede måned, så en betaling
    brukeren har slettet aldri blir lagt inn på nytt.
  */
  function catchUp(e, today){
    normalize(e);
    const a = e.auto;
    if(!a || !a.enabled || !(a.amount > 0)) return false;
    today = today === undefined ? todayDay() : today;
    let changed = false;
    let mi = a.cursor === null || a.cursor === undefined ? monthIndex(a.from) : a.cursor + 1;
    if(a.cursor === null || a.cursor === undefined){
      if(payDayFor(mi, a.dom) < a.from) mi++;
    }
    for(; mi <= monthIndex(today) + 1; mi++){
      const day = payDayFor(mi, a.dom);
      if(day > today) break;
      if(simulate(e, day - 1).balance > 0){
        e.payments.push({ id: 'a' + mi + '-' + Math.random().toString(16).slice(2, 8), day, amount: a.amount, auto: true });
        changed = true;
      }
      a.cursor = mi;
      changed = true;
    }
    return changed;
  }

  /*
    Prognose fremover fra i dag.
    in: { balance, type, rate, payment, dom }
    out: { months, endDay, interest, paid, never, series }
  */
  function project(inp){
    const today = todayDay();
    const balance = r2(Number(inp.balance) || 0);
    const payment = Math.max(0, Number(inp.payment) || 0);
    const out = { months: 0, endDay: today, interest: 0, paid: 0, never: false, series: [{ day: today, balance }] };
    if(balance <= 0) return out;
    if(payment <= 0){
      out.never = true;
      return out;
    }
    const fake = {
      amount: balance, startDay: today, createdAt: 0,
      rateType: inp.type || 'none', rate: Number(inp.rate) || 0,
      rateHistory: [{ day: today, rate: Number(inp.rate) || 0 }],
      payments: [], auto: null
    };
    const dom = Math.min(28, Math.max(1, inp.dom || 1));
    let mi = monthIndex(today);
    if(payDayFor(mi, dom) <= today) mi++;
    const horizon = today + MAX_DAYS;
    for(let m = mi; ; m++){
      const day = payDayFor(m, dom);
      if(day > horizon) break;
      fake.payments.push({ day, amount: payment });
      if(fake.payments.length > 1200) break;
    }
    /* finn dagen saldoen når null */
    let lo = today, hi = horizon;
    if(simulate(fake, hi).balance > 0){
      out.never = true;
      out.interest = simulate(fake, hi).interest;
      return out;
    }
    while(lo < hi){
      const mid = (lo + hi) >> 1;
      if(simulate(fake, mid).balance <= 0) hi = mid; else lo = mid + 1;
    }
    const end = simulate(fake, lo);
    out.endDay = lo;
    out.interest = end.interest;
    out.paid = end.paid;
    out.months = Math.max(1, fake.payments.filter(p => p.day <= lo).length);
    /* kurve: én verdi per måned, maks ~120 punkter */
    const step = Math.max(1, Math.ceil(out.months / 120));
    for(let m = 1; m <= out.months; m += step){
      const day = Math.min(lo, fake.payments[m - 1].day);
      out.series.push({ day, balance: simulate(fake, day).balance });
    }
    if(out.series[out.series.length - 1].day < lo) out.series.push({ day: lo, balance: 0 });
    return out;
  }

  /* Hvilken månedlig betaling gir ferdig innen et gitt antall måneder? */
  function paymentFor(balance, type, rate, months, dom){
    if(balance <= 0 || months < 1) return 0;
    let lo = 0, hi = balance * 1.5 + 1;
    for(let i = 0; i < 40; i++){
      const mid = (lo + hi) / 2;
      const p = project({ balance, type, rate, payment: mid, dom });
      if(!p.never && p.months <= months) hi = mid; else lo = mid;
    }
    return Math.ceil(hi);
  }

  function describeMonths(n){
    if(n < 1) return 'ferdig';
    const y = Math.floor(n / 12), m = n % 12;
    const ys = y ? y + (y === 1 ? ' år' : ' år') : '';
    const ms = m ? m + (m === 1 ? ' måned' : ' måneder') : '';
    return [ys, ms].filter(Boolean).join(' og ');
  }

  root.Loan = {
    dayOf, todayDay, dateOfDay, parts, daysInMonth, monthIndex, payDayFor,
    normalize, rateAt, setRate, simulate, currentBalance, catchUp,
    project, paymentFor, describeMonths, startDayOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
