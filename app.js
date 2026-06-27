/* Slushi Sensei — Ninja SLUSHi XL family recipe app */
const cfg = window.SLUSHI_CONFIG;
const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");
const bgLayer = $("#bg-layer");

const BGS = {
  adult: ["assets/bg-adult-1.jpg", "assets/bg-adult-2.jpg", "assets/bg-adult-3.jpg"],
  kid:   ["assets/bg-kid-1.jpg", "assets/bg-kid-2.jpg", "assets/bg-kid-3.jpg"],
};
let bgTimer = null, bgIdx = 0;
function startBg(kid) {
  const set = kid ? BGS.kid : BGS.adult;
  clearInterval(bgTimer);
  const apply = () => {
    const url = set[bgIdx % set.length]; bgIdx++;
    const probe = new Image();           // only swap in the image if it actually loads
    probe.onload = () => { bgLayer.style.backgroundImage = `url('${url}')`; };
    probe.src = url;
  };
  apply();
  bgTimer = setInterval(apply, 16000);
}

const state = {
  profiles: [], me: null, recipes: [],
  agg: {},            // recipe_id -> {avg, count}
  myRatings: {},      // recipe_id -> stars
  saved: new Set(),   // recipe_id
  tab: "recipes",
  chat: [],           // {role, html, raw, image?}
  apiMsgs: [],        // anthropic-format history
  pendingImage: null, // {dataUrl, media_type, base64}
  filters: { q: "", category: "all", spirit: "all", show: "all" },
};

/* ---------------- utils ---------------- */
function esc(s){return (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function md(s){
  let t = esc(s);
  t = t.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g,"$1<em>$2</em>");
  const lines = t.split("\n").map(l=>{
    const m = l.match(/^\s*[-•]\s+(.*)$/);
    return m ? `<li>${m[1]}</li>` : l;
  });
  let html="", inList=false;
  for(const l of lines){
    if(l.startsWith("<li>")){ if(!inList){html+="<ul style='margin:6px 0;padding-left:20px'>";inList=true;} html+=l; }
    else { if(inList){html+="</ul>";inList=false;} html += l ? `<div>${l}</div>` : "<div style='height:6px'></div>"; }
  }
  if(inList) html+="</ul>";
  return html;
}
function toast(msg){ let t=$("#toast"); if(!t){t=document.createElement("div");t.id="toast";document.body.appendChild(t);} t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2200); }

/* ---------------- boot ---------------- */
init();
async function init(){
  const { data: profs } = await sb.from("profiles").select("*").order("sort");
  state.profiles = profs || [];
  const savedName = localStorage.getItem("slushi_profile");
  const me = state.profiles.find(p=>p.name===savedName);
  if(me){ state.me = me; await enter(); } else renderLogin();
}

/* ---------------- login ---------------- */
function renderLogin(){
  startBg(false);
  app.innerHTML = `
  <div id="login">
    <div class="logo">🥤</div>
    <h1>Slushi Sensei</h1>
    <p>Your family's AI frozen-drink bartender for the Ninja SLUSHi&nbsp;XL. Who's making slush today?</p>
    <div class="profiles">
      ${state.profiles.map(p=>`
        <button class="pcard" data-name="${esc(p.name)}">
          <span class="face" style="background:${p.color}22;border:2px solid ${p.color}">${p.emoji}</span>
          <span class="nm">${esc(p.name)}</span>
          <span class="role">${p.is_kid?"Kid Mode 🧃":"Full Bar 🍸"}</span>
        </button>`).join("")}
    </div>
    <p class="muted" style="font-size:13px">Kids' profiles only ever see fruit, soda &amp; milkshake slushes — zero alcohol, anywhere.</p>
  </div>`;
  app.querySelectorAll(".pcard").forEach(b=>b.onclick=async()=>{
    state.me = state.profiles.find(p=>p.name===b.dataset.name);
    localStorage.setItem("slushi_profile", state.me.name);
    await enter();
  });
}

