/* =====================================================================
   RossSim UI — charts, dashboard, live runner, scenarios
   Depends on engine.js (simulateRun, poolByAge, maeVsPO, windowFCR,
   rowsToCSV, poBW, poFI, PENS_CFG, PO, IDX15, IDX60)
   ===================================================================== */
"use strict";

/* ---------------- helpers ---------------- */
const $=id=>document.getElementById(id);
const $$=s=>[...document.querySelectorAll(s)];
const LRI="\u2066",PDI="\u2069";
const esc=s=>String(s).replace(/[&<>"']/g,c=>(
  {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LI=s=>LRI+s+PDI; // bidi-isolate a Latin/technical token
function on(id,ev,fn){const el=$(id);
  if(el)el.addEventListener(ev,fn);else console.warn("[Arian] missing #"+id)}
const fa=(v,d=0)=>num(v,d); // locale-aware via i18n.js (fa digits | latin)
const en=v=>{ // now locale-aware: fa digits in fa mode, latin in en mode
  const n=Math.round(Number(v)||0);
  if(LANG==="fa"){
    const FA=["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
    return String(n).replace(/[0-9]/g,c=>FA[+c]);
  }
  return n.toLocaleString("en-US");
};
/* formatted fixed-decimal that follows LANG (e.g. fx(12.3,1) -> "۱۲.۳" or "12.3") */
function fx(v,d=1){
  const s=Number(v).toFixed(d);
  if(LANG==="fa"){
    const FA=["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
    return s.replace(/[0-9]/g,c=>FA[+c]);
  }
  return s;
}
/* data-goto navigation delegated to Router */
function toast(m){const t=$("toast");t.textContent=m;t.classList.add("on");
  clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("on"),2600)}
function animNum(el,target,fm){if(!el)return;const t0=performance.now(),dur=750,from=0;
  const step=()=>{const p=Math.min(1,(performance.now()-t0)/dur),e=1-Math.pow(1-p,3);
    el.textContent=fm(from+(target-from)*e);if(p<1)requestAnimationFrame(step)};
  requestAnimationFrame(step)}

/* =====================================================================
   tiny canvas chart engine (line/bar/band/shade/refline + tooltip)
   ===================================================================== */
const CH={};const tipEl=$("tip");
let CT={grid:"rgba(35,45,68,.55)",label:"#7d889f"};







/* =====================================================================
   TABS
   ===================================================================== */
let CUR_VIEW="v-landing";
try{document.addEventListener("arian:route",function(e){CUR_VIEW=e.detail.view;});}catch(e){}
if($("mainnav"))$("mainnav").setAttribute("role","tablist");
function markTabs(){document.querySelectorAll(".tab").forEach(b=>{
  b.setAttribute("role","tab");b.setAttribute("aria-controls",b.dataset.v);
  b.setAttribute("aria-selected",b.classList.contains("on")?"true":"false")})}
/* Tab clicks are delegated to Router (router.js) via the global [data-v] click
   delegation — the guard, active-state sync, history and titles live there. */
/* nav-group dropdown JS removed — parent tab navigates to #/feed; module links live on the feed page */

/* =====================================================================
   DASHBOARD — full validation run (all 6 pens, seed 308)
   ===================================================================== */
let DASH=null;
const dayLbl=i=>"d"+i;
function poWinFCR(){const P=PO();
  const i0=14,i1=P.maxDay-1;
  let fi=0;for(let i=i0;i<=i1;i++)fi+=(P.fiAsh[i]??0);
  return fi/(P.bwAsh[i1]-P.bwAsh[i0])}
function runDashboard(){
  var t0=performance.now();
  const endAge=Math.min(60,PO().maxDay);
  const run=simulateRun({ageStart:15,ageEnd:endAge,strain:CUR_STRAIN_KEY,seed:308});
  const pooled=poolByAge(run.summaries);
  const mae=maeVsPO(pooled);
  const fiSum=pooled.reduce((s,r)=>s+r.fi,0);
  const gain=pooled[pooled.length-1].bw-pooled[0].bw;
  const fcrWin=fiSum/gain;
  const vpds=run.summaries.map(s=>s.visits/s.alive).sort((a,b)=>a-b);
  const vMean=vpds.reduce((a,b)=>a+b,0)/vpds.length;
  const vP5=vpds[Math.floor(vpds.length*.05)],vP95=vpds[Math.floor(vpds.length*.95)];
  const ovlTotal=run.summaries.reduce((s,x)=>s+x.overlap,0);

  animNum($("k-bw"),pooled[pooled.length-1].bw,en);
  $("k-bw-po").textContent=en(poBW("ash",endAge));
  const devEnd=100*(pooled[pooled.length-1].bw-poBW("ash",endAge))/poBW("ash",endAge);
  $("k-bw-dev").textContent=(devEnd>=0?"+":"")+fx(devEnd,1)+"%";
  $("k-mae").textContent=fx(mae,2)+"%";
  $("db-strain").textContent=LI(STRAINS[CUR_STRAIN_KEY].label)+" · "+LI(STRAINS[CUR_STRAIN_KEY].breeder);
  $("db-guide").textContent=LI(STRAINS[CUR_STRAIN_KEY].guide);
  $("k-fcr").textContent=fx(fcrWin,3);
  $("k-fcr-po").textContent=fx(poWinFCR(),3);
  $("k-visits").textContent=en(Math.round(vMean));
  $("k-vrange").textContent=`${en(Math.round(vP5))}–${en(Math.round(vP95))}`;
  $("ms-deaths").textContent=fa(run.deaths.length);
  $("ms-fills").textContent=fa(run.fills.length);
  $("ms-ovl").textContent=fa(ovlTotal);
  $("ms-rows").textContent=fa(run.rowEstimate);
  $("h-mae").textContent=fx(mae,2)+"%";
  $("h-rows").textContent=fa(run.rowEstimate);
  syncSettingsInfo();

  const ages=pooled.map(r=>r.age);
  chart("c-growth",{labels:ages.map(a=>"d"+a),
    band:(()=>{const P=PO(),e=Math.min(60,P.maxDay);
      return{hi:P.bwM.slice(14,e),lo:P.bwF.slice(14,e),c:"rgba(139,92,246,.13)"}})(),
    series:[
      {y:pooled.map(r=>r.bw),c:"#22d3a5",fill:true,name:tr("lg.sim")},
      {y:pooled.map(r=>poBW("ash",r.age)),c:"#8b96ad",dash:true,w:1.6,name:"PO"}],
    hoverTitle:i=>dayLbl(i)});
  chart("c-intake",{type:"bar",
    series:[{y:pooled.map(r=>r.fi),c:"#3b82f6",name:tr("lg.sim")},
            {y:pooled.map(r=>poFI("ash",r.age)),c:"#f59e0b",dash:true,w:1.7,name:"PO"}],
    labels:ages.map(a=>"d"+a),
    hoverTitle:i=>dayLbl(i)});

  const penIds=Object.keys(PENS_CFG);
  const fcrs=penIds.map(p=>windowFCR(run.perPen[p]));
  const busyPeaks=penIds.map(p=>Math.max(...run.perPen[p].busy));
  const worst=penIds[busyPeaks.indexOf(Math.max(...busyPeaks))];
  chart("c-fcr",{type:"bar",series:[{y:fcrs,c:"#22d3a5",name:"FCR"}],
    refLines:[{v:poWinFCR(),label:"PO "+fx(poWinFCR(),3),c:"#f59e0b"}],
    min:0,zeroBase:true,labels:penIds,vFmt:v=>fx(+v,2),
    hoverTitle:i=>`${penIds[i]} (n=${PENS_CFG[penIds[i]].n})`});
  $("fcr-note").innerHTML=trf("fcr.note",{lo:fx(Math.min(...fcrs),3),
    hi:fx(Math.max(...fcrs),3),worst:worst,peak:fx(Math.max(...busyPeaks),0)});

  const dtot=run.diurnal.reduce((a,b)=>a+b,0)||1;
  const shares=run.diurnal.map(g=>100*g/dtot);
  chart("c-diurnal",{type:"bar",
    series:[{y:shares,c:"#8b5cf6",name:tr("lg.hourShare")}],
    labels:Array.from({length:24},(_,h)=>String(h)),
    shades:[{from:0,to:L_ON-1,c:"rgba(20,27,43,.75)"},{from:L_OFF,to:23,c:"rgba(20,27,43,.75)"}],
    zeroBase:true,vFmt:v=>fx(v,1)+"%",hoverTitle:i=>String(i)});

  const stRows=[...penIds].sort((a,b)=>busyPeaks[penIds.indexOf(b)]-busyPeaks[penIds.indexOf(a)])
    .map(pid=>{
      const bp=Math.max(...run.perPen[pid].busy);
      const ovl=run.perPen[pid].ovl.reduce((a,b)=>a+b,0);
      const cls=bp>=100?"bd":bp>=80?"wn":"ok";
      const verdict=tr(bp>=100?"ver.bottle":bp>=80?"ver.near":"ver.free");
      const col=bp>=100?"var(--bad)":bp>=80?"var(--warn)":"var(--acc)";
      return `<div class="busyrow">
        <span class="tag ${cls}" style="min-width:86px;text-align:center">${pid} · ${num(PENS_CFG[pid].n)}</span>
        <span class="bp"><i style="width:${clamp(bp,2,100)}%;background:${col}"></i></span>
        <b class="num" style="width:48px;text-align:left;font-size:12px">${fx(bp,0)}%</b>
        <span class="dm" style="font-size:10.5px;width:74px">${tr("st.ovlShort")}: ${num(ovl)}</span>
        <span class="tag ${cls}">${verdict}</span></div>`}).join("");
  $("st-list").innerHTML=stRows;

  $("tb-val").innerHTML=pooled.map(r=>{
    const dev=100*(r.bw-poBW("ash",r.age))/poBW("ash",r.age);
    const cls=Math.abs(dev)<1.5?"ok":Math.abs(dev)<3?"wn":"bd";
    return `<tr><td>${fa(r.age)}</td><td class="num">${en(r.bw)}</td><td class="num">${en(poBW("ash",r.age))}</td>
      <td class="num" style="color:${dev>=0?'var(--acc)':'var(--warn)'}">${dev>=0?"+":""}${fx(dev,1)}%</td>
      <td class="num">${en(r.fi)}</td><td class="num">${en(r.fiPo)}</td>
      <td><span class="tag ${cls}">${cls==="ok"?tr("val.excellent"):cls==="wn"?tr("val.ok"):tr("val.review")}</span></td></tr>`}).join("");
  DASH={run,pooled,mae};
}

/* =====================================================================
   LIVE RUNNER — single-pen streaming with device animation
   ===================================================================== */
let LV=null,LVT=null,LV_PAUSED=false,lastDevTs=0;
function lvSetBtns(){
  const active=!!(LV&&!LV.done),set=(id,v)=>{const el=$(id);if(el)el.disabled=v};
  set("btn-run",active);set("btn-pause",!active);set("btn-jump",!active);
  set("btn-stop",!active);set("btn-export",!LV||!LV.allRows.length);
  set("btn-export-xlsx",!LV||!LV.allRows.length)}
function lvStart(){
  lvStop(true);
  const a0=+$("in-age0").value,a1=+$("in-age1").value;
  if(!(a0<a1)){toast(tr("dyn.badRange"));return}
  const md=PO().maxDay;
  if(a1>md){toast(trf("dyn.rangeLimit",{max:num(md)}));return}
  const pen=$("in-pen").value,seed=Math.max(1,+$("in-seed").value||308);
  const speed=+$("in-speed").value;
  $("pg-lbl").textContent=tr("dyn.gen");
  setTimeout(()=>{
    const run=simulateRun({ageStart:a0,ageEnd:a1,pens:[pen],seed,strain:CUR_STRAIN_KEY,collectRows:true});
    LV={run,a0,a1,pen,di:0,ri:0,dayStart:0,speed,
      ages:[],bws:[],cum:0,cums:[],poCums:[],done:false,allRows:run.rows};
    $("feed").innerHTML='<span class="dm">// timestamp,flock_id,bird_id,sensor_id,age_day,raw_weight_g,weight_g,feed_bin_kg,feed_delta_g,temp_c,humidity,rssi</span>';
    ["l-day","l-date","l-bw","l-bwpo","l-fi","l-visits","l-busy","l-temp"].forEach(id=>$(id).textContent="—");
    $("dv-status").textContent="…";
    $("pg").style.width="0%";$("pg-rows").textContent="";
    lvSetBtns();LV_PAUSED=false;setPauseLabel(false);
    if(speed===999){lvJump()}else{lvtTick()}}
)}
function lvDayDone(s){
  LV.ages.push(s.age);LV.bws.push(s.meanBW);
  LV.cum+=s.fiPerBird;LV.cums.push(LV.cum);
  LV.poCums.push((LV.poCums.at(-1)||0)+poFI("ash",s.age));
  $("l-day").textContent=tr("day.prefix")+num(s.age);
  $("l-date").textContent = (typeof window.formatDate==="function" ? window.formatDate(s.date, { longMonth: LANG === "fa" }) : (window.Shamsi ? window.Shamsi.toShamsi(s.date, { longMonth: LANG === "fa" }) : s.date));
  animNum($("l-bw"),s.meanBW,v=>en(v));
  $("l-bwpo").textContent=en(poBW("ash",s.age));
  $("l-temp").textContent=fx(s.temp,1);
  $("l-fi").textContent=en(s.fiPerBird);
  $("l-visits").textContent=en(Math.round(s.visits/s.alive));
  const b=$("l-busy");b.textContent=fx(s.busyPct,0)+"%";
  b.className="v "+(s.busyPct>=95?"bad":s.busyPct>=75?"org":"acc");
  $("pg").style.width=(100*LV.di/Math.max(1,LV.run.summaries.length))+"%";
  $("pg-lbl").textContent=trf("dyn.running",{pen:LV.pen,day:fa(s.age),date:(typeof window.formatDate==="function"?window.formatDate(s.date):(window.Shamsi?window.Shamsi.toShamsi(s.date):s.date))});
  $("pg-rows").textContent=trf("dyn.records",{n:fa(LV.ri)});
  const k=LV.ages.length;
  chart("c-live-growth",{labels:LV.ages.map(a=>"d"+a),
    band:{hi:PO().bwM.slice(IDX15,IDX15+k),lo:PO().bwF.slice(IDX15,IDX15+k),c:"rgba(139,92,246,.11)"},
    series:[
      {y:LV.bws,c:"#22d3a5",fill:true,name:tr("lg.penMean")},
      {y:LV.ages.map(a=>poBW("ash",a)),c:"#8b96ad",dash:true,w:1.6,name:"PO"}],
    hoverTitle:i=>dayLbl(i)});
  chart("c-live-cum",{labels:LV.ages.map(a=>"d"+a),
    series:[
      {y:LV.cums,c:"#3b82f6",fill:true,name:tr("lg.cumSim")},
      {y:LV.poCums,c:"#f59e0b",dash:true,w:1.6,name:tr("lg.cumPo")}],
    hoverTitle:i=>dayLbl(i)});
}
function lvDevice(r,s){
  const now=performance.now();if(now-lastDevTs<45)return;lastDevTs=now;
  const [, ,bid,,,raw,w,bin,delta,tp,hm,rssi]=r;
  $("dv-bird").textContent=bid||tr("bird.unknown");
  $("dv-rssi").textContent=rssi;
  $("dv-w").textContent=w;$("dv-raw").textContent=raw;
  $("dv-binval").textContent=fx(+bin,2);
  $("dv-delta").textContent=delta;
  const pct=clamp(100*bin/25,2,100);
  $("dv-gfill").style.height=pct+"%";
  $("dv-gauge").classList.toggle("low",bin<4);
  ["d-rfid","d-scale","d-bin"].forEach((id,i)=>{
    const el=$(id);el.classList.add("lit");
    clearTimeout(el._lt);el._lt=setTimeout(()=>el.classList.remove("lit"),480+i*90)});
  $("dv-status").textContent=tr("day.prefix")+num(r[4])+" · "+LI(String(r[0]).slice(11))+
    " · 🌡"+LI(tp+"°C")+" · 💧"+LI(hm+"%")+" · "+(bid?tr("dyn.visitOk"):tr("dyn.readFail"));
}
function feedAppend(r){
  const feedEl=$("feed");
  const div=document.createElement("span");div.className="r flash";
  const [,fk,bid,sen,age,raw,w,bin,delta,tp,hm,rssi]=r;
  div.textContent="";
  div.innerHTML=`${r[0]} <span class="dm">${fk}</span> <span class="${bid?"id":"pos"}">${bid||"??"}</span> ${sen} ${age} ${raw} <b>${w}</b> <span class="neg">${fx(+bin,2)}</span> <span class="neg">${delta}</span> ${tp} ${hm} <span class="dm">${rssi}</span>`;
  feedEl.appendChild(div);
  while(feedEl.children.length>130)feedEl.removeChild(feedEl.firstChild);
  feedEl.scrollTop=feedEl.scrollHeight}
function lvtTick(){
  if(!LV||LV.done)return;
  if(LV_PAUSED){LVT=setTimeout(lvtTick,160);return}
  let budget=LV.speed*10;
  const days=LV.run.summaries;
  while(budget>0){
    if(LV.di>=days.length){lvFinish();return}
    const s=days[LV.di];
    const endRow=LV.dayStart+s.visits*3;
    const take=Math.min(budget,endRow-LV.ri);
    const upto=LV.ri+take;
    for(;LV.ri<upto;LV.ri++){
      const r=LV.allRows[LV.ri];
      feedAppend(r);
      if((LV.ri&1)===0||upto-LV.ri<4)lvDevice(r,s);
    }
    budget-=take;
    if(LV.ri>=endRow){lvDayDone(s);LV.di++;LV.dayStart=endRow}
  }
  LVT=setTimeout(lvtTick,clamp(190/LV.speed,26,140))}
function lvJump(){
  if(!LV)return;
  const days=LV.run.summaries;
  while(LV.di<days.length){
    const s=days[LV.di];
    LV.ri=LV.dayStart+s.visits*3;
    lvDayDone(s);LV.di++;LV.dayStart=LV.ri;
  }
  const last=LV.allRows[LV.allRows.length-1];
  if(last){lastDevTs=0;lvDevice(last,days[days.length-1]);
    $("pg-rows").textContent=trf("dyn.records",{n:num(LV.allRows.length)})}
  lvFinish(true)}
function lvFinish(jumped){
  if(!LV||LV.done)return;LV.done=true;
  clearTimeout(LVT);
  $("pg").style.width="100%";
  const gain=LV.bws[LV.bws.length-1]-LV.bws[0];
  const fcr=LV.cum/gain;
  $("pg-lbl").innerHTML=trf("dyn.done",{rows:fa(LV.allRows.length),
    bw:en(LV.bws.at(-1)),fcr:fx(fcr,3)});
  $("pg-rows").textContent=trf("dyn.records",{n:fa(LV.allRows.length)});
  toast(trf("dyn.done",{rows:fa(LV.allRows.length),bw:en(LV.bws.at(-1)),fcr:fx(fcr,3)}));
  lvSetBtns()}
function lvStop(silent){
  clearTimeout(LVT);LVT=null;
  if(LV)LV.done=true;LV_PAUSED=false;
  $("btn-pause").textContent=tr("btn.pause");
  if(!silent&&LV){$("pg-lbl").textContent=tr("dyn.paused")}
  setPauseLabel(false)}
function setPauseLabel(paused){const b=$("btn-pause");
  if(b)b.innerHTML=(paused?"▶ ":"⏸ ")+(paused?tr("btn.resume"):tr("btn.pause"))}
on("btn-run","click",lvStart);
on("btn-stop","click",()=>lvStop(false));
on("btn-jump","click",()=>{if(LV&&!LV.done){LV.speed=999;lvJump()}});
on("btn-pause","click",()=>{
  if(!LV||LV.done)return;
  LV_PAUSED=!LV_PAUSED;
  setPauseLabel(LV_PAUSED)});

on("in-speed","change",()=>{if(LV&&!LV.done&&+$("in-speed").value===999){LV.speed=999;
  clearTimeout(LVT);LVT=setTimeout(lvJump,10)}});
/* =====================================================================
   SCENARIOS — paired-seed comparison (baseline vs scenario)
   ===================================================================== */
function scnFill(){
  const t=$("scn-type").value;
  $("f-heat").style.display=t==="heat"?"contents":"none";
  $("f-stn").style.display=t==="stn"?"contents":"none"}
on("scn-type","change",scnFill);
on("btn-scn","click",()=>{
  const endAge=Math.min(60,PO().maxDay);
  const common={ageStart:15,ageEnd:endAge,seed:308,strain:CUR_STRAIN_KEY};
  const base=simulateRun(common);
  const mode=$("scn-type").value;
  let scn,shade=null,label="",note="";
  if(mode==="heat"){
    const from=Math.min(58,Math.max(16,+$("in-from").value||32));
    const days=Math.min(20,Math.max(1,+$("in-days").value||7));
    const dT=+$("in-dt").value||5;
    const to=Math.min(60,from+days-1);
    scn=simulateRun({...common,heat:{from,to,dT}});
    shade={from:from-15,to:to-15,c:"rgba(245,158,11,.07)"};
    label=trf("scn.wave",{dT:num(dT),from:num(from),to:num(to)});
    note=tr("scn.modelNote");
  }else{
    const stn=+$("in-stn").value||2;
    scn=simulateRun({...common,stations:stn});
    label=stn===2?tr("scn.stn2"):tr("scn.stn1");
    note=tr("scn.dualNote");
  }
  const pb=poolByAge(base.summaries),ps=poolByAge(scn.summaries);
  const ages=pb.map(r=>r.age);
  const endB=pb.at(-1).bw,endS=ps.at(-1).bw;
  const dB=endS-endB,dBp=100*dB/endB;
  let dipP=0,dipAge=15;
  ages.forEach((a,i)=>{
    const dd=100*(pb[i].bw-ps[i].bw)/pb[i].bw;
    if(dd>dipP){dipP=dd;dipAge=a}});
  const fiSum=r=>poolByAge(r.summaries).reduce((s,x)=>s+x.fi,0);
  const fcrW=r=>{const pp=poolByAge(r.summaries);
    return pp.reduce((s,x)=>s+x.fi,0)/(pp.at(-1).bw-pp[0].bw)};
  const peakOf=r=>Math.max(...Object.values(r.perPen).map(pp=>Math.max(...pp.busy)));
  const worstPen=r=>Object.entries(r.perPen).sort((a,b)=>Math.max(...b[1].busy)-Math.max(...a[1].busy))[0][0];

  const el=$("d-bw");
  el.textContent=(dB>=0?"+":"")+fx(dB,0)+" g ("+(dBp>=0?"+":"")+fx(dBp,1)+"%)";
  el.className="v "+(dB>=0?"acc":"bad");
  $("d-bw-sub").textContent=tr("bw.base")+en(endB)+" g → "+en(endS)+" g";
  $("d-dip").textContent="-"+fx(dipP,1)+"%";
  $("d-dip-sub").textContent=trf("scn.dipSub",{age:num(dipAge)});
  const fB=fcrW(base),fS=fcrW(scn);
  $("d-fcr").textContent=`${fx(fB,3)} → ${fx(fS,3)}`;
  $("d-fcr").className="v blue";
  const fcrU=$("d-fcr").nextElementSibling;
  if(fcrU)fcrU.textContent=tr(mode==="heat"?"scn.fcrSub":"scn.dBusy");
  const wp=worstPen(base);
  const pkB=Math.max(...base.perPen[wp].busy),pkS=Math.max(...scn.perPen[wp].busy);
  $("d-busy").textContent=fx(pkB,0)+"% → "+fx(pkS,0)+"%";
  $("d-busy-sub").textContent=trf("scn.busySub",{pen:wp});

  const mk=(arrB,arrS,poArr,title)=>{
    const cfg={labels:ages.map(a=>"d"+a),
      series:[
        {y:arrB,c:"#22d3a5",name:tr("scn.base"),w:2.2},
        {y:arrS,c:"#f59e0b",name:tr("scn.scenario"),w:2.2}],
      hoverTitle:title};
    if(poArr)cfg.series.push({y:poArr,c:"#8b96ad",dash:true,w:1.4,name:"PO"});
    if(shade)cfg.shades=[shade];
    return cfg};
  chart("c-scn-growth",mk(pb.map(r=>r.bw),ps.map(r=>r.bw),ages.map(a=>poBW("ash",a)),i=>dayLbl(i)));
  chart("c-scn-fi",mk(pb.map(r=>r.fi),ps.map(r=>r.fi),null,i=>dayLbl(i)));

  $("tb-scn").innerHTML=Object.keys(PENS_CFG).map(pid=>{
    const B=base.perPen[pid],S=scn.perPen[pid];
    const bwe=B.bw.at(-1),bws=S.bw.at(-1);
    const dp=100*(bws-bwe)/bwe;
    const fB2=windowFCR(B),fS2=windowFCR(S);
    const pB=Math.max(...B.busy),pS=Math.max(...S.busy);
    return `<tr><td><b>${pid}</b></td><td class="num">${PENS_CFG[pid].n}</td>
      <td class="num">${en(bwe)}</td><td class="num">${en(bws)}</td>
      <td class="num" style="color:${dp>=0?'var(--acc)':'var(--warn)'}">${dp>=0?"+":""}${fx(dp,1)}%</td>
      <td class="num">${fx(fB2,3)}</td><td class="num">${fx(fS2,3)}</td>
      <td class="num">${fx(pB,0)}%</td><td class="num">${fx(pS,0)}%</td></tr>`}).join("");

  if(mode==="heat"){
    $("scn-note").innerHTML=trf("scn.noteHeat",{label,dip:fx(dipP,1),
      age:num(dipAge),dir:dBp<0?tr("bw.lower")
        :tr("bw.higher"),
      dbw:fx(Math.abs(dBp),1)});
  }else{
    const ovB=base.summaries.reduce((s,x)=>s+x.overlap,0);
    const ovS=scn.summaries.reduce((s,x)=>s+x.overlap,0);
    $("scn-note").innerHTML=trf("scn.noteStn",{label,from:fx(pkB,0),
      to:fx(pkS,0),ovlB:fa(ovB),ovlS:fa(ovS)});
  }
  $("scn-res").style.display="block";
  requestAnimationFrame(()=>repaintView("v-scn"));
  toast(tr("dyn.scnDone"));
});

/* =====================================================================
   INIT
   ===================================================================== */
let rzT=null;
window.addEventListener("resize",()=>{clearTimeout(rzT);
  clearTimeout(rzT); rzT=setTimeout(()=>{ if(document.visibilityState==="visible") repaintView(CUR_VIEW); },160)});
document.addEventListener("DOMContentLoaded",()=>{
  scnFill();
  setTimeout(()=>{runDashboard();setTimeout(()=>tourStart(false),700)},40);
  if(document.fonts&&document.fonts.ready)
    document.fonts.ready.then(()=>setTimeout(()=>repaintView(CUR_VIEW),80));
});

/* =====================================================================
   EXPORTS — CSV + formatted Excel (xlsx.js)
   ===================================================================== */
function dl(name,data,mime){
  const blob=new Blob([data],{type:mime||"application/octet-stream"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000)}
const XLSX_MIME="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";








/* live-sim exports -> Export Center */
on("btn-export","click",openExport);
on("btn-export-xlsx","click",openExport);
lvSetBtns=function(){
  const active=!!(LV&&!LV.done),set=(id,v)=>{const el=$(id);if(el)el.disabled=v};
  set("btn-run",active);set("btn-pause",!active);set("btn-jump",!active);
  set("btn-stop",!active);
  set("btn-export",!LV||!LV.allRows.length);
  set("btn-export-xlsx",!LV||!LV.allRows.length)}

/* =====================================================================
   EXPERIMENT DESIGNER
   ===================================================================== */
const TR_KEYS=Object.keys(TREATMENTS);
let EXP=null;

function expRender(){
  $("exp-rows").innerHTML=EXP.pens.map((p,i)=>`<tr>
    <td class="num">${fa(i+1)}</td>
    <td><input type="text" value="${esc(p.id)}" data-i="${i}" data-k="id" maxlength="8"></td>
    <td><input type="number" value="${p.n}" min="1" max="400" data-i="${i}" data-k="n"></td>
    <td><select data-i="${i}" data-k="treat">${TR_KEYS.map(t=>
      `<option value="${t}"${t===p.treat?" selected":""}>${trTreat(t)}</option>`).join("")}</select></td>
    <td><button class="exp-del" data-del="${i}" data-title-i18n="btn.delPen" title="Delete pen">✕</button></td></tr>`).join("");
  const refresh=()=>{
    const tot=expTotals();
    $("exp-totals").innerHTML=trf("exp.totals",{pens:num(EXP.pens.length),birds:num(tot)})+
      (tot>250?(" · "+tr("exp.heavy")):"")};
  $$("#exp-rows input,#exp-rows select").forEach(el=>el.addEventListener("change",()=>{
    const i=+el.dataset.i,k=el.dataset.k,p=EXP.pens[i];if(!p)return;
    if(k==="id")p.id=(el.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,8))||("P"+(i+1));
    else if(k==="n")p.n=clamp(Math.round(+el.value)||10,1,400);
    else p.treat=el.value;
    el.value=p[k];expSave();refresh();expMarkStale()}));
  $$("#exp-rows .exp-del").forEach(b=>b.addEventListener("click",()=>{
    EXP.pens.splice(+b.dataset.del,1);
    if(!EXP.pens.length)EXP.pens.push({id:"P01",n:10,treat:"control"});
    expSave();expRender();expMarkStale()}));
  refresh()}
function expPresetApply(k){
  const P={
    std:[["P01",3],["P02",5],["P03",7],["P04",8],["P05",10],["P06",12]]
      .map(x=>({id:x[0],n:x[1],treat:"control"})),
    t4x2:["control","probiotic","vaccine","agp"]
      .flatMap((t,i)=>[1,2].map(r=>({id:`T${i+1}R${r}`,n:15,treat:t}))),
    heatcmp:[{id:"C1",n:20,treat:"control"},{id:"C2",n:20,treat:"control"},
             {id:"H1",n:20,treat:"heat"},{id:"H2",n:20,treat:"heat"}],
    vax:[1,2,3].map(r=>({id:`C${r}`,n:25,treat:"control"}))
      .concat([1,2,3].map(r=>({id:`V${r}`,n:25,treat:"vaccine"}))),
    big:[{id:"P01",n:50,treat:"control"}]};
  EXP={pens:P[k]||P.std};expSave();expRender();expMarkStale()}
function expSave(){try{localStorage.setItem("rossim_exp",JSON.stringify(EXP))}catch(e){}}
function expLoad(){
  try{const j=JSON.parse(localStorage.getItem("rossim_exp"));
    if(j&&Array.isArray(j.pens)&&j.pens.length&&j.pens.every(p=>p&&p.id&&p.n))
      {EXP={pens:j.pens.map(p=>({id:String(p.id),n:clamp(p.n|0||10,1,400),
        treat:TREATMENTS[p.treat]?p.treat:"control"}))};expRender();return}
  }catch(e){}
  expPresetApply("std")}
function expMarkStale(){
  if(FM&&!FM.stale){FM.stale=true;
    $("fm-lbl").textContent=tr("dyn.stale")}}
on("btn-exp-preset","click",()=>{expPresetApply($("exp-preset").value);toast(tr("dyn.presetDone"))});
on("btn-exp-add","click",()=>{
  let i=EXP.pens.length+1,id;const ids=new Set(EXP.pens.map(p=>p.id));
  do{id="P"+String(i).padStart(2,"0");i++}while(ids.has(id));
  EXP.pens.push({id,n:10,treat:"control"});expSave();expRender();expMarkStale()});
on("btn-goto-exp","click",()=>{ if(window.Router) window.Router.go("v-exp"); });
on("btn-exp-farm","click",()=>{
  if(window.Router) window.Router.go('v-farm');
  setTimeout(()=>{farmBuild()},60)});

/* =====================================================================
   FARM MAP — interactive animated barn locked to engine visits
   ===================================================================== */
let FM=null,FMRAF=null,FM_LAST=0,FM_clockUI=0;
function farmCfg(withRows){return{ageStart:15,ageEnd:Math.min(60,PO().maxDay),
  pensCustom:EXP.pens.map(p=>({...p})),seed:308,strain:CUR_STRAIN_KEY,
  collectRows:!!withRows,trackBirds:true}}
function farmStopLoop(){if(FMRAF){cancelAnimationFrame(FMRAF);FMRAF=null}}
function farmBuild(){
  const tot=expTotals();
  if(tot>400)return toast(tr("dyn.maxBirds"));
  farmStopLoop();FM=null;
  $("fm-lbl").textContent=tr("dyn.gen");
  setTimeout(()=>{
    const run=simulateRun({...farmCfg(false),collectVisits:true});
    const CYCLE=run.summaries.at(-1).age-14;
    const byDay=new Map(),deathsByDay=new Map();
    for(const v of run.visitsLog){if(!byDay.has(v.age))byDay.set(v.age,[]);byDay.get(v.age).push(v)}
    for(const a of byDay.values())a.sort((u,v)=>u.t-v.t);
    for(const d of run.deaths){if(!deathsByDay.has(d.age))deathsByDay.set(d.age,[]);deathsByDay.get(d.age).push(d)}
    const birdIndex=new Map();
    for(const snap of run.birdsDaily||[]){
      if(!birdIndex.has(snap.id))birdIndex.set(snap.id,[]);
      birdIndex.get(snap.id).push(snap)}
    FM={run,cycle:CYCLE,byDay,deathsByDay,birdIndex,stale:false,clock:0,di:0,firedIdx:0,
        playing:false,speed:+$("fm-speed").value,chicks:[],sel:null,selBird:null,
        hist:{ages:[],t:{}},se:{ages:[],t:{}}};
    buildBarnDOM();
    updateFarmDay(true);
    tickerClear();
    tickerAdd(trf("dyn.built",{birds:fa(tot),pens:fa(run.pensMeta.length),
      strain:STRAINS[CUR_STRAIN_KEY].label}));
    $("fm-csv").disabled=false;$("fm-xlsx").disabled=false;
    $("fm-lbl").textContent=tr("dyn.playing");
    setPlaying(true);
    startFarmLoop();
  },30)}
function buildBarnDOM(){
  if($("fm-empty"))$("fm-empty").style.display="none";
  const wrap=$("pens-wrap");wrap.innerHTML="";FM.chicks=[];
  for(const pm of FM.run.pensMeta){
    const pid=pm.pid;
    const tr=TREATMENTS[pm.treat];
    const box=document.createElement("div");box.className="penbox";box.dataset.pen=pm.pid;
    box.innerHTML=`<div class="penhead"><b>${esc(pm.pid)}</b>
      <span class="tchip" style="--c:${tr.color}">${trTreat(pm.treat)} · ${num(pm.n)}</span></div>
      <div class="penfloor"></div>
      <div class="troughrow"><span>🌾</span><span class="mbin"><i style="width:74%"></i></span></div>
      <div class="penstats"><span>BW —</span><span>FI —</span><span>🐔 —</span></div>`;
    wrap.appendChild(box);
    const floor=box.querySelector(".penfloor");
    for(const bm of FM.run.birdsMeta.filter(b=>b.pen===pm.pid)){
      const el=document.createElement("span");
      el.className="chick";el.textContent="🐤";
      el.dataset.tag=bm.id;el.dataset.pen=pm.pid;el.title=bm.id;
      el.addEventListener("click",ev=>{ev.stopPropagation();selectBird(bm.id)});
      floor.appendChild(el);
      FM.chicks.push({el,pen:pm.pid,id:bm.id,w:0,h:0,
        x:Math.random()*160,y:Math.random()*50,vx:(Math.random()-.5)*22,vy:(Math.random()-.5)*14,
        state:"roam",tx:0,ty:0,eatEnd:0,nextTurn:0})}
    box.addEventListener("click",()=>{FM.selBird=null;
      FM.sel=FM.sel===pm.pid?null:pm.pid;
      $$(".penbox").forEach(b=>b.classList.toggle("sel",b.dataset.pen===FM.sel));
      $("insp-title").innerHTML=FM.sel?(LI("pen "+pid)):tr("farm.wholeFarm");
      renderInspector()});
    function selectBird(id){
      FM.selBird=id;const pm2=FM.run.pensMeta.find(x=>x.pid===pid);
      $("insp-title").innerHTML="🏷 <b class='dir-ltr'>"+id+"</b>";
      renderInspector(true)}}
  requestAnimationFrame(()=>{
    for(const c of FM.chicks){const f=c.el.parentElement;
      c.w=f.clientWidth;c.h=f.clientHeight;
      if(c.x>c.w-10)c.x=Math.random()*(c.w-20)+6;if(c.y>c.h-16)c.y=Math.random()*(c.h-26)+6}});
}
function chickSize(c){const s=FM.run.summaries[FM.di*FM.run.pensMeta.length+
  FM.run.pensMeta.findIndex(p=>p.pid===c.pen)];
  return s?clamp(11+s.meanBW/300,12,30):14}
function moveChicks(dtMs){
  for(const c of FM.chicks){
    if(c.dead||!c.w)continue;
    if(c.state==="roam"){
      if(performance.now()>c.nextTurn){c.nextTurn=performance.now()+600+Math.random()*1800;
        const a=Math.random()*6.283,sp=14+Math.random()*18;c.vx=Math.cos(a)*sp;c.vy=Math.sin(a)*sp*.6}
      c.x+=c.vx*dtMs/1000;c.y+=c.vy*dtMs/1000;
      if(c.x<4){c.x=4;c.vx=Math.abs(c.vx)}if(c.x>c.w-12){c.x=c.w-12;c.vx=-Math.abs(c.vx)}
      if(c.y<2){c.y=2;c.vy=Math.abs(c.vy)}if(c.y>c.h-14){c.y=c.h-14;c.vy=-Math.abs(c.vy)}
    }else if(c.state==="go"||c.state==="back"){
      const dx=c.tx-c.x,dy=c.ty-c.y,d=Math.hypot(dx,dy),step=(c.state==="go"?55:38)*dtMs/1000;
      if(d<=step||d<1.5){
        if(c.state==="go"){c.state="eat";c.eatEnd=performance.now()+1200+Math.random()*2200;
          c.el.classList.add("eat")}
        else{c.state="roam"}
      }else{c.x+=dx/d*step;c.y+=dy/d*step}
    }else if(c.state==="eat"){
      if(performance.now()>c.eatEnd){c.el.classList.remove("eat");c.state="back";
        c.tx=8+Math.random()*(c.w-24);c.ty=4+Math.random()*(c.h-24)}}
    c.el.style.transform=`translate(${c.x}px,${c.y}px)`;}
}
function dispatchVisit(v){
  const c=FM.chicks.find(k=>k.pen===v.p&&k.id===v.bird&&!k.dead);
  if(!c||(c.state==="go"||c.state==="eat"))return;
  c.state="go";
  const slotN=(parseInt(v.bird.slice(1),10)%5);
  c.tx=14+slotN*((c.w-28)/4)+(Math.random()*8-4);
  c.ty=c.h-13+(Math.random()*4-2);
}
function applyDayDeaths(){
  const ds=FM.deathsByDay.get(curAge())||[];
  for(const d of ds){
    const c=FM.chicks.find(k=>k.pen===d.pen&&k.id===d.id&&!k.dead);
    if(c){c.dead=true;c.el.classList.add("die");setTimeout(()=>c.el.remove(),900);
      tickerAdd(trf("dyn.death",{id:esc(d.id),pen:esc(d.pen),age:num(d.age)}),true)}}
}
function curAge(){return 15+FM.di}
function fmCycle(){return FM.cycle||46}
function fireVisits(s0,s1){
  const arr=FM.byDay.get(curAge());if(!arr)return;
  while(FM.firedIdx<arr.length&&arr[FM.firedIdx].t*3600<=s1){
    if(arr[FM.firedIdx].t*3600>=s0)dispatchVisit(arr[FM.firedIdx]);
    FM.firedIdx++}
}
function nextDay(){
  FM.di++;FM.firedIdx=0;FM.clock=0;
  if(FM.di>=fmCycle()){setPlaying(false);
    $("fm-pg").style.width="100%";
    $("fm-lbl").textContent="✅ "+tr("dyn.finished");
    renderFarmCharts();renderBioIfReady();
    if(FM.sel)renderInspector();
    return}
  applyDayDeaths();
  const day=FM.run.summaries.slice(FM.di*FM.run.pensMeta.length,(FM.di+1)*FM.run.pensMeta.length);
  for(const s of day)if(s.refills>0)
    tickerAdd(trf("dyn.refill",{pen:"<b>"+s.pen+"</b>",x:s.refills>1?" ×"+fa(s.refills):""}));
  if(day.some(s=>s.treat==="vaccine")&&curAge()===19)
    tickerAdd(tr("dyn.vaxDay"),true);
  if(day.some(s=>s.treat==="heat")&&curAge()===32)
    tickerAdd(tr("dyn.heatDay"),true);
  updateFarmDay(false);renderFarmCharts();
}
function skipToNextDay(){
  if(!FM||FM.di>=46)return;
  fireVisits(FM.clock,86400);FM.clock=86400;
  nextDay();updateClockUI(true);
}
function updateClockUI(force){
  const h=Math.floor(FM.clock/3600),m=Math.floor(FM.clock%3600/60);
  if(!force&&h===FM_clockUI)return;FM_clockUI=h;
  $("fm-day").textContent=tr("day.prefix")+num(curAge());
  $("fm-hour").textContent=String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
  $("fm-pg").style.width=fx((FM.di+FM.clock/86400)/fmCycle()*100,1)+"%";
  const dark=h<L_ON||h>=L_OFF;
  $("fm-veil").classList.toggle("on",dark);
  $("fm-light").classList.toggle("off",dark);
  $("fm-light").innerHTML=dark?("🌙 "+tr("farm.darkOff")):("💡 "+tr("farm.light"));
}
function updateFarmDay(initial){
  const N=FM.run.pensMeta.length;
  const day=FM.run.summaries.slice(FM.di*N,(FM.di+1)*N);
  /* pen boxes */
  for(const s of day){
    const box=document.querySelector(`.penbox[data-pen="${s.pen}"]`);if(!box)continue;
    const st=box.querySelector(".penstats"),bin=box.querySelector(".mbin");
    st.innerHTML=`<span>BW ${Math.round(s.meanBW)}</span><span>FI ${Math.round(s.fiPerBird)}g</span>`+
      `<span>🐔 ${s.alive}/${s.n}</span>`;
    bin.firstElementChild.style.width=clamp(s.binEnd/BIN_CAP*100,2,100)+"%";
    bin.classList.toggle("low",s.binEnd<4);}
  /* chick sizes */
  for(const c of FM.chicks)c.el.style.fontSize=chickSize(c)+"px";
  /* env line */
  const temp=day.reduce((s,x)=>s+x.temp,0)/day.length,hum=day.reduce((s,x)=>s+x.hum,0)/day.length;
  $("fm-env").textContent=`🌡 ${fx(temp,1)}°C · 💧 ${fx(hum,0)}%`;
  /* history for charts */
  const H=FM.hist;
  if(initial){H.ages=[];for(const k in H.t)delete H.t[k]}
  if(!H.ages.includes(curAge())){
    H.ages.push(curAge());
    const groups={};
    for(const s of day)(groups[s.treat]??={bw:[],fi:[]}),
      groups[s.treat].bw.push(s.meanBW),groups[s.treat].fi.push(s.fiPerBird);
    (FM.se.ages).push(curAge());
    for(const k of Object.keys(TREATMENTS)){
      if(!groups[k])continue;
      (H.t[k]??={bw:[],fi:[]});
      (FM.se.t[k]??={bwSE:[],fiSE:[],hi:[],lo:[],fhi:[],flo:[]});
      const gB=groups[k].bw,gF=groups[k].fi;
      const mB=gB.reduce((a,b)=>a+b,0)/gB.length,mF=gF.reduce((a,b)=>a+b,0)/gF.length;
      const sB=BioStat.se(gB),sF=BioStat.se(gF);
      H.t[k].bw.push(mB);H.t[k].fi.push(mF);
      FM.se.t[k].bwSE.push(sB);FM.se.t[k].fiSE.push(sF);
      FM.se.t[k].hi.push(mB+sB);FM.se.t[k].lo.push(mB-sB);
      FM.se.t[k].fhi.push(mF+sF);FM.se.t[k].flo.push(mF-sF);}}
  renderInspector();updateClockUI(true);
}
function trTreat(k){return tr("tr."+k)}
function renderFarmCharts(){
  const H=FM.hist,S=FM.se;
  const series=Object.entries(H.t).map(([k,v])=>({
    y:v.bw,c:TREATMENTS[k].color,name:trTreat(k),w:2.2,
    band:S.t[k]?{hi:S.t[k].hi,lo:S.t[k].lo,c:TREATMENTS[k].color+"22"}:null}));
  series.push({y:H.ages.map(a=>poBW("ash",a)),c:"#8b96ad",dash:true,w:1.5,name:"PO"});
  chart("c-farm-growth",{labels:H.ages.map(a=>"d"+a),series,
    hoverTitle:i=>tr("day.prefix")+H.ages[i]});
  $("lg-farm-growth").innerHTML=Object.entries(H.t).map(([k])=>
    `<span class="lg"><span class="sw" style="background:${TREATMENTS[k].color}"></span>${trTreat(k)}</span>`).join("")+
    `<span class="lg"><span class="sw" style="background:#8b96ad"></span>PO</span>`;
  chart("c-farm-fi",{labels:H.ages.map(a=>"d"+a),
    series:Object.entries(H.t).map(([k,v])=>({y:v.fi,c:TREATMENTS[k].color,name:trTreat(k),w:2.2})),
    hoverTitle:i=>tr("day.prefix")+H.ages[i]});
  $("lg-farm-fi").innerHTML=$("lg-farm-growth").innerHTML;
}
function renderInspector(){
  const N=FM.run.pensMeta.length;
  const diSafe=Math.min(FM.di,fmCycle()-1);
  const day=FM.run.summaries.slice(diSafe*N,(diSafe+1)*N);
  let rows=[];
  if(FM.selBird){
    const snaps=(FM.birdIndex.get(FM.selBird)||[]).filter(x=>x.age<=15+diSafe);
    const lastS=snaps[snaps.length-1];
    if(!lastS){/* not enough data yet */}
    else{
    const dead=FM.run.deaths.some(d=>d.id===FM.selBird);
    const trObj=TREATMENTS[lastS.treat];
    const poSex=a=>poBW(lastS.sex,a);
    const dev=100*(lastS.bw-poSex(lastS.age))/poSex(lastS.age);
    const fcrB=lastS.fi/Math.max(60,lastS.bw-45);
    rows=[[tr("bird.tag"),`<b class="dir-ltr">${FM.selBird}</b>`],
      [tr("exp.treat"),`<span class="tchip" style="--c:${trObj.color}">${trTreat(lastS.treat)}</span>`],
      [tr("exp.penId"),`<b>${lastS.pen}</b>`],
      [tr("bird.sex"),lastS.sex==="m"?tr("sex.m"):tr("sex.f")],
      [tr("bird.cv"),"±"+fx(lastS.cv*100,1)+"%"],
      [tr("bird.status"),dead?'<span class="tag bd">'+tr("bird.dead")+'</span>'
                            :'<span class="tag ok">'+tr("bird.alive")+'</span>'],
      [tr("bird.bwNow"),`<b>${en(Math.round(lastS.bw))}</b> g <small class="${dev>=0?"acc":"org"}">(${dev>=0?"+":""}${fx(dev,1)}% ${tr("insp.vsPO")})</small>`],
      [tr("bird.fiTotal"),`<b>${en(Math.round(lastS.fi))}</b> g`],
      [tr("bio.fcr"),`<b>${fx(fcrB,2)}</b>`]];
    chart("c-insp",{labels:snaps.map(x=>"d"+x.age),min:0,
      series:[{y:snaps.map(x=>x.bw),c:trObj.color,fill:true,name:"BW"},
              {y:snaps.map(x=>poSex(x.age)),c:"#8b96ad",dash:true,w:1.4,name:"PO"}],
      hoverTitle:i=>tr("day.prefix")+snaps[i].age,yFmt:v=>en(v)});
    $("insp-body").innerHTML=rows.map(r=>`<div class="krow"><span>${r[0]}</span><span>${r[1]}</span></div>`).join("")+
      `<button class="btn ghost" id="bird-back" style="margin-top:9px;width:100%">✕ ${tr("bird.back")}</button>`;
    on("bird-back","click",()=>{FM.selBird=null;
      $("insp-title").textContent=tr("farm.wholeFarm");renderInspector()});
    return}}
  if(FM.sel){
    const s=day.find(x=>x.pen===FM.sel);if(!s)return;
    const pp=FM.run.perPen[FM.sel];
    const dev=100*(s.meanBW-poBW("ash",s.age))/poBW("ash",s.age);
    rows=[[tr("insp.treat"),`<span class="tchip" style="--c:${TREATMENTS[s.treat].color}">${trTreat(s.treat)}</span>`],
      [tr("insp.meanBw"),`<b>${en(Math.round(s.meanBW))}</b> g <small class="${dev>=0?"acc":"org"}">(${dev>=0?"+":""}${fx(dev,1)}% ${tr("insp.vsPO")})</small>`],
      [tr("insp.fiToday"),`<b>${en(Math.round(s.fiPerBird))}</b> g`],
      [tr("insp.visitsToday"),num(s.visits)+` (${num(Math.round(s.visits/s.alive))}${tr("insp.perBird")})`],
      [tr("sim.busy"),`<b>${num(Math.round(s.busyPct))}%</b>`],
      [tr("insp.bin"),`${fx(s.binEnd,2)} kg`],
      [tr("insp.refills"),num(pp.refills.reduce((a,b)=>a+b,0))],
      [tr("insp.ovl"),num(pp.ovl.reduce((a,b)=>a+b,0))],
      [tr("insp.mort"),num(FM.run.deaths.filter(d=>d.pen===FM.sel).length)]];
    chart("c-insp",{labels:pp.ages.map(a=>"d"+a),min:0,
      series:[{y:pp.bw,c:TREATMENTS[pp.treat].color,fill:true,name:tr("lg.penMean")},
              {y:pp.ages.map(a=>poBW("ash",a)),c:"#8b96ad",dash:true,w:1.4,name:"PO"}],
      hoverTitle:i=>dayLbl(i),yFmt:v=>en(v)});
  }else{
    const alive=day.reduce((s,x)=>s+x.alive,0),tot=day.reduce((s,x)=>s+x.n,0);
    const bwAvg=day.reduce((s,x)=>s+x.meanBW,0)/day.length;
    const dev=100*(bwAvg-poBW("ash",15+diSafe))/poBW("ash",15+diSafe);
    rows=[[tr("insp.pensAlive"),`<b>${num(day.length)}</b> / <b>${num(alive)}</b> · ${num(tot)}`],
      [tr("insp.farmBw"),`<b>${en(Math.round(bwAvg))}</b> g <small class="${dev>=0?"acc":"org"}">(${dev>=0?"+":""}${fx(dev,1)}% ${tr("insp.vsPO")})</small>`],
      [tr("insp.farmFiToday"),`<b>${en(Math.round(day.reduce((s,x)=>s+x.dayFI,0)/1000))}</b> kg`],
      [tr("insp.totalVisits"),num(day.reduce((s,x)=>s+x.visits,0))],
      [tr("insp.todayRefills"),num(day.reduce((s,x)=>s+x.refills,0))],
      [tr("insp.totalDeaths"),num(FM.run.deaths.length)],
      [tr("insp.todayOvl"),num(day.reduce((s,x)=>s+x.overlap,0))]];
    const ages=[],bws=[];
    for(let i=0;i<=diSafe;i++){
      const sl=FM.run.summaries.slice(i*N,(i+1)*N);
      ages.push(sl[0].age);bws.push(sl.reduce((s,x)=>s+x.meanBW,0)/sl.length)}
    chart("c-insp",{labels:ages.map(a=>"d"+a),min:0,
      series:[{y:bws,c:"#22d3a5",fill:true,name:tr("lg.farmMean")},
              {y:ages.map(a=>poBW("ash",a)),c:"#8b96ad",dash:true,w:1.4,name:"PO"}],
      hoverTitle:i=>dayLbl(i),yFmt:v=>en(v)});
  }
  $("insp-body").innerHTML=rows.map(r=>`<div class="krow"><span>${r[0]}</span><span>${r[1]}</span></div>`).join("");
}
/* ticker */
function tickerClear(){$("ticker").innerHTML=""}
function tickerAdd(html,bad,good){
  const li=document.createElement("li");li.innerHTML=
    `<small class="dm">[${$("fm-day").textContent.replace(/^(روز|Day)\s*/,"")}·${$("fm-hour").textContent}]</small> ${html}`;
  li.className=(bad?"bad ":"")+(good?"good":"");
  const t=$("ticker");t.prepend(li);
  while(t.children.length>45)t.removeChild(t.lastChild)}
/* playback controls */
function setPlaying(p){
  if(!FM)return;FM.playing=p;
  $("fm-play").innerHTML=(p?"⏸ ":"▶ ")+(p?tr("btn.pause"):tr("btn.play"))}
function startFarmLoop(){FM_LAST=0;if(!FMRAF)FMRAF=requestAnimationFrame(farmFrame)}
function farmFrame(ts){
  FMRAF=requestAnimationFrame(farmFrame);
  if(!FM)return;
  if(CUR_VIEW!=="v-farm"){FM_LAST=ts;return}
  const dtms=Math.min(120,ts-(FM_LAST||ts));FM_LAST=ts;
  if(FM.playing){
    let adv=dtms/1000*FM.speed;
    while(adv>0&&FM.di<46){
      const rem=86400-FM.clock,step=Math.min(adv,rem);
      fireVisits(FM.clock,FM.clock+step);FM.clock+=step;adv-=step;
      if(FM.clock>=86400)nextDay();}
    updateClockUI();}
  moveChicks(dtms);
}
on("fm-play","click",()=>{
  if(!FM||FM.stale)return toast(tr("dyn.stale"));
  setPlaying(!FM.playing)});
on("fm-nextday","click",()=>{if(FM&&!FM.stale)skipToNextDay()});
on("fm-restart","click",()=>{
  if(!FM||FM.stale)return toast(tr("dyn.stale"));
  FM.di=0;FM.clock=0;FM.firedIdx=0;setPlaying(false);
  buildBarnDOM();FM.hist={ages:[],t:{}};updateFarmDay(true);renderFarmCharts();
  tickerClear();tickerAdd(tr("dyn.rebuilt"));
  setPlaying(true)});
on("fm-speed","change",()=>{if(FM)FM.speed=+$("fm-speed").value});
on("fm-tags","click",()=>{const w=$("pens-wrap");if(!w)return;
  const hide=w.classList.toggle("hide-tags");
  const bt=$("fm-tags");if(bt){bt.dataset.on=hide?"0":"1";
    bt.classList.toggle("ok",!hide);bt.classList.toggle("wn",hide)}});
on("fm-xlsx","click",openExport);
on("fm-csv","click",openExport);


/* =====================================================================
   STRAIN SELECTOR + LANGUAGE + INIT
   ===================================================================== */
let CUR_STRAIN_KEY="ross308";
try{CUR_STRAIN_KEY=localStorage.getItem("rossim_strain")||"ross308";
  if(!STRAINS[CUR_STRAIN_KEY])CUR_STRAIN_KEY="ross308"}catch(e){}
function strainBanner(){const st=STRAINS[CUR_STRAIN_KEY];
  $("db-strain").textContent=LI(st.label)+" · "+LI(st.breeder);
  $("db-guide").textContent=LI(st.guide);
  $("db-glink").href=st.guideUrl}
function initStrain(){
  const box=document.querySelector(".strain-select");
  const cur=$("strain-current");
  const list=$("strain-list");
  const valEl=$("strain-value");
  if(!box||!cur||!list||!valEl)return;

  list.innerHTML=Object.entries(STRAINS).map(([k,s])=>
    `<li class="strain-select__option" role="option" data-key="${k}" tabindex="-1" `+
    `aria-selected="${k===CUR_STRAIN_KEY}">${esc(s.label)}</li>`).join("");
  function setVal(){valEl.textContent=STRAINS[CUR_STRAIN_KEY].label}
  function open(){list.hidden=false;box.setAttribute("aria-expanded","true");
    const sel=list.querySelector('[aria-selected="true"]');if(sel)sel.focus()}
  function close(){list.hidden=true;box.setAttribute("aria-expanded","false")}
  function isOpen(){return !list.hidden}

  setVal();setStrain(CUR_STRAIN_KEY);
  $("in-age1").max=STRAINS[CUR_STRAIN_KEY].maxDay;
  strainBanner();

  cur.addEventListener("click",e=>{e.stopPropagation();isOpen()?close():open()});

  list.addEventListener("click",e=>{
    const opt=e.target.closest(".strain-select__option");
    if(!opt)return;
    const key=opt.dataset.key;
    CUR_STRAIN_KEY=key;setStrain(key);
    try{localStorage.setItem("rossim_strain",key)}catch(e){}
    list.querySelectorAll(".strain-select__option")
      .forEach(o=>o.setAttribute("aria-selected",o===opt?"true":"false"));
    setVal();
    const md=STRAINS[key].maxDay;
    $("in-age1").max=md;
    ["in-age0","in-age1"].forEach(id=>{const el=$(id);
      if(el&&+el.value>md)el.value=md});
    strainBanner();expMarkStale();
    runDashboard();
    close();
    toast(tr("dash.active")+" "+STRAINS[key].label)});

  box.addEventListener("keydown",e=>{
    if(e.key==="Escape"){close();return}
    if(e.key==="Enter"||e.key===" "){
      if(isOpen()){const s=list.querySelector('[aria-selected="true"]');if(s)s.click()}
      else open();
      e.preventDefault();return}
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){
      const opts=[...list.querySelectorAll(".strain-select__option")];
      if(!opts.length)return;
      if(!isOpen()){open();return}
      let i=opts.findIndex(o=>o.getAttribute("aria-selected")==="true");
      i=(i+(e.key==="ArrowDown"?1:-1)+opts.length)%opts.length;
      opts.forEach(o=>o.setAttribute("aria-selected",o===opts[i]?"true":"false"));
      opts[i].focus();e.preventDefault()}});

  document.addEventListener("click",e=>{if(isOpen()&&!box.contains(e.target))close()});
}
function bindLang(){
  $("lang-fa").addEventListener("click",()=>setLang("fa"));
  $("lang-en").addEventListener("click",()=>setLang("en"))}

/* ---------------- theme (dark / light) ---------------- */
let THEME="light";
try{const _t=localStorage.getItem("rossim_theme");
  if(_t==="dark")THEME="dark"}catch(e){}
refreshChartTheme();
document.documentElement.setAttribute("data-theme",THEME==="light"?"light":"dark");
function applyThemeButtons(){
  const d=$("theme-dark"),l=$("theme-light");
  const dd=$("theme-dark-dd"),dl=$("theme-light-dd");
  if(d){d.classList.toggle("on",THEME==="dark");
    d.setAttribute("aria-pressed",THEME==="dark"?"true":"false")}
  if(l){l.classList.toggle("on",THEME==="light");
    l.setAttribute("aria-pressed",THEME==="light"?"true":"false")}
  if(dd){dd.classList.toggle("on",THEME==="dark");
    dd.setAttribute("aria-pressed",THEME==="dark"?"true":"false")}
  if(dl){dl.classList.toggle("on",THEME==="light");
    dl.setAttribute("aria-pressed",THEME==="light"?"true":"false")}}
function setTheme(t){
  if(THEME===t)return;THEME=t;
  try{localStorage.setItem("rossim_theme",t)}catch(e){}
  document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark");
  refreshChartTheme();applyThemeButtons();
  requestAnimationFrame(()=>repaintView(CUR_VIEW));
}
/* ---------------- header controls: hamburger REMOVED (v1.8.35) ------------
   The burger button + slide-in drawer are gone everywhere. Desktop keeps
   its inline .hctl controls; on mobile .hctl is display:none and every
   drawer entry (language/theme/help/reset) lives in the user menu
   (topbar dropdown + bottom sheet in auth.js). */
function bindHeaderResize(){
  // repaint charts after real layout changes (kept from the old drawer binder)
  let rw=innerWidth;
  window.addEventListener("resize",()=>{
    if(rw!==innerWidth){rw=innerWidth;
      requestAnimationFrame(()=>repaintView(CUR_VIEW))}});
  /* keep chicks' floor metrics fresh after layout changes */
  if(typeof ResizeObserver!=="undefined"){
    const ro2=new ResizeObserver(()=>{if(FM)for(const c of FM.chicks){
      const f=c.el.parentElement;if(!f)continue;
      c.w=f.clientWidth;c.h=f.clientHeight}});
    const pw=$("pens-wrap");
    if(pw)ro2.observe(pw)}
}
function bindTheme(){
  $("theme-dark").addEventListener("click",()=>setTheme("dark"));
  $("theme-light").addEventListener("click",()=>setTheme("light"));
  applyThemeButtons()}

/* ---------------- settings dropdown (desktop) ---------------- */
function settingsDropdownOpen(){return document.querySelector(".settings-dropdown")?.classList.contains("open")}
function openSettingsDropdown(){
  const dd=$("settings-dropdown"), btn=$("btn-settings");
  if(!dd)return;
  dd.classList.add("open");dd.hidden=false;
  if(btn)btn.setAttribute("aria-expanded","true")}
function closeSettingsDropdown(){
  const dd=$("settings-dropdown"), btn=$("btn-settings");
  if(!dd)return;
  dd.classList.remove("open");dd.hidden=true;
  if(btn)btn.setAttribute("aria-expanded","false")}
function bindSettingsDropdown(){
  on("btn-settings","click",()=>settingsDropdownOpen()?closeSettingsDropdown():openSettingsDropdown());
  document.addEventListener("click",e=>{
    const dd=$("settings-dropdown"), btn=$("btn-settings");
    if(!dd||!dd.classList.contains("open"))return;
    if(dd.contains(e.target)||(btn&&btn.contains(e.target)))return;
    closeSettingsDropdown()});
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&settingsDropdownOpen())closeSettingsDropdown()});
  /* theme buttons in dropdown */
  on("theme-dark-dd","click",()=>{setTheme("dark");closeSettingsDropdown()});
  on("theme-light-dd","click",()=>{setTheme("light");closeSettingsDropdown()});
  /* lang buttons in dropdown */
  on("lang-fa-dd","click",()=>{setLang("fa");closeSettingsDropdown()});
  on("lang-en-dd","click",()=>{setLang("en");closeSettingsDropdown()});
  /* calendar format buttons (date prefs) */
  ["auto","jalali","gregorian"].forEach(function(fmt){
    var b=document.getElementById("df-"+fmt);
    if(b) b.addEventListener("click",function(){
      if(window.setDatePrefs) window.setDatePrefs({fmt:fmt});
      applyDatePrefButtons();
      applyLang();
      try{ if(typeof DASH!=="undefined"&&DASH) runDashboard(); }catch(e){}
      try{ if(typeof FM!=="undefined"&&FM&&!FM.stale) updateFarmDay(true); }catch(e){}
      if(typeof window.EnvControl!=="undefined"&&window.EnvControl) window.EnvControl.tick(true);
      if(typeof startClock==="function") startClock();
    });
  });
  /* timezone select */
  var tzs=document.getElementById("tz-select");
  if(tzs) tzs.addEventListener("change",function(){
    if(window.setDatePrefs) window.setDatePrefs({tz:tzs.value});
    try{ if(typeof DASH!=="undefined"&&DASH) runDashboard(); }catch(e){}
    if(typeof window.EnvControl!=="undefined"&&window.EnvControl) window.EnvControl.tick(true);
    if(typeof startClock==="function") startClock();
  });
  /* restore stored prefs into the controls */
  try{
    var _st=JSON.parse(localStorage.getItem("rossim_date_prefs")||"{}");
    if(_st.fmt) applyDatePrefButtons();
    if(_st.tz && tzs) tzs.value=_st.tz;
  }catch(e){}
  /* help button in dropdown */
  on("btn-help-dd","click",()=>{showHelp();closeSettingsDropdown()});
  /* reset button in dropdown */
  on("btn-reset-dd","click",()=>{ if(window.MDialog){ MDialog.confirm({title:"\u0628\u0627\u0632\u0646\u0634\u0627\u0646\u06cc \u06a9\u0627\u0645\u0644 \u062f\u0627\u062f\u0647\u200c\u0647\u0627", message:"\u0622\u06cc\u0627 \u0627\u0632 \u0628\u0627\u0632\u0646\u0634\u0627\u0646\u06cc \u06a9\u0627\u0645\u0644 \u0627\u0637\u0645\u06cc\u0646\u0627\u0646 \u062f\u0627\u0631\u06cc\u062f\u061f\u000a\u000a\u062a\u0645\u0627\u0645 \u062f\u0627\u062f\u0647\u200c\u0647\u0627\u06cc \u062f\u0627\u0634\u0628\u0648\u0631\u062f \u0627\u0639\u062a\u0628\u0627\u0631\u0633\u0646\u062c\u06cc\u060c \u0637\u0631\u062d \u0622\u0632\u0645\u0627\u06cc\u0634\u060c \u0646\u0642\u0634\u0647 \u0641\u0627\u0631\u0645\u060c \u0634\u0628\u06cc\u0647\u200c\u0633\u0627\u0632\u06cc \u0632\u0646\u062f\u0647 \u0648 \u0633\u0646\u0627\u0631\u06cc\u0648\u0647\u0627 \u067e\u0627\u06a9 \u062e\u0648\u0627\u0647\u062f \u0634\u062f\u002e", icon:"danger", danger:true, confirmText:"\u0628\u0627\u0632\u0646\u0634\u0627\u0646\u06cc", cancelText:"\u0627\u0646\u0635\u0631\u0627\u0641"}).then(function(ok){ if(!ok) return; resetCycle();closeSettingsDropdown(); }); } else { var ok=confirm("\u0622\u06cc\u0627 \u0627\u0632 \u0628\u0627\u0632\u0646\u0634\u0627\u0646\u06cc \u06a9\u0627\u0645\u0644 \u0627\u0637\u0645\u06cc\u0646\u0627\u0646 \u062f\u0627\u0631\u06cc\u062f\u061f"); if(!ok) return; resetCycle();closeSettingsDropdown(); } });}

