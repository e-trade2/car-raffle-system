if (window.Telegram && window.Telegram.WebApp) {
  Telegram.WebApp.ready();
  Telegram.WebApp.expand();
}

const API = '/api';

// Raffle titles, subtitles, image URLs and bank details are admin-supplied
// and rendered via innerHTML below. Escaping them means a bad/compromised
// admin entry can't inject a script that runs in every visitor's browser.
function esc(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}

function copyToClipboard(text){
  if (navigator.clipboard && window.isSecureContext){
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject)=>{
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    }catch(err){ reject(err); }
  });
}

const TEXT = {
  en: {
    backLabel:"Back", cdLabel:"Time Remaining",
    cdDaysLbl:"Days", cdHoursLbl:"Hrs", cdMinsLbl:"Min", cdSecsLbl:"Sec",
    soldLbl:"sold", filledLbl:"filled", remainLbl:"tickets remaining",
    participantsLbl:"Participants", buyTicket:"Buy Ticket",
    priceLbl:"Ticket Price", pickLabel:"Select your lucky numbers",
    buyLabel:"Buy Now (random)", selectedNumsLbl:"Selected numbers:",
    navHome:"Home", navTickets:"Tickets", navProfile:"Profile",
    myTicketsTitle:"My Tickets",
    toastSoon:"Coming soon", toastPicked:"numbers selected",
    confirmSelection:"Confirm Selection",
    orderConfirmTitle:"Confirm your order", orderPaymentTitle:"Payment",
    orderStatusTitle:"Order submitted",
    fullNameLbl:"Full Name", phoneLbl:"Phone Number",
    continueLbl:"Continue", submitPaymentLbl:"Submit Payment",
    uploadHint:"Tap to upload your payment receipt",
    waitingApproval:"Your order is awaiting admin approval. We'll notify you once confirmed.",
    ticketNo:"Ticket #", banksLbl:"Select bank to view account (optional)",
  },
  am: {
    backLabel:"ተመለስ", cdLabel:"የቀረው ጊዜ",
    cdDaysLbl:"ቀናት", cdHoursLbl:"ሰዓት", cdMinsLbl:"ደቂቃ", cdSecsLbl:"ሰከንድ",
    soldLbl:"ተሸጠዋል", filledLbl:"ተሞልቷል", remainLbl:"ትኬት ቀርቷል",
    participantsLbl:"ተሳታፊዎች", buyTicket:"ትኬት ይግዙ",
    priceLbl:"የትኬት ዋጋ", pickLabel:"የዕድል ቁጥሮችዎን ይምረጡ",
    buyLabel:"አሁኑኑ ይግዙ (በዘፈቀደ)", selectedNumsLbl:"የመረጡት ቁጥሮች፡",
    navHome:"መነሻ", navTickets:"ትኬቶች", navProfile:"መገለጫ",
    myTicketsTitle:"የኔ ትኬቶች",
    toastSoon:"በቅርቡ ይመጣል", toastPicked:"ቁጥር ተመርጠዋል",
    confirmSelection:"ምርጫ አረጋግጥ",
    orderConfirmTitle:"ትዕዛዝዎን ያረጋግጡ", orderPaymentTitle:"ክፍያ",
    orderStatusTitle:"ትዕዛዝ ገብቷል",
    fullNameLbl:"ሙሉ ስም", phoneLbl:"ስልክ ቁጥር",
    continueLbl:"ቀጥል", submitPaymentLbl:"ክፍያ አስገባ",
    uploadHint:"የክፍያ ደረሰኝዎን ለመስቀል ይንኩ",
    waitingApproval:"ትዕዛዝዎ በአስተዳዳሪ እየተጠበቀ ነው። ሲረጋገጥ እናሳውቅዎታለን።",
    ticketNo:"ትኬት ቁ.", banksLbl:"የባንክ ሂሳብ ለማየት ይምረጡ (አማራጭ)",
  },
  om: {
    backLabel:"Deebi'i", cdLabel:"Yeroo Hafe",
    cdDaysLbl:"Guyyaa", cdHoursLbl:"Sa'aa", cdMinsLbl:"Daqiiqaa", cdSecsLbl:"Sekondii",
    soldLbl:"gurgurame", filledLbl:"guutame", remainLbl:"tikeetiin hafe",
    participantsLbl:"Hirmaattonni", buyTicket:"Tikeetii Bitadhu",
    priceLbl:"Gatii Tikeetii", pickLabel:"Lakkoofsa carraa kee filadhu",
    buyLabel:"Amma Bitadhu (kan tasaa)", selectedNumsLbl:"Lakkoofsa filatte:",
    navHome:"Fuula Duraa", navTickets:"Tikeetii", navProfile:"Piroofaayilii",
    myTicketsTitle:"Tikeetii Koo",
    toastSoon:"Dhiyootti ni dhufa", toastPicked:"lakkoofsi filatame",
    confirmSelection:"Filannoo Mirkaneessi",
    orderConfirmTitle:"Ajaja kee mirkaneessi", orderPaymentTitle:"Kaffaltii",
    orderStatusTitle:"Ajajni ergameera",
    fullNameLbl:"Maqaa Guutuu", phoneLbl:"Lakkoofsa Bilbilaa",
    continueLbl:"Itti Fufi", submitPaymentLbl:"Kaffaltii Ergi",
    uploadHint:"Ragaa kaffaltii keessan fe'uuf tuqaa",
    waitingApproval:"Ajajni keessan mirkaneeffannaa admin eegaa jira. Yeroo mirkanaa'utti isin beeksisna.",
    ticketNo:"Lakk. Tikeetii", banksLbl:"Herrega baankii ilaaluuf filadhu (filannoo)",
  }
};
const LANG_NAME = { en:"English", am:"አማርኛ", om:"Afaan Oromo" };
let currentLang = localStorage.getItem('lang') || 'en';