/* ---------------- enter app ---------------- */
async function enter(){
  startBg(state.me.is_kid);
  await loadData();
  state.chat = [{ role:"ai", raw:"", html: greeting() }];
  state.apiMsgs = [];
  renderShell();
}
function greeting(){
  if(state.me.is_kid) return md(`Hi ${state.me.name}! 🦄 I'm **Slushi Sensei**. Tell me a fruit, candy, or soda you love and I'll invent a frosty slushi just for you! 🍓🍊🫐`);
  return md(`Hey ${state.me.name} 👋 I'm **Slushi Sensei**. Give me a base spirit and I'll build you a *freezable*, spirit-forward slush — or snap a photo of your drink and I'll tell you how to fix the texture. Try a quick action below. 🍹`);
}

async function loadData(){
  let q = sb.from("recipes").select("*").order("is_official",{ascending:false}).order("name");
  if(state.me.is_kid) q = q.eq("is_alcoholic", false);
  const { data: recs } = await q;
  state.recipes = recs || [];
  const { data: aggs } = await sb.from("recipe_ratings").select("*");
  state.agg = {}; (aggs||[]).forEach(a=>state.agg[a.recipe_id]={avg:Number(a.avg_stars),count:a.rating_count});
  const { data: mine } = await sb.from("ratings").select("recipe_id,stars").eq("profile_id", state.me.id);
  state.myRatings = {}; (mine||[]).forEach(r=>state.myRatings[r.recipe_id]=r.stars);
  const { data: sv } = await sb.from("saved_recipes").select("recipe_id").eq("profile_id", state.me.id);
  state.saved = new Set((sv||[]).map(s=>s.recipe_id));
}

/* ---------------- shell ---------------- */
function renderShell(){
  const tabs = [["recipes","🍧 Recipes"],["chat","🤖 Sensei"],["saved","⭐ Saved"]];
  app.innerHTML = `
  <header class="bar"><div class="wrap">
    <div class="title">🥤 Slushi Sensei</div>
    <div class="me">
      ${state.me.is_kid?`<span class="kidpill">KID MODE</span>`:""}
      <span>${esc(state.me.name)}</span>
      <span class="face" style="background:${state.me.color}33;border:2px solid ${state.me.color}">${state.me.emoji}</span>
      <button class="btn ghost sm" id="switch">Switch</button>
    </div>
  </div></header>
  <nav class="tabs wrap">
    ${tabs.map(([k,l])=>`<button data-tab="${k}" class="${state.tab===k?"on":""}">${l}</button>`).join("")}
  </nav>
  <main class="wrap" id="main"></main>`;
  $("#switch").onclick=()=>{ localStorage.removeItem("slushi_profile"); state.me=null; renderLogin(); };
  app.querySelectorAll("nav.tabs button").forEach(b=>b.onclick=()=>{ state.tab=b.dataset.tab; renderShell(); });
  if(state.tab==="recipes") renderRecipes();
  else if(state.tab==="chat") renderChat();
  else renderSaved();
}

/* ---------------- recipes ---------------- */
function categories(){ return ["all", ...Array.from(new Set(state.recipes.map(r=>r.category))).sort()]; }
function spirits(){ return ["all", ...Array.from(new Set(state.recipes.map(r=>r.base_spirit).filter(Boolean))).sort()]; }

function filteredRecipes(){
  const f=state.filters;
  return state.recipes.filter(r=>{
    if(f.category!=="all" && r.category!==f.category) return false;
    if(f.spirit!=="all" && r.base_spirit!==f.spirit) return false;
    if(!state.me.is_kid && f.show==="alc" && !r.is_alcoholic) return false;
    if(!state.me.is_kid && f.show==="na" && r.is_alcoholic) return false;
    if(f.q){ const hay=(r.name+" "+(r.tags||[]).join(" ")+" "+(r.notes||"")+" "+(r.base_spirit||"")).toLowerCase(); if(!hay.includes(f.q.toLowerCase())) return false; }
    return true;
  });
}