/* sync dropdown pills with header pills */
function syncSettingsInfo(){
  const mae=$("h-mae")?.textContent||"—";
  const rows=$("h-rows")?.textContent||"—";
  if($("h-mae-dd"))$("h-mae-dd").textContent=mae;
  if($("h-rows-dd"))$("h-rows-dd").textContent=rows;}

/* highlight the calendar-format segment matching the stored pref */
function applyDatePrefButtons(){
  var prefs={fmt:"auto"};
  try{ prefs=JSON.parse(localStorage.getItem("rossim_date_prefs")||"{}"); }catch(e){}
  ["auto","jalali","gregorian"].forEach(function(fmt){
    var b=document.getElementById("df-"+fmt);
    if(b){ b.classList.toggle("on", (prefs.fmt||"auto")===fmt);
           b.setAttribute("aria-pressed", (prefs.fmt||"auto")===fmt ? "true":"false"); }
  });}

/* dropdown action helpers */
function showHelp(){tourStart(true)}
function resetCycle(){resetAll();toast(tr("dyn.resetDone"))}

/* =====================================================================
   BIOSTATISTICS LAB — pen = experimental unit
   ===================================================================== */
function penMetric(pp,metric,run){
  switch(metric){
    case"bw":return pp.bw.at(-1);
    case"fi":return pp.fi.reduce((a,b)=>a+b,0);
    case"fcr":return windowFCR(pp);
    case"mort":return 100*run.deaths.filter(d=>d.pen===pp.pid).length/pp.n;
  }}
