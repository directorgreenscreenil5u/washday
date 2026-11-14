/* =========================================================
   WASHDAY · laundry subscription web app
   Runs in the browser and saves to localStorage for now.
   Functions marked "BACKEND:" are where a real database,
   SMS/WhatsApp OTP (e.g. Termii) and Paystack plug in.
   ========================================================= */
const CONFIG = {
  brand: 'Washday',
  whatsapp: '2348000000000',
  areas: [ {name:'Lekki Phase 1', open:true}, {name:'Yaba', open:true}, {name:'Ikoyi', open:false}, {name:'Surulere', open:false}, {name:'Ikeja GRA', open:false} ],
  plans: {
    fresh:     { name:'Fresh Start',  price:20000, pickups:2, kg:8,  service:'Wash, dry and fold',            blurb:'For one person who wants their weekends back.', extra:[], img:'folded' },
    weekly:    { name:'Weekly Fresh', price:45000, pickups:4, kg:8,  service:'Wash, dry, iron, hang or fold', blurb:'A pickup every week, ironed and ready to wear.', extra:['Live order tracking'], tag:'Best for most homes', img:'shirt' },
    household: { name:'Full House',   price:75000, pickups:4, kg:15, service:'Wash, dry, iron, hang or fold', blurb:'For busy homes with kids, towels and bedding.', extra:['1 duvet or bedding set a month','Priority pickup windows'], img:'family' }
  },
  overweightPerKg: 1000,
  // PLACEHOLDER PRICES: set before launch
  extraPickup: 7000, duvet: 5000, dryCleanItem: 3000, express: 5000,
  foundingDiscount: 0.30,
  foundingDeadline: '2027-01-04',
  windows: ['7:00 – 9:00am','9:00 – 11:00am','11:00am – 1:00pm','1:00 – 3:00pm','3:00 – 5:00pm','6:00 – 8:00pm'],
  staffPin: '2468'
};
const IMG = { hero:'img/hero.webp', shirt:'img/shirt.webp', folded:'img/folded.webp', woman:'img/woman.webp', rider:'img/rider.webp', tagging:'img/tagging.webp', native:'img/native.webp', family:'img/family.webp' };
const PLAN_KEYS = ['fresh','weekly','household'];
const STATUSES = ['Scheduled','Picked up','Tagged and counted','Washing and ironing','Quality check and packed','Out for delivery','Delivered'];
const STATUS_HELP = ['Your rider will come in the chosen window.','Bag weighed at your door. Confirmation sent on WhatsApp.','Every item tagged to you and counted.','Washed on its own, never mixed with other loads.','Items counted again and sealed with the count on the bag.','Rider is on the way.','Confirm your item count and rate the load.'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DOW_L = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MON_L = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const KEY = 'washday_v2';
let DB;
function blank(){ return { users:{}, session:null, orders:[], waitlist:[], quotes:[], seq:1000, tickets:200 }; }
function load(){ try{ DB = JSON.parse(localStorage.getItem(KEY)) || blank(); }catch(e){ DB = blank(); } }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(DB)); }catch(e){} }
load();