function renderRecipes(){
  const main=$("#main"); const f=state.filters;
  main.innerHTML=`
    <div class="toolbar glass">
      <input type="search" id="q" placeholder="Search recipes, flavors, spirits…" value="${esc(f.q)}" />
      <select id="cat">${categories().map(c=>`<option value="${c}" ${f.category===c?"selected":""}>${c==="all"?"All categories":c}</option>`).join("")}</select>
      <select id="spr">${spirits().map(c=>`<option value="${c}" ${f.spirit===c?"selected":""}>${c==="all"?"Any base":c}</option>`).join("")}</select>
      ${state.me.is_kid?"":`<select id="show">
        <option value="all" ${f.show==="all"?"selected":""}>🍸 + 🧃 All</option>
        <option value="alc" ${f.show==="alc"?"selected":""}>🍸 Cocktails</option>
        <option value="na" ${f.show==="na"?"selected":""}>🧃 Non-alcoholic</option></select>`}
    </div>
    <div class="count" id="count"></div>
    <div class="grid" id="grid"></div>`;
  $("#q").oninput=e=>{state.filters.q=e.target.value;drawGrid();};
  $("#cat").onchange=e=>{state.filters.category=e.target.value;drawGrid();};
  $("#spr").onchange=e=>{state.filters.spirit=e.target.value;drawGrid();};
  if($("#show"))$("#show").onchange=e=>{state.filters.show=e.target.value;drawGrid();};
  drawGrid();
}

function starsHtml(recipeId){
  const mine=state.myRatings[recipeId]||0;
  let h='<span class="stars" data-rid="'+recipeId+'">';
  for(let i=1;i<=5;i++) h+=`<span class="star ${i<=mine?"full":""}" data-v="${i}">★</span>`;
  h+="</span>";
  return h;
}
function recipeCard(r){
  const a=state.agg[r.id];
  const saved=state.saved.has(r.id);
  const ings=(r.ingredients||[]).map(i=>`<li><b>${esc(i.amount||"")}</b> ${esc(i.item||"")}</li>`).join("");
  return `<div class="card glass" data-rid="${r.id}">
    <div class="row">
      ${r.is_alcoholic?'<span class="badge alc">🍸 Cocktail</span>':'<span class="badge na">🧃 Family</span>'}
      <span class="badge preset">${esc(r.preset)}</span>
      <span class="badge src">${esc(r.source)}</span>
    </div>
    <h3>${esc(r.name)}</h3>
    <div class="row" style="justify-content:space-between">
      ${starsHtml(r.id)}
      <span class="meta">${a?`★ ${a.avg} (${a.count})`:"Be the first ★"}</span>
    </div>
    <div class="meta">${esc(r.category)}${r.base_spirit?" · "+esc(r.base_spirit):""} · serves ${esc(r.servings||"")}${r.est_abv?` · ~${r.est_abv}% ABV`:""}</div>
    <details><summary>Ingredients &amp; how-to</summary>
      <ul class="ings">${ings}</ul>
      ${r.instructions?`<p class="meta" style="line-height:1.5">${esc(r.instructions)}</p>`:""}
    </details>
    ${r.notes?`<div class="notes">💡 ${esc(r.notes)}</div>`:""}
    <div class="acts">
      <button class="btn sm ${saved?"":"ghost"}" data-save="${r.id}">${saved?"★ Saved":"☆ Save"}</button>
      <button class="btn ghost sm" data-ask="${r.id}">🤖 Tweak this</button>
    </div>
  </div>`;
}
function drawGrid(){
  const list=filteredRecipes();
  $("#count").textContent=`${list.length} recipe${list.length===1?"":"s"}`;
  const grid=$("#grid");
  if(!list.length){ grid.innerHTML=`<div class="empty"><div class="big">🫥</div>No matches. Try clearing a filter.</div>`; return; }
  grid.innerHTML=list.map(recipeCard).join("");
  grid.querySelectorAll(".stars").forEach(s=>{
    s.querySelectorAll(".star").forEach(st=>st.onclick=()=>rate(s.dataset.rid,Number(st.dataset.v)));
  });
  grid.querySelectorAll("[data-save]").forEach(b=>b.onclick=()=>toggleSave(b.dataset.save));
  grid.querySelectorAll("[data-ask]").forEach(b=>b.onclick=()=>{
    const r=state.recipes.find(x=>x.id===b.dataset.ask);
    state.tab="chat"; renderShell();
    setTimeout(()=>sendMessage(`I'm making "${r.name}". Here it is: ${(r.ingredients||[]).map(i=>i.amount+" "+i.item).join(", ")}. Preset ${r.preset}. Suggest one tweak to make it even better.`),60);
  });
}
async function rate(rid,v){
  state.myRatings[rid]=v;
  await sb.from("ratings").upsert({profile_id:state.me.id,recipe_id:rid,stars:v},{onConflict:"profile_id,recipe_id"});
  const { data: aggs } = await sb.from("recipe_ratings").select("*").eq("recipe_id",rid);
  if(aggs&&aggs[0]) state.agg[rid]={avg:Number(aggs[0].avg_stars),count:aggs[0].rating_count};
  toast("Rated "+v+"★");
  if(state.tab==="recipes") drawGrid(); else renderSaved();
}
async function toggleSave(rid){
  if(state.saved.has(rid)){
    state.saved.delete(rid);
    await sb.from("saved_recipes").delete().eq("profile_id",state.me.id).eq("recipe_id",rid);
    toast("Removed from Saved");
  } else {
    state.saved.add(rid);
    await sb.from("saved_recipes").insert({profile_id:state.me.id,recipe_id:rid});
    toast("Saved ★");
  }
  if(state.tab==="recipes") drawGrid(); else renderSaved();
}