function runBioStats(){
  if(!FM)return toast(tr("dyn.noData"));
  const metric=$("bio-metric").value||"bw";
  const groups={}; // treat -> array of pen values
  for(const pm of FM.run.pensMeta){
    const v=penMetric(FM.run.perPen[pm.pid],metric,FM.run);
    if(v==null||!isFinite(v))continue;
    (groups[pm.treat]??=[]).push(v)}
  const keys=Object.keys(groups).filter(k=>groups[k].length>0);
  const out=$("bio-out");
  if(keys.length<2||keys.every(k=>groups[k].length<2)){
    out.innerHTML=`<div class="note wn">${tr("bio.noReps")}</div>`;return}
  /* descriptive */
  let html=`<div class="tbl-scroll"><table class="bio-table"><thead><tr>
    <th>${tr("exp.treat")}</th><th class="num">${tr("bio.nCol")}</th>
    <th class="num">${tr("bio.meanCol")}</th><th class="num">${tr("bio.seCol")}</th>
    <th class="num">${tr("bio.ciCol")}</th></tr></thead><tbody>`;
  for(const k of keys){
    const a=groups[k],m=BioStat.mean(a),sd=BioStat.sd(a),e=BioStat.se(a);
    const ci=BioStat.ci95(a);
    html+=`<tr><td><span class="tchip" style="--c:${TREATMENTS[k].color}">${trTreat(k)}</span></td>
      <td class="num">${a.length}</td>
      <td class="num">${fx(m,2)} ± ${fx(sd,2)}</td>
      <td class="num">${fx(e,3)}</td>
      <td class="num">[${fx(ci[0],2)}, ${fx(ci[1],2)}]</td></tr>`}
  html+="</tbody></table></div>";
  /* anova */
  const av=BioStat.anova(keys.map(k=>groups[k]));
  if(av){
    html+=`<div class="note" style="margin-top:11px"><b>${tr("bio.anovaTitle")}:</b> `+
      trf("bio.anovaLine",{dfB:av.dfB,dfW:av.dfW,F:fx(av.F,2),
        p:av.p<.001?av.p.toExponential(1):fx(av.p,4),eta2:fx(av.eta2,3)})+
      ` <span class="starp">${BioStat.stars(av.p)}</span></div>`}
  /* pairwise welch + holm (only when >=2 groups with >=2 obs) */
  const pk=keys.filter(k=>groups[k].length>=2);
  if(pk.length>=2){
    const pairs=[];
    for(let i=0;i<pk.length;i++)for(let j=i+1;j<pk.length;j++){
      const w=BioStat.welchT(groups[pk[i]],groups[pk[j]]);
      pairs.push({i,j,p:w.p,t:w.t,df:w.df})}
    const adj=BioStat.holm(pairs.map(p=>p.p));
    html+=`<h3 style="margin-top:14px">${tr("bio.pairwise")}</h3>
      <table class="pmatrix"><thead><tr><th></th>${pk.map(k=>
      `<th><span class="tchip" style="--c:${TREATMENTS[k].color}">${trTreat(k)}</span></th>`).join("")}</tr></thead><tbody>`;
    for(const ki of pk){
      html+=`<tr><td><span class="tchip" style="--c:${TREATMENTS[ki].color}">${trTreat(ki)}</span></td>`;
      for(const kj of pk){
        if(ki===kj){html+="<td class='dm'>—</td>";continue}
        const pr=pairs.find(p=>(p.i===ki&&p.j===kj)||(p.i===kj&&p.j===ki));
        if(!pr){html+="<td>·</td>";continue}
        const star="<span class='starp'>"+BioStat.stars(pr.p)+"</span>";
        html+=`<td>${pr.p<.001?"<0.001":fx(pr.p,3)} ${star}</td>`}
      html+="</tr>"}
    html+="</tbody></table>"}
  html+=`<div class="methtext" style="margin-top:9px">${tr("bio.method")}</div>`;
  out.innerHTML=html}
