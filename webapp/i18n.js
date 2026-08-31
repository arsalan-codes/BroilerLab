/* =====================================================================
   BroilerLab i18n — full FA / EN dictionaries + runtime switcher
   ===================================================================== */
"use strict";
const I18N = (function(){
  // Dictionaries live in locales/fa.js + locales/en.js (loaded before this file).
  var base = {};
  try {
    if (typeof window !== "undefined") {
      if (window.I18N_FA) base.fa = window.I18N_FA;
      if (window.I18N_EN) base.en = window.I18N_EN;
    }
  } catch (e) {}
  return base;
})();
let LANG="fa";
try{LANG=localStorage.getItem("rossim_lang")==="en"?"en":"fa"}catch(e){}
function tr(key){const d=I18N[LANG]||I18N.fa;return d[key]??I18N.fa[key]??key}
function trf(key,vars){let s=tr(key);
  for(const k in (vars||{}))s=s.split("{"+k+"}").join(vars[k]);return s}
/* locale-aware number formatter driven by LANG */
function num(v,d=0){
  const loc=LANG==="fa"?"fa-IR":"en-US";
  return new Intl.NumberFormat(loc,{minimumFractionDigits:d,maximumFractionDigits:d}).format(v)}
/* plain integer/float formatter that follows LANG (no thousands grouping) */
function lnum(v,d=0){
  if(v==null||isNaN(v))return "—";
  const s=Number(v).toFixed(d);
  if(LANG==="fa"){
    const FA=["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
    return s.replace(/[0-9]/g,c=>FA[+c]);
  }
  return s;
}
/* centralized locale-aware formatters — single source for numbers/dates/times */
function formatNumber(v,d=0){ return num(v,d) }
function formatDate(input, opts){
  // opts: {longMonth:boolean, withTime:boolean}
  opts=opts||{};
  try{
    if(LANG==="fa" && window.Shamsi && typeof window.Shamsi.toShamsi==="function"){
      return window.Shamsi.toShamsi(input, opts);
    }
    var dt=(input instanceof Date)?input:new Date(input);
    if(isNaN(dt)) return String(input);
    if(opts.longMonth){
      return new Intl.DateTimeFormat(LANG==="fa"?"fa-IR":"en-US",{year:"numeric",month:"long",day:"numeric"}).format(dt);
    }
    return new Intl.DateTimeFormat(LANG==="fa"?"fa-IR":"en-US",{year:"numeric",month:"2-digit",day:"2-digit"}).format(dt);
  }catch(e){ return String(input) }
}
function formatTime(input){
  try{
    var dt=(input instanceof Date)?input:new Date(input);
    if(isNaN(dt)) dt=new Date();
    var s=String(dt.getHours()).padStart(2,"0")+":"+String(dt.getMinutes()).padStart(2,"0");
    if(dt.getSeconds) s+=":"+String(dt.getSeconds()).padStart(2,"0");
    if(LANG==="fa"){
      var FA=["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
      return s.replace(/[0-9]/g,function(c){return FA[+c]});
    }
    return s;
  }catch(e){ return "" }
}
function formatDateTime(input, opts){
  opts=opts||{};
  var d=formatDate(input, opts);
  var t=formatTime(input);
  return d+" "+t;
}
function formatRelativeTime(value, unit){
  // value: numeric, unit: "second"|"minute"|"hour"|"day"|"week"|"month"|"year"
  try{
    var loc=LANG==="fa"?"fa-IR":"en-US";
    if(typeof Intl.RelativeTimeFormat==="function"){
      var rtf=new Intl.RelativeTimeFormat(loc,{numeric:"auto", style:"long"});
      return rtf.format(value, unit);
    }
  }catch(e){}
  // fallback simple
  if(LANG==="fa"){
    var map={second:"ثانیه",minute:"دقیقه",hour:"ساعت",day:"روز",week:"هفته",month:"ماه",year:"سال"};
    var u=map[unit]||unit;
    if(value===0) return "همین الان";
    if(value<0) return Math.abs(value)+" "+u+" پیش";
    return value+" "+u+" بعد";
  } else {
    if(value===0) return "now";
    if(value<0) return Math.abs(value)+" "+unit+(Math.abs(value)!==1?"s":"")+" ago";
    return "in "+value+" "+unit+(value!==1?"s":"");
  }
}
function formatCurrency(v,currency){
  currency=currency||"IRR";
  try{
    var loc=LANG==="fa"?"fa-IR":"en-US";
    return new Intl.NumberFormat(loc,{style:"currency",currency:currency, minimumFractionDigits:0, maximumFractionDigits:0}).format(v);
  }catch(e){ return num(v,0)+" "+currency }
}
function formatPercent(v,d){ return lnum(v,d)+"%" }
// expose globally for app components
try{ window.formatNumber=formatNumber; window.formatDate=formatDate; window.formatTime=formatTime; window.formatDateTime=formatDateTime; window.formatRelativeTime=formatRelativeTime; window.formatCurrency=formatCurrency; window.formatPercent=formatPercent; }catch(e){}

/* keep every version badge in sync with window.SITE_VERSION (version.js) */
function syncVersion(){
  var v=window.SITE_VERSION; if(!v)return;
  var s="v"+v;
  document.querySelectorAll("[data-vbadge]").forEach(el=>{ el.textContent=s; });
  document.querySelectorAll("[data-version-text]").forEach(el=>{ el.textContent=s; });
}
try{window.syncVersion=syncVersion}catch(e){}

function applyLang(){
  document.documentElement.lang=LANG;
  document.documentElement.dir=LANG==="fa"?"rtl":"ltr";
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    if(el.id==="landing-typed")return; // owned by typing effect module (restarts on rossim:lang)
    el.textContent=tr(el.dataset.i18n)});
  document.querySelectorAll("[data-i18n-html]").forEach(el=>{el.innerHTML=tr(el.dataset.i18nHtml)});
  document.querySelectorAll("[data-title-i18n]").forEach(el=>{
    el.title=tr(el.dataset.titleI18n);
    el.setAttribute("aria-label",tr(el.dataset.titleI18n))});
  document.querySelectorAll("[data-alt-i18n]").forEach(el=>{el.alt=tr(el.dataset.altI18n)});
  if(window.Router&&window.Router.syncTitle){window.Router.syncTitle();}
  else{const t=document.querySelector("title");if(t)t.textContent=tr("app.title");}
  $("lang-fa").classList.toggle("on",LANG==="fa");
  $("lang-en").classList.toggle("on",LANG==="en");
  $("lang-fa-dd").classList.toggle("on",LANG==="fa");
  $("lang-en-dd").classList.toggle("on",LANG==="en");
  try{syncVersion()}catch(e){}
}
function setLang(l){if(LANG===l)return;LANG=l;
  try{localStorage.setItem("rossim_lang",l)}catch(e){}
  try{window.dispatchEvent(new CustomEvent("rossim:lang",{detail:l}))}catch(e){}
  applyLang();
  try{
    if(typeof updateLandingCTA==="function")try{updateLandingCTA()}catch(e){}
    if(typeof renderAuthArea==="function")try{renderAuthArea()}catch(e){}
    if(typeof renderWorkspace==="function")try{renderWorkspace()}catch(e){}
    if(typeof expRender==="function")expRender();
    if(typeof DASH!=="undefined"&&DASH)runDashboard();
    if(typeof FM!=="undefined"&&FM&&!FM.stale){
      document.querySelectorAll(".penbox").forEach(box=>{
        const pm=FM.run.pensMeta.find(x=>x.pid===box.dataset.pen);if(!pm)return;
        const chip=box.querySelector(".penhead .tchip");
        if(chip)chip.textContent=tr("tr."+pm.treat)+" · "+num(pm.n)});
      renderInspector();renderFarmCharts();updateFarmDay(true);
      if(typeof setPlaying==="function")setPlaying(FM.playing);
      const fl2=document.getElementById("fm-lbl");
      if(fl2)fl2.textContent=FM.stale?tr("dyn.stale"):tr("dyn.playing");
      const bo=document.getElementById("bio-out");
      if(bo&&bo.innerHTML)runBioStats();
      const tk=document.getElementById("ticker");
      if(tk)tk.innerHTML=""}
    const sr=document.getElementById("scn-res");
    if(sr&&sr.style.display!=="none"){
      const bs=document.getElementById("btn-scn");if(bs)bs.click()}
  }catch(e){}
  requestAnimationFrame(()=>requestAnimationFrame(()=>repaintView(CUR_VIEW)))}
// initial apply on load — ensure html lang/dir and translations match stored LANG
try{
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded", function(){ try{applyLang()}catch(e){} });
  } else { try{applyLang()}catch(e){} }
}catch(e){}