/* ---------------- saved ---------------- */
function renderSaved(){
  const main=$("#main");
  const list=state.recipes.filter(r=>state.saved.has(r.id));
  if(!list.length){ main.innerHTML=`<div class="empty glass" style="margin-top:14px"><div class="big">⭐</div>No saved recipes yet.<br/><span class="muted">Tap ☆ Save on any recipe to keep it here.</span></div>`; return; }
  main.innerHTML=`<div class="count">${list.length} saved</div><div class="grid" id="grid"></div>`;
  const grid=$("#grid"); grid.innerHTML=list.map(recipeCard).join("");
  grid.querySelectorAll(".stars").forEach(s=>s.querySelectorAll(".star").forEach(st=>st.onclick=()=>rate(s.dataset.rid,Number(st.dataset.v))));
  grid.querySelectorAll("[data-save]").forEach(b=>b.onclick=()=>toggleSave(b.dataset.save));
  grid.querySelectorAll("[data-ask]").forEach(b=>b.onclick=()=>{ state.tab="chat"; renderShell(); });
}

/* ---------------- chat ---------------- */
function quickChips(){
  if(state.me.is_kid) return [
    ["🍓","Invent a strawberry slushi"],["🌈","A rainbow fruit slush"],
    ["🍫","A chocolate milkshake idea"],["🥤","Surprise me!"]];
  return [
    ["🥃","Recipe from a base spirit"],["📷","Analyze my drink photo"],
    ["🍬","It's too sweet"],["🍋","It's too sour"],["💧","It won't freeze"]];
}
function renderChat(){
  const main=$("#main");
  main.innerHTML=`
    <div class="chatwrap">
      <div class="quick" id="quick">${quickChips().map(([e,t])=>`<button class="chip" data-q="${esc(t)}">${e} ${esc(t)}</button>`).join("")}</div>
      <div class="msgs" id="msgs"></div>
      <div class="preview-strip" id="preview"></div>
      <div class="composer">
        <label class="iconbtn" title="Add photo">📷<input id="file" type="file" accept="image/*" capture="environment" hidden></label>
        <textarea id="ta" rows="1" placeholder="${state.me.is_kid?"Tell me a flavor you love…":"Name a spirit, ask for a tweak, or attach a photo…"}"></textarea>
        <button class="iconbtn send" id="send" title="Send">➤</button>
      </div>
    </div>`;
  drawMsgs();
  const ta=$("#ta");
  ta.oninput=()=>{ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,120)+"px";};
  ta.onkeydown=e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend();} };
  $("#send").onclick=doSend;
  $("#file").onchange=onFile;
  main.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>{
    if(b.dataset.q==="Analyze my drink photo"){ $("#file").click(); return; }
    if(b.dataset.q==="Recipe from a base spirit"){ $("#ta").value="Make me a spirit-forward frozen slush using "; $("#ta").focus(); return; }
    sendMessage(b.dataset.q);
  });
}
function drawMsgs(){
  const m=$("#msgs"); if(!m) return;
  m.innerHTML=state.chat.map(c=>{
    if(c.role==="user") return `<div class="msg user">${esc(c.raw)}${c.image?`<br><img class="shot" src="${c.image}">`:""}</div>`;
    if(c.role==="typing") return `<div class="typing">Slushi Sensei is mixing… <span class="spin"></span></div>`;
    return `<div class="msg ai">${c.html}${c.canSave?`<div class="saverec"><button class="btn sm" data-savemsg="${c.idx}">💾 Save as recipe</button></div>`:""}</div>`;
  }).join("");
  m.querySelectorAll("[data-savemsg]").forEach(b=>b.onclick=()=>saveAiRecipe(Number(b.dataset.savemsg)));
  m.scrollTop=m.scrollHeight;
}
function onFile(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    const dataUrl=reader.result;
    state.pendingImage={ dataUrl, media_type:file.type||"image/jpeg", base64:String(dataUrl).split(",")[1] };
    $("#preview").innerHTML=`<img src="${dataUrl}"><button id="rmimg">✕ remove photo</button><span class="muted" style="font-size:13px">attached — add a note &amp; send</span>`;
    $("#rmimg").onclick=()=>{state.pendingImage=null;$("#preview").innerHTML="";$("#file").value="";};
  };
  reader.readAsDataURL(file);
}
function doSend(){ const ta=$("#ta"); const t=ta.value.trim(); if(!t&&!state.pendingImage) return; ta.value=""; ta.style.height="auto"; sendMessage(t); }