function t(key){ return (TEXT[currentLang] && TEXT[currentLang][key]) || TEXT.en[key] || key; }

function applyLang(lang){
  currentLang = lang;
  localStorage.setItem('lang', lang);
  document.getElementById('langLabel').textContent = LANG_NAME[lang];
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('.lang-menu button').forEach(b=>{
    b.classList.toggle('active', b.dataset.lang === lang);
  });
  document.getElementById('navHome').textContent = t('navHome');
  document.getElementById('navTickets').textContent = t('navTickets');
  document.getElementById('navProfile').textContent = t('navProfile');
  document.getElementById('myTicketsTitle').textContent = t('myTicketsTitle');
  if (currentRaffle) renderDetail(currentRaffle);
  renderHomeList();
}

document.getElementById('langBtn').addEventListener('click', ()=>{
  document.getElementById('langMenu').classList.toggle('show');
  document.getElementById('langBtn').classList.toggle('open');
});
document.querySelectorAll('.lang-menu button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    applyLang(btn.dataset.lang);
    document.getElementById('langMenu').classList.remove('show');
    document.getElementById('langBtn').classList.remove('open');
  });
});
document.addEventListener('click', (e)=>{
  if (!e.target.closest('.lang-wrap')) {
    document.getElementById('langMenu').classList.remove('show');
    document.getElementById('langBtn').classList.remove('open');
  }
});

let isLight = false;
document.getElementById('themeBtn').addEventListener('click', ()=>{
  isLight = !isLight;
  document.documentElement.style.setProperty('--bg-base', isLight ? '#f4f6f3' : '#050807');
  document.documentElement.style.setProperty('--text-primary', isLight ? '#0e1a14' : '#f4f6f3');
  document.body.style.color = isLight ? '#0e1a14' : '#f4f6f3';
});

function pad(n){ return String(n).padStart(2,'0'); }
function fmtCountdown(drawAt){
  const diff = Math.max(0, new Date(drawAt) - Date.now());
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { d:pad(d), h:pad(h), m:pad(m), s:pad(s) };
}

function showView(id){
  document.querySelectorAll('.view').forEach(v=> v.style.display = 'none');
  const el = document.getElementById(id);
  el.style.display = 'block';
  el.classList.remove('view-enter');
  void el.offsetWidth;
  el.classList.add('view-enter');
  window.scrollTo({ top:0, behavior:'auto' });
  document.querySelectorAll('.nav-item').forEach(n=> n.classList.remove('active'));
}
document.getElementById('navHomeItem').addEventListener('click', ()=>{ showView('homeView'); document.getElementById('navHomeItem').classList.add('active'); });
document.getElementById('navTicketsItem').addEventListener('click', ()=>{ showView('ticketsView'); document.getElementById('navTicketsItem').classList.add('active'); loadSavedPhoneIntoTickets(); });
document.getElementById('navProfileItem').addEventListener('click', ()=>{ showView('profileView'); document.getElementById('navProfileItem').classList.add('active'); loadProfile(); });
document.getElementById('navHomeItem').classList.add('active');

let toastTimer;
function showToast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.classList.remove('show'), 2400);
}

// ===================== HOME =====================
let raffles = [];
let currentRaffle = null;

async function loadRaffles(){
  try{
    const res = await fetch(`${API}/raffles`);
    const data = await res.json();
    raffles = data.raffles || [];
    renderHomeList();
  }catch(e){
    console.error(e);
    showToast('Could not load raffles');
  }
}

function carHtml(raffle){
  if (raffle.imageUrl) return `<img src="${esc(raffle.imageUrl)}" alt="${esc(raffle.title)}">`;
  return `<svg class="car-svg" viewBox="0 0 400 190">
    <ellipse cx="200" cy="168" rx="150" ry="10" fill="rgba(0,0,0,0.15)"/>
    <path d="M45 130 C45 95 75 78 120 70 L150 45 C160 38 178 33 200 33 C224 33 246 40 258 52 L282 72 C320 76 348 92 352 122 L352 138 L45 138 Z" fill="#c7cdc3" stroke="#8b948a" stroke-width="2"/>
    <path d="M150 46 C162 40 178 36 200 36 C222 36 240 42 252 52 L262 70 L145 70 Z" fill="#dfe3db" stroke="#8b948a" stroke-width="1.5"/>
    <rect x="153" y="50" width="45" height="18" rx="3" fill="#3b4640"/>
    <rect x="202" y="50" width="50" height="18" rx="3" fill="#3b4640"/>
    <circle cx="110" cy="140" r="26" fill="#1c1f1c"/><circle cx="110" cy="140" r="12" fill="#8d95a3"/>
    <circle cx="290" cy="140" r="26" fill="#1c1f1c"/><circle cx="290" cy="140" r="12" fill="#8d95a3"/>
  </svg>`;
}