const $ = (s,el=document)=>el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const naira = n => '₦' + Math.round(n).toLocaleString('en-NG');
const iso = d => { const x=new Date(d); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
const parse = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const today = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };
const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const addMonths = (d,n) => { const x=new Date(d); x.setMonth(x.getMonth()+n); return x; };
const fmt = d => { d = typeof d==='string'?parse(d):d; return DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()]; };
const fmtL = d => { d = typeof d==='string'?parse(d):d; return DOW_L[d.getDay()]+' '+d.getDate()+' '+MON_L[d.getMonth()]; };
const fmtY = d => { d = typeof d==='string'?parse(d):d; return d.getDate()+' '+MON_L[d.getMonth()]+' '+d.getFullYear(); };
const fmtTime = t => { const d=new Date(t); let h=d.getHours(), m=String(d.getMinutes()).padStart(2,'0'); const ap=h>=12?'pm':'am'; h=h%12||12; return fmt(d)+', '+h+':'+m+ap; };
const normPhone = p => { let d=String(p||'').replace(/\D/g,''); if(d.startsWith('234')) d=d.slice(3); if(d.startsWith('0')) d=d.slice(1); return d; };
const showPhone = p => '+234 ' + p.slice(0,3)+' '+p.slice(3,6)+' '+p.slice(6);
const me = () => DB.session ? DB.users[DB.session] : null;
const myOrders = () => DB.orders.filter(o=>o.phone===DB.session).sort((a,b)=> b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
const plan = u => CONFIG.plans[u.plan] || CONFIG.plans.weekly;
const isFounding = () => today() < parse(CONFIG.foundingDeadline);
const biweekly = u => u.plan==='fresh';

const sv = p => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  check: sv('<path d="M5 12l5 5L20 7"/>').replace('stroke-width="2"','stroke-width="2.4"'),
  clock: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  tag: sv('<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  card: sv('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>'),
  list: sv('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  bag: sv('<path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
  van: sv('<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
  home: sv('<path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
  cal: sv('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  shield: sv('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  chat: sv('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-5A8 8 0 1 1 21 12z"/>'),
  camera: sv('<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>'),
  pin: sv('<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  out: sv('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'),
  menu: sv('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  pause: sv('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
  alert: sv('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>'),
  star: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>'
};
const LOGO = (c1='#1F6FB2') => `<svg width="32" height="32" viewBox="0 0 34 34" aria-hidden="true"><circle cx="12" cy="20" r="10" fill="${c1}"/><circle cx="24" cy="10" r="6" fill="#8CC0E8"/><circle cx="27" cy="24" r="4" fill="#F2A65A"/></svg>`;
const ARROW = '<span class="arrow" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg></span>';

function toast(msg, ok){ const t=document.createElement('div'); t.className='toast'+(ok?' ok':''); t.textContent=msg; $('#toasts').appendChild(t); setTimeout(()=>t.remove(), 4000); }
let modalOnClose=null;
function modal(html, onClose){ $('#modal').innerHTML = `<div class="modalbg" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`; modalOnClose=onClose||null; const f=$('#modal .modal input, #modal .modal button'); if(f) f.focus(); }
function closeModal(){ $('#modal').innerHTML=''; if(modalOnClose){ const f=modalOnClose; modalOnClose=null; f(); } }

/* ---------- Business logic ---------- */
function nextId(){ DB.seq += 1; return 'WD-' + DB.seq; }
function cycleOf(u, ref=today()){ let start = parse(u.cycleStart); while (addMonths(start,1) <= ref) start = addMonths(start,1); return { start, end: addDays(addMonths(start,1),-1), renew: addMonths(start,1) }; }
function rollBilling(u){
  if(!u.plan || !u.cycleStart) return;
  let start = parse(u.cycleStart); const t = today();
  while (addMonths(start,1) <= t){
    start = addMonths(start,1); const d = iso(start);
    if (!u.bills.some(b=>b.date===d && b.kind==='renewal')){
      const paused = u.pauseMonth && u.pauseMonth===d.slice(0,7);
      const over = u.pendingCharges||0; u.pendingCharges=0;
      if (u.pendingPlan){ u.plan=u.pendingPlan; u.pendingPlan=null; }
      if (u.status==='cancelled') continue;
      u.bills.unshift({ date:d, kind:'renewal', desc: paused ? plan(u).name+' · paused month' : plan(u).name+', '+MON_L[start.getMonth()]+(over?' + extra charges':''), amount:(paused?0:plan(u).price)+over, status:'Paid' });
    }
  }
}
function cycleRegular(u){ const c = cycleOf(u); return DB.orders.filter(o=>o.phone===u.phone && o.type==='regular' && !o.cancelled && parse(o.date)>=c.start && parse(o.date)<=c.end); }
function upcomingRegular(u){ return DB.orders.find(o=>o.phone===u.phone && o.type==='regular' && o.status===0 && !o.cancelled); }
function nextPickupDate(u, from){
  const lastReg = DB.orders.filter(o=>o.phone===u.phone && o.type==='regular' && !o.replaced).map(o=>parse(o.date)).sort((a,b)=>b-a)[0];
  if (lastReg && lastReg >= from) from = lastReg;
  let d = addDays(from,1);
  while (d.getDay() !== u.pickupDay) d = addDays(d,1);
  if (biweekly(u)){ const last = DB.orders.filter(o=>o.phone===u.phone && o.type==='regular' && !o.cancelled).map(o=>parse(o.date)).sort((a,b)=>b-a)[0]; while (last && (d - last) < 13*864e5) d = addDays(d,7); }
  while ((u.skips||[]).includes(iso(d))) d = addDays(d, biweekly(u)?14:7);
  return d;
}
function ensureUpcoming(u){
  if (!u.plan || u.status!=='active' || upcomingRegular(u)) return;
  const c = cycleOf(u); const used = cycleRegular(u).length;
  let d = nextPickupDate(u, today());
  if (u.pauseMonth && iso(d).slice(0,7)===u.pauseMonth) return;
  if (used >= plan(u).pickups && d <= c.end) d = nextPickupDate(u, c.end);
  DB.orders.push(newOrder(u, { type:'regular', date: iso(d), window:u.window, address:0, bags:1, extras:[] }));
}
function newOrder(u, o){ return { id: nextId(), phone:u.phone, type:o.type, date:o.date, window:o.window, address:o.address, bags:o.bags, extras:o.extras||[], note:o.note||'', status:0, history:[{s:0,at:Date.now()}], kg:null, items:null, flags:[], issue:null, rating:null, cost:o.cost||0, security:true }; }
function refresh(){ const u = me(); if(!u) return; rollBilling(u); ensureUpcoming(u); save(); }

/* ---------- Router ---------- */
let UI = {};
const TITLES = { login:'Log in', signup:'Create account', subscribe:'Start your plan', app:'Dashboard', 'app/schedule':'Schedule a pickup', 'app/track':'Track order', 'app/orders':'Orders', 'app/billing':'Plan and billing', staff:'Staff' };
function go(path){ location.hash = '#/' + path; }
function splitRoute(h){ if (h.startsWith('app/track/')) return ['app/track', h.slice(10)]; if (h.startsWith('home/')) return ['', h.slice(5)]; return [h, null]; }
function route(){
  const h = location.hash.replace(/^#\/?/,''); const [path, arg] = splitRoute(h);
  if (path.startsWith('app')){ if (!me()) { UI.after = h; return go('login'); } if (!me().plan) return go('subscribe'); refresh(); }
  if (path==='subscribe' && !me()) { UI.after='subscribe'; UI.authInit=false; return go('signup'); }
  const fn = ROUTES[path] || viewHome;
  $('#app').innerHTML = fn(arg);
  document.title = (TITLES[path]||'Laundry subscription in Lagos') + ' · ' + CONFIG.brand;
  if (path==='' && arg){ const el=document.getElementById(arg); if(el) setTimeout(()=>el.scrollIntoView({behavior:'smooth'}),30); } else window.scrollTo(0,0);
  if (path==='login'||path==='signup'){ const f=$('[data-otp="0"]')||$('input[name="name"]')||$('input[name="phone"]'); if(f) f.focus(); }
}
function rerender(){ const y=window.scrollY; const h=location.hash.replace(/^#\/?/,''); const [p,a]=splitRoute(h); $('#app').innerHTML=(ROUTES[p]||viewHome)(a); window.scrollTo(0,y); }
window.addEventListener('hashchange', ()=>route());

/* =========================================================
   MARKETING SITE
   ========================================================= */
Object.assign(IMG, { hero3d:'img/hero3d.webp', moon:'img/moon.webp', shirtpink:'img/shirtpink.webp', bagpink:'img/bagpink.webp', iron:'img/iron.webp', towels:'img/towels.webp' });
Object.assign(IMG, { hero:'img/hero.jpg', moon:'img/hero.jpg', hero3d:'img/hero.jpg', bagpink:'img/basket.jpg', iron:'img/iron.jpg', native:'img/native.jpg', towels:'img/bed.jpg', woman:'img/woman.jpg', family:'img/family.jpg', rider:'img/rider.jpg', tagging:'img/tagging.jpg', folded:'img/folded.jpg', shirt:'img/shirts.jpg', shirtpink:'img/shirts.jpg', heroVid:'img/hero-wm.mp4', heroPoster:'img/hero-wm.jpg' });
Object.assign(IMG, { bagpink:'img/svc-wash.jpg', iron:'img/svc-iron.jpg', native:'img/svc-dry.jpg', towels:'img/svc-bed.jpg' });
const ARR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const ARR_UP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>';
function siteHeader(){
  const u = me();
  return `<header class="pillnav anav">
      <a class="wm" href="#/">washday</a>
      <nav class="navlinks" aria-label="Main"><a href="#/home/services">Services</a><a href="#/home/how">How it works</a><a href="#/home/plans">Pricing</a><a href="#/home/uses">Who it's for</a><a href="#/home/faq">Help</a></nav>
      <div class="navcta">
        ${u ? `<a class="btn btn-dark" href="#/app">My account</a>` : `<a class="btn btn-dark" href="#/subscribe">Get started</a><a class="btn btn-light hide-m" href="#/login">Log in</a>`}
        <button class="menubtn" data-act="menu" aria-label="Open menu" aria-expanded="false">${I.menu}</button>
      </div>
    </header>
    <div class="mobilemenu" id="mobilemenu"><a href="#/home/services">Services</a><a href="#/home/how">How it works</a><a href="#/home/plans">Pricing</a><a href="#/home/uses">Who it's for</a><a href="#/home/faq">Help</a>${u?'<a href="#/app">My account</a>':'<a href="#/login">Log in</a>'}</div>`;
}
const FAQS = [
  ['How much laundry is 8 kg?','About a week of clothes for one person: roughly 6 shirts, 4 trousers, 6 T-shirts, underwear and a towel or two. The rider weighs your bag at the door so you always know.'],
  ['What happens if I go over my kg limit?',`We wash it anyway and add ${naira(CONFIG.overweightPerKg)} per extra kg to your next bill. You see the weight on WhatsApp before we leave your door.`],
  ['Can I pause or cancel my plan?','Yes. Pause for one billing month a year when you travel, switch plans from your account, or cancel before your next billing date. Unused pickups do not roll over.'],
  ['What if something is lost or damaged?','Every item is tagged and counted, so this is rare. If it happens, we pay you back using our published compensation scale and reply to every complaint within 24 hours.'],
  ['How do I pay?','Online by card, bank transfer or USSD through Paystack, billed monthly. Riders never collect cash.'],
  ['What are the pickup times?','Pick a fixed day and a two-hour window between 7am and 8pm, Monday to Saturday. Move a single pickup from your account up to 12 hours before.']
];
function planCard(k, feat){
  const p = CONFIG.plans[k];
  const per = Math.round(p.price/p.pickups/50)*50;
  const cad = p.pickups===4 ? 'Every week' : 'Every other week';
  const feats = [p.service, 'Free pickup and delivery', 'Every item tagged and counted', ...p.extra];
  const tick = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
  const disc = isFounding() ? Math.round(p.price*(1-CONFIG.foundingDiscount)) : 0;
  return `<article class="pcard ${feat?'feat':''}">
    <div class="pc-img"><img class="photo" src="${IMG[p.img]}" alt="" loading="lazy">${p.tag?`<span class="pc-badge">${p.tag}</span>`:''}</div>
    <div class="pc-body">
      <div class="pc-top"><h3>${p.name}</h3><span class="pc-cad">${cad}</span></div>
      <p class="pc-blurb">${p.blurb}</p>
      <div class="pc-price"><span class="pc-amt">${naira(p.price)}</span><span class="pc-per">/ month</span></div>
      <p class="pc-sub">About ${naira(per)} per pickup${disc?` · <b>${naira(disc)}</b> first month for founding members`:''}</p>
      <div class="pc-stats"><div><b>${p.pickups}</b><span>pickups a month</span></div><div><b>${p.kg} kg</b><span>per pickup</span></div></div>
      <ul>${feats.map(f=>`<li><i>${tick}</i><span>${f}</span></li>`).join('')}</ul>
      <button class="btn btn-lg btn-block ${feat?'btn-white':'btn-dark'}" data-act="pick-plan" data-plan="${k}">Choose ${p.name} ${ARR}</button>
    </div>
  </article>`;
}
const SVC = {
  wash: { label:'Wash & fold', img:'bagpink', title:'Everyday wash and fold', rows:[[I.bag,'Weighed at your door','Your rider weighs the bag in front of you and sends the weight on WhatsApp.'],[I.tag,'Washed on its own','Your load is never mixed with anyone else\'s. Every item is tagged to you.']] },
  iron: { label:'Ironing', img:'iron', title:'Washed, dried and pressed', rows:[[I.check,'Hung or folded, your choice','Shirts on hangers, trousers creased, ready to wear straight from the bag.'],[I.clock,'Back in 48 hours','Or 24 hours with express return when you need it sooner.']] },
  dry: { label:'Dry cleaning', img:'native', title:'Native attire and suits', rows:[[I.shield,'Agbada, kaftans, ankara, gowns','Cleaned and pressed with care, flagged and photographed if already stained.'],[I.card,`From ${naira(CONFIG.dryCleanItem)} per item`,'Add items to any pickup, or book a dry-cleaning-only collection.']] },
  bed: { label:'Bedding', img:'towels', title:'Duvets, sheets and curtains', rows:[[I.home,'Big items, handled separately','Washed on their own and returned in a zip bag.'],[I.plus,'Included on Full House','One duvet or bedding set a month, or from '+naira(CONFIG.duvet)+' on other plans.']] }
};
const SI = {
  scale:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><path d="M5 7h14"/><path d="M7 7l-3 7a3 3 0 0 0 6 0L7 7z"/><path d="M17 7l-3 7a3 3 0 0 0 6 0l-3-7z"/><path d="M9 21h6"/><path d="M12 7v14"/></svg>`,
  tag:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>`,
  hanger:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7a2 2 0 1 1 2-2c0 1.2-2 1.6-2 3v1"/><path d="M12 9l-9 7.5A1.5 1.5 0 0 0 4 19h16a1.5 1.5 0 0 0 1-2.5L12 9z"/></svg>`,
  clock:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  sparkle:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>`,
  camera:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  layers:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>`,
  zip:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 9h16"/><path d="M12 9v3"/></svg>`
};
const SVC3 = {
  wash: { label:'Wash & fold', ti:'drop', img:'bagpink', head:'Everyday clothes, done.', sub:'Hand over one bag. Get it back clean, fresh and neatly folded.', price:'Included in every plan',
    rows:[['scale','Weighed at your door','Your rider weighs the bag in front of you and sends the weight on WhatsApp.'],['tag','Every item tagged','Each piece is tagged to you and counted in and out.'],['shield','Never mixed','Your load is washed on its own, with your detergent preferences.']] },
  iron: { label:'Ironing', ti:'hanger', img:'iron', head:'Pressed and ready to wear.', sub:'Shirts on hangers, trousers creased, straight from the bag to your day.', price:'Included in Weekly Fresh and Full House',
    rows:[['hanger','Hung or folded','Tell us once and we remember how you like each item.'],['clock','Back in 48 hours','Or 24 hours with express return when you need it sooner.'],['sparkle','Crisp every time','Steam-pressed by hand, collars and cuffs included.']] },
  dry: { label:'Dry cleaning', ti:'sparkle', img:'native', head:'From agbada to tuxedo.', sub:'Native attire, suits and gowns, cleaned and pressed with care.', price:`From ${naira(CONFIG.dryCleanItem)} per item`,
    rows:[['sparkle','Delicate fabrics','Aso-oke, lace, ankara and embroidery handled by specialists.'],['camera','Photographed on arrival','Existing stains or damage are flagged before we start.'],['zip','Returned covered','Every piece comes back pressed, on a hanger, in a garment cover.']] },
  bed: { label:'Bedding', ti:'layers', img:'towels', head:'Duvets, sheets and curtains.', sub:'Big items washed properly, without taking over your weekend.', price:`Included on Full House, or ${naira(CONFIG.duvet)} a duvet`,
    rows:[['layers','Washed on their own','Large items get their own cycle and a full dry.'],['shield','Hygienic wash','Hot wash for sheets and towels to keep them truly clean.'],['zip','Sealed and fresh','Folded and returned in a sealed zip bag.']] }
};
Object.assign(SI, {
  drop:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/></svg>`,
  shield:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>`
});
const SVC2 = [
  { label:'Wash & fold', head:'Everyday clothes,<br>done.', img:'bagpink', facts:[['scale','Weighed at your door'],['tag','Every item tagged to you']], price:'Included in every plan' },
  { label:'Ironing', head:'Pressed and<br>ready to wear.', img:'iron', facts:[['hanger','Hung or folded, your choice'],['clock','Back in 48 hours']], price:'Included in Weekly Fresh and Full House' },
  { label:'Dry cleaning', head:'Agbada to<br>tuxedo.', img:'native', facts:[['sparkle','Native attire, suits and gowns'],['camera','Stains photographed on arrival']], price:`From ${naira(CONFIG.dryCleanItem)} per item` },
  { label:'Bedding', head:'Duvets, sheets<br>and curtains.', img:'towels', facts:[['layers','Washed on their own'],['zip','Returned in a sealed bag']], price:`Included on Full House, or ${naira(CONFIG.duvet)} a duvet` }
];
const USES = [
  ['woman','Busy professionals','Long days, no time, no generator to spare. Hand over one bag a week and get your weekends back.','fresh'],
  ['family','Families','Kids\' clothes, school uniforms, towels and bedding. Full House covers up to 15 kg a pickup.','household'],
  ['rider','Estates','One collection point for every resident, a fixed pickup day and a residents\' discount.','quote'],
  ['tagging','Businesses','Uniforms, towels and linen for salons, spas, gyms and small hotels, counted in and out every time.','quote']
];
const ACCS = [
  ['Every item tagged and counted','Each piece gets a tag tied to you. We count at pickup and again before delivery, and the count is printed on the sealed bag.'],
  ['Weighed at your door','No surprises. The rider weighs your bag in front of you and the weight arrives on WhatsApp before they leave.'],
  ['Never mixed with other loads','Your laundry is washed on its own, with the detergent and folding preferences saved on your account.'],
  ['A written guarantee','If anything is lost or damaged we pay you back on a published scale, and every complaint is answered within 24 hours.']
];
function viewHome(){
  const u = me(); const tab = UI.svc2 || 'wash'; const S = SVC[tab]; const acc = UI.acc ?? 0;
  const open = CONFIG.areas.filter(a=>a.open).map(a=>a.name);
  const marqItems = ['◐ Lekki Phase 1','◑ Yaba','48-hour return','Every item tagged','◒ Ikoyi · soon','Paystack','◓ Surulere · soon','WhatsApp updates','◐ Ikeja GRA · soon'];
  return `
  ${isFounding()?`<div class="annc">Founding members get ${Math.round(CONFIG.foundingDiscount*100)}% off.<a href="#/subscribe">Claim yours</a></div>`:''}
  ${siteHeader()}
  <main>
  <section class="ahero">
    <h1 class="ah-h1">Laundry, handled.</h1>
    <p class="ah-sub">Picked up. Cleaned. Back in 48 hours.</p>
    <div class="ah-ctas"><a class="ah-btn" href="#/home/plans">Choose a plan</a><a class="ah-link" href="#/home/how">Learn more <span aria-hidden="true">›</span></a></div>
    <div class="ah-media"><video class="ah-vid" src="${IMG.heroVid}" poster="${IMG.heroPoster}" autoplay muted loop playsinline preload="auto" aria-hidden="true"></video><div class="wm-lcd" aria-hidden="true"><span class="wm-lock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span><span class="wm-digits"><span class="wm-ghost">8:88</span><span class="wm-time">0<i>:</i>47</span></span></div><span class="wm-led" aria-hidden="true"></span></div>
  </section>

  <section id="services" class="wrap section">
    <div class="svx-head"><h2 class="h2">Everything your wardrobe needs.</h2><p class="lead">One subscription. Four services. Zero trips to the laundry man.</p></div>
    <div class="svx-tabs" role="tablist">${Object.entries(SVC3).map(([k,v])=>`<button role="tab" class="${tab===k?'on':''}" aria-selected="${tab===k}" data-act="svc2" data-t="${k}"><span class="svx-ti">${SI[v.ti]}</span>${v.label}</button>`).join('')}</div>
    ${(()=>{ const V=SVC3[tab]||SVC3.wash; return `<div class="svx-panel">
      <div class="svx-media"><img src="${IMG[V.img]}" alt="${V.label}" loading="lazy"></div>
      <div class="svx-body">
        <p class="svx-eyebrow">${V.label}</p>
        <h3 class="svx-h">${V.head}</h3>
        <p class="svx-sub">${V.sub}</p>
        <ul class="svx-rows">${V.rows.map(r=>`<li><span class="svx-ic">${SI[r[0]]}</span><div><b>${r[1]}</b><span>${r[2]}</span></div></li>`).join('')}</ul>
        <div class="svx-foot"><span class="svx-price">${V.price}</span><a class="svx-link" href="#/home/plans">See plans <span aria-hidden="true">›</span></a></div>
      </div>
    </div>`; })()}
  </section>

  <section id="how" class="wrap section">
    <div class="row" style="gap:clamp(32px,6vw,96px);align-items:center">
      <div style="flex:1 1 400px;min-width:0">
        <span class="tag">Live tracking</span>
        <h2 class="h2">Know where your laundry is, at every step</h2>
        <p class="lead" style="margin-top:18px">Your rider confirms the weight at your door. You get a message when it's tagged, when it's washing and when it's on the way back. Nothing to chase.</p>
        <ol style="list-style:none;padding:0;margin:28px 0 0;display:flex;flex-direction:column;gap:14px">${['Choose a plan and a pickup day','We collect, weigh and tag every item','Washed, pressed and counted again','Back at your door within 48 hours'].map((s,i)=>`<li style="display:flex;gap:14px;align-items:center"><span style="width:30px;height:30px;border-radius:50%;background:var(--pink-soft);color:var(--pink-ink);font-weight:600;font-size:13px;display:flex;align-items:center;justify-content:center;flex:none">${i+1}</span><span style="font-weight:500">${s}</span></li>`).join('')}</ol>
        <a class="btn btn-dark btn-lg" href="#/subscribe" style="margin-top:32px">Get started ${ARR}</a>
      </div>
      <div class="gcard" style="flex:1 1 440px;min-width:0" aria-hidden="true">
        <div class="phone" style="max-width:420px;margin:24px auto">
          <div class="between" style="padding:4px 4px 12px;border-bottom:1px solid #F1E3EC"><span style="width:28px;height:28px;border-radius:50%;background:#F4F4F5;display:flex;align-items:center;justify-content:center">‹</span><b class="small">${CONFIG.brand}</b><span style="width:28px;height:28px;border-radius:50%;background:#F4F4F5;display:flex;align-items:center;justify-content:center">⋯</span></div>
          <div style="display:flex;flex-direction:column;gap:10px;padding:16px 4px">
            <div class="bub me">Can you pick up tomorrow morning?</div>
            <div class="bub them">Booked for Tue 8:00 – 10:00am. Tunde will collect from 12 Admiralty Way.</div>
            <div class="bub them"><span class="tag" style="margin:0 0 6px;font-size:11px;padding:3px 8px">Picked up</span><br>7.4 kg weighed at your door. 18 items tagged and counted.</div>
            <div class="bub them"><span class="tag" style="margin:0 0 6px;font-size:11px;padding:3px 8px">On the way</span><br>Your laundry is out for delivery. Arriving 10:00 – 12:00.</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;background:#F4F4F5;border-radius:12px;padding:10px 12px;color:#A1A1AA;font-size:13px">Type a message<span style="margin-left:auto;width:24px;height:24px;border-radius:7px;background:#2340E8"></span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="wrap section">
    <div class="panel" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:clamp(24px,5vw,64px);align-items:center;padding:clamp(18px,4vw,48px)">
      <div style="display:flex;justify-content:center" aria-hidden="true">
        <div style="width:300px;background:#fff;border-radius:36px;padding:14px;box-shadow:0 30px 60px rgba(0,0,0,.08)">
          <div style="border-radius:24px;padding:20px;color:#fff;background:linear-gradient(140deg,#2A2A2E,#0A0A0B)"><div class="between xs" style="color:#A1A1AA"><span>Weekly Fresh</span><span>Active</span></div><p style="font-family:var(--display);font-size:30px;font-weight:500;margin-top:26px;letter-spacing:-.03em">₦45,000</p><p class="xs" style="color:#A1A1AA;margin-top:2px">Renews 17 Dec</p></div>
          <div style="padding:16px 6px 6px"><p class="xs soft">This month</p><p style="font-family:var(--display);font-size:26px;font-weight:500;letter-spacing:-.03em">2 of 4 pickups</p><div class="bar" style="margin-top:10px"><span style="width:50%;background:var(--pink)"></span></div>
            <div class="row" style="gap:8px;margin-top:14px"><span class="btn btn-sm" style="flex:1;background:#F4F4F5">Schedule</span><span class="btn btn-sm" style="flex:1;background:#F4F4F5">Pause</span></div>
            <p class="xs soft" style="margin-top:16px">Next pickup</p><p style="font-family:var(--display);font-size:22px;font-weight:500">Tue · 8 – 10am</p>
            <span class="btn btn-dark btn-sm btn-block" style="margin-top:12px">Track order</span></div>
        </div>
      </div>
      <div>
        <h2 class="h2">Laundry done properly, behind the scenes</h2>
        <p class="lead" style="margin-top:16px">${CONFIG.brand} runs on a simple system you can see: weights, counts and photos for every load, all visible in your account.</p>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:28px">${ACCS.map((a,i)=>`<div class="acc ${acc===i?'open':''}"><button data-act="acc" data-i="${i}" aria-expanded="${acc===i}"><span>${a[0]}</span><span aria-hidden="true" style="font-size:22px;font-weight:300">${acc===i?'−':'+'}</span></button>${acc===i?`<p class="ans">${a[1]}</p>`:''}</div>`).join('')}</div>
      </div>
    </div>
  </section>

  <section id="plans" class="wrap section">
    <div class="plans-head"><div><span class="tag">Pricing</span><h2 class="h2">Pick a plan that fits your week</h2></div><p class="lead">Pickup and delivery are always included. Each plan has a weight limit per pickup, so it stays fair for everyone. Change or pause any month.</p></div>
    <div class="pgrid">${planCard('fresh')}${planCard('weekly',true)}${planCard('household')}</div>
    <div class="pextras"><span class="pe-l">Extras on any plan</span><span>Over your limit <b>${naira(CONFIG.overweightPerKg)}/kg</b></span><span>Dry cleaning <b>${naira(CONFIG.dryCleanItem)}/item</b></span><span>Duvet <b>${naira(CONFIG.duvet)}</b></span><span>Express 24h <b>+${naira(CONFIG.express)}</b></span></div>
  </section>

  <section id="uses" class="wrap section">
    <div style="text-align:center;margin-bottom:36px"><span class="tag">Who it's for</span><h2 class="h2">Designed for real-life laundry</h2></div>
    <div style="display:flex;flex-direction:column;gap:20px">
      ${USES.map((x,i)=>`<div class="stack" style="top:${100+i*18}px"><div class="ucard"><div><h3 style="font-family:var(--display);font-size:30px;font-weight:500;letter-spacing:-.03em">${x[1]}</h3><p class="muted" style="margin-top:12px;font-size:16px;max-width:420px;line-height:1.6">${x[2]}</p>${x[3]==='quote'?`<button class="ulink" data-act="quote">Request a quote ${ARR}</button>`:`<button class="ulink" data-act="pick-plan" data-plan="${x[3]}">See ${CONFIG.plans[x[3]].name} ${ARR}</button>`}</div><div class="img"><img class="photo" src="${IMG[x[0]]}" alt="" loading="lazy"></div></div></div>`).join('')}
    </div>
  </section>

  <section id="areas" class="wrap section">
    <div class="panel" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;padding:clamp(18px,4vw,48px);align-items:center">
      <div>
        <span class="tag">Coverage</span>
        <h2 class="h2">Starting in ${open.join(' and ')}</h2>
        <p class="lead" style="margin-top:14px">Tight routes mean riders arrive on time. New areas open as each one fills up.</p>
        <div class="row" style="gap:8px;margin-top:22px">${CONFIG.areas.map(a=>`<span style="font-size:14px;font-weight:500;padding:9px 16px;border-radius:999px;${a.open?'background:#0A0A0B;color:#fff':'background:#fff;color:var(--muted)'}">${a.name}${a.open?'':' · soon'}</span>`).join('')}</div>
      </div>
      <form data-form="waitlist" novalidate style="background:#fff;border-radius:24px;padding:28px;display:flex;flex-direction:column;gap:12px">
        <p style="font-family:var(--display);font-size:22px;font-weight:500;letter-spacing:-.02em">Not in your area yet?</p>
        <p class="muted small">Join the waitlist and we'll message you when we open near you.</p>
        <label><span class="sr">Area or estate</span><input class="input" name="area" placeholder="Area or estate"></label>
        <label><span class="sr">WhatsApp number</span><input class="input" name="phone" type="tel" placeholder="WhatsApp number"></label>
        <button class="btn btn-dark btn-lg">Notify me ${ARR}</button>
      </form>
    </div>
  </section>

  <section id="faq" class="wrap section" style="max-width:880px">
    <div style="text-align:center;margin-bottom:32px"><span class="tag">Help</span><h2 class="h2">Questions, answered</h2></div>
    <div class="panel" style="display:flex;flex-direction:column;gap:10px;padding:14px">${FAQS.map((f,i)=>{ const o=(UI.faq ?? 0)===i; return `<div class="acc ${o?'open':''}" id="faq-${i}"><button data-act="faq" data-i="${i}" aria-expanded="${o}"><span>${f[0]}</span><span aria-hidden="true" style="font-size:22px;font-weight:300">${o?'−':'+'}</span></button>${o?`<p class="ans">${f[1]}</p>`:''}</div>`; }).join('')}</div>
  </section>

  <section class="section">
    <div class="rcta"><div style="padding:56px 24px;max-width:760px"><h2 class="h1" style="font-size:clamp(38px,5vw,64px)">Get your weekends back</h2><p class="lead" style="margin-top:16px;color:rgba(255,255,255,.85)">Choose a plan in two minutes. Your first pickup could be this week.</p><div class="row" style="justify-content:center;gap:10px;margin-top:30px"><a class="btn btn-dark btn-lg" href="#/subscribe">Get started ${ARR}</a><a class="btn btn-lg" style="background:rgba(255,255,255,.7);color:var(--ink)" href="https://wa.me/${CONFIG.whatsapp}" target="_blank" rel="noopener">Chat on WhatsApp</a></div></div></div>
  </section>
  </main>

  <footer class="rfoot">
    <div class="row" style="gap:48px;justify-content:space-between">
      <div style="max-width:340px"><a class="wm" href="#/">washday</a><p class="muted" style="margin-top:14px">Monthly laundry subscription with pickup and delivery in Lagos.</p></div>
      <div class="row" style="gap:64px;font-size:15px">
        <div style="display:flex;flex-direction:column;gap:12px"><b style="font-weight:600">Service</b><a href="#/home/services">Services</a><a href="#/home/how">How it works</a><a href="#/home/plans">Pricing</a><a href="#/home/areas">Areas</a></div>
        <div style="display:flex;flex-direction:column;gap:12px"><b style="font-weight:600">Account</b><a href="#/login">Log in</a><a href="#/subscribe">Get started</a><a href="#/app/orders">Track an order</a></div>
        <div style="display:flex;flex-direction:column;gap:12px"><b style="font-weight:600">Help</b><a href="#/home/faq">FAQ</a><a href="#" data-act="policy">Damage and loss policy</a><a href="https://wa.me/${CONFIG.whatsapp}" target="_blank" rel="noopener">WhatsApp</a><a href="#/staff">Staff login</a></div>
      </div>
    </div>
    <div class="between" style="margin-top:48px;padding-top:20px;border-top:1px solid var(--line2);font-size:14px;color:var(--muted)"><span>© ${new Date().getFullYear()} ${CONFIG.brand}. Lagos, Nigeria.</span><span>Payments secured by Paystack</span></div>
    <div class="rwm" aria-hidden="true">washday</div>
  </footer>`;
}

function viewAuth(){
  const h = location.hash.replace(/^#\/?/,'');
  if (!UI.authInit){ UI.authInit = true; UI.authMode = h==='signup' ? 'signup' : 'login'; UI.authStep='phone'; }
  const login = UI.authMode==='login'; const step = UI.authStep;
  return `<div class="authwrap">
    <div class="authside">
      <img src="${IMG.moon}" alt="" style="object-position:80% 50%">
      <a class="wm" href="#/">washday</a>
      <div>
        <div class="glass" style="border-radius:20px;padding:16px 18px;display:flex;gap:14px;align-items:center;max-width:360px;color:var(--ink);margin-bottom:24px"><span style="width:42px;height:42px;border-radius:50%;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;flex:none">${I.van}</span><div><p style="font-weight:600">Out for delivery</p><p class="small" style="color:var(--ink2)">Rider arriving 10:00 – 12:00 today</p></div></div>
        <h1 class="h1" style="font-size:clamp(36px,4vw,56px);max-width:520px;color:#fff">Laundry day, without the laundry.</h1>
        <p style="margin-top:14px;font-size:17px;color:#E2EBF1;max-width:440px">Schedule pickups, track every item and manage your plan in one place.</p>
      </div>
    </div>
    <div class="authmain"><div style="width:100%;max-width:420px">
      <a class="logo" href="#/" style="margin-bottom:32px">${LOGO()}<span>${CONFIG.brand}</span></a>
      <div class="tabs" role="tablist"><button role="tab" class="${login?'on':''}" aria-selected="${login}" data-act="auth-mode" data-m="login">Log in</button><button role="tab" class="${!login?'on':''}" aria-selected="${!login}" data-act="auth-mode" data-m="signup">Create account</button></div>
      ${step==='phone' ? `
      <form data-form="auth-phone" novalidate style="margin-top:32px;display:flex;flex-direction:column;gap:16px">
        <div><h2 class="flowh1">${login?'Welcome back':'Create your account'}</h2><p class="muted" style="margin-top:8px">${login?'Log in with the phone number on your plan.':'It takes a minute. You will choose your plan and pickup day next.'}</p></div>
        ${!login?`<label class="field">Full name<input class="input" name="name" autocomplete="name" placeholder="Adaeze Okafor" value="${esc(UI.authName||'')}"></label>`:''}
        <label class="field">Phone number<span style="display:flex;border:1px solid #CFDCE6;border-radius:14px;background:#fff;overflow:hidden"><span style="padding:14px;font-weight:600;background:#F1F6FA;border-right:1px solid #CFDCE6">+234</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="803 000 0000" value="${esc(UI.authPhoneRaw||'')}" style="border:0;padding:14px 16px;flex:1;min-width:0;font-size:16px;font-weight:400;outline:none"></span></label>
        ${!login?`<label class="field">Email (for receipts)<input class="input" name="email" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(UI.authEmail||'')}"></label>`:''}
        ${UI.authErr?`<p class="err" role="alert">${esc(UI.authErr)}</p>`:''}
        <button class="btn btn-dark btn-lg btn-block">Send me a code ${ARROW}</button>
        <p class="xs soft" style="text-align:center">We'll send a 6-digit code by SMS or WhatsApp. No passwords to remember.</p>
      </form>` : `
      <form data-form="auth-code" novalidate style="margin-top:32px;display:flex;flex-direction:column;gap:16px">
        <button type="button" class="linkbtn" data-act="auth-back" style="align-self:flex-start">← Change number</button>
        <div><h2 class="flowh1">Enter your code</h2><p class="muted" style="margin-top:8px">Sent to ${showPhone(UI.authPhone)}.</p></div>
        <fieldset style="border:0;padding:0;margin:0"><legend class="sr">6-digit code</legend><div class="otp">${[0,1,2,3,4,5].map(i=>`<input aria-label="Digit ${i+1}" inputmode="numeric" maxlength="1" data-otp="${i}" autocomplete="${i===0?'one-time-code':'off'}">`).join('')}</div></fieldset>
        ${UI.authErr?`<p class="err" role="alert">${esc(UI.authErr)}</p>`:''}
        <button class="btn btn-dark btn-lg btn-block">${login?'Verify and log in':'Verify and choose a plan'}</button>
        <p class="demo-note">Demo mode: your code is <b>${UI.otp}</b>. In production this is sent by SMS or WhatsApp.</p>
        <p class="small soft" style="text-align:center">Didn't get it? <button type="button" class="linkbtn" data-act="auth-resend">Resend code</button></p>
      </form>`}
      <p class="xs soft" style="text-align:center;margin-top:36px">By continuing you agree to our Terms and Privacy policy. <a href="#/">Back to home</a></p>
    </div></div>
  </div>`;
}
/* ---------- Subscribe ---------- */
function nextDateFor(dow){ let d=addDays(today(),1); while(d.getDay()!==dow) d=addDays(d,1); return d; }
function radio(on){ return `<span style="flex:none;width:22px;height:22px;border-radius:50%;border:2px solid ${on?'var(--ink)':'#C9DCEA'};display:flex;align-items:center;justify-content:center"><span style="width:10px;height:10px;border-radius:50%;background:${on?'var(--ink)':'transparent'}"></span></span>`; }
function viewSubscribe(){
  const u = me();
  if (!UI.sub){ UI.sub = { step:0, plan: UI.pickedPlan || u.plan || 'weekly', area: CONFIG.areas.find(a=>a.open).name, label:'Home', street:'', building:'', landmark:'', notes:'', contact: '0'+u.phone, day:2, window:0, shirts:'On hangers', detergent:'Standard, lightly scented', starch:false, whites:true, method:'card', agree:true }; }
  const s = UI.sub; const p = CONFIG.plans[s.plan];
  const disc = isFounding() ? Math.round(p.price*CONFIG.foundingDiscount) : 0;
  const first = nextDateFor(s.day); const openAreas = CONFIG.areas.filter(a=>a.open);
  let body = '';
  if (s.step===0) body = `<h1 class="flowh1">Choose your plan</h1><p class="muted" style="margin-top:8px">You can change or pause it any time from your account.</p>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:28px">
      ${PLAN_KEYS.map(k=>{ const q=CONFIG.plans[k]; const on=k===s.plan; return `<button type="button" class="choice ${on?'on':''}" aria-pressed="${on}" data-act="sub-plan" data-plan="${k}" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:14px">${radio(on)}<span style="width:76px;height:76px;border-radius:14px;overflow:hidden;flex:none"><img class="photo" src="${IMG[q.img]}" alt=""></span><span style="flex:1 1 200px"><span style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b style="font-family:var(--display);font-size:20px;font-weight:600">${q.name}</b>${q.tag?`<span class="pill pill-amber">${q.tag}</span>`:''}</span><span class="muted" style="display:block;margin-top:4px;font-size:14px">${q.pickups} pickups a month · up to ${q.kg} kg each · ${q.service.toLowerCase()}</span></span><span style="text-align:right;padding-right:8px"><b style="display:block;font-family:var(--display);font-size:24px;font-weight:500;letter-spacing:-.02em">${naira(q.price)}</b><span class="xs soft">per month</span></span></button>`; }).join('')}
    </div>
    <div style="margin-top:18px;background:var(--sky);border-radius:18px;padding:14px 18px;font-size:15px;display:flex;gap:12px;align-items:center;color:var(--blue)">${I.alert}<span style="color:var(--ink)">Need uniforms or linen for a business or estate? <button type="button" class="linkbtn" data-act="quote" style="font-size:15px">Request a quote</button> instead.</span></div>`;
  if (s.step===1) body = `<h1 class="flowh1">Where should we pick up?</h1><p class="muted" style="margin-top:8px">We currently serve ${openAreas.map(a=>a.name).join(' and ')}.</p>
    <form data-form="sub-address" class="card-b" novalidate style="margin-top:28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px">
      <label class="field">Area<select class="input" name="area">${openAreas.map(a=>`<option ${a.name===s.area?'selected':''}>${a.name}</option>`).join('')}</select></label>
      <label class="field">Address label<select class="input" name="label">${['Home','Office','Other'].map(x=>`<option ${x===s.label?'selected':''}>${x}</option>`).join('')}</select></label>
      <label class="field" style="grid-column:1/-1">Street address<input class="input" name="street" autocomplete="street-address" value="${esc(s.street)}" placeholder="12 Admiralty Way"></label>
      <label class="field">Estate, building or flat<input class="input" name="building" value="${esc(s.building)}" placeholder="Flat 3B, Palm Court"></label>
      <label class="field">Nearest landmark<input class="input" name="landmark" value="${esc(s.landmark)}" placeholder="Opposite the filling station"></label>
      <label class="field" style="grid-column:1/-1">Notes for the rider (gate, security, who hands over the bag)<textarea class="input" name="notes" rows="3" placeholder="Tell security it's ${CONFIG.brand}.">${esc(s.notes)}</textarea></label>
      <label class="field">Contact on pickup day<input class="input" name="contact" type="tel" value="${esc(s.contact)}"></label>
      ${UI.subErr?`<p class="err" role="alert" style="grid-column:1/-1">${esc(UI.subErr)}</p>`:''}
    </form>`;
  if (s.step===2) body = `<h1 class="flowh1">Pick your regular pickup day</h1>
    <p class="muted" style="margin-top:8px">${s.plan==='fresh'?'Your rider comes on this day every other week.':'Your rider comes on the same day each week.'} Your first pickup would be <b style="color:var(--ink)">${fmtL(first)}</b>.</p>
    <div class="card-b" style="margin-top:28px"><h2 style="font-size:16px;font-weight:600;margin-bottom:14px">Day of the week</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px">${[1,2,3,4,5,6].map(d=>`<button type="button" class="chip ${d===s.day?'on':''}" aria-pressed="${d===s.day}" data-act="sub-day" data-d="${d}">${DOW[d]}</button>`).join('')}</div>
      <h2 style="font-size:16px;font-weight:600;margin:28px 0 14px">Two-hour window</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">${CONFIG.windows.map((w,i)=>`<button type="button" class="chip ${i===s.window?'on':''}" aria-pressed="${i===s.window}" data-act="sub-win" data-w="${i}">${w}</button>`).join('')}</div>
    </div>
    <div class="card-b" style="margin-top:16px"><h2 style="font-size:16px;font-weight:600;margin-bottom:16px">How you like your clothes</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px">
        <label class="field">Shirts<select class="input" data-bind="shirts">${['On hangers','Folded'].map(x=>`<option ${x===s.shirts?'selected':''}>${x}</option>`).join('')}</select></label>
        <label class="field">Detergent<select class="input" data-bind="detergent">${['Standard, lightly scented','Unscented, sensitive skin'].map(x=>`<option ${x===s.detergent?'selected':''}>${x}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-bind="starch" ${s.starch?'checked':''}> Light starch on shirts</label>
        <label class="check"><input type="checkbox" data-bind="whites" ${s.whites?'checked':''}> Wash whites separately</label>
      </div></div>`;
  if (s.step===3) body = `<h1 class="flowh1">Review and pay</h1><p class="muted" style="margin-top:8px">Payments are processed securely by Paystack. Riders never collect cash.</p>
    <div class="card-b" style="margin-top:28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;font-size:15px">
      <div><p class="xs soft">Plan</p><p style="font-weight:600;margin-top:4px">${p.name} · ${p.pickups} pickups, ${p.kg} kg each</p></div>
      <div><p class="xs soft">Pickup</p><p style="font-weight:600;margin-top:4px">${s.plan==='fresh'?'Every other':'Every'} ${DOW_L[s.day]}, ${CONFIG.windows[s.window]}</p></div>
      <div><p class="xs soft">Address</p><p style="font-weight:600;margin-top:4px">${esc(s.street)}, ${esc(s.area)}</p></div>
      <div><p class="xs soft">First pickup</p><p style="font-weight:600;margin-top:4px">${fmtL(first)}</p></div>
    </div>
    <h2 style="font-size:16px;font-weight:600;margin:28px 0 14px">Payment method</h2>
    <div style="display:flex;flex-direction:column;gap:10px">${[['card','Card','Visa, Mastercard or Verve. Saved for monthly billing.'],['transfer','Bank transfer','Pay to a dedicated account number. We remind you before each renewal.'],['ussd','USSD','Dial a code from your bank. Works without internet.']].map(m=>{const on=s.method===m[0];return `<button type="button" class="choice ${on?'on':''}" aria-pressed="${on}" data-act="sub-method" data-m="${m[0]}" style="display:flex;gap:14px;align-items:center">${radio(on)}<span><b style="display:block">${m[1]}</b><span class="small soft">${m[2]}</span></span></button>`;}).join('')}</div>
    <label class="check" style="margin-top:22px"><input type="checkbox" data-bind="agree" ${s.agree?'checked':''}> ${isFounding()?'I agree to the 3-month founding-member commitment, the Terms, and the damage and loss policy. ':'I agree to the Terms and the damage and loss policy. '}My plan renews monthly until I cancel.</label>
    ${UI.subErr?`<p class="err" role="alert" style="margin-top:10px">${esc(UI.subErr)}</p>`:''}`;
  return `<div style="min-height:100vh;background:var(--bg)">
    <header class="flowbar"><div class="wrap between" style="padding-top:14px;padding-bottom:14px">
      <a class="logo" href="#/">${LOGO()}<span>${CONFIG.brand}</span></a>
      <ol class="steps" aria-label="Sign-up steps">${['Plan','Address','Pickup day','Pay'].map((l,i)=>`<li><button type="button" class="${i===s.step?'cur':''} ${i<s.step?'done':''}" ${i===s.step?'aria-current="step"':''} data-act="sub-step" data-i="${i}"><span class="dot">${i<s.step?'✓':i+1}</span>${l}</button></li>`).join('')}</ol>
      <a href="#/" class="small" style="font-weight:600;color:var(--muted);text-decoration:none">Cancel</a>
    </div></header>
    <div class="wrap" style="padding-top:40px;padding-bottom:64px;display:flex;flex-wrap:wrap;gap:32px;align-items:flex-start">
      <main style="flex:999 1 520px;min-width:0">${body}
        <div class="between" style="margin-top:32px">
          ${s.step>0?`<button type="button" class="btn btn-light btn-lg" data-act="sub-prev">Back</button>`:'<span></span>'}
          ${s.step<3?`<button type="button" class="btn btn-dark btn-lg" data-act="sub-next">${['Continue to address','Continue to pickup day','Continue to payment'][s.step]} ${ARROW}</button>`:`<button type="button" class="btn btn-blue btn-lg" data-act="sub-pay">Pay ${naira(p.price-disc)} and start</button>`}
        </div>
      </main>
      <aside class="card-b" aria-label="Summary" style="flex:1 1 300px;min-width:0;padding:14px 14px 24px">
        <div style="border-radius:18px;overflow:hidden;height:180px;position:relative"><img class="photo" src="${IMG[p.img]}" alt=""><span class="pill" style="position:absolute;left:12px;top:12px;background:rgba(255,255,255,.9)">${p.name}</span></div>
        <div style="padding:20px 12px 0">
          <h2 class="cardh">Summary</h2>
          <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px;font-size:15px">
            <div class="between"><span>${p.name} plan</span><b>${naira(p.price)}</b></div>
            ${disc?`<div class="between" style="color:var(--green)"><span>Founding member, ${Math.round(CONFIG.foundingDiscount*100)}% off month 1</span><b>−${naira(disc)}</b></div>`:''}
            <div class="between"><span>Pickup and delivery</span><b>Free</b></div>
            <div style="height:1px;background:var(--line);margin:4px 0"></div>
            <div class="between" style="font-size:18px;font-weight:700"><span>Due today</span><span>${naira(p.price-disc)}</span></div>
            <p class="xs soft">Then ${naira(p.price)} every month. Extra weight is billed at ${naira(CONFIG.overweightPerKg)} per kg.</p>
          </div>
          <div style="margin-top:20px;background:var(--bg);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px;font-size:14px;color:var(--blue)">
            <span style="display:flex;gap:10px;align-items:center">${I.shield}<span style="color:var(--ink)">Loss and damage guarantee</span></span>
            <span style="display:flex;gap:10px;align-items:center">${I.clock}<span style="color:var(--ink)">Back within 48 hours</span></span>
            <span style="display:flex;gap:10px;align-items:center">${I.pause}<span style="color:var(--ink)">Pause one month a year</span></span>
          </div>
        </div>
      </aside>
    </div>
  </div>`;
}

/* ---------- App shell ---------- */
function shell(active, inner){
  const u = me(); const p = plan(u);
  const items = [['app','Dashboard',I.home],['app/schedule','Schedule pickup',I.cal],['app/orders','Orders',I.list],['app/billing','Plan &amp; billing',I.card]];
  const initials = u.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
  return `<div class="shell">
    <header class="appbar"><a class="logo" href="#/app" style="color:#fff">${LOGO('#4C93D1')}<span>${CONFIG.brand}</span></a><button class="btn btn-ghost btn-sm" data-act="logout">Log out</button></header>
    <aside class="side">
      <a class="logo" href="#/" style="color:#fff;padding:0 8px">${LOGO('#4C93D1')}<span>${CONFIG.brand}</span></a>
      <nav aria-label="Account">${items.map(i=>`<a href="#/${i[0]}" class="${active===i[0]?'on':''}" ${active===i[0]?'aria-current="page"':''}>${i[2]}${i[1]}</a>`).join('')}</nav>
      <div style="margin-top:auto;display:flex;flex-direction:column;gap:14px">
        <div style="border-radius:18px;overflow:hidden;position:relative;height:150px"><img class="photo" src="${IMG.rider}" alt=""><div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,rgba(11,29,42,.85))"></div><div style="position:absolute;left:14px;right:14px;bottom:12px"><p style="font-size:14px;font-weight:600">Need help?</p><a href="https://wa.me/${CONFIG.whatsapp}" target="_blank" rel="noopener" style="color:#fff;font-size:13px">Chat on WhatsApp →</a></div></div>
        <div style="display:flex;align-items:center;gap:12px;padding:0 8px">
          <span style="width:40px;height:40px;border-radius:50%;background:var(--orange);color:var(--ink);font-weight:700;display:flex;align-items:center;justify-content:center;flex:none">${esc(initials)}</span>
          <div style="flex:1;min-width:0"><p style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.name)}</p><p style="font-size:12px;color:#C3D4DE">${p.name}${u.status!=='active'?' · '+u.status:''}</p></div>
          <button data-act="logout" aria-label="Log out" style="background:none;border:0;color:#C3D4DE;padding:8px;display:flex">${I.out}</button>
        </div>
      </div>
    </aside>
    <div class="content">${inner}</div>
    <nav class="tabbar" aria-label="App">${items.map(i=>`<a href="#/${i[0]}" class="${active===i[0]?'on':''}">${i[2]}<span>${i[1].replace('&amp;','&').split(' ')[0]}</span></a>`).join('')}</nav>
  </div>`;
}
function statusPill(o){
  if (o.cancelled) return '<span class="pill pill-grey">Cancelled</span>';
  if (o.issue && o.issue.status==='open') return '<span class="pill pill-orange">Issue open</span>';
  if (o.status===6) return '<span class="pill pill-green">Delivered</span>';
  if (o.status===0) return '<span class="pill pill-grey">Scheduled</span>';
  return `<span class="pill pill-blue">${STATUSES[o.status]}</span>`;
}
const typeName = t => ({regular:'Plan pickup', extra:'Extra pickup', dry:'Dry cleaning'})[t];
function addrLine(u,i){ const a=u.addresses[i]||u.addresses[0]; return a.street + (a.building?', '+a.building:'') + ', ' + a.area; }
function returnDate(o){ return addDays(parse(o.date), o.extras.includes('express')?1:2); }
function activity(u){
  const out=[];
  DB.orders.filter(o=>o.phone===u.phone).forEach(o=>o.history.forEach(h=>{ if(h.s>0) out.push({ at:h.at, t:`${o.id}: ${STATUSES[h.s]}${h.s===1&&o.kg?` · ${o.kg} kg`:''}${h.s===2&&o.items?` · ${o.items} items`:''}`, c: h.s===6?'#2E7D32':'#1F6FB2' }); }));
  DB.orders.filter(o=>o.phone===u.phone && o.flags.length).forEach(o=>o.flags.forEach(f=>out.push({at:f.at, t:`${o.id}: ${f.text}`, c:'#F2A65A'})));
  return out.sort((a,b)=>b.at-a.at);
}

/* ---------- Dashboard ---------- */
function viewDashboard(){
  const u = me(); const p = plan(u); const c = cycleOf(u); const orders = myOrders();
  const active = orders.filter(o=>o.status>=1 && o.status<6 && !o.cancelled).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const next = orders.filter(o=>o.status===0 && !o.cancelled).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const inCycle = cycleRegular(u); const used = inCycle.filter(o=>o.status>=1).length; const booked = inCycle.filter(o=>o.status===0).length;
  const kg = inCycle.reduce((s,o)=>s+(o.kg||0),0);
  const hr = new Date().getHours(); const greet = hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  const acts = activity(u);
  const activeCard = active ? `
    <section class="card" style="flex:2 1 480px;min-width:0" aria-label="Active order">
      <div class="between" style="align-items:flex-start"><div><p class="small soft">Active order · ${active.id}</p><h2 class="apph1" style="font-size:28px;margin-top:6px">${STATUSES[active.status]}</h2><p class="muted" style="margin-top:6px;font-size:15px">Expected back <b style="color:var(--ink)">${fmt(returnDate(active))}, ${CONFIG.windows[active.window]}</b></p></div><a class="btn btn-soft btn-sm" href="#/app/track/${active.id}">Track order →</a></div>
      <ol class="track5" style="margin-top:28px">${[1,2,3,4,6].map((st,i)=>{ const cls = active.status>=st ? 'done' : (active.status===st-1||(st===6&&active.status===5)?'now':'todo'); return `<li class="${cls}"><i></i><p>${['Picked up','Tagged','Washing','Packed','Delivered'][i]}</p></li>`; }).join('')}</ol>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-top:24px">
        <div style="background:var(--bg);border-radius:16px;padding:14px 16px"><p class="xs soft">Weight</p><p style="font-size:18px;font-weight:700;margin-top:4px">${active.kg?active.kg+' kg':'—'}</p></div>
        <div style="background:var(--bg);border-radius:16px;padding:14px 16px"><p class="xs soft">Items</p><p style="font-size:18px;font-weight:700;margin-top:4px">${active.items??'Counting'}</p></div>
        <div style="background:var(--bg);border-radius:16px;padding:14px 16px"><p class="xs soft">Type</p><p style="font-size:18px;font-weight:700;margin-top:4px">${typeName(active.type)}</p></div>
        ${active.flags.length?`<div style="background:var(--orange-bg);border-radius:16px;padding:14px 16px"><p class="xs" style="color:var(--orange-ink)">Notes</p><p style="font-size:18px;font-weight:700;margin-top:4px">${active.flags.length} flagged</p></div>`:''}
      </div>
    </section>` : `
    <section style="flex:2 1 480px;min-width:0;position:relative;border-radius:24px;overflow:hidden;min-height:300px;display:flex;align-items:flex-end;color:#fff" aria-label="Active order">
      <img class="photo" src="${IMG.folded}" alt="" style="position:absolute;inset:0"><div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(11,29,42,.85),rgba(11,29,42,.2))"></div>
      <div style="position:relative;padding:28px;max-width:460px"><p class="small" style="color:#C7D5DF">No laundry with us right now</p><h2 class="apph1" style="font-size:30px;margin-top:6px">${next?'Your next pickup is booked.':'Nothing scheduled yet.'}</h2><p style="margin-top:8px;color:#DCE7EF">When your rider collects your bag, you'll see every step here.</p>
      <div class="row" style="margin-top:20px;gap:10px"><a class="btn btn-white" href="#/app/schedule">Schedule a pickup</a>${orders.length?'<a class="btn btn-ghost" href="#/app/orders">Past orders</a>':''}</div></div>
    </section>`;
  const nextCard = `
    <section class="card-dark" style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column" aria-label="Next pickup">
      <p class="small" style="color:#B9CCD8">Next pickup${next&&next.type!=='regular'?' · '+typeName(next.type):''}</p>
      ${u.status==='paused' && !next ? `<p class="apph1" style="font-size:30px;margin-top:8px">Plan paused</p><p style="color:#D5E3EC;margin-top:6px">Resume any time in Plan &amp; billing.</p>` :
        next ? `<p class="apph1" style="font-size:34px;margin-top:8px">${fmt(next.date)}</p><p style="color:#D5E3EC;margin-top:6px">${CONFIG.windows[next.window]}</p>
        <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px;font-size:14px;color:#D5E3EC"><span style="display:flex;gap:10px;align-items:center"><span style="color:#8CC0E8">${I.pin}</span>${esc(u.addresses[next.address]?.label||'Home')} · ${esc(addrLine(u,next.address))}</span><span style="display:flex;gap:10px;align-items:center"><span style="color:#8CC0E8">${I.bag}</span>${next.bags} bag${next.bags>1?'s':''}</span></div>
        <div style="margin-top:auto;padding-top:24px;display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-white btn-sm" style="flex:1" href="#/app/schedule">Reschedule</a>${next.type==='regular'?`<button class="btn btn-ghost btn-sm" style="flex:1" data-act="skip" data-id="${next.id}">Skip this one</button>`:`<button class="btn btn-ghost btn-sm" style="flex:1" data-act="cancel-order" data-id="${next.id}">Cancel</button>`}</div>` :
        `<p class="apph1" style="font-size:30px;margin-top:8px">None booked</p><p style="color:#D5E3EC;margin-top:6px">You've used this cycle's pickups. Book an extra one any time.</p><a class="btn btn-white btn-sm" style="margin-top:20px;align-self:flex-start" href="#/app/schedule">Book extra pickup</a>`}
    </section>`;
  return shell('app', `
    <div class="between"><div><p class="small soft">${fmtL(today())}</p><h1 class="apph1" style="margin-top:4px">${greet}, ${esc(u.name.split(' ')[0])}</h1></div><a class="btn btn-dark" href="#/app/schedule">${I.plus}Schedule pickup</a></div>
    ${u.status==='cancelled'?`<div class="demo-note" style="margin-top:20px;font-size:14px">Your plan is cancelled and ends on ${fmtY(c.end)}. <a href="#/app/billing">Restart it</a></div>`:''}
    <div class="row" style="margin-top:28px">${activeCard}${nextCard}</div>
    <div class="row" style="margin-top:16px">
      <section class="card" style="flex:1 1 320px;min-width:0" aria-label="Plan usage">
        <div class="between"><h2 class="cardh">${p.name}</h2><a href="#/app/billing" class="small" style="font-weight:600">Manage</a></div>
        <p class="small soft" style="margin-top:4px">Cycle ${fmt(c.start)} – ${fmt(c.end)} · renews ${fmt(c.renew)} for ${naira(p.price)}</p>
        <div style="margin-top:22px"><div class="between small"><b>Pickups</b><span><b>${used}</b> used${booked?`, ${booked} booked`:''} of ${p.pickups}</span></div><div class="bar" style="margin-top:8px"><span style="width:${Math.min(100,(used+booked)/p.pickups*100)}%"></span></div></div>
        <div style="margin-top:18px"><div class="between small"><b>Weight</b><span><b>${kg.toFixed(1)} kg</b> of ${p.pickups*p.kg} kg</span></div><div class="bar" style="margin-top:8px"><span style="width:${Math.min(100,kg/(p.pickups*p.kg)*100)}%;background:var(--orange)"></span></div></div>
        <p class="xs soft" style="margin-top:16px">${u.pendingCharges?`${naira(u.pendingCharges)} in extra charges will be added to your next bill.`:`Limit is ${p.kg} kg per pickup. Extra weight is ${naira(CONFIG.overweightPerKg)} per kg.`}</p>
      </section>
      <section class="card" style="flex:1 1 320px;min-width:0" aria-label="Quick actions">
        <h2 class="cardh">Quick actions</h2>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:18px">
          ${[['app/schedule',I.bag,'Extra pickup','extra'],['app/schedule',I.tag,'Dry cleaning','dry'],['app/orders',I.alert,'Report an issue',''],['app/billing',I.pause,'Pause plan','']].map(a=>`<a href="#/${a[0]}" ${a[3]?`data-act="sched-type" data-t="${a[3]}"`:''} style="display:flex;flex-direction:column;gap:10px;background:var(--bg);border-radius:18px;padding:16px;text-decoration:none;color:var(--ink)"><span style="color:var(--blue)">${a[1]}</span><b class="small">${a[2]}</b></a>`).join('')}
        </div>
      </section>
      <section class="card" style="flex:1 1 320px;min-width:0" aria-label="Updates">
        <h2 class="cardh">Updates</h2>
        ${acts.length?`<ol style="list-style:none;margin:18px 0 0;padding:0;display:flex;flex-direction:column;gap:16px">${acts.slice(0,4).map(a=>`<li style="display:flex;gap:12px"><span style="flex:none;width:10px;height:10px;border-radius:50%;background:${a.c};margin-top:6px"></span><div><p class="small" style="font-weight:600">${esc(a.t)}</p><p class="xs soft">${fmtTime(a.at)}</p></div></li>`).join('')}</ol>`:'<p class="muted small" style="margin-top:14px">Updates about your orders will appear here.</p>'}
      </section>
    </div>
    <div class="row" style="margin-top:16px">
      <section class="card" style="flex:2 1 480px;min-width:0" aria-label="Recent orders">
        <div class="between"><h2 class="cardh">Recent orders</h2><a href="#/app/orders" class="small" style="font-weight:600">View all</a></div>
        <div style="margin-top:8px">${orders.slice(0,4).map(o=>`<a href="#/app/track/${o.id}" style="display:flex;gap:16px;align-items:center;padding:16px 0;border-bottom:1px solid #EDF2F6;text-decoration:none;color:var(--ink);flex-wrap:wrap"><b style="width:90px">${o.id}</b><span class="muted small" style="flex:1;min-width:150px">${fmt(o.date)} · ${typeName(o.type)}${o.items?` · ${o.items} items`:''}${o.kg?` · ${o.kg} kg`:''}</span>${statusPill(o)}</a>`).join('') || '<p class="muted small" style="padding:14px 0">No orders yet.</p>'}</div>
      </section>
      <section style="flex:1 1 300px;min-width:0;position:relative;border-radius:24px;overflow:hidden;color:#fff;min-height:260px;display:flex;flex-direction:column;justify-content:flex-end" aria-label="Refer a friend">
        <img class="photo" src="${IMG.woman}" alt="" style="position:absolute;inset:0"><div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,29,42,.1),rgba(11,29,42,.85))"></div>
        <div style="position:relative;padding:24px"><h2 class="cardh" style="font-size:22px">Give a free pickup, get one</h2><p style="margin-top:6px;font-size:14px;color:#DCE7EF">When a friend subscribes with your code, you both get one free pickup.</p>
        <div style="margin-top:16px;display:flex;gap:8px;align-items:center;background:#fff;border-radius:999px;padding:6px 6px 6px 18px;color:var(--ink)"><b style="flex:1;letter-spacing:.08em">${esc(u.referral)}</b><button class="btn btn-dark btn-sm" data-act="copy" data-v="${esc(u.referral)}">Copy</button></div></div>
      </section>
    </div>`);
}
/* ---------- Schedule ---------- */
function stepper(key,val){ return `<div style="display:flex;align-items:center;gap:6px;background:var(--bg);border-radius:999px;padding:5px"><button type="button" class="chip" style="width:40px;height:40px;padding:0;border-radius:50%;border:0" data-act="sch-step" data-k="${key}" data-n="-1" aria-label="Fewer">−</button><span aria-live="polite" style="min-width:40px;text-align:center;font-size:18px;font-weight:700">${val}</span><button type="button" class="chip" style="width:40px;height:40px;padding:0;border-radius:50%;border:0" data-act="sch-step" data-k="${key}" data-n="1" aria-label="More">+</button></div>`; }
function slotLoad(date){ const l=[0,0,0,0,0,0]; DB.orders.filter(o=>o.date===date && o.status===0 && !o.cancelled).forEach(o=>l[o.window]++); return l; }
function schedCost(s){
  const lines=[]; let total=0;
  if (s.type==='move') lines.push(['Plan pickup','Included']);
  if (s.type==='extra'){ const c=CONFIG.extraPickup*s.bags; lines.push([`Extra pickup × ${s.bags}`, naira(c)]); total+=c; }
  if (s.type==='dry'){ const c=CONFIG.dryCleanItem*s.dryItems; lines.push([`Dry cleaning × ${s.dryItems}`, naira(c)]); total+=c; }
  if (s.extras.includes('duvet')){ lines.push(['Duvet', naira(CONFIG.duvet)]); total+=CONFIG.duvet; }
  if (s.extras.includes('dry')) lines.push(['Dry cleaning items','Priced at pickup']);
  if (s.extras.includes('express')){ lines.push(['Express return', naira(CONFIG.express)]); total+=CONFIG.express; }
  return {lines,total};
}
function viewSchedule(){
  const u = me(); const p = plan(u); const upcoming = upcomingRegular(u);
  if (!UI.sch){
    const t = UI.schedType || (upcoming ? 'move' : 'extra');
    const base = upcoming && t==='move' ? parse(upcoming.date) : nextDateFor(u.pickupDay);
    UI.sch = { type:t, date: iso(base), window: upcoming && t==='move' ? upcoming.window : u.window, address:0, bags:1, extras:[], note:'', month: base.getMonth(), year: base.getFullYear(), done:null, dryItems:2 };
    UI.schedType = null;
  }
  const s = UI.sch;
  if (s.done){
    const o = DB.orders.find(x=>x.id===s.done);
    return shell('app/schedule', `<section class="card" aria-live="polite" style="max-width:640px;margin:40px auto 0;text-align:center;padding:0;overflow:hidden">
      <div style="height:200px"><img class="photo" src="${IMG.rider}" alt=""></div>
      <div style="padding:40px 32px">
      <h1 class="apph1">Pickup booked</h1>
      <p class="muted" style="margin-top:10px;font-size:16px">${o.id} · ${fmtL(o.date)}, ${CONFIG.windows[o.window]} at ${esc(addrLine(u,o.address))}. We'll send your rider's name on WhatsApp the evening before.</p>
      <div class="row" style="justify-content:center;margin-top:28px;gap:10px"><a class="btn btn-dark" href="#/app">Back to dashboard</a><button class="btn btn-light" data-act="sch-reset">Book another</button></div></div>
    </section>`);
  }
  const types = [ ...(upcoming?[['move','Move my next plan pickup',`Currently ${fmt(upcoming.date)}, ${CONFIG.windows[upcoming.window]}.`]]:[]),
    ['extra','Extra pickup',`On top of your plan. ${naira(CONFIG.extraPickup)}, up to ${p.kg} kg per bag.`],
    ['dry','Dry cleaning only',`Suits, agbada, gowns. ${naira(CONFIG.dryCleanItem)} per item.`] ];
  const first = new Date(s.year, s.month, 1); const lead = (first.getDay()+6)%7; const dim = new Date(s.year, s.month+1, 0).getDate();
  const min = addDays(today(),1); const max = addDays(today(),60);
  const cells = []; for(let i=0;i<lead;i++) cells.push('<span class="blank"></span>');
  for(let d=1; d<=dim; d++){ const dt=new Date(s.year,s.month,d); const k=iso(dt); const dis = dt<min || dt>max || dt.getDay()===0; const reg = dt.getDay()===u.pickupDay && !dis;
    cells.push(`<button type="button" class="${k===s.date?'on':''} ${reg?'reg':''}" ${dis?'disabled':''} aria-pressed="${k===s.date}" aria-label="${fmtL(dt)}${dis?', unavailable':''}" data-act="sch-date" data-d="${k}">${d}</button>`); }
  const canPrev = new Date(s.year,s.month,1) > new Date(min.getFullYear(),min.getMonth(),1); const canNext = new Date(s.year,s.month+1,1) <= max;
  const load = slotLoad(s.date);
  const extrasList = s.type==='dry' ? [['express','Express return','Back within 24 hours instead of 48.',CONFIG.express]] : [['duvet','Duvet or comforter','Washed on its own, returned in a zip bag.',CONFIG.duvet],['dry','Dry cleaning items','Tell the rider which items at pickup.',CONFIG.dryCleanItem],['express','Express return','Back within 24 hours instead of 48.',CONFIG.express]];
  const cost = schedCost(s);
  return shell('app/schedule', `
    <a href="#/app" class="small" style="font-weight:600;text-decoration:none">← Dashboard</a>
    <h1 class="apph1" style="margin-top:8px">Schedule a pickup</h1>
    <p class="muted" style="margin-top:6px">Move your next plan pickup, or book an extra one.</p>
    <div class="row" style="margin-top:28px;align-items:flex-start">
      <div style="flex:999 1 520px;min-width:0;display:flex;flex-direction:column;gap:16px">
        <section class="card" aria-label="Pickup type"><h2 class="cardh" style="margin-bottom:16px">What kind of pickup?</h2>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">${types.map(t=>`<button type="button" class="choice ${s.type===t[0]?'on':''}" aria-pressed="${s.type===t[0]}" data-act="sch-type" data-t="${t[0]}"><b style="display:block">${t[1]}</b><span class="xs muted" style="display:block;margin-top:4px">${t[2]}</span></button>`).join('')}</div>
        </section>
        <section class="card" aria-label="Date and time" style="display:flex;flex-wrap:wrap;gap:32px">
          <div style="flex:1 1 300px;min-width:0">
            <div class="between"><h2 class="cardh">${MON_L[s.month]} ${s.year}</h2><div style="display:flex;gap:6px"><button class="chip" style="width:38px;height:38px;padding:0;border-radius:50%" data-act="sch-month" data-n="-1" ${canPrev?'':'disabled'} aria-label="Previous month">‹</button><button class="chip" style="width:38px;height:38px;padding:0;border-radius:50%" data-act="sch-month" data-n="1" ${canNext?'':'disabled'} aria-label="Next month">›</button></div></div>
            <div class="cal" style="margin-top:16px">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<span class="dow" aria-hidden="true">${d}</span>`).join('')}${cells.join('')}</div>
            <p class="xs soft" style="margin-top:14px;display:flex;gap:8px;align-items:center"><span style="width:6px;height:6px;border-radius:50%;background:var(--orange)"></span>Your regular ${DOW_L[u.pickupDay]} pickups · no pickups on Sundays</p>
          </div>
          <div style="flex:1 1 240px;min-width:0">
            <h2 class="cardh">Time window</h2><p class="small soft" style="margin-top:4px">${fmtL(s.date)}</p>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">${CONFIG.windows.map((w,i)=>{ const full = load[i]>=6; const few = load[i]>=4 && !full; return `<button type="button" class="chip ${i===s.window?'on':''}" ${full?'disabled':''} aria-pressed="${i===s.window}" data-act="sch-win" data-w="${i}" style="display:flex;justify-content:space-between;padding:13px 16px"><span>${w}</span><span class="xs" style="color:${i===s.window?'#F2C08F':full?'#8496A2':'#B4621A'}">${full?'Full':few?'Few slots left':''}</span></button>`; }).join('')}</div>
          </div>
        </section>
        <section class="card" aria-label="Details" style="display:flex;flex-direction:column;gap:24px">
          <div><h2 class="cardh" style="margin-bottom:14px">Pickup address</h2>
            <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">${u.addresses.map((a,i)=>`<button type="button" class="choice ${s.address===i?'on':''}" aria-pressed="${s.address===i}" data-act="sch-addr" data-i="${i}"><b style="display:block">${esc(a.label)}</b><span class="xs muted" style="display:block;margin-top:4px">${esc(addrLine(u,i))}</span></button>`).join('')}</div>
            <button type="button" class="linkbtn" data-act="add-address" style="margin-top:8px">+ Add a new address</button>
          </div>
          ${s.type==='dry' ? `<div class="between" style="padding-top:20px;border-top:1px solid #EDF2F6"><div><h2 class="cardh">How many items?</h2><p class="small soft" style="margin-top:4px">${naira(CONFIG.dryCleanItem)} per item.</p></div>${stepper('dryItems',s.dryItems)}</div>` :
          `<div class="between" style="padding-top:20px;border-top:1px solid #EDF2F6"><div><h2 class="cardh">How many bags?</h2><p class="small soft" style="margin-top:4px">One ${CONFIG.brand} bag holds about ${p.kg} kg.</p></div>${stepper('bags',s.bags)}</div>`}
          <div style="padding-top:20px;border-top:1px solid #EDF2F6"><h2 class="cardh" style="margin-bottom:14px">Add extras</h2>
            <div style="display:flex;flex-direction:column;gap:10px">${extrasList.map(x=>{ const on=s.extras.includes(x[0]); return `<button type="button" class="choice ${on?'on':''}" role="checkbox" aria-checked="${on}" data-act="sch-extra" data-x="${x[0]}" style="display:flex;gap:14px;align-items:center;padding:14px 16px"><span style="flex:none;width:22px;height:22px;border-radius:7px;border:2px solid ${on?'var(--ink)':'#C9DCEA'};background:${on?'var(--ink)':'#fff'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800">${on?'✓':''}</span><span style="flex:1"><b style="display:block">${x[1]}</b><span class="xs muted">${x[2]}</span></span><b class="small">${x[0]==='dry'?naira(x[3])+' / item':(x[0]==='express'?'+':'')+naira(x[3])}</b></button>`; }).join('')}</div>
          </div>
          <label class="field" style="padding-top:20px;border-top:1px solid #EDF2F6">Note for the rider (optional)<textarea class="input" rows="2" data-bind-sch="note" placeholder="e.g. Bag will be with security at the gate">${esc(s.note)}</textarea></label>
        </section>
      </div>
      <aside class="card-dark" aria-label="Summary" style="flex:1 1 300px;min-width:0;position:sticky;top:16px">
        <h2 class="cardh">Summary</h2>
        <div style="margin-top:20px;display:flex;flex-direction:column;gap:16px;font-size:15px">
          ${[['Type',types.find(t=>t[0]===s.type)[1]],['When',fmtL(s.date)+', '+CONFIG.windows[s.window]],['Where',esc(u.addresses[s.address].label)+' · '+esc(addrLine(u,s.address))],[s.type==='dry'?'Items':'Bags', s.type==='dry'?s.dryItems:`${s.bags} (about ${s.bags*p.kg} kg)`],['Back by',fmt(addDays(parse(s.date),s.extras.includes('express')?1:2))+', same window']].map(r=>`<div><p class="xs" style="color:#B9CCD8">${r[0]}</p><p style="font-weight:600;margin-top:4px">${r[1]}</p></div>`).join('')}
        </div>
        <div style="height:1px;background:rgba(255,255,255,.15);margin:22px 0"></div>
        <div style="display:flex;flex-direction:column;gap:10px;font-size:15px">${cost.lines.map(l=>`<div class="between"><span>${l[0]}</span><b>${l[1]}</b></div>`).join('')}<div class="between" style="font-size:17px;font-weight:700;padding-top:6px"><span>${cost.total?'Charged now':'Total'}</span><span>${naira(cost.total)}</span></div></div>
        <p class="xs" style="color:#B9CCD8;margin-top:14px">Over ${p.kg} kg per bag is billed at ${naira(CONFIG.overweightPerKg)} per kg after weighing at your door.</p>
        <button class="btn btn-white btn-lg btn-block" style="margin-top:22px" data-act="sch-confirm">${s.type==='move'&&!cost.total?'Move pickup':cost.total?'Pay and book':'Confirm pickup'}</button>
        <p class="xs" style="color:#B9CCD8;text-align:center;margin-top:10px">Free to change up to 12 hours before.</p>
      </aside>
    </div>`);
}

/* ---------- Track ---------- */
function viewTrack(id){
  const u = me();
  const o = DB.orders.find(x=>x.id===id && x.phone===u.phone) || myOrders().find(x=>x.status>=1&&x.status<6) || myOrders()[0];
  if (!o) return shell('app/orders', `<div class="card" style="margin-top:20px"><h1 class="apph1">No orders yet</h1><p class="muted" style="margin-top:8px">Book your first pickup to start tracking.</p><a class="btn btn-dark" style="margin-top:16px" href="#/app/schedule">Schedule pickup</a></div>`);
  const back = returnDate(o);
  const ev = STATUSES.map((st,i)=>{ const h=o.history.find(x=>x.s===i); return { st, at:h?h.at:null, cls: (i<o.status||(o.status===6&&i===6)||i===0) ? 'done' : i===o.status ? 'now' : 'todo' }; });
  const exp = [null,fmt(o.date),fmt(o.date),fmt(o.date),fmt(addDays(parse(o.date),1)),fmt(back),fmt(back)+', '+CONFIG.windows[o.window]];
  const R = UI.report && UI.report.id===o.id ? UI.report : null;
  return shell('app/orders', `
    <a href="#/app/orders" class="small" style="font-weight:600;text-decoration:none">← All orders</a>
    <div class="between" style="margin-top:8px;align-items:flex-end">
      <div><h1 class="apph1">Order ${o.id}</h1><p class="muted" style="margin-top:6px">${typeName(o.type)} · ${o.status===0?'Pickup':'Picked up'} ${fmtL(o.date)}</p></div>
      <div class="row" style="gap:10px">${o.status===0&&!o.cancelled?`<a class="btn btn-light" href="#/app/schedule">Reschedule</a>`:''}${o.status>=1?`<button class="btn btn-light" data-act="report-open" data-id="${o.id}">Report a problem</button>`:''}<a class="btn btn-dark" href="https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent('Hi, about order '+o.id)}" target="_blank" rel="noopener">${I.chat}Message us</a></div>
    </div>
    ${R?`<section class="card" style="margin-top:20px;border:2px solid var(--orange)" aria-label="Report a problem">${R.sent?`<div style="display:flex;gap:16px;align-items:center"><span style="width:48px;height:48px;border-radius:50%;background:var(--green-bg);color:var(--green);display:flex;align-items:center;justify-content:center">${I.check}</span><div><p style="font-size:18px;font-weight:700">Report received · ticket #R-${R.ticket}</p><p class="small muted">We'll message you on WhatsApp within 24 hours.</p></div></div>`:`
      <div class="between"><h2 class="cardh" style="font-size:22px">Report a problem with ${o.id}</h2><button class="chip" style="width:40px;height:40px;padding:0;border-radius:50%;border:0" data-act="report-close" aria-label="Close">×</button></div>
      <div class="row" style="gap:8px;margin-top:18px">${['Missing item','Damaged item','Stain not removed','Late pickup or delivery','Something else'].map(t=>`<button type="button" class="chip ${R.kind===t?'on':''}" style="border-radius:999px;padding:10px 16px;font-size:14px" data-act="report-kind" data-k="${t}">${t}</button>`).join('')}</div>
      <label class="field" style="margin-top:18px">What happened?<textarea class="input" rows="3" id="report-text" placeholder="Tell us which item and what's wrong.">${esc(R.text||'')}</textarea></label>
      <div class="row" style="gap:10px;margin-top:16px"><button class="btn btn-dark" data-act="report-send">Send report</button></div>
      <p class="xs soft" style="margin-top:12px">We reply within 24 hours. Lost or damaged items are paid back on our published scale.</p>`}</section>`:''}
    ${o.cancelled?`<div class="demo-note" style="margin-top:20px;font-size:14px">This pickup was cancelled.</div>`:`
    <section style="margin-top:20px;position:relative;border-radius:24px;overflow:hidden;padding:28px 32px" class="between" aria-label="Current status">
      <img class="photo" src="${IMG.hero}" alt="" style="position:absolute;inset:0;object-position:60% 40%"><div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(241,247,252,.95) 0%,rgba(241,247,252,.75) 50%,rgba(241,247,252,.1) 100%)"></div>
      <div style="display:flex;gap:18px;align-items:center;position:relative"><span class="ibox" style="width:64px;height:64px;border-radius:20px;background:#fff;color:var(--blue)">${[I.cal,I.bag,I.tag,I.clock,I.check,I.van,I.check][o.status]}</span><div><p class="small" style="color:var(--ink2)">Now</p><p class="apph1" style="font-size:30px">${STATUSES[o.status]}</p><p class="small" style="color:var(--ink2);margin-top:2px">${STATUS_HELP[o.status]}</p></div></div>
      <div class="glass" style="padding:16px 20px;border-radius:18px;position:relative"><p class="xs" style="color:var(--ink2)">${o.status===6?'Delivered':o.status===0?'Pickup window':'Delivery window'}</p><p style="font-size:18px;font-weight:700;margin-top:4px">${o.status===0?fmt(o.date):fmt(back)} · ${CONFIG.windows[o.window]}</p></div>
    </section>`}
    ${o.status===6 && !o.rating ? `<section class="card" style="margin-top:16px" aria-label="Rate"><div class="between"><div><h2 class="cardh">How was this load?</h2><p class="small muted" style="margin-top:4px">Your rating goes straight to the team that washed it.</p></div><div class="row" style="gap:6px">${[1,2,3,4,5].map(n=>`<button class="chip" style="width:48px;height:48px;padding:0;border-radius:14px;color:var(--orange)" data-act="rate" data-id="${o.id}" data-n="${n}" aria-label="${n} star${n>1?'s':''}">${I.star}</button>`).join('')}</div></div></section>`:''}
    <div class="row" style="margin-top:16px;align-items:flex-start">
      <section class="card" style="flex:999 1 460px;min-width:0" aria-label="Timeline"><h2 class="cardh" style="margin-bottom:20px">Timeline</h2>
        <ol class="tl">${ev.map((e,i)=>`<li class="${e.cls}"><div class="rail"><span class="dot">${e.cls==='done'?'✓':''}</span><span class="ln"></span></div><div class="body"><div class="between" style="align-items:baseline"><p style="font-weight:600;color:${e.cls==='todo'?'var(--soft)':e.cls==='now'?'var(--blue)':'var(--ink)'}">${i===0?'Pickup scheduled':e.st}</p><p class="xs soft">${e.at?fmtTime(e.at):(exp[i]?'Expected '+exp[i]:'')}</p></div><p class="small muted" style="margin-top:4px">${i===1&&o.kg?`Bag weighed at your door: ${o.kg} kg.`:i===2&&o.items?`${o.items} items tagged to you.${o.flags.length?' '+o.flags.length+' flagged (see right).':''}`:STATUS_HELP[i]}</p></div></li>`).join('')}</ol>
      </section>
      <div style="flex:1 1 320px;min-width:0;display:flex;flex-direction:column;gap:16px">
        <section class="card" aria-label="Details"><h2 class="cardh">Details</h2>
          <div style="margin-top:12px;font-size:15px">${[['Items',o.items??'Counted after pickup'],['Weight',o.kg?o.kg+' kg':'Weighed at pickup'],[o.type==='dry'?'Items to clean':'Bags',o.bags],['Extras',o.extras.length?o.extras.map(x=>({duvet:'Duvet',dry:'Dry cleaning',express:'Express'})[x]).join(', '):'None'],['Charged',o.cost?naira(o.cost):'Included in plan']].map(r=>`<div class="between" style="padding:11px 0;border-bottom:1px solid #EDF2F6"><span class="muted">${r[0]}</span><b>${r[1]}</b></div>`).join('')}</div>
          ${o.overweight?`<p class="demo-note" style="margin-top:14px">${o.overweight} kg over your limit · ${naira(o.overweight*CONFIG.overweightPerKg)} added to your next bill.</p>`:''}
        </section>
        ${o.flags.length?`<section class="card" aria-label="Flagged"><h2 class="cardh">Flagged before washing</h2>${o.flags.map(f=>`<div style="display:flex;gap:12px;margin-top:14px"><span class="ibox" style="width:44px;height:44px;background:var(--orange-bg);color:#B4621A">${I.camera}</span><p class="small" style="padding-top:2px">${esc(f.text)}</p></div>`).join('')}</section>`:''}
        ${o.status<6&&!o.cancelled?`<section class="card" aria-label="Delivery"><h2 class="cardh">Delivery</h2><p class="small muted" style="margin-top:6px">${esc(addrLine(u,o.address))}</p>
          <button class="choice" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;border:0;background:var(--bg)" role="switch" aria-checked="${o.security}" data-act="toggle-sec" data-id="${o.id}"><span><b style="display:block;font-size:15px">Leave with security if I'm out</b><span class="xs soft">We'll photo the handover for you.</span></span><span class="switch ${o.security?'on':''}"></span></button>
          ${o.status===0?`<button class="btn btn-light btn-block" style="margin-top:12px" data-act="cancel-order" data-id="${o.id}">${o.type==='regular'?'Skip this pickup':'Cancel pickup'}</button>`:''}
        </section>`:''}
      </div>
    </div>`);
}
/* ---------- Orders ---------- */
function viewOrders(){
  const u = me(); const all = myOrders();
  const f = UI.ofilter || 'all'; const q = (UI.oq||'').toLowerCase();
  const tests = { all:()=>true, active:o=>o.status<6&&!o.cancelled, delivered:o=>o.status===6, issues:o=>!!o.issue };
  const rows = all.filter(tests[f]).filter(o=>!q || o.id.toLowerCase().includes(q));
  const c = cycleOf(u); const inC = all.filter(o=>parse(o.date)>=c.start && parse(o.date)<=c.end && !o.cancelled);
  return shell('app/orders', `
    <div class="between"><div><h1 class="apph1">Orders</h1><p class="muted" style="margin-top:6px">Every pickup, its weight, item count and any extra charges.</p></div><a class="btn btn-dark" href="#/app/schedule">${I.plus}Schedule pickup</a></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:28px">
      <div class="stat"><p class="xs soft">Pickups this cycle</p><b>${cycleRegular(u).filter(o=>o.status>=1).length} <span style="font-size:16px;color:var(--soft)">of ${plan(u).pickups}</span></b></div>
      <div class="stat"><p class="xs soft">Washed this cycle</p><b>${inC.reduce((s,o)=>s+(o.kg||0),0).toFixed(1)} kg</b></div>
      <div class="stat"><p class="xs soft">Items handled</p><b>${all.reduce((s,o)=>s+(o.items||0),0)}</b></div>
      <div class="stat"><p class="xs soft">Extra charges pending</p><b>${naira(u.pendingCharges||0)}</b></div>
    </div>
    <section class="card" style="margin-top:16px;padding-bottom:12px" aria-label="Order list">
      <div class="between">
        <div class="tabs" role="tablist" style="flex-wrap:wrap">${[['all','All'],['active','Active'],['delivered','Delivered'],['issues','Issues']].map(t=>`<button role="tab" class="${f===t[0]?'on':''}" aria-selected="${f===t[0]}" data-act="ofilter" data-f="${t[0]}" style="flex:none">${t[1]} <span class="soft">${all.filter(tests[t[0]]).length}</span></button>`).join('')}</div>
        <label style="display:flex;align-items:center;gap:8px;border:1px solid var(--line2);border-radius:999px;padding:0 16px;flex:0 1 280px;color:var(--soft)"><span class="sr">Search orders</span><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" id="osearch" value="${esc(UI.oq||'')}" placeholder="Search order number" style="border:0;padding:12px 0;flex:1;min-width:0;font-size:15px;outline:none;color:var(--ink)"></label>
      </div>
      <div class="tablebox" style="margin-top:16px"><table style="min-width:820px"><thead><tr><th>Order</th><th>Type</th><th>Date</th><th style="text-align:right">Items</th><th style="text-align:right">Weight</th><th style="text-align:right">Charged</th><th>Status</th><th><span class="sr">Actions</span></th></tr></thead>
      <tbody>${rows.map(o=>`<tr><td><b>${o.id}</b></td><td>${typeName(o.type)}</td><td class="muted">${fmt(o.date)}</td><td style="text-align:right">${o.items??'—'}</td><td style="text-align:right">${o.kg?o.kg+' kg':'—'}</td><td style="text-align:right">${o.cost?naira(o.cost):'—'}${o.overweight?`<br><span class="xs soft">+${naira(o.overweight*CONFIG.overweightPerKg)} weight</span>`:''}</td><td>${statusPill(o)}</td><td style="text-align:right;white-space:nowrap"><a href="#/app/track/${o.id}" style="font-weight:600;font-size:14px">${o.status<6&&!o.cancelled?'Track':'View'}</a></td></tr>`).join('')}</tbody></table></div>
      ${rows.length?'':'<p class="muted" style="text-align:center;padding:32px 0">No orders here yet.</p>'}
    </section>`);
}

/* ---------- Billing ---------- */
function viewBilling(){
  const u = me(); const p = plan(u); const c = cycleOf(u);
  const B = UI.bill || (UI.bill = { panel:null, pick:u.plan, month:null });
  const commitEnd = u.commitEnd ? parse(u.commitEnd) : null; const committed = commitEnd && commitEnd > today();
  const nextAmt = (u.pendingPlan?CONFIG.plans[u.pendingPlan].price:p.price) + (u.pendingCharges||0);
  const pauseOpts = [1,2,3].map(n=>iso(addMonths(c.start,n)).slice(0,7));
  const close = `<button class="chip" style="width:40px;height:40px;padding:0;border-radius:50%;border:0" data-act="bill-panel" data-p="" aria-label="Close">×</button>`;
  return shell('app/billing', `
    <h1 class="apph1">Plan &amp; billing</h1><p class="muted" style="margin-top:6px">Change, pause or manage your subscription and payments.</p>
    <div class="row" style="margin-top:28px;align-items:flex-start">
      <div style="flex:999 1 520px;min-width:0;display:flex;flex-direction:column;gap:16px">
        <section class="card-dark" aria-label="Current plan" style="padding:0;overflow:hidden">
          <div style="display:flex;flex-wrap:wrap">
            <div style="flex:1 1 220px;min-height:200px;position:relative"><img class="photo" src="${IMG[p.img]}" alt="" style="position:absolute;inset:0"></div>
            <div style="flex:2 1 360px;padding:28px 32px">
              <div class="row" style="gap:8px;align-items:center"><p class="small" style="color:#B9CCD8">Current plan</p>${u.founding?'<span class="pill pill-amber">Founding member</span>':''}${u.status!=='active'?`<span class="pill" style="background:#fff;color:var(--ink)">${u.status==='paused'?'Paused':'Cancelled'}</span>`:''}${u.pauseMonth&&u.status==='active'?`<span class="pill" style="background:#fff;color:var(--ink)">Pausing ${MON_L[Number(u.pauseMonth.slice(5))-1]}</span>`:''}${u.pendingPlan?`<span class="pill" style="background:#fff;color:var(--ink)">Switching to ${CONFIG.plans[u.pendingPlan].name} on ${fmt(c.renew)}</span>`:''}</div>
              <p class="apph1" style="font-size:36px;margin-top:8px;color:#fff">${p.name} · ${naira(p.price)}<span style="font-size:16px;color:#B9CCD8"> / month</span></p>
              <p style="color:#D5E3EC;margin-top:6px">${p.pickups} pickups a month, up to ${p.kg} kg each. ${p.service}.</p>
              <div class="row" style="gap:10px;margin-top:18px">${u.status==='cancelled'?`<button class="btn btn-white btn-sm" data-act="restart">Restart plan</button>`:`<button class="btn btn-white btn-sm" data-act="bill-panel" data-p="change">Change plan</button>${u.pauseMonth?`<button class="btn btn-ghost btn-sm" data-act="resume">Cancel the pause</button>`:`<button class="btn btn-ghost btn-sm" data-act="bill-panel" data-p="pause">Pause a month</button>`}<button class="btn btn-ghost btn-sm" data-act="bill-panel" data-p="day">Change pickup day</button>`}</div>
            </div>
          </div>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1px;background:rgba(255,255,255,.1);border-top:1px solid rgba(255,255,255,.1)">
            ${[['Pickup',`${biweekly(u)?'Every other':'Every'} ${DOW[u.pickupDay]}, ${CONFIG.windows[u.window]}`],['Next bill',u.status==='cancelled'?'None':`${fmt(c.renew)} · ${naira(nextAmt)}`],['Commitment',committed?'Until '+fmtY(commitEnd):'None, cancel any time'],['Member since',MON_L[parse(u.joined).getMonth()]+' '+parse(u.joined).getFullYear()]].map(r=>`<div style="background:var(--ink);padding:16px 20px"><p class="xs" style="color:#B9CCD8">${r[0]}</p><p style="font-weight:600;margin-top:4px">${r[1]}</p></div>`).join('')}
          </div>
        </section>
        ${B.panel==='change'?`<section class="card" style="border:2px solid var(--ink)" aria-label="Change plan">
          <div class="between"><h2 class="cardh" style="font-size:22px">Change your plan</h2>${close}</div>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:18px">${PLAN_KEYS.map(k=>{const q=CONFIG.plans[k];const on=B.pick===k;return `<button class="choice ${on?'on':''}" aria-pressed="${on}" data-act="bill-pick" data-k="${k}" style="padding:12px"><span style="display:block;height:96px;border-radius:12px;overflow:hidden;margin-bottom:12px"><img class="photo" src="${IMG[q.img]}" alt=""></span><span class="between" style="padding:0 6px"><b style="font-family:var(--display);font-size:18px">${q.name}</b>${k===u.plan?'<span class="xs" style="color:var(--blue);font-weight:700">CURRENT</span>':''}</span><b style="display:block;font-size:20px;margin-top:4px;padding:0 6px">${naira(q.price)}</b><span class="xs muted" style="display:block;margin-top:4px;padding:0 6px 6px">${q.pickups} pickups, ${q.kg} kg each</span></button>`;}).join('')}</div>
          <div class="between" style="margin-top:18px"><p class="small muted" style="max-width:520px">${B.pick===u.plan?'This is your current plan.':CONFIG.plans[B.pick].price>p.price?`Upgrade starts now. You pay ${naira(Math.round((CONFIG.plans[B.pick].price-p.price)*Math.max(0,(c.renew-today())/(c.renew-c.start))))} for the rest of this cycle.`:`Downgrade starts on your next billing date, ${fmt(c.renew)}.`}</p><button class="btn btn-dark" data-act="bill-apply">Confirm change</button></div>
        </section>`:''}
        ${B.panel==='pause'?`<section class="card" style="border:2px solid var(--orange)" aria-label="Pause plan">
          <div class="between"><h2 class="cardh" style="font-size:22px">Pause for a month</h2>${close}</div>
          <p class="muted" style="margin-top:8px">Travelling? Pause one billing month a year. No pickups and no charge that month.${u.commitEnd?' Your commitment end date moves back by a month.':''}</p>
          ${u.pausedYear===String(today().getFullYear())?`<p class="demo-note" style="margin-top:14px">You've already used this year's pause.</p>`:`<div class="row" style="gap:10px;margin-top:18px">${pauseOpts.map(m=>`<button class="chip ${B.month===m?'on':''}" data-act="bill-month" data-m="${m}" style="padding:14px 18px">${MON_L[Number(m.slice(5))-1]} ${m.slice(0,4)}</button>`).join('')}</div>
          <button class="btn btn-dark" style="margin-top:18px" data-act="bill-pause" ${B.month?'':'disabled'}>Pause ${B.month?MON_L[Number(B.month.slice(5))-1]:''}</button>`}
        </section>`:''}
        ${B.panel==='day'?`<section class="card" style="border:2px solid var(--ink)" aria-label="Change pickup day">
          <div class="between"><h2 class="cardh" style="font-size:22px">Regular pickup day and time</h2>${close}</div>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:10px;margin-top:18px">${[1,2,3,4,5,6].map(d=>`<button class="chip ${(B.day??u.pickupDay)===d?'on':''}" data-act="bill-day" data-d="${d}">${DOW[d]}</button>`).join('')}</div>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:12px">${CONFIG.windows.map((w,i)=>`<button class="chip ${(B.win??u.window)===i?'on':''}" data-act="bill-win" data-w="${i}">${w}</button>`).join('')}</div>
          <button class="btn btn-dark" style="margin-top:18px" data-act="bill-dayapply">Save</button>
        </section>`:''}
        <section class="card" aria-label="Billing history"><h2 class="cardh">Billing history</h2>
          <div class="tablebox" style="margin-top:8px"><table style="min-width:540px"><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th><th>Status</th><th><span class="sr">Receipt</span></th></tr></thead><tbody>
          ${u.status!=='cancelled'?`<tr><td>${fmt(c.renew)}</td><td>${(u.pendingPlan?CONFIG.plans[u.pendingPlan]:p).name}, next month${u.pendingCharges?' + extra charges':''}</td><td style="text-align:right"><b>${naira(nextAmt)}</b></td><td><span class="pill pill-grey">Scheduled</span></td><td></td></tr>`:''}
          ${u.bills.map((b,i)=>`<tr><td>${fmt(b.date)}</td><td>${esc(b.desc)}</td><td style="text-align:right"><b>${naira(b.amount)}</b></td><td><span class="pill pill-green">${b.status}</span></td><td style="text-align:right"><button class="linkbtn" data-act="receipt" data-i="${i}">Receipt</button></td></tr>`).join('')}
          </tbody></table></div>
        </section>
      </div>
      <div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:16px">
        <section class="card" aria-label="Payment method"><h2 class="cardh">Payment method</h2>
          <div style="margin-top:16px;background:linear-gradient(135deg,#1F6FB2,#0B1D2A);color:#fff;border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:18px">
            <div class="between xs" style="color:#C3D4DE"><span>${u.payment.type==='card'?'Card':u.payment.type==='transfer'?'Bank transfer':'USSD'}</span><span>Paystack</span></div>
            <p style="font-size:20px;font-weight:600;letter-spacing:.12em">${u.payment.type==='card'?'•••• '+u.payment.last4:u.payment.type==='transfer'?'Dedicated account':'Bank USSD code'}</p>
            <p class="xs" style="color:#C3D4DE">${u.payment.type==='card'?'Charged automatically each month':'We remind you 3 days before renewal'}</p>
          </div>
          <button class="btn btn-soft btn-block" style="margin-top:14px" data-act="pay-method">Change payment method</button>
        </section>
        <section class="card" aria-label="Addresses"><div class="between"><h2 class="cardh">Addresses</h2><button class="linkbtn" data-act="add-address">+ Add</button></div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;font-size:14px">${u.addresses.map((a,i)=>`<div style="background:var(--bg);border-radius:16px;padding:14px 16px"><div class="between"><b>${esc(a.label)}${i===0?' <span class="xs" style="color:var(--blue)">· default</span>':''}</b>${i>0?`<button class="linkbtn" data-act="del-address" data-i="${i}" style="color:var(--red);font-size:13px">Remove</button>`:''}</div><p class="muted" style="margin-top:4px">${esc(addrLine(u,i))}</p></div>`).join('')}</div>
        </section>
        <section class="card" aria-label="Notifications"><h2 class="cardh">Notifications</h2>
          ${[['whatsapp','WhatsApp updates','Pickup, washing, delivery and receipts'],['sms','SMS','Only if WhatsApp messages fail'],['email','Email receipts','Monthly invoice to '+(u.email||'your email')]].map(n=>`<button class="choice" role="switch" aria-checked="${!!u.notifs[n[0]]}" data-act="notif" data-k="${n[0]}" style="display:flex;justify-content:space-between;align-items:center;gap:12px;border:0;border-bottom:1px solid #EDF2F6;border-radius:0;padding:14px 0;box-shadow:none"><span><b style="display:block;font-size:15px">${n[1]}</b><span class="xs soft">${esc(n[2])}</span></span><span class="switch ${u.notifs[n[0]]?'on':''}"></span></button>`).join('')}
        </section>
        ${u.status!=='cancelled'?`<section style="border:1px solid var(--line2);border-radius:24px;padding:24px 28px" aria-label="Cancel"><h2 class="cardh" style="font-size:16px">Cancel subscription</h2><p class="small muted" style="margin:6px 0 12px">${committed?`Your founding-member commitment runs to ${fmtY(commitEnd)}. You can cancel after that, or pause instead.`:`Your plan stays active until ${fmtY(c.end)}, then stops.`}</p>${committed?'<button class="linkbtn" disabled style="color:#9AAAB5;cursor:not-allowed">Cancel my plan</button>':'<button class="linkbtn" style="color:var(--red)" data-act="cancel-plan">Cancel my plan</button>'}</section>`:''}
      </div>
    </div>`);
}

/* ---------- Staff console ---------- */
function viewStaff(){
  if (!UI.staff){
    return `<div class="authwrap"><div class="authside"><img src="${IMG.tagging}" alt=""><a class="logo" href="#/" style="color:#fff">${LOGO('#fff')}<span>${CONFIG.brand}</span></a><h1 class="h1" style="font-size:clamp(34px,4vw,54px);color:#fff">Operations console</h1></div>
      <div class="authmain"><form data-form="staff-pin" style="width:100%;max-width:380px;display:flex;flex-direction:column;gap:16px">
      <h2 class="flowh1">Staff login</h2><p class="muted">Enter the staff PIN to manage pickups and orders.</p>
      <label class="field">Staff PIN<input class="input" name="pin" type="password" inputmode="numeric" autocomplete="off"></label>
      ${UI.staffErr?'<p class="err" role="alert">Wrong PIN.</p>':''}
      <button class="btn btn-dark btn-lg">Open console</button>
      <p class="demo-note">Demo PIN: <b>${CONFIG.staffPin}</b>. Replace with real staff accounts before launch.</p>
    </form></div></div>`;
  }
  const f = UI.sfilter || 'open';
  const list = DB.orders.filter(o=> f==='all' ? true : f==='open' ? (o.status<6 && !o.cancelled) : f==='issues' ? (o.issue&&o.issue.status==='open') : o.date===iso(today())).sort((a,b)=>a.date.localeCompare(b.date)||a.window-b.window);
  const users = Object.values(DB.users); const subs = users.filter(u=>u.plan && u.status!=='cancelled');
  const mrr = subs.filter(u=>u.status==='active').reduce((s,u)=>s+plan(u).price,0);
  return `<div style="min-height:100vh;background:var(--app)">
    <header style="background:var(--ink);color:#fff"><div class="wrap between" style="padding-top:14px;padding-bottom:14px"><a class="logo" href="#/" style="color:#fff">${LOGO('#4C93D1')}<span>${CONFIG.brand} · Operations</span></a><div class="row" style="gap:8px"><button class="btn btn-ghost btn-sm" data-act="staff-export">Export CSV</button><button class="btn btn-ghost btn-sm" data-act="staff-out">Lock</button></div></div></header>
    <main class="wrap" style="padding-top:28px;padding-bottom:64px">
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
        <div class="stat"><p class="xs soft">Active subscribers</p><b>${subs.filter(u=>u.status==='active').length}</b></div>
        <div class="stat"><p class="xs soft">Monthly plan revenue</p><b>${naira(mrr)}</b></div>
        <div class="stat"><p class="xs soft">Pickups today</p><b>${DB.orders.filter(o=>o.date===iso(today())&&!o.cancelled).length}</b></div>
        <div class="stat"><p class="xs soft">Open issues</p><b>${DB.orders.filter(o=>o.issue&&o.issue.status==='open').length}</b></div>
        <div class="stat"><p class="xs soft">Waitlist / quotes</p><b>${DB.waitlist.length} / ${DB.quotes.length}</b></div>
      </div>
      <section class="card" style="margin-top:16px">
        <div class="between"><h1 class="apph1" style="font-size:26px">Orders</h1><div class="tabs">${[['open','Open'],['today','Today'],['issues','Issues'],['all','All']].map(t=>`<button class="${f===t[0]?'on':''}" data-act="sfilter" data-f="${t[0]}" style="flex:none">${t[1]}</button>`).join('')}</div></div>
        <div class="tablebox" style="margin-top:12px"><table style="min-width:1000px"><thead><tr><th>Order</th><th>Customer</th><th>When</th><th>Address</th><th>Type</th><th>Status</th><th>Weight / items</th><th>Action</th></tr></thead><tbody>
        ${list.map(o=>{ const u=DB.users[o.phone]; return `<tr><td><b>${o.id}</b>${o.issue&&o.issue.status==='open'?`<br><span class="pill pill-orange" style="margin-top:4px">${esc(o.issue.kind)}</span>`:''}</td><td>${esc(u?.name||'?')}<br><span class="xs soft">0${o.phone}</span></td><td>${fmt(o.date)}<br><span class="xs soft">${CONFIG.windows[o.window]}</span></td><td class="small" style="max-width:220px">${u?esc(addrLine(u,o.address)):''}${o.note?`<br><span class="xs soft">“${esc(o.note)}”</span>`:''}</td><td class="small">${typeName(o.type)}${o.extras.length?'<br><span class="xs soft">+ '+o.extras.join(', ')+'</span>':''}</td><td>${statusPill(o)}</td><td class="small">${o.kg?o.kg+' kg':'—'} / ${o.items??'—'}</td><td style="white-space:nowrap">${o.cancelled?'—':o.status<6?`<button class="btn btn-dark btn-sm" data-act="advance" data-id="${o.id}">→ ${STATUSES[o.status+1]}</button>`:''}${o.status>=2&&o.status<6?` <button class="btn btn-light btn-sm" data-act="flag" data-id="${o.id}">Flag</button>`:''}${o.issue&&o.issue.status==='open'?` <button class="btn btn-light btn-sm" data-act="resolve" data-id="${o.id}">Resolve</button>`:''}</td></tr>`; }).join('')}
        </tbody></table></div>
        ${list.length?'':'<p class="muted" style="text-align:center;padding:32px 0">Nothing here.</p>'}
      </section>
      <div class="row" style="margin-top:16px">
        <section class="card" style="flex:1 1 400px;min-width:0"><h2 class="cardh">Subscribers</h2><div class="tablebox"><table><thead><tr><th>Name</th><th>Plan</th><th>Day</th><th>Area</th><th>Status</th></tr></thead><tbody>${users.filter(u=>u.plan).map(u=>`<tr><td>${esc(u.name)}<br><span class="xs soft">0${u.phone}</span></td><td>${plan(u).name}</td><td>${DOW[u.pickupDay]}</td><td class="small">${esc(u.addresses[0].area)}</td><td><span class="pill ${u.status==='active'?'pill-green':'pill-grey'}">${u.status}</span></td></tr>`).join('')}</tbody></table></div></section>
        <section class="card" style="flex:1 1 300px;min-width:0"><h2 class="cardh">Waitlist and quote requests</h2>${[...DB.waitlist.map(w=>`<p class="small" style="padding:10px 0;border-bottom:1px solid #EDF2F6"><b>${esc(w.area)}</b> · ${esc(w.phone)}<br><span class="xs soft">Waitlist · ${fmtTime(w.at)}</span></p>`),...DB.quotes.map(q=>`<p class="small" style="padding:10px 0;border-bottom:1px solid #EDF2F6"><b>${esc(q.org)}</b> · ${esc(q.phone)}<br><span class="xs soft">Quote · ${esc(q.need)}</span></p>`)].join('')||'<p class="muted small" style="margin-top:10px">None yet.</p>'}</section>
      </div>
      <p class="xs soft" style="margin-top:20px"><button class="linkbtn" data-act="reset-all" style="color:var(--red);font-size:13px">Reset all demo data</button></p>
    </main></div>`;
}
/* =========================================================
   EVENTS
   ========================================================= */
const ROUTES = { '': viewHome, login: viewAuth, signup: viewAuth, subscribe: viewSubscribe, app: viewDashboard, 'app/schedule': viewSchedule, 'app/track': viewTrack, 'app/orders': viewOrders, 'app/billing': viewBilling, staff: viewStaff };
const quoteForm = () => modal(`<form data-form="quote" style="display:flex;flex-direction:column;gap:14px"><h2 class="cardh" style="font-size:24px">Request a business or estate quote</h2><label class="field">Business or estate name<input class="input" name="org"></label><label class="field">Contact phone<input class="input" name="phone" type="tel"></label><label class="field">What do you need washed?<textarea class="input" name="need" rows="3" placeholder="e.g. 20 staff uniforms weekly, 60 towels"></textarea></label><div class="row" style="gap:10px"><button class="btn btn-dark">Send request</button><button type="button" class="btn btn-light" data-act="modal-close">Cancel</button></div></form>`);
document.addEventListener('click', e=>{
  const t = e.target.closest('[data-act]'); if(!t) return;
  const a = t.dataset.act; const u = me();
  const A = {
    'modal-bg': ()=>{ if(e.target===t) closeModal(); },
    'modal-close': closeModal,
    menu: ()=>{ const m=$('#mobilemenu'); m.classList.toggle('open'); t.setAttribute('aria-expanded', m.classList.contains('open')); },
    faq: ()=>{ const i=+t.dataset.i; UI.faq = UI.faq===i?-1:i; rerender(); },
    svc: ()=>{ UI.svc=t.dataset.t; rerender(); },
    svc2: ()=>{ UI.svc2=t.dataset.t; rerender(); },
    acc: ()=>{ const i=+t.dataset.i; UI.acc = UI.acc===i?-1:i; rerender(); },
    policy: ()=> modal(`<h2 class="cardh" style="font-size:24px">Our damage and loss guarantee</h2><div class="muted" style="margin-top:14px;display:flex;flex-direction:column;gap:12px;font-size:15px"><p>Every item is tagged to you and counted at pickup and again before delivery. Anything already stained or damaged is photographed before washing.</p><p>If we lose or damage an item, report it within 48 hours of delivery from your order page. We reply within 24 hours and pay you back using our published compensation scale, credited to your account or paid by transfer.</p><p class="demo-note">Add your compensation scale and cap here before launch.</p></div><button class="btn btn-dark" style="margin-top:20px" data-act="modal-close">Close</button>`),
    'pick-plan': ()=>{ UI.pickedPlan=t.dataset.plan; UI.sub=null; if(!me()){ UI.after='subscribe'; UI.authInit=false; go('signup'); } else if (me().plan){ UI.bill={panel:'change',pick:t.dataset.plan}; go('app/billing'); } else go('subscribe'); },
    quote: quoteForm,
    'auth-mode': ()=>{ UI.authMode=t.dataset.m; UI.authStep='phone'; UI.authErr=''; rerender(); },
    'auth-back': ()=>{ UI.authStep='phone'; UI.authErr=''; rerender(); },
    'auth-resend': ()=>{ UI.otp = String(Math.floor(100000+Math.random()*900000)); UI.authErr=''; rerender(); toast('New code sent'); },
    'sub-plan': ()=>{ UI.sub.plan=t.dataset.plan; rerender(); },
    'sub-step': ()=>{ const i=+t.dataset.i; if(i<UI.sub.step){ UI.sub.step=i; UI.subErr=''; rerender(); } },
    'sub-prev': ()=>{ UI.sub.step--; UI.subErr=''; rerender(); },
    'sub-next': ()=>{ if(UI.sub.step===1 && !saveAddressForm()) return; UI.sub.step++; UI.subErr=''; rerender(); window.scrollTo(0,0); },
    'sub-day': ()=>{ UI.sub.day=+t.dataset.d; rerender(); },
    'sub-win': ()=>{ UI.sub.window=+t.dataset.w; rerender(); },
    'sub-method': ()=>{ UI.sub.method=t.dataset.m; rerender(); },
    'sub-pay': ()=>{ if(!UI.sub.agree){ UI.subErr='Please accept the terms to continue.'; return rerender(); } const p=CONFIG.plans[UI.sub.plan]; const amt=p.price-(isFounding()?Math.round(p.price*CONFIG.foundingDiscount):0); payModal(amt, UI.sub.method, ()=>finishSubscribe(amt)); },
    logout: ()=>{ DB.session=null; save(); UI={}; toast('Logged out'); go(''); },
    skip: ()=> confirmModal('Skip this pickup?', 'Your next one moves to the following pickup day. Unused pickups do not roll over to next month.', 'Skip pickup', ()=>{ const o=DB.orders.find(x=>x.id===t.dataset.id); o.cancelled=true; u.skips=(u.skips||[]).concat(o.date); ensureUpcoming(u); save(); rerender(); toast('Pickup skipped'); }),
    'cancel-order': ()=> confirmModal('Cancel this pickup?', 'If you paid for it, the amount is credited to your next bill.', 'Cancel pickup', ()=>{ const o=DB.orders.find(x=>x.id===t.dataset.id); o.cancelled=true; if(o.type==='regular') u.skips=(u.skips||[]).concat(o.date); if(o.cost) u.pendingCharges=(u.pendingCharges||0)-o.cost; ensureUpcoming(u); save(); rerender(); toast('Pickup cancelled'); }),
    copy: ()=>{ try{ navigator.clipboard.writeText(t.dataset.v); }catch(x){} toast('Referral code copied'); },
    'sched-type': ()=>{ UI.sch=null; UI.schedType=t.dataset.t; },
    'sch-type': ()=>{ UI.sch.type=t.dataset.t; UI.sch.extras=[]; const up=upcomingRegular(u); if(t.dataset.t==='move'&&up){ UI.sch.date=up.date; UI.sch.window=up.window; const d=parse(up.date); UI.sch.month=d.getMonth(); UI.sch.year=d.getFullYear(); } rerender(); },
    'sch-date': ()=>{ UI.sch.date=t.dataset.d; const l=slotLoad(UI.sch.date); if(l[UI.sch.window]>=6) UI.sch.window=l.findIndex(x=>x<6); rerender(); },
    'sch-month': ()=>{ let m=UI.sch.month+(+t.dataset.n), y=UI.sch.year; if(m<0){m=11;y--;} if(m>11){m=0;y++;} UI.sch.month=m; UI.sch.year=y; rerender(); },
    'sch-win': ()=>{ UI.sch.window=+t.dataset.w; rerender(); },
    'sch-addr': ()=>{ UI.sch.address=+t.dataset.i; rerender(); },
    'sch-step': ()=>{ const k=t.dataset.k; UI.sch[k]=Math.max(1,Math.min(k==='bags'?4:20, UI.sch[k]+(+t.dataset.n))); rerender(); },
    'sch-extra': ()=>{ const x=t.dataset.x; const ex=UI.sch.extras; UI.sch.extras = ex.includes(x)? ex.filter(y=>y!==x) : ex.concat(x); rerender(); },
    'sch-confirm': ()=> confirmSchedule(),
    'sch-reset': ()=>{ UI.sch=null; rerender(); },
    'add-address': ()=> modal(`<form data-form="address" style="display:flex;flex-direction:column;gap:14px"><h2 class="cardh" style="font-size:24px">Add an address</h2><label class="field">Label<input class="input" name="label" placeholder="Office"></label><label class="field">Area<select class="input" name="area">${CONFIG.areas.filter(a=>a.open).map(a=>`<option>${a.name}</option>`).join('')}</select></label><label class="field">Street address<input class="input" name="street"></label><label class="field">Estate, building or flat<input class="input" name="building"></label><div class="row" style="gap:10px"><button class="btn btn-dark">Save address</button><button type="button" class="btn btn-light" data-act="modal-close">Cancel</button></div></form>`),
    'del-address': ()=>{ u.addresses.splice(+t.dataset.i,1); save(); rerender(); toast('Address removed'); },
    'report-open': ()=>{ UI.report={ id:t.dataset.id, kind:'Missing item', text:'' }; rerender(); },
    'report-close': ()=>{ UI.report=null; rerender(); },
    'report-kind': ()=>{ UI.report.text=($('#report-text')||{}).value||''; UI.report.kind=t.dataset.k; rerender(); },
    'report-send': ()=>{ const txt=($('#report-text')||{}).value||''; if(!txt.trim()){ toast('Tell us briefly what happened'); return; } const o=DB.orders.find(x=>x.id===UI.report.id); DB.tickets++; o.issue={ kind:UI.report.kind, text:txt, status:'open', ticket:DB.tickets, at:Date.now() }; UI.report.sent=true; UI.report.ticket=DB.tickets; save(); rerender(); },
    'toggle-sec': ()=>{ const o=DB.orders.find(x=>x.id===t.dataset.id); o.security=!o.security; save(); rerender(); },
    rate: ()=>{ const o=DB.orders.find(x=>x.id===t.dataset.id); o.rating=+t.dataset.n; save(); rerender(); toast('Thanks for rating your load', true); },
    ofilter: ()=>{ UI.ofilter=t.dataset.f; rerender(); },
    'bill-panel': ()=>{ UI.bill.panel = t.dataset.p || null; UI.bill.pick=u.plan; UI.bill.month=null; UI.bill.day=null; UI.bill.win=null; rerender(); },
    'bill-pick': ()=>{ UI.bill.pick=t.dataset.k; rerender(); },
    'bill-apply': ()=>{ const k=UI.bill.pick; if(k===u.plan){ UI.bill.panel=null; return rerender(); } const np=CONFIG.plans[k], cp=plan(u); const c=cycleOf(u);
      if(np.price>cp.price){ const diff=Math.round((np.price-cp.price)*Math.max(0,(c.renew-today())/(c.renew-c.start))); payModal(diff, u.payment.type, ()=>{ u.plan=k; u.pendingPlan=null; u.bills.unshift({date:iso(today()),kind:'upgrade',desc:`Upgrade to ${np.name} (rest of cycle)`,amount:diff,status:'Paid'}); UI.bill.panel=null; save(); rerender(); toast(`You're now on ${np.name}`, true); }); }
      else { u.pendingPlan=k; UI.bill.panel=null; save(); rerender(); toast(`Switching to ${np.name} on ${fmt(c.renew)}`); } },
    'bill-month': ()=>{ UI.bill.month=t.dataset.m; rerender(); },
    'bill-pause': ()=>{ u.pauseMonth=UI.bill.month; u.pausedYear=String(today().getFullYear()); if(u.commitEnd) u.commitEnd=iso(addMonths(parse(u.commitEnd),1)); UI.bill.panel=null; save(); rerender(); toast(`Plan will pause for ${MON_L[Number(u.pauseMonth.slice(5))-1]}`, true); },
    resume: ()=>{ u.status='active'; u.pauseMonth=null; u.pausedYear=null; ensureUpcoming(u); save(); rerender(); toast('Pause cancelled', true); },
    'bill-day': ()=>{ UI.bill.day=+t.dataset.d; rerender(); },
    'bill-win': ()=>{ UI.bill.win=+t.dataset.w; rerender(); },
    'bill-dayapply': ()=>{ if(UI.bill.day!=null) u.pickupDay=UI.bill.day; if(UI.bill.win!=null) u.window=UI.bill.win; const up=upcomingRegular(u); if(up){ up.cancelled=true; up.replaced=true; } ensureUpcoming(u); UI.bill.panel=null; save(); rerender(); toast(`Pickups now ${biweekly(u)?'every other':'every'} ${DOW_L[u.pickupDay]}, ${CONFIG.windows[u.window]}`, true); },
    'cancel-plan': ()=> confirmModal('Cancel your plan?', `You keep your remaining pickups until ${fmtY(cycleOf(u).end)}. After that you won't be charged.`, 'Cancel plan', ()=>{ u.status='cancelled'; save(); rerender(); toast('Plan cancelled'); }),
    restart: ()=>{ u.status='active'; ensureUpcoming(u); save(); rerender(); toast('Welcome back. Your plan is active.', true); },
    'pay-method': ()=> modal(`<h2 class="cardh" style="font-size:24px">Payment method</h2><div style="display:flex;flex-direction:column;gap:10px;margin-top:16px">${[['card','Card'],['transfer','Bank transfer'],['ussd','USSD']].map(m=>`<button class="choice ${u.payment.type===m[0]?'on':''}" data-act="set-method" data-m="${m[0]}">${m[1]}</button>`).join('')}</div><p class="demo-note" style="margin-top:14px">In production this opens Paystack to save a new card securely.</p>`),
    'set-method': ()=>{ u.payment={ type:t.dataset.m, last4: t.dataset.m==='card'?String(Math.floor(1000+Math.random()*9000)):null }; save(); closeModal(); rerender(); toast('Payment method updated', true); },
    notif: ()=>{ const k=t.dataset.k; u.notifs[k]=!u.notifs[k]; save(); rerender(); },
    receipt: ()=>{ const b=u.bills[+t.dataset.i]; modal(`<h2 class="cardh" style="font-size:24px">Receipt</h2><div style="margin-top:16px;font-size:15px">${[['Customer',esc(u.name)],['Date',fmtY(b.date)],['Description',esc(b.desc)],['Amount',naira(b.amount)],['Status',b.status],['Paid via',u.payment.type==='card'?'Card •••• '+u.payment.last4:u.payment.type]].map(r=>`<div class="between" style="padding:10px 0;border-bottom:1px solid #EDF2F6"><span class="muted">${r[0]}</span><b>${r[1]}</b></div>`).join('')}</div><div class="row" style="gap:10px;margin-top:18px"><button class="btn btn-dark" data-act="print">Print</button><button class="btn btn-light" data-act="modal-close">Close</button></div>`); },
    print: ()=> window.print(),
    'pay-confirm': ()=>{ const f=UI.payDone; UI.payDone=null; closeModal(); if(f) f(); },
    sfilter: ()=>{ UI.sfilter=t.dataset.f; rerender(); },
    'staff-out': ()=>{ UI.staff=false; rerender(); },
    advance: ()=>{ const o=DB.orders.find(x=>x.id===t.dataset.id); if(o.status===0) return pickupModal(o); if(o.status===1) return countModal(o); setStatus(o,o.status+1); },
    flag: ()=>{ const o=DB.orders.find(x=>x.id===t.dataset.id); modal(`<form data-form="flag" data-id="${o.id}" style="display:flex;flex-direction:column;gap:14px"><h2 class="cardh" style="font-size:24px">Flag an item on ${o.id}</h2><label class="field">What did you find?<input class="input" name="text" placeholder="Stain on blue shirt collar, photographed"></label><div class="row" style="gap:10px"><button class="btn btn-dark">Add flag</button><button type="button" class="btn btn-light" data-act="modal-close">Cancel</button></div></form>`); },
    resolve: ()=>{ const o=DB.orders.find(x=>x.id===t.dataset.id); o.issue.status='resolved'; save(); rerender(); toast('Issue marked resolved', true); },
    'staff-export': ()=>{ const rows=[['order','customer','phone','date','window','type','status','kg','items','cost']].concat(DB.orders.map(o=>[o.id,DB.users[o.phone]?.name||'','0'+o.phone,o.date,CONFIG.windows[o.window],o.type,o.cancelled?'Cancelled':STATUSES[o.status],o.kg??'',o.items??'',o.cost])); const csv=rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n'); const l=document.createElement('a'); l.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); l.download='washday-orders.csv'; l.click(); },
    'reset-all': ()=> confirmModal('Reset all demo data?', 'This deletes every account, order and waitlist entry saved in this browser.', 'Reset', ()=>{ localStorage.removeItem(KEY); DB=blank(); UI={staff:true}; save(); rerender(); })
  };
  if (A[a]){ if(t.tagName==='A' && a!=='sched-type') e.preventDefault(); A[a](); }
});
document.addEventListener('submit', e=>{
  const f = e.target; const k = f.dataset.form; if(!k) return; e.preventDefault();
  const v = Object.fromEntries(new FormData(f).entries());
  if (k==='waitlist'){ if(!(v.area||'').trim()||normPhone(v.phone).length<10){ toast('Add your area and a valid phone number'); return; } DB.waitlist.push({area:v.area.trim(),phone:v.phone.trim(),at:Date.now()}); save(); f.reset(); toast("You're on the waitlist. We'll message you.", true); }
  if (k==='quote'){ if(!(v.org||'').trim()||normPhone(v.phone).length<10){ toast('Add a name and valid phone number'); return; } DB.quotes.push({org:v.org.trim(),phone:v.phone.trim(),need:v.need||'',at:Date.now()}); save(); closeModal(); toast('Quote request sent. We will call you within one working day.', true); }
  if (k==='auth-phone'){
    const ph = normPhone(v.phone); UI.authPhoneRaw=v.phone; UI.authName=v.name; UI.authEmail=v.email;
    if (ph.length!==10){ UI.authErr='Enter a valid Nigerian phone number, e.g. 803 000 0000.'; return rerender(); }
    if (UI.authMode==='signup'){ if(!v.name||v.name.trim().length<2){ UI.authErr='Please enter your full name.'; return rerender(); } if(DB.users[ph]){ UI.authErr='This number already has an account. Log in instead.'; return rerender(); } }
    else if (!DB.users[ph]){ UI.authErr='No account with this number yet. Create one instead.'; return rerender(); }
    UI.authPhone=ph; UI.otp=String(Math.floor(100000+Math.random()*900000)); UI.authStep='code'; UI.authErr=''; rerender();   // BACKEND: send OTP by SMS/WhatsApp
  }
  if (k==='auth-code'){
    const code=[...f.querySelectorAll('[data-otp]')].map(i=>i.value).join('');
    if (code!==UI.otp){ UI.authErr='That code is not right. Check and try again.'; return rerender(); }
    const ph=UI.authPhone;
    if (UI.authMode==='signup') DB.users[ph] = { phone:ph, name:UI.authName.trim(), email:(UI.authEmail||'').trim(), plan:null, status:'active', joined:iso(today()), addresses:[], bills:[], notifs:{whatsapp:true,sms:false,email:true}, payment:{type:'card',last4:null}, referral:(UI.authName.split(' ')[0]||'WD').toUpperCase().replace(/[^A-Z]/g,'').slice(0,8)+String(Math.floor(10+Math.random()*89)), skips:[], pendingCharges:0 };
    DB.session=ph; save();
    const after = UI.after; const mode=UI.authMode; UI = { pickedPlan: UI.pickedPlan };
    toast(mode==='signup'?'Account created':'Welcome back', true);
    if (!DB.users[ph].plan) go('subscribe'); else go(after && after.startsWith('app') ? after : 'app');
  }
  if (k==='ask'){ const q=(v.q||'').trim().toLowerCase(); if(!q) return; const words=q.split(/\W+/).filter(w=>w.length>2); let best=-1,score=0; FAQS.forEach((f,i)=>{ const txt=(f[0]+' '+f[1]).toLowerCase(); const sc=words.filter(w=>txt.includes(w)).length; if(sc>score){score=sc;best=i;} }); if(best>=0){ UI.faq=best; rerender(); const el=document.getElementById('faq-'+best); if(el) el.scrollIntoView({behavior:'smooth',block:'center'}); } else { window.open('https://wa.me/'+CONFIG.whatsapp+'?text='+encodeURIComponent(v.q),'_blank'); } return; }
  if (k==='staff-pin'){ if(v.pin===CONFIG.staffPin){ UI.staff=true; UI.staffErr=false; } else UI.staffErr=true; rerender(); }
  if (k==='address'){ const u=me(); if(!(v.label||'').trim()||!(v.street||'').trim()){ toast('Add a label and street address'); return; } u.addresses.push({label:v.label.trim(),area:v.area,street:v.street.trim(),building:(v.building||'').trim(),landmark:'',notes:''}); save(); closeModal(); rerender(); toast('Address saved', true); }
  if (k==='pickup'){ const o=DB.orders.find(x=>x.id===f.dataset.id); const kg=parseFloat(v.kg); if(!(kg>0)){ toast('Enter the weight'); return; } o.kg=Math.round(kg*10)/10; const u=DB.users[o.phone]; if(o.type!=='dry'){ const over=Math.max(0,Math.ceil(o.kg-plan(u).kg*o.bags)); if(over){ o.overweight=over; u.pendingCharges=(u.pendingCharges||0)+over*CONFIG.overweightPerKg; } } closeModal(); setStatus(o,1); }
  if (k==='count'){ const o=DB.orders.find(x=>x.id===f.dataset.id); const n=parseInt(v.items,10); if(!(n>0)){ toast('Enter the item count'); return; } o.items=n; if(v.flag&&v.flag.trim()) o.flags.push({text:v.flag.trim(),at:Date.now()}); closeModal(); setStatus(o,2); }
  if (k==='flag'){ const o=DB.orders.find(x=>x.id===f.dataset.id); if(!(v.text||'').trim()) return; o.flags.push({text:v.text.trim(),at:Date.now()}); save(); closeModal(); rerender(); toast('Flag added. Customer notified.'); }
});
document.addEventListener('input', e=>{
  const t=e.target;
  if (t.dataset.otp!==undefined){ t.value=t.value.replace(/\D/g,'').slice(0,1); if(t.value){ const n=$(`[data-otp="${+t.dataset.otp+1}"]`); if(n) n.focus(); } }
  if (t.id==='osearch'){ UI.oq=t.value; const pos=t.selectionStart; rerender(); const s=$('#osearch'); s.focus(); s.setSelectionRange(pos,pos); }
  if (t.dataset.bindSch){ UI.sch[t.dataset.bindSch]=t.value; }
});
document.addEventListener('change', e=>{ const t=e.target; if (t.dataset.bind && UI.sub){ UI.sub[t.dataset.bind] = t.type==='checkbox'?t.checked:t.value; } });
document.addEventListener('keydown', e=>{
  if (e.key==='Escape' && $('#modal').innerHTML) closeModal();
  const t=e.target; if (t.dataset && t.dataset.otp!==undefined && e.key==='Backspace' && !t.value){ const p=$(`[data-otp="${+t.dataset.otp-1}"]`); if(p){ p.focus(); p.value=''; } }
});
document.addEventListener('paste', e=>{ const t=e.target; if(t.dataset && t.dataset.otp!==undefined){ const d=(e.clipboardData.getData('text')||'').replace(/\D/g,'').slice(0,6); if(d.length>1){ e.preventDefault(); d.split('').forEach((c,i)=>{ const el=$(`[data-otp="${i}"]`); if(el) el.value=c; }); } } });

/* ---------- Flow helpers ---------- */
function saveAddressForm(){
  const f=$('[data-form="sub-address"]'); if(!f) return true;
  const v=Object.fromEntries(new FormData(f).entries()); Object.assign(UI.sub, v);
  if(!v.street.trim()){ UI.subErr='Please enter your street address.'; rerender(); return false; }
  if(normPhone(v.contact).length!==10){ UI.subErr='Please enter a valid contact phone number.'; rerender(); return false; }
  return true;
}
function payModal(amount, method, done){
  UI.payDone = done; const m = {card:'Card',transfer:'Bank transfer',ussd:'USSD'}[method]||'Card';
  modal(`<div class="between"><h2 class="cardh" style="font-size:24px">Pay ${naira(amount)}</h2><span class="pill pill-grey">Paystack</span></div><p class="muted" style="margin-top:6px">${m}</p>
    ${method==='card'?`<div style="display:flex;flex-direction:column;gap:12px;margin-top:18px"><label class="field">Card number<input class="input" inputmode="numeric" value="4084 0840 8408 4081"></label><div class="row" style="gap:12px"><label class="field" style="flex:1">Expiry<input class="input" value="12/29"></label><label class="field" style="flex:1">CVV<input class="input" inputmode="numeric" value="408"></label></div></div>`:method==='transfer'?`<div class="card-b" style="margin-top:18px;padding:18px"><p class="xs soft">Transfer to</p><p style="font-size:20px;font-weight:700;margin-top:4px">0123456789</p><p class="small muted">Demo Bank · ${CONFIG.brand} / Paystack</p></div>`:`<div class="card-b" style="margin-top:18px;padding:18px"><p class="xs soft">Dial from your bank line</p><p style="font-size:20px;font-weight:700;margin-top:4px">*737*000*${amount}#</p></div>`}
    <p class="demo-note" style="margin-top:16px">Demo payment. Nothing is charged. In production this step is Paystack's secure checkout.</p>
    <div class="row" style="gap:10px;margin-top:18px"><button class="btn btn-blue btn-lg" data-act="pay-confirm">${method==='card'?'Pay '+naira(amount):'I have paid'}</button><button class="btn btn-light btn-lg" data-act="modal-close">Cancel</button></div>`);
}
function confirmModal(title, text, label, fn){ UI.payDone = fn; modal(`<h2 class="cardh" style="font-size:24px">${title}</h2><p class="muted" style="margin-top:8px">${text}</p><div class="row" style="gap:10px;margin-top:20px"><button class="btn btn-dark" data-act="pay-confirm">${label}</button><button class="btn btn-light" data-act="modal-close">Keep it</button></div>`); }
function finishSubscribe(amount){
  const u=me(); const s=UI.sub; const p=CONFIG.plans[s.plan];
  u.plan=s.plan; u.status='active'; u.pickupDay=s.day; u.window=s.window;
  u.addresses=[{label:s.label,area:s.area,street:s.street.trim(),building:s.building.trim(),landmark:s.landmark.trim(),notes:s.notes.trim()}].concat(u.addresses||[]);
  u.prefs={shirts:s.shirts,detergent:s.detergent,starch:s.starch,whites:s.whites};
  u.payment={type:s.method,last4:s.method==='card'?'4081':null};
  const first = nextDateFor(s.day);
  u.cycleStart = iso(first); u.joined = iso(today());
  u.founding = isFounding(); u.commitEnd = u.founding ? iso(addDays(addMonths(first,3),-1)) : null;
  u.bills=[{date:iso(today()),kind:'start',desc:`${p.name}, first month${u.founding?' · founding member '+Math.round(CONFIG.foundingDiscount*100)+'% off':''}`,amount,status:'Paid'}];
  DB.orders.push(newOrder(u,{type:'regular',date:iso(first),window:s.window,address:0,bags:1,extras:[],note:s.notes}));
  save(); UI={}; toast(`You're subscribed. First pickup ${fmt(first)}.`, true); go('app');
}
function confirmSchedule(){
  const u=me(); const s=UI.sch; const note=($('[data-bind-sch="note"]')||{}).value||s.note; const cost=schedCost(s);
  if (s.type==='move'){
    const o=upcomingRegular(u); if(!o){ toast('No plan pickup to move'); return; }
    const apply=()=>{ o.date=s.date; o.window=s.window; o.address=s.address; o.bags=s.bags; o.note=note; o.extras=s.extras.slice(); if(cost.total){ o.cost=cost.total; u.bills.unshift({date:iso(today()),kind:'extra',desc:`Extras on ${o.id}`,amount:cost.total,status:'Paid'}); } save(); s.done=o.id; rerender(); window.scrollTo(0,0); };
    return cost.total ? payModal(cost.total, u.payment.type, apply) : apply();
  }
  payModal(cost.total, u.payment.type, ()=>{
    const o=newOrder(u,{type:s.type,date:s.date,window:s.window,address:s.address,bags:s.type==='dry'?s.dryItems:s.bags,extras:s.extras.slice(),note,cost:cost.total});
    DB.orders.push(o); u.bills.unshift({date:iso(today()),kind:'extra',desc:`${typeName(s.type)} ${o.id}`,amount:cost.total,status:'Paid'}); save(); s.done=o.id; rerender(); window.scrollTo(0,0);
  });
}
function setStatus(o, st){ o.status=st; o.history.push({s:st,at:Date.now()}); if (st===6){ const u=DB.users[o.phone]; if(u) ensureUpcoming(u); } save(); rerender(); toast(`${o.id} → ${STATUSES[st]}`, true); }   // BACKEND: WhatsApp update here
function pickupModal(o){ modal(`<form data-form="pickup" data-id="${o.id}" style="display:flex;flex-direction:column;gap:14px"><h2 class="cardh" style="font-size:24px">Pick up ${o.id}</h2><p class="muted">Weigh the bag at the door. Limit: ${o.type==='dry'?'n/a (dry cleaning)':plan(DB.users[o.phone]).kg*o.bags+' kg'}.</p><label class="field">Weight (kg)<input class="input" name="kg" type="number" step="0.1" min="0.1"></label><div class="row" style="gap:10px"><button class="btn btn-dark">Mark picked up</button><button type="button" class="btn btn-light" data-act="modal-close">Cancel</button></div></form>`); }
function countModal(o){ modal(`<form data-form="count" data-id="${o.id}" style="display:flex;flex-direction:column;gap:14px"><h2 class="cardh" style="font-size:24px">Tag and count ${o.id}</h2><label class="field">Number of items<input class="input" name="items" type="number" min="1"></label><label class="field">Anything to flag? (optional)<input class="input" name="flag" placeholder="Stain on blue shirt collar"></label><div class="row" style="gap:10px"><button class="btn btn-dark">Save count</button><button type="button" class="btn btn-light" data-act="modal-close">Cancel</button></div></form>`); }

route();
(function(){ let m=47; setInterval(function(){ m = m<=1 ? 47 : m-1; document.querySelectorAll('.wm-time').forEach(function(el){ el.innerHTML = '0<i>:</i>'+String(m).padStart(2,'0'); }); },60000); })();