function recipeContextStr(){
  return state.recipes.slice(0,40).map(r=>`${r.name} [${r.is_alcoholic?"cocktail":"family"}${r.base_spirit?", "+r.base_spirit:""}, ${r.preset}]`).join("; ");
}
async function sendMessage(text){
  const img=state.pendingImage;
  // build display + api message
  state.chat.push({ role:"user", raw:text||(img?"(photo)":""), image:img?img.dataUrl:null });
  const content=[];
  if(text) content.push({type:"text",text});
  if(img){ content.push({type:"image",source:{type:"base64",media_type:img.media_type,data:img.base64}}); if(!text) content[0]={type:"text",text:"Look at this photo of my drink/ingredients for the Ninja Slushi. What will happen and how should I fix or build it?"}; }
  state.apiMsgs.push({ role:"user", content });
  state.pendingImage=null; const pv=$("#preview"); if(pv)pv.innerHTML="";
  state.chat.push({ role:"typing" }); drawMsgs();

  try{
    const res=await fetch(cfg.AI_FUNCTION_URL,{
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+cfg.SUPABASE_ANON_KEY, "apikey":cfg.SUPABASE_ANON_KEY },
      body:JSON.stringify({ kidMode:state.me.is_kid, profileName:state.me.name, messages:state.apiMsgs, recipeContext:recipeContextStr() })
    });
    const data=await res.json();
    state.chat=state.chat.filter(c=>c.role!=="typing");
    if(data.text){
      state.apiMsgs.push({ role:"assistant", content:data.text });
      const idx=state.chat.length;
      const canSave=!state.me.is_kid && /ingredient|oz|cup|tbsp|tsp/i.test(data.text);
      state.chat.push({ role:"ai", raw:data.text, html:md(data.text), canSave, idx });
    } else {
      state.chat.push({ role:"ai", raw:"", html:md(`😬 The kitchen hit a snag: ${esc(data.error||"unknown error")}. ${data.detail?"":""}Try again in a sec.`) });
    }
  }catch(err){
    state.chat=state.chat.filter(c=>c.role!=="typing");
    state.chat.push({ role:"ai", raw:"", html:md("😬 Couldn't reach the Sensei (network). Check your connection and try again.") });
  }
  drawMsgs();
}

async function saveAiRecipe(idx){
  const msg=state.chat[idx]; if(!msg) return;
  const firstLine=(msg.raw.split("\n").find(l=>l.trim())||"New Sensei Recipe").replace(/[*#:]/g,"").trim().slice(0,60);
  const name=prompt("Save this recipe as:", firstLine)||firstLine;
  const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Math.random().toString(36).slice(2,6);
  const isAlc=state.me.is_kid?false:/\b(tequila|vodka|rum|gin|whiskey|whisky|bourbon|brandy|liqueur|wine|prosecco|aperol|campari|spirit|cocktail|spiked)\b/i.test(msg.raw);
  const { error }=await sb.from("recipes").insert({
    name, slug, category:"Sensei", is_alcoholic:isAlc, preset:/spiked max/i.test(msg.raw)?"Spiked Max":/spiked/i.test(msg.raw)?"Spiked":"SlushAssist",
    ingredients:[], instructions:msg.raw, notes:"Created with Slushi Sensei.", source:"AI", created_by:state.me.name, tags:["ai","sensei"]
  });
  if(error){ toast("Couldn't save: "+error.message); return; }
  toast("Saved to your database ⭐");
  await loadData();
}