function raffleCardHtml(raffle, idx){
  const badge = raffle.badge === 'hot' ? `<div class="badge-hot">🔥 Featured</div>`
    : raffle.badge === 'new' ? `<div class="badge-new">NEW</div>` : '';
  return `
  <div class="hero" style="margin-top:${idx>0?'14px':'0'};">
    <div class="hero-media">
      ${badge}
      <div class="badge-rating">★★★★★ <span class="rating-num">${raffle.rating.toFixed(1)}</span></div>
      ${carHtml(raffle)}
    </div>
    <div class="hero-body">
      <div class="car-title">${esc(raffle.title)}</div>
      <div class="car-sub">${esc(raffle.subtitle||'')}</div>
      <div class="countdown-label">⏱ <span>${t('cdLabel')}</span></div>
      <div class="countdown" data-raffle="${raffle.id}">
        <div class="cd-box"><div class="cd-num" data-unit="days">--</div><div class="cd-lbl">${t('cdDaysLbl')}</div></div>
        <div class="cd-box"><div class="cd-num" data-unit="hours">--</div><div class="cd-lbl">${t('cdHoursLbl')}</div></div>
        <div class="cd-box"><div class="cd-num" data-unit="mins">--</div><div class="cd-lbl">${t('cdMinsLbl')}</div></div>
        <div class="cd-box"><div class="cd-num" data-unit="secs">--</div><div class="cd-lbl">${t('cdSecsLbl')}</div></div>
      </div>
      <div class="stats-block">
        <div class="stats-top">
          <div class="stats-sold"><b>${raffle.soldCount.toLocaleString()}</b> ${t('soldLbl')}</div>
          <div class="stats-pct">${raffle.percentFilled}% ${t('filledLbl')}</div>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${raffle.percentFilled}%"></div></div>
        <div class="stats-remaining">${raffle.remaining.toLocaleString()} ${t('remainLbl')}</div>
        <div class="stats-bottom">
          <div class="participants">
            <div class="p-icon">👥</div>
            <div><div class="p-lbl">${t('participantsLbl')}</div><div class="p-num">${raffle.soldCount.toLocaleString()}</div></div>
          </div>
          <button class="buy-ticket-btn" data-open-detail="${raffle.id}">${t('buyTicket')}</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderHomeList(){
  const wrap = document.getElementById('raffleListHome');
  const empty = document.getElementById('homeEmpty');
  const active = raffles.filter(r=> r.status === 'active');
  if (active.length === 0){
    wrap.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  wrap.innerHTML = active.map(raffleCardHtml).join('');
  wrap.querySelectorAll('[data-open-detail]').forEach(btn=>{
    btn.addEventListener('click', ()=> openDetail(btn.dataset.openDetail));
  });
}

// ===================== DETAIL =====================
let qty = 1;
let selectedNumbers = [];
const MAX_TICKETS = 20; // max numbers a single order can contain

async function openDetail(raffleId){
  try{
    const res = await fetch(`${API}/raffles/${raffleId}`);
    if (!res.ok){ showToast('Raffle not found'); return; }
    const data = await res.json();
    currentRaffle = data.raffle;
    qty = 1;
    selectedNumbers = [];
    renderDetail(currentRaffle);
    showView('detailView');
  }catch(e){ console.error(e); showToast('Could not load raffle'); }
}

function renderDetail(raffle){
  const el = document.getElementById('detailView');
  el.innerHTML = `
    <div class="back-row" id="backBtn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>${t('backLabel')}</span>
    </div>
    <div class="hero">
      <div class="hero-media">
        <div class="badge-new">NEW</div>
        <div class="badge-rating">★★★★★ <span class="rating-num">${raffle.rating.toFixed(1)}</span></div>
        ${carHtml(raffle)}
      </div>
      <div class="hero-body">
        <div class="car-title">${esc(raffle.title)}</div>
        <div class="car-sub">${esc(raffle.subtitle||'')}</div>
        <div class="countdown-label">🔥 <span>${t('cdLabel')}</span></div>
        <div class="countdown" data-raffle="${raffle.id}">
          <div class="cd-box"><div class="cd-num" data-unit="days">--</div><div class="cd-lbl">${t('cdDaysLbl')}</div></div>
          <div class="cd-box"><div class="cd-num" data-unit="hours">--</div><div class="cd-lbl">${t('cdHoursLbl')}</div></div>
          <div class="cd-box"><div class="cd-num" data-unit="mins">--</div><div class="cd-lbl">${t('cdMinsLbl')}</div></div>
          <div class="cd-box"><div class="cd-num" data-unit="secs">--</div><div class="cd-lbl">${t('cdSecsLbl')}</div></div>
        </div>
      </div>
    </div>
    <div class="panel buy-panel">
      <div class="price-row">
        <div><div class="price-lbl">${t('priceLbl')}</div><div class="price-val">${raffle.price.toLocaleString()} Birr</div></div>
        <div class="qty">
          <button id="qtyMinus">−</button>
          <div class="qty-val" id="qtyVal">${qty}</div>
          <button class="plus" id="qtyPlus">+</button>
        </div>
      </div>
      <div class="selected-numbers-row" id="selectedNumbersRow" style="display:${selectedNumbers.length?'flex':'none'};">
        <span>${t('selectedNumsLbl')}</span>
        <div class="selected-chips" id="selectedChips"></div>
      </div>
      <button class="btn btn-outline-pink" id="pickNumbersBtn">🎯 <span>${t('pickLabel')}</span></button>
      <button class="btn btn-gold" id="buyNowBtn">⚡ <span>${t('buyLabel')}</span></button>
    </div>
  `;
  renderSelectedChips();
  document.getElementById('backBtn').addEventListener('click', ()=> showView('homeView'));
  document.getElementById('qtyPlus').addEventListener('click', ()=>{
    qty = Math.min(qty+1, MAX_TICKETS);
    document.getElementById('qtyVal').textContent = qty;
    if (selectedNumbers.length) { selectedNumbers = []; renderSelectedChips(); }
  });
  document.getElementById('qtyMinus').addEventListener('click', ()=>{
    qty = Math.max(qty-1, 1);
    document.getElementById('qtyVal').textContent = qty;
    if (selectedNumbers.length) { selectedNumbers = []; renderSelectedChips(); }
  });
  document.getElementById('pickNumbersBtn').addEventListener('click', ()=> openNumberPicker());
  document.getElementById('buyNowBtn').addEventListener('click', ()=> startCheckout('random'));
  tickAllCountdowns();
}

function renderSelectedChips(){
  const row = document.getElementById('selectedNumbersRow');
  const chips = document.getElementById('selectedChips');
  if (!row) return;
  if (selectedNumbers.length){
    row.style.display = 'flex';
    chips.innerHTML = selectedNumbers.map(n=> `<span class="chip-num">${n}</span>`).join('');
  } else {
    row.style.display = 'none';
    chips.innerHTML = '';
  }
}

function tickAllCountdowns(){
  document.querySelectorAll('.countdown[data-raffle]').forEach(box=>{
    const id = box.dataset.raffle;
    const raffle = raffles.find(r=>r.id===id) || currentRaffle;
    if (!raffle) return;
    const c = fmtCountdown(raffle.drawAt);
    box.querySelector('[data-unit="days"]').textContent = c.d;
    box.querySelector('[data-unit="hours"]').textContent = c.h;
    box.querySelector('[data-unit="mins"]').textContent = c.m;
    box.querySelector('[data-unit="secs"]').textContent = c.s;
  });
}
setInterval(tickAllCountdowns, 1000);

// ===================== NUMBER PICKER =====================
let numGridStart = 1;
const NUM_PAGE = 210;

async function openNumberPicker(){
  if (!currentRaffle) return;
  numGridStart = 1;
  document.getElementById('numGrid').innerHTML = '';
  document.getElementById('pickNumTitle').textContent = t('pickLabel');
  document.getElementById('numberModalConfirm').textContent = t('confirmSelection');
  updatePickSub();
  document.getElementById('numberModalBackdrop').classList.add('show');
  await loadNumberPage();
}

function updatePickSub(){
  document.getElementById('pickNumSub').textContent = `${selectedNumbers.length}/${MAX_TICKETS} selected`;
  const row = document.getElementById('pickTotalRow');
  const lbl = document.getElementById('pickTotalLbl');
  const val = document.getElementById('pickTotalVal');
  if (selectedNumbers.length && currentRaffle){
    const total = currentRaffle.price * selectedNumbers.length;
    row.style.display = 'flex';
    lbl.textContent = `${selectedNumbers.length} × ${currentRaffle.price.toLocaleString()} Birr`;
    val.textContent = `${total.toLocaleString()} Birr`;
  } else {
    row.style.display = 'none';
  }
}

async function loadNumberPage(){
  const end = Math.min(currentRaffle.totalNumbers, numGridStart + NUM_PAGE - 1);
  const res = await fetch(`${API}/raffles/${currentRaffle.id}/numbers?start=${numGridStart}&end=${end}`);
  const data = await res.json();
  const grid = document.getElementById('numGrid');
  data.numbers.forEach(item=>{
    const cell = document.createElement('div');
    cell.className = 'num-cell';
    if (selectedNumbers.includes(item.n)) cell.classList.add('selected');
    else if (item.status !== 'available') cell.classList.add(item.status);
    cell.textContent = item.n;
    if (item.status === 'available' || selectedNumbers.includes(item.n)){
      cell.addEventListener('click', ()=> toggleNumber(item.n, cell));
    }
    grid.appendChild(cell);
  });
  numGridStart = end + 1;
  document.getElementById('numLoadMore').style.display = numGridStart > currentRaffle.totalNumbers ? 'none' : 'block';
}
document.getElementById('numLoadMore').addEventListener('click', loadNumberPage);

function toggleNumber(n, cell){
  const idx = selectedNumbers.indexOf(n);
  if (idx > -1){
    selectedNumbers.splice(idx, 1);
    cell.classList.remove('selected');
  } else {
    if (selectedNumbers.length >= MAX_TICKETS){
      showToast(`You can select up to ${MAX_TICKETS} number(s) per order.`);
      return;
    }
    selectedNumbers.push(n);
    cell.classList.add('selected');
  }
  updatePickSub();
}

document.getElementById('numberModalClose').addEventListener('click', ()=>{
  document.getElementById('numberModalBackdrop').classList.remove('show');
});
document.getElementById('numberModalConfirm').addEventListener('click', ()=>{
  if (selectedNumbers.length < 1){
    showToast(`Please select at least 1 number`);
    return;
  }
  qty = selectedNumbers.length;
  const qtyVal = document.getElementById('qtyVal');
  if (qtyVal) qtyVal.textContent = qty;
  document.getElementById('numberModalBackdrop').classList.remove('show');
  renderSelectedChips();
  showToast(`${selectedNumbers.length} ${t('toastPicked')}`);
});

// ===================== CHECKOUT (3 steps) =====================
let checkoutOrder = null;
let checkoutMode = 'random';
let selectedBankId = null;
let receiptFile = null;

function startCheckout(mode){
  checkoutMode = mode;
  if (mode === 'manual' && selectedNumbers.length !== qty){
    showToast(`Please select ${qty} number(s) first`);
    return;
  }
  // A manual pick that was confirmed but then abandoned (checkout modal
  // closed before finishing) leaves selectedNumbers populated. If the buyer
  // then hits "Buy Now (random)", that stale array must not leak into this
  // random order - otherwise the step-1 summary displays the old manual
  // numbers while the server actually assigns different random ones.
  if (mode === 'random' && selectedNumbers.length){
    selectedNumbers = [];
    renderSelectedChips();
  }
  selectedBankId = null;
  receiptFile = null;
  checkoutOrder = null;
  renderCheckoutStep1();
  document.getElementById('checkoutModalBackdrop').classList.add('show');
  setStepBars(1);
}

function setStepBars(step){
  [1,2,3].forEach(n=>{
    const bar = document.getElementById('stepBar'+n);
    bar.classList.remove('active','done');
    if (n < step) bar.classList.add('done');
    if (n === step) bar.classList.add('active');
  });
  document.getElementById('checkoutStepLbl').textContent = `Step ${step} of 3`;
}

function renderCheckoutStep1(){
  document.getElementById('checkoutTitle').textContent = t('orderConfirmTitle');
  const total = currentRaffle.price * qty;
  document.getElementById('checkoutBody').innerHTML = `
    <div class="summary-card">
      <div style="font-weight:700;margin-bottom:4px;">${esc(currentRaffle.title)}</div>
      <div class="summary-row"><span>${qty} × ${currentRaffle.price.toLocaleString()} Birr</span></div>
      <div class="summary-total">${total.toLocaleString()} Birr</div>
      ${checkoutMode === 'manual' && selectedNumbers.length ? `<div class="order-id-chip">#${selectedNumbers.join(', #')}</div>` : `<div class="order-id-chip">Random numbers will be assigned</div>`}
    </div>
    <div class="field"><label>${t('fullNameLbl')}</label><input type="text" id="checkoutFullName" placeholder="${t('fullNameLbl')}" value="${esc(localStorage.getItem('fullName')||'')}"></div>
    <div class="field"><label>${t('phoneLbl')}</label><input type="tel" id="checkoutPhone" placeholder="e.g. 251912345678" value="${esc(localStorage.getItem('phone')||'')}"></div>
  `;
  document.getElementById('checkoutFoot').innerHTML = `<button class="btn btn-gold" id="checkoutStep1Next">${t('continueLbl')} →</button>`;
  document.getElementById('checkoutStep1Next').addEventListener('click', submitStep1);
}

async function submitStep1(){
  const fullName = document.getElementById('checkoutFullName').value.trim();
  const phone = document.getElementById('checkoutPhone').value.trim();
  if (!fullName || !phone){ showToast('Please fill in your name and phone number'); return; }
  // If this phone differs from the last saved one, drop the old
  // customerId - it belonged to that previous phone number and would
  // just cause a mismatch on the next ticket lookup. The real value for
  // this phone comes back in the order response below.
  if (localStorage.getItem('phone') !== phone) localStorage.removeItem('customerId');
  localStorage.setItem('fullName', fullName);
  localStorage.setItem('phone', phone);

  const btn = document.getElementById('checkoutStep1Next');
  btn.disabled = true; btn.textContent = '...';
  try{
    const res = await fetch(`${API}/orders`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        raffleId: currentRaffle.id, quantity: qty,
        numbers: checkoutMode === 'manual' ? selectedNumbers : undefined,
        mode: checkoutMode, fullName, phone
      })
    });
    const data = await res.json();
    if (!res.ok){ showToast(data.error || 'Could not create order'); btn.disabled=false; btn.textContent = t('continueLbl')+' →'; return; }
    checkoutOrder = data.order;
    localStorage.setItem('customerId', checkoutOrder.customerId);
    renderCheckoutStep2(data.banks);
    setStepBars(2);
  }catch(e){
    console.error(e); showToast('Network error, please try again'); btn.disabled=false; btn.textContent = t('continueLbl')+' →';
  }
}

function renderCheckoutStep2(banks){
  document.getElementById('checkoutTitle').textContent = t('orderPaymentTitle');
  document.getElementById('checkoutBody').innerHTML = `
    <div class="summary-card">
      <div class="summary-row"><span>Total</span><b>${checkoutOrder.total.toLocaleString()} Birr</b></div>
      <div class="order-id-chip">Order #${checkoutOrder.id}</div>
      <div class="order-id-chip">Tickets: #${checkoutOrder.ticketNumbers.join(', #')}</div>
    </div>
    <div style="font-size:12.5px;color:var(--text-secondary);font-weight:600;margin-bottom:8px;">${t('banksLbl')}</div>
    <div id="banksList">
      ${banks.map(b=>`
        <div class="bank-card" data-bank="${b.id}">
          <div class="bank-left"><div class="bank-icon">🏦</div><div><div class="bank-name">${esc(b.name)}</div><div class="bank-holder">${esc(b.holder)}</div></div></div>
          <div class="bank-account-wrap">
            <div class="bank-account">${esc(b.account)}</div>
            <div class="copy-account-btn" data-copy="${esc(b.account)}" title="Copy account number">
              <svg class="icon-copy" width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" stroke-width="2"/></svg>
              <svg class="icon-check" width="15" height="15" viewBox="0 0 24 24" fill="none" style="display:none;"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
        </div>`).join('')}
    </div>
    <div class="upload-box" id="uploadBox">
      <div id="uploadHintText">${t('uploadHint')}</div>
      <img id="uploadPreview" class="upload-preview" style="display:none;">
    </div>
    <input type="file" id="receiptInput" accept="image/*" style="display:none;">
  `;
  document.getElementById('checkoutFoot').innerHTML = `<button class="btn btn-gold" id="checkoutStep2Next">${t('submitPaymentLbl')} →</button>`;

  document.querySelectorAll('.bank-card').forEach(card=>{
    card.addEventListener('click', ()=>{
      document.querySelectorAll('.bank-card').forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
      selectedBankId = card.dataset.bank;
    });
  });
  document.querySelectorAll('.copy-account-btn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const text = btn.dataset.copy;
      copyToClipboard(text).then(()=>{
        btn.classList.add('copied');
        btn.querySelector('.icon-copy').style.display = 'none';
        btn.querySelector('.icon-check').style.display = '';
        btn.title = 'Copied!';
        showToast('Account number copied');
        setTimeout(()=>{
          btn.classList.remove('copied');
          btn.querySelector('.icon-copy').style.display = '';
          btn.querySelector('.icon-check').style.display = 'none';
          btn.title = 'Copy account number';
        }, 1500);
      }).catch(()=> showToast('Could not copy'));
    });
  });
  const uploadBox = document.getElementById('uploadBox');
  const receiptInput = document.getElementById('receiptInput');
  uploadBox.addEventListener('click', ()=> receiptInput.click());
  receiptInput.addEventListener('change', ()=>{
    const file = receiptInput.files[0];
    if (!file) return;
    receiptFile = file;
    uploadBox.classList.add('has-file');
    document.getElementById('uploadHintText').textContent = file.name;
    const reader = new FileReader();
    reader.onload = e=>{
      const img = document.getElementById('uploadPreview');
      img.src = e.target.result; img.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('checkoutStep2Next').addEventListener('click', submitStep2);
}

async function submitStep2(){
  if (!receiptFile){ showToast('Please upload your payment receipt'); return; }
  const btn = document.getElementById('checkoutStep2Next');
  btn.disabled = true; btn.textContent = '...';
  try{
    const fd = new FormData();
    fd.append('receipt', receiptFile);
    if (selectedBankId) fd.append('bankId', selectedBankId);
    const res = await fetch(`${API}/orders/${checkoutOrder.id}/payment`, { method:'POST', body: fd });
    const data = await res.json();
    if (!res.ok){ showToast(data.error || 'Could not submit payment'); btn.disabled=false; btn.textContent=t('submitPaymentLbl')+' →'; return; }
    checkoutOrder = data.order;
    renderCheckoutStep3();
    setStepBars(3);
  }catch(e){
    console.error(e); showToast('Network error, please try again'); btn.disabled=false; btn.textContent=t('submitPaymentLbl')+' →';
  }
}

function renderCheckoutStep3(){
  document.getElementById('checkoutTitle').textContent = t('orderStatusTitle');
  document.getElementById('checkoutBody').innerHTML = `
    <div class="status-card">
      <div class="status-icon wait">⏳</div>
      <div style="font-weight:700;font-size:16px;margin-bottom:8px;">Order #${checkoutOrder.id}</div>
      <div style="color:var(--text-secondary);font-size:13.5px;line-height:1.5;">${t('waitingApproval')}</div>
      <div class="order-id-chip" style="margin-top:14px;">Tickets: #${checkoutOrder.ticketNumbers.join(', #')}</div>
      <div class="order-id-chip" style="margin-top:8px;background:var(--accent-gold);color:#241a02;font-weight:700;">Your Customer ID: ${esc(checkoutOrder.customerId)}</div>
      <div style="color:var(--text-tertiary);font-size:11.5px;margin-top:6px;">Save this ID - you'll need it with your phone number to look up your tickets later.</div>
    </div>
  `;
  document.getElementById('checkoutFoot').innerHTML = `<button class="btn btn-outline" id="checkoutDone">Done</button>`;
  document.getElementById('checkoutDone').addEventListener('click', ()=>{
    document.getElementById('checkoutModalBackdrop').classList.remove('show');
    selectedNumbers = [];
    qty = 1;
    loadRaffles();
    if (currentRaffle) openDetail(currentRaffle.id);
    showView('ticketsView');
    document.getElementById('ticketPhoneInput').value = checkoutOrder.phone;
    document.getElementById('ticketCustomerIdInput').value = checkoutOrder.customerId;
    searchTickets(checkoutOrder.phone, checkoutOrder.customerId);
  });
}

document.getElementById('checkoutModalClose').addEventListener('click', ()=>{
  document.getElementById('checkoutModalBackdrop').classList.remove('show');
});

// wire "select manually then buy" — after confirming numbers, buyNowBtn does random;
// picking numbers then pressing pick again shows chips; add a dedicated buy-with-selection path:
document.addEventListener('click', (e)=>{
  if (e.target.closest('#numberModalConfirm')){
    // if selection complete, auto-trigger checkout with manual mode after a short delay
    if (selectedNumbers.length === qty){
      setTimeout(()=> startCheckout('manual'), 150);
    }
  }
});

// ===================== TICKETS =====================
async function searchTickets(phone, customerId){
  if (!phone){ showToast('Enter a phone number'); return; }
  if (!customerId){ showToast('Enter your Customer ID'); return; }
  try{
    const res = await fetch(`${API}/tickets?phone=${encodeURIComponent(phone)}&customerId=${encodeURIComponent(customerId)}`);
    const data = await res.json();
    if (!res.ok){ showToast(data.error || 'Could not load tickets'); return; }
    renderTickets(data.orders || [], data.counts || {active:0,pending:0,total:0});
  }catch(e){ console.error(e); showToast('Could not load tickets'); }
}

function statusLabel(s){
  return { confirmed:'Confirmed', pending:'Pending Review', awaiting_payment:'Awaiting Payment', rejected:'Rejected', expired:'Expired' }[s] || s;
}

// For an expired/rejected order, the numbers were released back to the
// pool - they no longer belong to this order. Label each number with what
// it's actually doing right now (free / re-bought and taken / re-reserved
// by someone mid-checkout), so a customer never mistakes an old order for
// still owning those numbers.
const liveStatusLabel = { available: 'Free now', taken: 'Taken by another buyer', pending: 'Reserved by another buyer' };

async function fetchLiveNumberStatuses(raffleId, nums){
  try{
    const res = await fetch(`${API}/raffles/${raffleId}/numbers?nums=${nums.join(',')}`);
    const data = await res.json();
    const map = {};
    (data.numbers || []).forEach(item => { map[item.n] = item.status; });
    return map;
  }catch(e){ console.error(e); return {}; }
}

function renderTickets(orders, counts){
  document.getElementById('ticketsActiveNum').textContent = counts.active || 0;
  document.getElementById('ticketsPendingNum').textContent = counts.pending || 0;
  document.getElementById('ticketsTotalNum').textContent = counts.total || 0;
  const list = document.getElementById('ticketsList');
  const empty = document.getElementById('ticketsEmpty');
  if (!orders.length){ list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  list.innerHTML = orders.map(o=> {
    const released = o.status === 'expired' || o.status === 'rejected';
    const needsPayment = o.status === 'awaiting_payment';
    return `
    <div class="ticket-card">
      <div class="ticket-top">
        <div><div style="font-weight:700;">${esc(o.raffleTitle)}</div><div style="font-size:11.5px;color:var(--text-tertiary);">Order #${esc(o.id)}</div></div>
        <div class="ticket-status ${o.status}">${statusLabel(o.status)}</div>
      </div>
      <div style="font-size:12.5px;color:var(--text-secondary);">${o.quantity} ticket(s) · ${o.total.toLocaleString()} Birr</div>
      ${released ? `<div style="font-size:11.5px;color:var(--accent-red);margin-top:6px;">These numbers were released back to the pool and no longer belong to you.</div>` : ''}
      ${needsPayment ? `<div style="font-size:11.5px;color:var(--accent-gold);margin-top:6px;">Reserved until ${new Date(o.reservedUntil).toLocaleTimeString()} - upload your payment receipt before then or these numbers will be released.</div>` : ''}
      <div class="ticket-nums" id="ticket-nums-${o.id}">${o.ticketNumbers.map(n=>`<span class="chip-num${released ? ' chip-num-released' : ''}">#${n}</span>`).join('')}</div>
      ${needsPayment ? `<button class="btn btn-gold" style="margin-top:12px;margin-bottom:0;" data-resumepay="${esc(o.id)}">Continue Payment →</button>` : ''}
    </div>
  `;
  }).join('');

  list.querySelectorAll('[data-resumepay]').forEach(btn=>{
    btn.addEventListener('click', ()=> resumePayment(btn.dataset.resumepay));
  });

  // Kick off live-status lookups only for released orders, then patch the
  // chips in place once results come back (avoids blocking the initial render).
  orders.filter(o => o.status === 'expired' || o.status === 'rejected').forEach(async o => {
    const statusMap = await fetchLiveNumberStatuses(o.raffleId, o.ticketNumbers);
    const container = document.getElementById(`ticket-nums-${o.id}`);
    if (!container) return;
    container.innerHTML = o.ticketNumbers.map(n => {
      const live = statusMap[n] || 'available';
      const label = liveStatusLabel[live] || 'Free now';
      return `<span class="chip-num chip-num-released chip-live-${live}">#${n} <em>${label}</em></span>`;
    }).join('');
  });
}