on("btn-bio-run","click",runBioStats);
function renderBioIfReady(){if($("bio-out").innerHTML)runBioStats()}

/* =====================================================================
   GUIDED TOUR — comprehensive 13-step 90-sec walkthrough (v2)
   ===================================================================== */
const TOUR_STEPS=[
  {sel:null, icon:"fa-graduation-cap", title:"tour.welcomeT", text:"tour.welcomeP"},
  {sel:"#auth-area", icon:"fa-lock", title:"tour.authT", text:"tour.authP", view:"v-landing"},
  {sel:".strain-select", icon:"fa-dna", title:"tour.strainT", text:"tour.strainP"},
  {sel:".hsettings", icon:"fa-gear", title:"tour.settingsT", text:"tour.settingsP"},
  {sel:"#mainnav", icon:"fa-compass", title:"tour.navT", text:"tour.navP"},
  {sel:"#v-dash", view:"v-dash", icon:"fa-chart-line", title:"tour.dashT", text:"tour.dashP"},
  {sel:"#v-exp", view:"v-exp", icon:"fa-vial", title:"tour.expT", text:"tour.expP"},
  {sel:"#v-farm", view:"v-farm", icon:"fa-map", title:"tour.farmT", text:"tour.farmP"},
  {sel:"#v-sim", view:"v-sim", icon:"fa-satellite-dish", title:"tour.simT", text:"tour.simP"},
  {sel:"#v-scn", view:"v-scn", icon:"fa-flask", title:"tour.scnT", text:"tour.scnP"},
  {sel:"#v-dev", view:"v-dev", icon:"fa-microchip", title:"tour.devT", text:"tour.devP"},
  {sel:"#v-sci", view:"v-sci", icon:"fa-book-open", title:"tour.sciT", text:"tour.sciP"},
  {sel:null, icon:"fa-box-open", title:"tour.expT2", text:"tour.expP2"},
  {sel:null, done:true, icon:"fa-flag-checkered", title:"tour.doneT", text:"tour.doneP"}
];
let TOUR={i:0,active:false,pending:false,el:null,seq:0,raf:0};
function prefersReduced(){return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches}
function tourClearSpot(){
  document.querySelectorAll(".tour-spot").forEach(e=>e.classList.remove("tour-spot"));
  TOUR.el=null;
  const sh=$("tour-shade");if(sh)sh.classList.remove("on","holed");
  const tip=$("tour-tip");if(tip){tip.style.display="none";tip.classList.remove("show","tt-above","tt-below")}}
