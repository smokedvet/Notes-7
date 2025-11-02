// Minimal local encrypted vault using Web Crypto API (AES-GCM + PBKDF2)
// NOTE: This is for privacy from casual access on the same device. If the device is compromised, security isn't guaranteed.

const $ = (id)=>document.getElementById(id);
const views = {
  home: $('homeView'),
  checkin: $('checkinView'),
  patterns: $('patternsView'),
  truths: $('truthsView'),
  plan: $('planView'),
  resources: $('resourcesView'),
  auth: $('authView'),
};
const navBtns = document.querySelectorAll('nav button');
navBtns.forEach(b=>b.addEventListener('click', ()=>showView(b.dataset.view)));
$('quickExit').addEventListener('click', quickExit);
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') quickExit(); });

let vault = null;       // decrypted in-memory object
let keyMaterial = null; // CryptoKey for PBKDF2
let aesKey = null;      // AES-GCM key
const STORE_KEY = 'qrk_vault';
const SALT_KEY  = 'qrk_salt';
const IV_BYTES = 12;

// ---------- Auth / Unlock ----------
$('unlockBtn').addEventListener('click', async () => {
  const pass = $('passphrase').value || '';
  $('authMsg').textContent = 'Unlocking...';
  try {
    keyMaterial = await getKeyMaterial(pass);
    const salt = getOrCreateSalt();
    aesKey = await deriveKey(keyMaterial, salt);
    // Try to load existing or create new
    const existing = localStorage.getItem(STORE_KEY);
    if (existing) {
      vault = await decryptVault(existing, aesKey);
    } else {
      vault = defaultVault();
      await persistVault();
    }
    $('authMsg').textContent = '';
    views.auth.classList.add('hidden');
    showView('home');
    renderAll();
  } catch (err) {
    console.error(err);
    $('authMsg').textContent = 'Failed to unlock. Check passphrase.';
  }
});

function defaultVault(){
  return {
    truths: [
      "I’m allowed to feel safe in my own body.",
      "I can love others without losing myself.",
      "I don’t need permission to heal.",
      "My worth isn’t defined by what broke me.",
      "I can be both gentle and strong."
    ],
    checkins: [], // {date, peace, drain, right}
    patterns: [], // {title, what, body, lie, truth, createdAt}
    plan: { people:"", steps:"", code:"", meet:"" }
  };
}

function showView(id){
  Object.values(views).forEach(v=>v.classList.add('hidden'));
  switch(id){
    case 'home': views.home.classList.remove('hidden'); break;
    case 'checkin': views.checkin.classList.remove('hidden'); break;
    case 'patterns': views.patterns.classList.remove('hidden'); break;
    case 'truths': views.truths.classList.remove('hidden'); break;
    case 'plan': views.plan.classList.remove('hidden'); break;
    case 'resources': views.resources.classList.remove('hidden'); break;
    default: views.home.classList.remove('hidden');
  }
}

function quickExit(){
  // Hide sensitive content and navigate to a neutral site
  Object.values(views).forEach(v=>v.classList.add('hidden'));
  views.auth.classList.remove('hidden');
  window.open('https://www.weather.com', '_blank');
}

// ---------- WebCrypto helpers ----------
function getOrCreateSalt(){
  let saltB64 = localStorage.getItem(SALT_KEY);
  if(!saltB64){
    const salt = crypto.getRandomValues(new Uint8Array(16));
    saltB64 = btoa(String.fromCharCode(...salt));
    localStorage.setItem(SALT_KEY, saltB64);
  }
  const bytes = Uint8Array.from(atob(saltB64), c=>c.charCodeAt(0));
  return bytes;
}
async function getKeyMaterial(password) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    {"name": "PBKDF2"},
    false,
    ["deriveBits", "deriveKey"]
  );
}
async function deriveKey(keyMaterial, salt){
  return crypto.subtle.deriveKey(
    {
      "name": "PBKDF2",
      salt,
      "iterations": 250000,
      "hash": "SHA-256"
    },
    keyMaterial,
    { "name": "AES-GCM", "length": 256},
    false,
    ["encrypt", "decrypt"]
  );
}
async function encryptVault(dataObj, key){
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(dataObj));
  const ct = await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, plaintext);
  const merged = new Uint8Array(IV_BYTES + ct.byteLength);
  merged.set(iv, 0);
  merged.set(new Uint8Array(ct), IV_BYTES);
  return btoa(String.fromCharCode(...merged));
}
async function decryptVault(b64, key){
  const raw = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
  const iv = raw.slice(0, IV_BYTES);
  const ct = raw.slice(IV_BYTES);
  const pt = await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, ct);
  const dec = new TextDecoder().decode(pt);
  return JSON.parse(dec);
}
async function persistVault(){
  const b64 = await encryptVault(vault, aesKey);
  localStorage.setItem(STORE_KEY, b64);
}