// Lets a customer who left mid-checkout (order created + numbers reserved,
// but no receipt uploaded yet) pick up exactly where they stopped, instead
// of having to start over with a fresh set of numbers. Jumps straight to
// the payment step of the checkout modal using the existing order.
async function resumePayment(orderId){
  try{
    const res = await fetch(`${API}/orders/${orderId}`);
    const data = await res.json();
    if (!res.ok){ showToast(data.error || 'Order not found'); return; }
    if (data.order.status !== 'awaiting_payment'){
      showToast('This order can no longer accept payment - it may have expired or already been submitted.');
      searchTickets(data.order.phone, data.order.customerId);
      return;
    }
    const banksRes = await fetch(`${API}/banks`);
    const banksData = await banksRes.json();
    checkoutOrder = data.order;
    checkoutMode = 'manual';
    selectedBankId = null;
    receiptFile = null;
    renderCheckoutStep2(banksData.banks || []);
    document.getElementById('checkoutModalBackdrop').classList.add('show');
    setStepBars(2);
  }catch(e){ console.error(e); showToast('Could not resume this order'); }
}

document.getElementById('ticketSearchBtn').addEventListener('click', ()=>{
  const phone = document.getElementById('ticketPhoneInput').value.trim();
  const customerId = document.getElementById('ticketCustomerIdInput').value.trim();
  searchTickets(phone, customerId);
});
function loadSavedPhoneIntoTickets(){
  const savedPhone = localStorage.getItem('phone');
  const savedId = localStorage.getItem('customerId');
  if (savedPhone && !document.getElementById('ticketPhoneInput').value){
    document.getElementById('ticketPhoneInput').value = savedPhone;
  }
  if (savedId && !document.getElementById('ticketCustomerIdInput').value){
    document.getElementById('ticketCustomerIdInput').value = savedId;
  }
  if (savedPhone && savedId){
    searchTickets(savedPhone, savedId);
  }
}