function tourPlaceTip(rect){
  const tip=$("tour-tip");if(!tip)return;
  tip.style.display="block";
  const tw=tip.offsetWidth||420,th=tip.offsetHeight||180;
  const maxX=Math.max(10,innerWidth-tw-10),maxY=Math.max(10,innerHeight-th-10);
  let x,y,place="center";
  if(!rect){x=clamp((innerWidth-tw)/2,10,maxX);y=clamp((innerHeight-th)/2,10,maxY)}
  else{
    x=clamp(rect.left+rect.width/2-tw/2,10,maxX);
    y=rect.bottom+14;place="below";
    if(y+th>innerHeight-14){y=Math.max(10,rect.top-th-14);place="above"}
    if(y<10){y=10;place="center"}
  }
  tip.style.left=x+"px";tip.style.top=y+"px";
  // spotlight hole: punch the shade AROUND the target instead of lifting the
  // target above the shade. The old z-index boost trapped inside ancestor
  // stacking contexts (sticky topbar etc.), leaving the target UNDER the
  // blurred shade — invisible while the tip described it.
  var sh2=$("tour-shade");
  if(sh2){
    if(!rect){sh2.classList.remove("holed")}
    else{
      var pad=10, rh=(rect.height!=null?rect.height:((rect.bottom||0)-(rect.top||0)));
      var hx=Math.max(0,rect.left-pad), hy=Math.max(0,rect.top-pad);
      var hw=Math.max(0,Math.min(innerWidth-hx,rect.width+pad*2));
      var hh=Math.max(0,Math.min(innerHeight-hy,rh+pad*2));
      sh2.style.setProperty("--thx",hx+"px");sh2.style.setProperty("--thy",hy+"px");
      sh2.style.setProperty("--thw",hw+"px");sh2.style.setProperty("--thh",hh+"px");
      sh2.classList.add("holed");
    }
  }
  // restart the enter animation every step (direction-aware slide)
  tip.classList.remove("show","tt-above","tt-below");
  void tip.offsetWidth;
  if(place!=="center") tip.classList.add(place==="above"?"tt-above":"tt-below");
  tip.classList.add("show")}
