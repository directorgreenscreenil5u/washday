/* Washday live backend (Supabase). Loaded after app.js.
   While SUPABASE_URL / SUPABASE_KEY below are empty, this file does nothing and the site keeps
   working in demo mode. Only PUBLIC keys go here (the "anon" / "publishable" key). Never a secret key. */
var LIVE_CFG = { url: '', key: '' };
var SB = null, SNAP = null, LIVE_STAFF = false, LIVE_READY = false, PUSH_Q = Promise.resolve(), PUSH_T = null, LAST_PAYREF = null;
function isLive(){ return !!(LIVE_CFG.url && LIVE_CFG.key); }

(function(){
  if (!isLive()) return;
  var LKEY = 'washday_live';
  try { localStorage.removeItem('wd_staff'); } catch(e){}
  var st = document.createElement('style'); st.textContent = '.demo-note{display:none!important}'; document.head.appendChild(st);
  var cache = null; try { cache = JSON.parse(localStorage.getItem(LKEY)); } catch(e){}
  DB = cache || blank(); DB.handoffs = DB.handoffs || []; DB.tags = DB.tags || {};
  var _save = function(){ try { localStorage.setItem(LKEY, JSON.stringify(DB)); } catch(e){} };
  var me10 = function(p){ return String(p||'').replace(/\D/g,'').slice(-10); };
  var isDemoSession = function(){ var u = DB.session && DB.users[DB.session]; return !!(u && u.isDemo); };
  var clone = function(o){ return JSON.parse(JSON.stringify(o)); };
  var friendly = function(err){ var m = (err && (err.message || err.error_description || err.msg)) || String(err||''); 
    if (/payment required/i.test(m)) return 'Payment is needed for this. Please try again.';
    if (/no active plan/i.test(m)) return 'Your plan is not active yet.';
    if (/already booked/i.test(m)) return 'Your next plan pickup is already booked.';
    if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute and try again.';
    if (/invalid|expired/i.test(m) && /otp|token|code/i.test(m)) return 'That code is not right or has expired.';
    if (/network|fetch/i.test(m)) return 'No connection. Check your internet and try again.';
    return 'Something went wrong. Please try again.'; };

  // ---------- overrides that apply in live mode ----------
  nextId = function(){ var a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s=''; for (var i=0;i<6;i++) s += a[Math.floor(Math.random()*a.length)]; return 'WD-' + s; };
  var _newOrder = newOrder;
  newOrder = function(u, o){ var r = _newOrder(u, o); r.qty = o.qty || (LAST_PAYREF && UI.sch && UI.sch.qty) || {}; if (LAST_PAYREF){ r.payRef = LAST_PAYREF; } return r; };
  var _demoFill = demoFill; demoFill = function(u){ if (u && u.isDemo) return _demoFill(u); };
  var _roll = rollBilling; rollBilling = function(u){ if (u && u.isDemo) return _roll(u); };
  save = function(){ _save(); schedulePush(); };

  // ---------- Supabase client ----------
  function sbLoad(){
    if (SB) return Promise.resolve(SB);
    return loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js').then(function(){
      SB = window.supabase.createClient(LIVE_CFG.url, LIVE_CFG.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'wd_auth' } });
      SB.auth.onAuthStateChange(function(ev){ if (ev === 'SIGNED_OUT'){ if (!isDemoSession()){ DB = blank(); DB.handoffs=[]; DB.tags={}; SNAP=null; LIVE_STAFF=false; UI.staff=false; _save(); if (/^#\/app/.test(location.hash)) go(''); else route(); } } });
      return SB;
    });
  }
  function snapshot(){ var s = { u:{}, o:{}, t:{}, h:{} };
    Object.keys(DB.users).forEach(function(k){ s.u[k] = JSON.stringify(DB.users[k]); });
    DB.orders.forEach(function(o){ s.o[o.id] = JSON.stringify(o); });
    Object.keys(DB.tags||{}).forEach(function(k){ s.t[k] = JSON.stringify(DB.tags[k]); });
    (DB.handoffs||[]).forEach(function(h){ s.h[h.id] = JSON.stringify(h); });
    return s; }
  function replaceIn(target, src){ Object.keys(target).forEach(function(k){ delete target[k]; }); Object.assign(target, src); }

  async function pull(){
    var ses = (await SB.auth.getSession()).data.session; if (!ses){ return false; }
    var ph = me10(ses.user.phone);
    var st = await SB.from('staff').select('phone,name,role').eq('phone', ph).maybeSingle();
    LIVE_STAFF = !!(st.data); UI.staff = LIVE_STAFF; if (!LIVE_STAFF){ try { localStorage.removeItem('wd_staff'); } catch(e){} }
    var q = function(t, order){ var r = SB.from(t).select('*'); return order ? r.order(order, { ascending: true }) : r; };
    var res = await Promise.all([ q('profiles'), q('orders','created_at'), q('tags'), q('handoffs','created_at') ]);
    var err = res.find(function(r){ return r.error; }); if (err) throw err.error;
    var nu = {}; res[0].data.forEach(function(r){ nu[r.phone] = Object.assign({}, r.data, { phone: r.phone }); });
    DB.users = nu;
    DB.orders = res[1].data.map(function(r){ return Object.assign({ extras: [], flags: [], history: [] }, r.data, { id: r.id, phone: r.phone }); });
    DB.tags = {}; res[2].data.forEach(function(r){ DB.tags[r.code] = Object.assign({}, r.data, { code: r.code, phone: r.phone }); });
    DB.handoffs = res[3].data.map(function(r){ return Object.assign({}, r.data, { _rid: r.id, phone: r.phone, done: r.status === 'done' }); }).reverse();
    if (LIVE_STAFF){
      var wq = await Promise.all([ q('waitlist','created_at'), q('quotes','created_at') ]);
      DB.waitlist = (wq[0].data||[]).map(function(r){ return { _rid: r.id, area: r.area, phone: r.phone, at: Date.parse(r.created_at) }; });
      DB.quotes = (wq[1].data||[]).map(function(r){ return { _rid: r.id, org: r.org, phone: r.phone, need: r.need, at: Date.parse(r.created_at) }; });
    } else { DB.waitlist = []; DB.quotes = []; }
    DB.session = nu[ph] ? ph : null;
    SNAP = snapshot(); _save(); LIVE_READY = true;
    return { phone: ph, hasProfile: !!nu[ph] };
  }

  function schedulePush(){ if (!SB || !SNAP || isDemoSession()) return; clearTimeout(PUSH_T); PUSH_T = setTimeout(function(){ PUSH_Q = PUSH_Q.then(push).catch(function(e){ console.warn('washday sync', e); toast('Could not save your last change. Check your connection.'); }); }, 350); }
  async function push(){
    if (!SB || !SNAP || isDemoSession()) return;
    var mine = DB.session, changed = false;
    // profiles first (orders and tags point at them)
    for (var ph of Object.keys(DB.users)){
      if (!LIVE_STAFF && ph !== mine) continue;
      var j = JSON.stringify(DB.users[ph]); if (SNAP.u[ph] === j) continue;
      var r = await SB.from('profiles').upsert({ phone: ph, data: DB.users[ph] }).select().single();
      if (r.error){ toast(friendly(r.error)); return resync(); }
      replaceIn(DB.users[ph], Object.assign({}, r.data.data, { phone: ph })); SNAP.u[ph] = JSON.stringify(DB.users[ph]);
      if (SNAP.u[ph] !== j) changed = true;
    }
    for (var o of DB.orders.slice()){
      if (!LIVE_STAFF && o.phone !== mine) continue;
      var jo = JSON.stringify(o); if (SNAP.o[o.id] === jo) continue;
      var ro = await SB.from('orders').upsert({ id: o.id, phone: o.phone, data: o }).select().single();
      if (ro.error){ toast(friendly(ro.error)); return resync(); }
      replaceIn(o, Object.assign({ extras: [], flags: [], history: [] }, ro.data.data, { id: ro.data.id, phone: ro.data.phone })); SNAP.o[o.id] = JSON.stringify(o);
      if (SNAP.o[o.id] !== jo) changed = true;
    }
    if (LIVE_STAFF){
      for (var c of Object.keys(DB.tags||{})){
        var t = DB.tags[c], jt = JSON.stringify(t); if (SNAP.t[c] === jt) continue;
        var rt = await SB.from('tags').upsert({ code: c, phone: t.phone && DB.users[t.phone] ? t.phone : null, data: t });
        if (rt.error){ toast(friendly(rt.error)); return resync(); }
        SNAP.t[c] = jt;
      }
    }
    for (var h of (DB.handoffs||[])){
      var jh = JSON.stringify(h); if (SNAP.h[h.id] === jh) continue;
      if (!h._rid){
        if (h.phone !== mine) continue;
        var rh = await SB.from('handoffs').insert({ phone: h.phone, data: h }).select('id').single();
        if (rh.error){ toast(friendly(rh.error)); continue; }
        h._rid = rh.data.id;
      } else if (LIVE_STAFF){
        var uh = await SB.from('handoffs').update({ data: h, status: h.done ? 'done' : 'open' }).eq('id', h._rid);
        if (uh.error){ toast(friendly(uh.error)); continue; }
      }
      SNAP.h[h.id] = JSON.stringify(h);
    }
    _save();
    if (changed) rerender();
  }
  async function resync(){ try { await pull(); } catch(e){} rerender(); }

  // ---------- boot ----------
  sbLoad().then(function(){ return pull(); }).then(function(r){
    if (r === false && DB.session && !isDemoSession()){ DB.session = null; _save(); }
    route();
  }).catch(function(e){ console.warn('live boot', e); });
  document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible' && SB && SNAP && !isDemoSession()){ clearTimeout(PUSH_T); PUSH_Q = PUSH_Q.then(push).then(function(){ return pull(); }).then(function(){ rerender(); }).catch(function(){}); } });

  // ---------- login with real SMS codes ----------
  document.addEventListener('submit', function(e){
    var f = e.target, k = f.dataset && f.dataset.form; if (!k) return;
    var v = Object.fromEntries(new FormData(f).entries());
    if (k === 'waitlist' || k === 'quote'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (k === 'waitlist' && (!(v.area||'').trim() || normPhone(v.phone).length < 10)) return toast('Add your area and a valid phone number');
      if (k === 'quote' && (!(v.org||'').trim() || normPhone(v.phone).length < 10)) return toast('Add a name and valid phone number');
      var row = k === 'waitlist' ? { area: v.area.trim(), phone: v.phone.trim() } : { org: v.org.trim(), phone: v.phone.trim(), need: v.need || '' };
      sbLoad().then(function(){ return SB.from(k === 'waitlist' ? 'waitlist' : 'quotes').insert(row); }).then(function(r){
        if (r.error) return toast(friendly(r.error));
        if (k === 'waitlist'){ f.reset(); toast("You're on the waitlist. We'll message you.", true); } else { closeModal(); toast('Quote request sent. We will call you within one working day.', true); }
      }).catch(function(err){ toast(friendly(err)); });
      return;
    }
    if (k === 'auth-phone'){
      e.preventDefault(); e.stopImmediatePropagation();
      var ph = normPhone(v.phone); UI.authPhoneRaw = v.phone; UI.authName = v.name; UI.authEmail = v.email;
      if (ph.length !== 10){ UI.authErr = 'Enter a valid Nigerian phone number, e.g. 803 000 0000.'; return rerender(); }
      if (UI.authMode === 'signup' && (!v.name || v.name.trim().length < 2)){ UI.authErr = 'Please enter your full name.'; return rerender(); }
      UI.authBusy = true; UI.authErr = ''; rerender();
      sbLoad().then(function(){ return SB.auth.signInWithOtp({ phone: '+234' + ph }); }).then(function(r){
        UI.authBusy = false; if (r.error){ UI.authErr = friendly(r.error); return rerender(); }
        UI.authPhone = ph; UI.otp = null; UI.authStep = 'code'; rerender(); toast('Code sent by SMS', true);
      }).catch(function(err){ UI.authBusy = false; UI.authErr = friendly(err); rerender(); });
      return;
    }
    if (k === 'auth-code'){
      e.preventDefault(); e.stopImmediatePropagation();
      var code = [].slice.call(f.querySelectorAll('[data-otp]')).map(function(i){ return i.value; }).join('');
      if (!/^\d{6}$/.test(code)){ UI.authErr = 'Enter the 6-digit code.'; return rerender(); }
      var phc = UI.authPhone;
      SB.auth.verifyOtp({ phone: '+234' + phc, token: code, type: 'sms' }).then(async function(r){
        if (r.error){ UI.authErr = friendly(r.error); return rerender(); }
        var p = await pull();
        if (!p.hasProfile){
          var data = { name: (UI.authName || '').trim(), email: (UI.authEmail || '').trim(), addresses: [], notifs: { whatsapp: true, sms: false, email: true }, skips: [] };
          var ins = await SB.from('profiles').insert({ phone: phc, data: data });
          if (ins.error){ UI.authErr = friendly(ins.error); return rerender(); }
          await pull();
        }
        var after = UI.after, mode = UI.authMode; UI = { pickedPlan: UI.pickedPlan, staff: LIVE_STAFF };
        toast(mode === 'signup' ? 'Account created' : 'Welcome back', true);
        if (after && /^(staff|scan)/.test(after)) return go(after);
        if (!me().plan) go('subscribe'); else go(after && after.indexOf('app') === 0 ? after : 'app');
      }).catch(function(err){ UI.authErr = friendly(err); rerender(); });
      return;
    }
    if (k === 'staff-pin'){ e.preventDefault(); e.stopImmediatePropagation(); UI.after = location.hash.replace('#/','') || 'staff'; UI.authInit = false; go('login'); }
  }, true);

  document.addEventListener('click', function(e){
    var t = e.target.closest && e.target.closest('[data-act]'); if (!t) return; var a = t.dataset.act;
    if (a === 'logout'){
      if (isDemoSession()){ return; } // demo logout handled by app.js
      e.preventDefault(); e.stopImmediatePropagation();
      (SB ? SB.auth.signOut() : Promise.resolve()).finally(function(){ DB = blank(); DB.handoffs = []; DB.tags = {}; SNAP = null; LIVE_STAFF = false; _save(); UI = {}; toast('Logged out'); if (location.hash === '#/' || location.hash === '') route(); else go(''); });
    }
    if (a === 'auth-resend'){
      e.preventDefault(); e.stopImmediatePropagation();
      SB.auth.signInWithOtp({ phone: '+234' + UI.authPhone }).then(function(r){ if (r.error) toast(friendly(r.error)); else toast('New code sent', true); });
    }
    if (a === 'staff-out'){
      e.preventDefault(); e.stopImmediatePropagation();
      try { localStorage.removeItem('wd_staff'); } catch(e){}
      (SB ? SB.auth.signOut() : Promise.resolve()).finally(function(){ UI = {}; LIVE_STAFF = false; rerender(); });
    }
    if (a === 'reset-all'){ e.preventDefault(); e.stopImmediatePropagation(); toast('Not available on the live site'); }
    if (a === 'bill-apply' && !isDemoSession()){
      // mid-cycle upgrades are not charged online yet: every change starts at renewal
      var u = me(); if (!u) return; var kk = UI.bill && UI.bill.pick; if (!kk || kk === u.plan) return;
      e.preventDefault(); e.stopImmediatePropagation();
      u.pendingPlan = kk; UI.bill.panel = null; save(); rerender(); toast('Switching to ' + CONFIG.plans[kk].name + ' on ' + fmt(cycleOf(u).renew));
    }
  }, true);

  // ---------- staff: phone login replaces the PIN ----------
  var _staffLogin = staffLogin;
  staffLogin = function(title, sub, cta){
    if (LIVE_STAFF){ UI.staff = true; }
    var html = _staffLogin(title, sub, cta);
    return html.replace(/<form[^>]*data-form="staff-pin"[\s\S]*?<\/form>/, '<form data-form="staff-pin" class="sl-live"><p class="muted" style="margin:6px 0 16px">Use the phone number on the staff list. We will text you a code.</p><button class="btn btn-dark btn-lg" style="width:100%">Log in with phone</button>'
      + (SB && DB.session && !LIVE_STAFF ? '<p class="small" style="margin-top:12px;color:var(--red)">This number is not on the staff list.</p>' : '') + '</form>');
  };

  // ---------- payments through Paystack, checked by the server ----------
  function paystack(amount, meta, onPaid){
    var u = me(); if (!u){ toast('Please log in first'); return; }
    if (!CONFIG.paystackKey){
      modal('<h2 class="cardh" style="font-size:24px">Online payment is opening soon</h2><p class="muted" style="margin-top:8px">We have noted your request. Our team will contact you on 0' + esc(u.phone) + ' to complete payment.</p><div class="row" style="margin-top:20px"><button class="btn btn-dark" data-act="modal-close">OK</button></div>');
      askHuman('Wants to pay ' + naira(amount) + ' (' + (meta.desc || meta.purpose) + ')'); return;
    }
    loadScript('https://js.paystack.co/v2/inline.js').then(function(){
      var pop = new PaystackPop();
      pop.newTransaction({ key: CONFIG.paystackKey, email: (u.email && /@/.test(u.email)) ? u.email : '0' + u.phone + '@example.com', amount: Math.round(amount) * 100, currency: 'NGN',
        reference: 'WD-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
        metadata: Object.assign({ phone: '0' + u.phone, name: u.name }, meta),
        onSuccess: function(tx){
          toast('Payment received. Confirming…');
          SB.functions.invoke('paystack-verify', { body: { reference: tx.reference } }).then(function(r){
            if (r.error || (r.data && r.data.error)){ toast('We received your payment but could not confirm it yet. Ref ' + tx.reference + '. Our team will sort it out.'); askHuman('Payment ' + tx.reference + ' needs checking'); return; }
            onPaid(tx.reference);
          });
        },
        onCancel: function(){ toast('Payment cancelled. You can try again.'); },
        onError: function(err){ toast('Paystack error: ' + (err && err.message || 'please try again')); } });
    }).catch(function(){ toast('Could not reach Paystack. Check your connection.'); });
  }
  var _payModal = payModal;
  payModal = function(amount, method, done){
    if (isDemoSession()) return _payModal(amount, method, done);
    var sub = location.hash.indexOf('subscribe') > -1 && UI.sub && UI.sub.plan;
    var meta = sub ? { purpose: 'subscribe', plan: UI.sub.plan, start: UI.sub.day != null ? iso(nextDateFor(UI.sub.day)) : null, desc: CONFIG.plans[UI.sub.plan].name }
                   : { purpose: 'order', desc: (UI.sch && UI.sch.type ? typeName(UI.sch.type) : 'Extras') };
    paystack(amount, meta, function(ref){
      pull().then(function(){
        LAST_PAYREF = sub ? null : ref;
        try { done(); } finally { LAST_PAYREF = null; }
        if (!sub && UI.sch && UI.sch.type === 'move'){ var o = upcomingRegular(me()); if (o){ o.payRef = ref; o.qty = UI.sch.qty || {}; save(); } }
      });
    });
  };
  obPay = function(){
    var s = UI.sub, p = CONFIG.plans[s.plan]; var amt = p.price - (isFounding() ? Math.round(p.price * CONFIG.foundingDiscount) : 0);
    if (s.email && me()) me().email = s.email.trim();
    paystack(amt, { purpose: 'subscribe', plan: s.plan, start: s.day != null ? iso(nextDateFor(s.day)) : null, desc: p.name }, function(ref){ pull().then(function(){ obFinish(amt, ref); }); });
  };
})();