// ===================== PROFILE =====================
function loadProfile(){
  const phone = localStorage.getItem('phone') || '';
  const customerId = localStorage.getItem('customerId') || '';
  document.getElementById('profilePhoneVal').textContent = phone || 'Not set';
  document.getElementById('profileCustomerIdVal').textContent = customerId || 'Not set (place an order to get one)';
  document.getElementById('profilePhoneInput').value = phone;
}
document.getElementById('profileSaveBtn').addEventListener('click', ()=>{
  const phone = document.getElementById('profilePhoneInput').value.trim();
  if (!phone){ showToast('Enter a phone number'); return; }
  // Changing the phone here doesn't change your customer id - that id is
  // tied to whichever phone you actually ordered under. If this doesn't
  // match, ticket lookups just won't find anything, same as typing a
  // phone number that never placed an order.
  localStorage.setItem('phone', phone);
  loadProfile();
  showToast('Saved');
});

// ===================== INIT =====================
applyLang(currentLang);
loadRaffles();
setInterval(loadRaffles, 30000);

// If opened as a Telegram Mini App, ask the backend (via signed initData -
// see verifyTelegramInitData in server/utils.js) whether this Telegram
// account already shared its phone with the bot. If so, use that to fill
// in the checkout form instead of making the person retype what they just
// gave the bot seconds earlier. Silently does nothing outside Telegram, if
// the bot hasn't collected a phone for this user yet, or if the backend
// isn't configured for it (TELEGRAM_BOT_TOKEN unset) - checkout still
// works fine either way, just without the prefill.
async function prefillFromTelegram(){
  const initData = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData;
  if (!initData) return;
  try{
    const res = await fetch(`${API}/telegram/prefill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.linked && data.phone){
      localStorage.setItem('phone', data.phone);
      if (data.fullName) localStorage.setItem('fullName', data.fullName);
      if (data.customerId) localStorage.setItem('customerId', data.customerId);
      // Covers the case where the checkout form already rendered (with
      // empty/stale values) before this fetch resolved.
      const phoneEl = document.getElementById('checkoutPhone');
      const nameEl = document.getElementById('checkoutFullName');
      if (phoneEl && !phoneEl.value) phoneEl.value = data.phone;
      if (nameEl && !nameEl.value && data.fullName) nameEl.value = data.fullName;
      // Same idea for "My Tickets": if the person already tapped that tab
      // before this fetch resolved, it rendered empty (no customerId yet).
      // Re-run the load now that we actually have one, so they don't have
      // to manually re-tap the tab to see their own orders show up.
      if (data.customerId) loadSavedPhoneIntoTickets();
    }
  }catch(e){ /* prefill is a convenience, not required - fail quiet */ }
}
prefillFromTelegram();