function tourSwitchView(view){
  if(!view) return false;
  const tab=document.querySelector(`.tab[data-v="${view}"]`);
  const sec=document.getElementById(view);
  if(!tab||!sec) return false;
  // honor auth gate: if needs-auth and view is gated, stay on landing and skip highlight
  const needsAuth=document.body.classList.contains("needs-auth");
  const isGated=needsAuth && !["v-landing","v-about"].includes(view);
  if(isGated) return false;
  document.querySelectorAll(".tab").forEach(b=>{b.classList.remove("on");b.setAttribute("aria-selected","false")});
  document.querySelectorAll("section.view").forEach(s=>s.classList.remove("on"));
  tab.classList.add("on");tab.setAttribute("aria-selected","true");
  sec.classList.add("on");
  try{ CUR_VIEW=view; if(typeof repaintView==="function") repaintView(view); }catch(e){}
  return true;
}
function tourShow(i){
  if(i>=TOUR_STEPS.length){tourEnd(true);return}
  if(i<0)i=0;
  TOUR.i=i;tourClearSpot();
  const st=TOUR_STEPS[i];
  const pct=Math.round(((i+1)/TOUR_STEPS.length)*100);
  const bar=$("tt-bar"); if(bar) bar.style.width=pct+"%";
  $("tt-step").textContent=(i+1)+"/"+TOUR_STEPS.length;
  $("tt-title").textContent=tr(st.title);
  $("tt-text").textContent=tr(st.text);
  const iconEl=$("tt-icon");
  if(iconEl) iconEl.innerHTML=`<i class="fa-solid ${st.icon||"fa-circle-info"}"></i>`;
  const nextBtn=$("tt-next");
  if(nextBtn){
    const lbl=st.done?tr("tour.finish"):tr("tour.next");
    nextBtn.innerHTML=st.done? `<span>${lbl}</span>` : `<span>${lbl}</span> ›`;
  }
  const prevBtn=$("tt-prev");
  if(prevBtn){ prevBtn.style.visibility=i===0?"hidden":"visible"; prevBtn.innerHTML=`‹ <span>${tr("tour.prev")}</span>`; }
  const skipBtn=$("tt-skip"); if(skipBtn) skipBtn.textContent=tr("tour.skip");
  const dots=$("tt-dots");
  if(dots){
    dots.innerHTML=TOUR_STEPS.map((_,k)=>`<i class="${k===i?"on":""}" data-k="${k}" title="${k+1}"></i>`).join("");
    dots.querySelectorAll("i").forEach(el=> el.addEventListener("click",()=> tourShow(parseInt(el.dataset.k,10))));
  }
  const shade=$("tour-shade");if(shade)shade.classList.add("on");
  // switch view first if step has view
  if(st.view) tourSwitchView(st.view);
  if(st.sel){
    const el=document.querySelector(st.sel);
    if(el){
      // ensure visible
      try{ el.scrollIntoView({block:"center",behavior:prefersReduced()?"auto":"smooth"});}catch(e){}
      const seq=++TOUR.seq;
      setTimeout(()=>{
        if(seq!==TOUR.seq||!TOUR.active||TOUR.i!==i) return; // stale step: a newer tourShow won
        el.classList.add("tour-spot");
        TOUR.el=el;
        const r=el.getBoundingClientRect();
        // if element is hidden (display none), center tip
        if(r.width===0 && r.height===0){TOUR.el=null;tourPlaceTip(null)}
        else tourPlaceTip({left:r.left,top:r.top,bottom:r.bottom,width:r.width});
        TOUR.pending=false;
      },prefersReduced()?0:420);
      TOUR.pending=true;return
    }
  }
  TOUR.el=null;tourPlaceTip(null)
}
function tourReposition(){
  // keep the floating tip glued to its target across scroll/resize —
  // the old flush only ran inside the 420ms post-click window, so the tip
  // drifted as soon as the user scrolled afterwards.
  if(!TOUR.active) return;
  const st=TOUR_STEPS[TOUR.i];
  if(TOUR.pending){
    if(!st||!st.sel) return;
    const el=document.querySelector(st.sel);if(!el||!el.isConnected) return;
    el.classList.add("tour-spot");
    TOUR.el=el;
    const r=el.getBoundingClientRect();
    if(r.width===0) tourPlaceTip(null);
    else tourPlaceTip({left:r.left,top:r.top,bottom:r.bottom,width:r.width});
    TOUR.pending=false;return
  }
  if(!st||!st.sel||!TOUR.el||!TOUR.el.isConnected) return;
  const r=TOUR.el.getBoundingClientRect();
  if(r.width===0&&r.height===0) tourPlaceTip(null);
  else tourPlaceTip({left:r.left,top:r.top,bottom:r.bottom,width:r.width})
}
function tourScheduleReposition(){
  if(!TOUR.active||TOUR.raf) return;
  TOUR.raf=requestAnimationFrame(()=>{TOUR.raf=0;tourReposition()})
}
function tourPendingFlush(){
  tourReposition()}