// ---------- Check‑ins ----------
$('checkinForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const d = $('ciDate').value || new Date().toISOString().slice(0,10);
  const peace = $('ciPeace').value.trim();
  const drain = $('ciDrain').value.trim();
  const right = $('ciRight').value.trim();
  vault.checkins.unshift({date:d, peace, drain, right});
  await persistVault();
  $('ciPeace').value = $('ciDrain').value = $('ciRight').value = '';
  renderCheckins();
});
function renderCheckins(){
  const ul = $('checkinList');
  ul.innerHTML='';
  vault.checkins.forEach((c,i)=>{
    const li = document.createElement('li');
    li.innerHTML = `<strong>${c.date}</strong><br>
      <em>Peace:</em> ${escapeHtml(c.peace)}<br>
      <em>Drain:</em> ${escapeHtml(c.drain)}<br>
      <em>Did right:</em> ${escapeHtml(c.right)}<br>
      <button data-del="${i}">Delete</button>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll('button[data-del]').forEach(b=>b.addEventListener('click', async ()=>{
    const idx = +b.dataset.del;
    vault.checkins.splice(idx,1);
    await persistVault();
    renderCheckins();
  }));
}

// ---------- Patterns ----------
$('patternForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const p = {
    title: $('ptTitle').value.trim(),
    what: $('ptWhat').value.trim(),
    body: $('ptBody').value.trim(),
    lie: $('ptLie').value.trim(),
    truth: $('ptTruth').value.trim(),
    createdAt: new Date().toISOString()
  };
  vault.patterns.unshift(p);
  await persistVault();
  ['ptTitle','ptWhat','ptBody','ptLie','ptTruth'].forEach(id=>$(id).value='');
  renderPatterns();
});
function renderPatterns(){
  const ul = $('patternList');
  ul.innerHTML='';
  vault.patterns.forEach((p,i)=>{
    const li = document.createElement('li');
    li.innerHTML = `<strong>${escapeHtml(p.title||'Untitled')}</strong>
      <div class="muted">${new Date(p.createdAt).toLocaleString()}</div>
      <div><em>What happened:</em> ${escapeHtml(p.what)}</div>
      <div><em>Body signals:</em> ${escapeHtml(p.body)}</div>
      <div><em>Old lie:</em> ${escapeHtml(p.lie)}</div>
      <div><em>New truth:</em> ${escapeHtml(p.truth)}</div>
      <button data-del="${i}">Delete</button>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll('button[data-del]').forEach(b=>b.addEventListener('click', async ()=>{
    const idx = +b.dataset.del;
    vault.patterns.splice(idx,1);
    await persistVault();
    renderPatterns();
  }));
}

// ---------- Truths ----------
$('truthForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const t = $('trText').value.trim();
  if(!t) return;
  vault.truths.push(t);
  await persistVault();
  $('trText').value='';
  renderTruths();
});
function renderTruths(){
  const ul = $('truthList');
  ul.innerHTML='';
  vault.truths.forEach((t,i)=>{
    const li = document.createElement('li');
    li.textContent = t;
    li.title = "Click to remove";
    li.addEventListener('click', async ()=>{
      vault.truths.splice(i,1);
      await persistVault();
      renderTruths();
    });
    ul.appendChild(li);
  });
}

// ---------- Stability Plan ----------
$('savePlan').addEventListener('click', async ()=>{
  vault.plan.people = $('spPeople').value;
  vault.plan.steps  = $('spSteps').value;
  vault.plan.code   = $('spCode').value;
  vault.plan.meet   = $('spMeet').value;
  await persistVault();
  alert('Saved.');
});

function renderPlan(){
  $('spPeople').value = vault.plan.people;
  $('spSteps').value  = vault.plan.steps;
  $('spCode').value   = vault.plan.code;
  $('spMeet').value   = vault.plan.meet;
}

// ---------- Export / Import ----------
$('exportBtn').addEventListener('click', async ()=>{
  // Persist then export encrypted blob from localStorage
  await persistVault();
  const b64 = localStorage.getItem(STORE_KEY) || '';
  const blob = new Blob([b64], {type:'application/octet-stream'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vault.qrk';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('importFile').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const text = await file.text();
  localStorage.setItem(STORE_KEY, text.trim());
  try{
    vault = await decryptVault(text.trim(), aesKey);
    renderAll();
    alert('Imported and unlocked.');
  }catch(e){
    alert('Imported. Enter the correct passphrase to unlock.');
  }
});


// ---- Printing ----
$('printPage').addEventListener('click', ()=>{
  window.print();
});

// ---- Panic Mask ----
let masked = false;
$('panicMask').addEventListener('click', activateMask);
$('groceryMask').addEventListener('click', deactivateMask);
function activateMask(){
  if(masked) return;
  masked = true;
  document.body.classList.add('masked');
  // hide all views and show mask
  Object.values(views).forEach(v=>v.classList.add('hidden'));
  $('groceryMask').classList.remove('hidden');
}
function deactivateMask(){
  // Only deactivate with secret combo or clicking mask (soft hide)
  $('groceryMask').classList.add('hidden');
  masked = false;
  // Return to auth screen for safety
  showView('home');
  views.auth.classList.add('hidden');
}
document.addEventListener('keydown', (e)=>{
  // Secret combo: Ctrl+Shift+M toggles mask
  if(e.ctrlKey && e.shiftKey && e.key.toLowerCase()==='m'){
    if(masked){ deactivateMask(); } else { activateMask(); }
  }
});

// ---- Print helpers ----
function printElement(title, element){
  const w = window.open('', '_blank');
  const doc = w.document;
  const css = `
    <style>
      body{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Arial, sans-serif; padding:20px; }
      h1{ font-size: 20px; margin: 0 0 12px 0; }
      .muted{ color:#666; }
      .chip{ display:inline-block; padding:6px 10px; border-radius:999px; background:#eee; margin:4px 6px 0 0; }
      ul{ padding-left:16px; }
      .block{ margin-bottom:10px; }
    </style>`;
  doc.write(`<html><head><title>${title}</title>${css}</head><body><h1>${title}</h1>${element.outerHTML}</body></html>`);
  doc.close();
  w.focus();
  w.print();
}

// Section print buttons
$('printCheckinSection').addEventListener('click', ()=>{
  const section = $('checkinView').cloneNode(true);
  // remove form inputs for print clarity
  const form = section.querySelector('#checkinForm'); if(form) form.remove();
  printElement('Quiet Journal — Daily Check‑In', section);
});
$('printPatternSection').addEventListener('click', ()=>{
  const section = $('patternsView').cloneNode(true);
  const form = section.querySelector('#patternForm'); if(form) form.remove();
  printElement('Quiet Journal — Pattern Tracker', section);
});
$('printTruthSection').addEventListener('click', ()=>{
  const section = $('truthsView').cloneNode(true);
  const form = section.querySelector('#truthForm'); if(form) form.remove();
  printElement('Quiet Journal — Truth Statements', section);
});
$('printPlanSection').addEventListener('click', ()=>{
  const section = $('planView').cloneNode(true);
  // Convert textareas to plain text blocks
  section.querySelectorAll('textarea,input').forEach(el=>{
    const div=document.createElement('div');
    div.className='block';
    const label=el.parentElement.querySelector('label')?el.parentElement.querySelector('label').textContent:'';
    div.innerHTML = `<strong>${(el.id||'').toUpperCase()}</strong><div>${escapeHtml(el.value||'')}</div>`;
  });
  printElement('Quiet Journal — Stability Plan', section);
});

// Per-item print buttons for lists
function attachPerItemPrintButtons(){
  // Check‑ins
  document.querySelectorAll('#checkinList li').forEach((li)=>{
    if(!li.querySelector('.btn-print')){
      const b=document.createElement('button'); b.textContent='Print'; b.className='btn-print'; b.style.marginLeft='8px';
      li.appendChild(b);
      b.addEventListener('click', ()=> printElement('Quiet Journal — Check‑In', li));
    }
  });
  // Patterns
  document.querySelectorAll('#patternList li').forEach((li)=>{
    if(!li.querySelector('.btn-print')){
      const b=document.createElement('button'); b.textContent='Print'; b.className='btn-print'; b.style.marginLeft='8px';
      li.appendChild(b);
      b.addEventListener('click', ()=> printElement('Quiet Journal — Pattern', li));
    }
  });
  // Truths list prints as a section already; optional per-chip not needed.
}

const _renderCheckins = renderCheckins;
renderCheckins = function(){
  _renderCheckins();
  attachPerItemPrintButtons();
}
const _renderPatterns = renderPatterns;
renderPatterns = function(){
  _renderPatterns();
  attachPerItemPrintButtons();
}

// ---- Backup reminder (30 days) ----
const BACKUP_TS_KEY = 'qrk_last_backup_ts';

function setBackupTimestamp(){
  localStorage.setItem(BACKUP_TS_KEY, String(Date.now()));
  updateBackupBanner();
}

function daysSince(ts){
  const ms = Date.now() - ts;
  return Math.floor(ms / (1000*60*60*24));
}

function updateBackupBanner(){
  const el = $('backupReminder');
  if(!el) return;
  const tsStr = localStorage.getItem(BACKUP_TS_KEY);
  if(!tsStr){ 
    el.textContent = 'Backup recommended';
    el.classList.remove('hidden'); el.classList.add('warn'); 
    return; 
  }
  const ts = parseInt(tsStr, 10);
  const d = daysSince(ts);
  if(isNaN(d)){ 
    el.textContent = 'Backup recommended';
    el.classList.remove('hidden'); el.classList.add('warn'); 
    return; 
  }
  if(d >= 30){
    el.textContent = `Last backup: ${d} days ago`;
    el.classList.remove('hidden'); el.classList.add('warn');
  }else{
    el.textContent = `Last backup: ${d} day${d==1?'':'s'} ago`;
    el.classList.remove('hidden'); el.classList.remove('warn'); el.classList.add('ok');
  }
}

// Hook into export button to set timestamp
const _exportBtnHandler = $('exportBtn').onclick;
$('exportBtn').addEventListener('click', ()=>{
  setTimeout(()=> setBackupTimestamp(), 100); // after file saves
});

// Update banner after unlock/render
const _postRenderAll = renderAll;
renderAll = function(){
  _postRenderAll();
  updateBackupBanner();
}

// ---- Secret Chat (local, encrypted) ----
// Access: click tiny dot (bottom-left), or Ctrl+Shift+C
if(!$('chatView')){
  console.warn('chatView missing');
}

function ensureChat(){
  if(!vault.chat) vault.chat = []; // {t, text}
}

function showChat(){
  ensureChat();
  Object.values(views).forEach(v=>v.classList.add('hidden'));
  $('chatView').classList.remove('hidden');
  renderChat();
}
function renderChat(){
  const log = $('chatLog');
  log.innerHTML = '';
  (vault.chat||[]).forEach((m,i)=>{
    const div = document.createElement('div');
    div.className='msg';
    const dt = new Date(m.t||Date.now());
    div.innerHTML = `<div>${escapeHtml(m.text||'')}</div><div class="meta">${dt.toLocaleString()}</div>`;
    log.appendChild(div);
  });
  log.scrollTop = log.scrollHeight;
}
$('stealthDot').addEventListener('click', showChat);
document.addEventListener('keydown', (e)=>{
  if(e.ctrlKey && e.shiftKey && e.key.toLowerCase()==='c'){
    showChat();
  }
});

const chatForm = document.getElementById('chatForm');
if(chatForm){
  chatForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const input = $('chatInput');
    const text = input.value.trim();
    if(!text) return;
    ensureChat();
    vault.chat.push({t: Date.now(), text});
    await persistVault();
    input.value='';
    renderChat();
  });
}

// Print Chat
$('printChatSection').addEventListener('click', ()=>{
  const section = $('chatView').cloneNode(true);
  // remove input form in print
  const f = section.querySelector('.chatform'); if(f) f.remove();
  printElement('notes — Chat', section);
});
// ---------- Render all ----------
function renderAll(){
  renderCheckins();
  renderPatterns();
  renderTruths();
  renderPlan();
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