function tourStart(force){
  const KEY="arian_tour_v2";
  try{
    if(!force && localStorage.getItem(KEY)==="done") return;
  }catch(e){}
  TOUR.active=true;TOUR.i=0;TOUR.pending=false;
  document.body.classList.add("tour-active");
  // close settings drawer if open
  try{ document.getElementById("settings-dropdown")?.setAttribute("hidden",""); }catch(e){}
  tourShow(0)}
function tourEnd(finished){
  TOUR.active=false;TOUR.pending=false;
  tourClearSpot();
  document.body.classList.remove("tour-active");
  try{ localStorage.setItem("arian_tour_v2","done"); localStorage.setItem("rossim_tour","done"); }catch(e){}
  if(finished) try{ toast(tr("tour.doneT")); }catch(e){}
}
function bindTour(){
  const start=()=>{tourClearSpot();tourStart(true)};
  on("btn-help","click",start);
  on("btn-help-dd","click",start);
  on("tt-next","click",()=>tourShow(TOUR.i+1));
  on("tt-prev","click",()=>tourShow(TOUR.i-1));
  on("tt-skip","click",()=>tourEnd(false));
  const shade=$("tour-shade"); if(shade) shade.addEventListener("click",()=> tourEnd(false));
  document.addEventListener("keydown",(e)=>{
    if(!TOUR.active) return;
    if(e.key==="Escape") { e.preventDefault(); tourEnd(false); }
    else if(e.key==="ArrowRight" || e.key==="ArrowLeft"){
      // respect RTL: ArrowRight = next in LTR, prev in RTL? Keep simple: Right=next
      e.preventDefault();
      if(e.key==="ArrowRight") tourShow(TOUR.i+1);
      else tourShow(TOUR.i-1);
    }
  });
  window.addEventListener("resize",tourScheduleReposition);
  window.addEventListener("scroll",tourScheduleReposition,{passive:true,capture:true});
  window.addEventListener("rossim:lang",()=>{ if(TOUR.active) tourShow(TOUR.i); });
}

/* =====================================================================
   EXPORT CENTER — user-selectable parameters
   ===================================================================== */
/* daily-summary column catalog (user-selectable export parameters) */
const SUM_COLS=[
  {id:"pen",       lk:"col.pen",      en:"pen",           get:(s)=>s.pen},
  {id:"treatment", lk:"col.treat",    en:"treatment",     get:(s,r)=>r.labelEn},
  {id:"age_day",   lk:"col.day",      en:"age_day",       get:(s)=>s.age},
  {id:"n_alive",   lk:"col.alive",    en:"n_alive",       get:(s)=>s.alive},
  {id:"mean_bw_g", lk:"col.bw",       en:"mean_bw_g",     get:(s)=>+(s.meanBW.toFixed(1))},
  {id:"fi_per_bird_g",lk:"col.fi",    en:"fi_per_bird_g", get:(s)=>+(s.fiPerBird.toFixed(1))},
  {id:"fi_po_g",   lk:"col.fipo",     en:"fi_po_g",       get:(s)=>s.fiPerBirdPo},
  {id:"visits_total",lk:"col.visT",    en:"visits_total",  get:(s)=>s.visits},
  {id:"visits_per_bird",lk:"col.visB",en:"visits_per_bird",get:(s)=>+(s.visits/s.alive).toFixed(1)},
  {id:"busy_pct",  lk:"col.busy",     en:"busy_pct",      get:(s)=>+(s.busyPct.toFixed(1))},
  {id:"overlap_events",lk:"col.ovl",   en:"overlap_events",get:(s)=>s.overlap},
  {id:"bin_refills",lk:"col.fill",     en:"bin_refills",   get:(s)=>s.refills},
  {id:"bin_end_kg",lk:"col.bin",       en:"bin_end_kg",    get:(s)=>s.binEnd},
  {id:"temp_c",    lk:"col.temp",     en:"temp_c",        get:(s)=>+(s.temp.toFixed(1))},
  {id:"humidity_pct",lk:"col.hum",     en:"humidity_pct",  get:(s)=>+(s.hum.toFixed(1))}];
let SUM_COLS_SEL=null; // null = all
function sumColsSel(){
  if(!SUM_COLS_SEL)
    try{const j=JSON.parse(localStorage.getItem("rossim_cols"));
        if(Array.isArray(j)&&j.length)SUM_COLS_SEL=new Set(j)}catch(e){}
  if(!SUM_COLS_SEL)SUM_COLS_SEL=new Set(SUM_COLS.map(c=>c.id));
  return SUM_COLS_SEL}
function saveCols(){try{localStorage.setItem("rossim_cols",
  JSON.stringify([...sumColsSel()]))}catch(e){}}

const EX_SHEETS=[
  {id:"summary",lk:"ex.summary",always:true,
    build:r=>summaryRows(r.summaries)},
  {id:"device", lk:"ex.device", needRows:true},
  {id:"birds",  lk:"ex.birds", farmOnly:true,
    build:()=>birdsSheetRows(FM.run)},
  {id:"design", lk:"ex.design",
    build:r=>designRows(r.pensMeta)},
  {id:"po",     lk:"ex.po",
    build:()=>poSheetRows()}];
let EX={fmt:"xlsx",ctx:null,
  checked:new Set(["summary","device","design","po"]),csvPick:"summary"};

function exContext(){
  if(LV&&LV.allRows.length)
    return{kind:"live",run:LV.run,rows:LV.allRows,rowsOk:true,
      label:trf("ex.ctxLive",{pen:LI(LV.pen),a0:num(LV.a0),a1:num(LV.a1),
        strain:LI(STRAINS[CUR_STRAIN_KEY].label)})};
  if(FM&&!FM.stale)
    return{kind:"farm",run:FM.run,rows:null,rowsOk:expTotals()<=200,
      label:trf("ex.ctxFarm",{pens:num(FM.run.pensMeta.length),
        a0:num(15),a1:num(Math.min(60,PO().maxDay)),
        strain:LI(STRAINS[CUR_STRAIN_KEY].label)})};
  return null}

function exRender(){
  const ctx=EX.ctx;if(!ctx)return;
  $("ex-src").textContent=ctx.label;
  const sheets=$("ex-sheets"),pick=$("ex-csvp");
  renderColPicker(EX.fmt==="xlsx"?EX.checked.has("summary"):(EX.csvPick==="summary"));
  if(EX.fmt!=="xlsx"){
    renderColPicker(EX.csvPick==="summary");
    sheets.style.display="none";pick.style.display="flex";
    pick.style.flexDirection="column";pick.style.gap="6px";
    const ds=$("ex-dataset");
    ds.innerHTML=EX_SHEETS
      .filter(sh=>!(sh.id==="birds"&&ctx.kind!=="farm"))
      .filter(sh=>sh.id!=="device"||ctx.rowsOk)
      .map(o=>`<option value="${o.id}"${o.id===EX.csvPick?" selected":""}>${esc(tr(o.lk))}</option>`).join("");
    ds.onchange=()=>{EX.csvPick=ds.value};
    return}
  pick.style.display="none";sheets.style.display="flex";sheets.innerHTML="";
  EX_SHEETS.forEach(sh=>{
    if(sh.id==="birds"&&ctx.kind!=="farm")return;
    if(sh.needRows&&!ctx.rowsOk)return;
    let cnt="";
    try{
      if(sh.id==="summary")cnt=ctx.run.summaries.length+" rows";
      else if(sh.id==="device")cnt=(ctx.rows?ctx.rows.length:0)+" rows";
      else if(sh.id==="birds")
        cnt=(FM.run.birdsDaily?FM.run.birdsDaily.length:0)+" rows";
      else if(sh.id==="design")cnt=ctx.run.pensMeta.length+" pens";
      else if(sh.id==="po")cnt=PO().maxDay+" days"}catch(e){}
    const locked=!!sh.always;
    const row=document.createElement("label");
    row.className="sheetrow"+(locked?" locked":"");
    row.innerHTML=`<input type="checkbox" data-id="${sh.id}"
        ${(locked||EX.checked.has(sh.id))?"checked":""} ${locked?"disabled":""}>
      <span>${esc(tr(sh.lk))}</span><span class="cnt">${cnt}</span>`;
    row.querySelector("input").addEventListener("change",ev=>{
      ev.target.checked?EX.checked.add(sh.id):EX.checked.delete(sh.id)});
    sheets.appendChild(row)})}

function renderColPicker(showIf){
  const box=$("ex-cols");if(!box)return;
  const summaryOn=EX.fmt!=="xlsx"?(EX.csvPick==="summary"):EX.checked.has("summary");
  box.style.display=(showIf&&summaryOn)?"block":"none";
  if(!summaryOn)return;
  const sel=sumColsSel();
  box.innerHTML=`<div class="colpick-head">
      <span class="hlabel">${esc(tr("ex.columns"))}</span>
      <span class="cp-actions">
        <button type="button" class="tag bl" id="cp-all">✓ ${esc(tr("cp.all"))}</button>
        <button type="button" class="tag wn" id="cp-none">✕ ${esc(tr("cp.none"))}</button>
      </span></div>
    <div class="cp-grid">${SUM_COLS.map(c=>`
      <label class="sheetrow cp"><input type="checkbox" data-c="${c.id}"
        ${sel.has(c.id)?"checked":""}><span>${esc(tr(c.lk))}</span>
        <span class="cnt dir-ltr">${c.en}</span></label>`).join("")}</div>`;
  box.querySelectorAll("input[data-c]").forEach(inp=>{
    inp.addEventListener("change",()=>{
      inp.checked?sumColsSel().add(inp.dataset.c):sumColsSel().delete(inp.dataset.c);
      saveCols()})});
  const allB=box.querySelector("#cp-all"),noneB=box.querySelector("#cp-none");
  if(allB)allB.addEventListener("click",()=>{SUM_COLS.forEach(c=>sumColsSel().add(c.id));
    saveCols();renderColPicker(true)});
  if(noneB)noneB.addEventListener("click",()=>{
    SUM_COLS.forEach(c=>sumColsSel().delete(c.id));saveCols();renderColPicker(true)})}

function openExport(){
  EX.ctx=exContext();
  const m=$("ex-modal");if(!m)return;
  if(!EX.ctx){toast(tr("ex.none"));return}
  try{exRender()}catch(e){console.error("exRender:",e)}
  m.style.display="grid"}
function closeExport(){const m=$("ex-modal");if(m)m.style.display="none"}

async function exGenerate(){
  const ctx=EX.ctx;if(!ctx)return;
  const btn=$("ex-go");
  if(btn){btn.disabled=true;btn.textContent="⏳"}
  try{
    const selCols=sumColsSel();
    if(EX.fmt==="xlsx"){
      await new Promise(r=>setTimeout(r,30));
      let devRows=null;
      if(EX.checked.has("device")){
        devRows=(ctx.rows!==null&&ctx.rows!==undefined)?ctx.rows:
          (ctx.rowsOk?simulateRun(farmCfg(true)).rows:null);
        if(devRows&&devRows.length>500000)devRows=devRows.slice(0,500000)}
      const sheets=[];
      for(const sh of EX_SHEETS){
        if(sh.id==="device"){
          if(!EX.checked.has("device")||!devRows)continue;
          const capped=devRows.length>=500000;
          sheets.push({name:capped?"Raw device data (capped)":"Raw device data",
            rows:[["timestamp","flock_id","bird_id","sensor_id","age_day",
              "raw_weight_g","weight_g","feed_bin_kg","feed_delta_g",
              "temp_c","humidity","rssi"],...devRows],
            rtl:false,widths:[19,9,9,9,9,12,10,12,13,8,9,7]});
          continue}
        if(!EX.checked.has(sh.id))continue;
        let data=sh.id==="summary"?summaryRows(ctx.run.summaries,selCols)
          :(typeof sh.build==="function"?sh.build(ctx.run):null);
        if(!data)continue;
        const dynW=sh.id==="summary"?selCols.size+1:16;
        const widths={summary:Array(dynW).fill(11),
          birds:[9,8,16,8,8,9,12,13,11,9],
          design:[10,10,14,24],po:[6,10,10,12,10,11]}[sh.id];
        sheets.push({name:tr(sh.lk).slice(0,28),rows:data,widths})}
      if(!sheets.length){toast(tr("ex.none"));return}
      dl(`Arian_${CUR_STRAIN_KEY}_${EX.ctx.kind}_v1.xlsx`,
        xlsxBuild(sheets),XLSX_MIME);
      toast(tr("dyn.xlsxDone"));
    }else{
      const sh=EX_SHEETS.find(s=>s.id===EX.csvPick);if(!sh)return;
      let data=[],head="";
      if(sh.id==="device"){
        data=(ctx.rows!==null&&ctx.rows!==undefined)?ctx.rows:
          (ctx.rowsOk?simulateRun(farmCfg(true)).rows:[]);
        head="timestamp,flock_id,bird_id,sensor_id,age_day,raw_weight_g,weight_g,feed_bin_kg,feed_delta_g,temp_c,humidity,rssi"}
      else if(sh.id==="summary"){
        const t=summaryRows(ctx.run.summaries,selCols);
        head=t.shift().join(",");data=t}
      else{const t=typeof sh.build==="function"?sh.build(ctx.run)||[]:[];
        head=t.shift()||"";data=t}
      const guard=v=>{const st=String(v);
        return /^[=+@]|^-[^0-9.]/.test(st)?"'"+st:st};
      const csv=head+"\n"+data.map(r=>r.map(c=>guard(c)).join(",")).join("\n");
      dl(`Arian_${CUR_STRAIN_KEY}_${sh.id}.csv`,
        "\ufeff"+csv,"text/csv;charset=utf-8");
      toast(trf("dyn.records",{n:num(data.length)}))}
  }catch(e){console.error(e);toast("export error")}
  finally{const bt=$("ex-go");
    if(bt){bt.disabled=false;bt.textContent="⬇ "+tr("ex.generate")}
    closeExport()}
}
function bindExportCenter(){
  $("ex-close").addEventListener("click",closeExport);
  on("ex-back","click",closeExport);
  /* click on the dark overlay (outside the card) also cancels */
  document.querySelector("#ex-modal").addEventListener("click",e=>{
    if(e.target.id==="ex-modal")closeExport()});
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&document.getElementById("ex-modal").style.display!=="none")
      closeExport()});
  $("ex-go").addEventListener("click",exGenerate);
  $("ex-format").addEventListener("click",e=>{
    const b=e.target.closest("button[data-fmt]");if(!b)return;
    EX.fmt=b.dataset.fmt;
    document.querySelectorAll("#ex-format button").forEach(x=>
      x.classList.toggle("on",x===b));
    exRender()});
}


/* =====================================================================
   METHODOLOGY — live accuracy matrix per strain
   ===================================================================== */
function runMethodologyValidation(){
  const lbl=$("met-lbl"),tb=$("tb-met");
  lbl.textContent=tr("dyn.gen");tb.innerHTML="";
  setTimeout(()=>{
    const results=[];
    for(const[key,st]of Object.entries(STRAINS)){
      setStrain(key);
      const end=Math.min(60,st.maxDay);
      const run=simulateRun({ageStart:15,ageEnd:end,strain:key,seed:308});
      const pooled=poolByAge(run.summaries);
      const mae=maeVsPO(pooled);
      const fiSum=pooled.reduce((s,r)=>s+r.fi,0);
      const gain=pooled.at(-1).bw-pooled[0].bw;
      const fcrWin=fiSum/gain;
      let poFi=0;for(let i=IDX15;i<st.maxDay;i++)poFi+=(st.fiAsh[i]||0);
      const poGain=st.bwAsh[st.maxDay-1]-st.bwAsh[IDX15];
      const poFcr=poGain>0?poFi/poGain:0;
      const d42row=pooled.find(r=>r.age===Math.min(42,st.maxDay));
      const bw42=d42row?d42row.bw:0;
      const d42Age=Math.min(42,st.maxDay);
      const po42=poBW("ash",d42Age);
      const visits=run.summaries.reduce((s,x)=>s+x.visits/x.alive,0)/run.summaries.length;
      results.push({key,label:st.label,maxDay:st.maxDay,
        bw42:Math.round(bw42),po42:Math.round(po42),
        dev42:po42?100*(bw42-po42)/po42:0,
        fcr:fcrWin,poFcr,visits:Math.round(visits),mae})}
    tb.innerHTML="";
    for(const r of results){
      const devCls=Math.abs(r.dev42)<1.5?"ok":Math.abs(r.dev42)<3?"wn":"bd";
      tb.innerHTML+=`<tr>
        <td><b>${r.label}</b></td><td class="num">d${r.maxDay}</td>
        <td class="num">${en(r.bw42)}</td><td class="num">${en(r.po42)}</td>
        <td class="num" style="color:${r.dev42>=0?"var(--acc)":"var(--warn)"}">${r.dev42>=0?"+":""}${fx(r.dev42,1)}%</td>
        <td class="num">${fx(r.fcr,3)}</td><td class="num">${fx(r.poFcr,3)}</td>
        <td class="num">${en(r.visits)}</td>
        <td class="num"><span class="tag ${Math.abs(r.dev42)<2?"ok":"wn"}">${fx(r.mae,2)}%</span></td></tr>`}
    lbl.textContent="✅";
    setStrain(CUR_STRAIN_KEY); // restore
  },30)}
on("btn-met-run","click",()=>{runMethodologyValidation()});
on("btn-met-run","click",()=>{});

/* =====================================================================
   RESET — clear all cycle data
   ===================================================================== */
const RESET_CHARTS=["c-live-growth","c-live-cum","c-farm-growth","c-farm-fi",
  "c-insp","c-scn-growth","c-scn-fi"];

function resetAll(){
  lvStop(true);LV=null;
  ["l-day","l-date","l-bw","l-bwpo","l-fi","l-visits","l-busy","l-temp"].forEach(function(id){
    var e=$(id);if(e)e.textContent="\u2014"});
  var pg=$("pg");if(pg)pg.style.width="0%";
  var pl=$("pg-lbl");if(pl)pl.textContent=tr("dyn.ready");
  var pr=$("pg-rows");if(pr)pr.textContent="";
  var fd=$("feed");
  if(fd)fd.innerHTML='<span class="dm">// timestamp,flock_id,bird_id,sensor_id,age_day,raw_weight_g,weight_g,feed_bin_kg,feed_delta_g,temp_c,humidity,rssi</span>';
  ["dv-bird","dv-rssi","dv-w","dv-raw","dv-binval","dv-delta"].forEach(function(id){
    var e=$(id);if(e)e.textContent="\u2014"});
  var st=$("dv-status");if(st)st.textContent="";
  var gf=$("dv-gfill");if(gf)gf.style.height="74%";
  var gg=$("dv-gauge");if(gg)gg.classList.remove("low");
  farmStopLoop();FM=null;FMRAF=null;
  var pw=$("pens-wrap");if(pw)pw.innerHTML="";
  if($("fm-empty"))$("fm-empty").style.display="";
  tickerClear();
  ["fm-day","fm-hour","fm-env","insp-body"].forEach(function(id){
    var e=$(id);if(e)e.textContent="\u2014"});
  var it=$("insp-title");if(it)it.textContent=tr("farm.wholeFarm");
  var fp=$("fm-pg");if(fp)fp.style.width="0%";
  var fl=$("fm-lbl");if(fl)fl.textContent=tr("dyn.ready");
  var bo=$("bio-out");if(bo)bo.innerHTML="";
  var sr=$("scn-res");if(sr)sr.style.display="none";
  RESET_CHARTS.forEach(clearChart);
  // --- full zero: clear persisted experiment / cycles ---
  try{ localStorage.removeItem("rossim_exp"); }catch(e){}
  try{ localStorage.removeItem("rossim_cols"); }catch(e){}
  // backend: delete all cycles for current user (zero dashboard/exp/farm/sim)
  try{
    if(window.apiAuth){
      window.apiAuth("/api/cycles").then(function(list){
        var arr=Array.isArray(list)?list:(list.cycles||list.items||[]);
        if(!arr||!arr.length) return;
        var dels=arr.map(function(c){ var id=c.id||c.cycle_id; return window.apiAuth("/api/cycles/"+id,{method:"DELETE"}).catch(function(){}); });
        return Promise.all(dels);
      }).catch(function(){});
    }
  }catch(e){}
  // clear workspace stats display
  ["ws-n-cycles","ws-n-scenarios","ws-n-device"].forEach(function(id){ var e=$(id); if(e) e.textContent="0"; });
  // also clear device panel if present
  try{ if(window.clearDevicePanel) window.clearDevicePanel(); }catch(e){}
  runDashboard();repaintView(CUR_VIEW);
  toast(tr("dyn.resetDone"));
}
var resetArmed=0,resetTimer=null;
function bindReset(){
  var btn=$("btn-reset");if(!btn)return;
  // BUGFIX: the old flow overwrote the button's text with emoji,
  // destroying the icon+label children and reintroducing removed emoji.
  // Now the .armed class (red styling) is the only visual state.
  btn.addEventListener("click",function(){
    if(resetArmed){
      resetArmed=0;clearTimeout(resetTimer);
      btn.classList.remove("armed");
      if(window.MDialog){ MDialog.confirm({title:"بازنشانی کامل داده‌ها", message:"آیا از بازنشانی کامل اطمینان دارید؟\n\nتمام داده‌های داشبورد اعتبارسنجی، طرح آزمایش، نقشه فارم، شبیه‌سازی زنده و سناریوها برای حساب شما به‌طور کامل پاک خواهد شد و قابل بازگشت نیست.\nآیا ادامه می‌دهید؟", icon:"danger", danger:true, confirmText:"بازنشانی", cancelText:"انصراف"}).then(function(ok){ if(!ok){ toast("لغو شد"); return; } resetAll(); }); } else { var ok=confirm("آیا از بازنشانی کامل اطمینان دارید؟"); if(!ok){ toast("لغو شد"); return; } resetAll(); }
    }else{
      resetArmed=1;btn.classList.add("armed");
      toast(tr("dyn.resetArmed"));
      resetTimer=setTimeout(function(){
        resetArmed=0;btn.classList.remove("armed");
      },3000);
    }
  });
}
on("btn-exp-defaults","click",function(){
  expPresetApply("std");
  toast(tr("dyn.designReset"));
});

/* ---------------- init ---------------- */
document.addEventListener("keydown",e=>{
  if(!e.key||e.key.toLowerCase()!=="t"||e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target;
  if(t&&(t.tagName==="INPUT"||t.tagName==="SELECT"||t.tagName==="TEXTAREA"||t.isContentEditable))return;
  setTheme(THEME==="dark"?"light":"dark")});
document.addEventListener("DOMContentLoaded",()=>{
  expLoad();initStrain();bindLang();bindTheme();applyLang();scnFill();
  bindReset();bindHeaderResize();bindExportCenter();bindTour();bindSettingsDropdown();
  markTabs();
  document.documentElement.setAttribute("data-theme",THEME==="light"?"light":"dark");
  refreshChartTheme();
  startClock();
  $("fm-lbl").textContent=tr("dyn.ready");
  if($("fm-empty"))$("fm-empty").style.display="";
  if(window.requestIdleCallback) requestIdleCallback(runDashboard, {timeout:500}); else setTimeout(runDashboard,40);
  if(document.fonts&&document.fonts.ready)
    document.fonts.ready.then(()=>setTimeout(()=>repaintView(CUR_VIEW),80));
  /* sync settings info after dashboard runs */
  setTimeout(syncSettingsInfo,120);});

/* ===== Live clock in topbar (Shamsi date + HH:MM:SS) ===== */
function startClock(){
  var elD=$("tc-date"), elT=$("tc-time");
  if(!elD||!elT) return;
  function tick(){
    var now=new Date();
    try{
      var dh=document.getElementById("dhead-clock");
      if(dh){
        var dTxt="", tTxt=now.toLocaleTimeString((typeof LANG!=="undefined"&&LANG==="fa")?"fa-IR":"en-US",{hour:"2-digit",minute:"2-digit"});
        if(typeof window.formatDate==="function") dTxt=window.formatDate(now,{longMonth:false});
        else if(window.Shamsi && typeof window.Shamsi.toShamsi==="function" && (typeof LANG==="undefined"||LANG==="fa")) dTxt=window.Shamsi.toShamsi(now,{longMonth:false});
        else dTxt=now.toLocaleDateString((typeof LANG!=="undefined"&&LANG==="fa")?"fa-IR":"en-US",{year:"numeric",month:"2-digit",day:"2-digit"});
        dh.textContent=dTxt+" · "+tTxt;
      }
    }catch(e){}
    try {
      if(typeof window.formatDate==="function"){
        elD.textContent=window.formatDate(now,{longMonth:false});
      } else if(window.Shamsi && typeof window.Shamsi.toShamsi==="function" && (typeof LANG==="undefined" || LANG==="fa")){
        elD.textContent=window.Shamsi.toShamsi(now,{longMonth:false});
      } else {
        elD.textContent=now.toLocaleDateString(LANG==="fa"?"fa-IR":"en-US",
          {year:"numeric",month:"2-digit",day:"2-digit"});
      }
    } catch(e){
      elD.textContent=now.toLocaleDateString("fa-IR",{year:"numeric",month:"2-digit",day:"2-digit"});
    }
    var timeStr=String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0")+":"+String(now.getSeconds()).padStart(2,"0");
    try{ elT.textContent=(typeof window.formatTime==="function"?window.formatTime(now):timeStr); }catch(e){ elT.textContent=timeStr; }
  }
  tick();
  setInterval(tick,1000);
  // refresh on language change: i18n setLang already repaints, but force tick
  window.addEventListener("rossim:lang", tick);
}
