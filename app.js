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
  if(el)el.addEventListener(ev,fn);else console.warn("[BroilerLab] missing #"+id)}
const fa=(v,d=0)=>num(v,d); // locale-aware via i18n.js (fa digits | latin)
const en=v=>Math.round(v).toLocaleString("en-US");
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
function refreshChartTheme(){
  const cs=getComputedStyle(document.documentElement);
  CT.grid=(cs.getPropertyValue("--chart-grid")||"").trim()||CT.grid;
  CT.label=(cs.getPropertyValue("--chart-label")||"").trim()||CT.label}
function rr(x,x0,y0,w,h,r){r=Math.max(0,Math.min(r,h/2,w/2));x.beginPath();
  x.moveTo(x0+r,y0);x.arcTo(x0+w,y0,x0+w,y0+h,r);x.arcTo(x0+w,y0+h,x0,y0+h,r);
  x.arcTo(x0,y0+h,x0,y0,r);x.arcTo(x0,y0,x0+w,y0,r);x.closePath()}
function chart(id,cfg){CH[id]=cfg;const cv=$(id);if(cv&&!cv._hover){cv._hover=1;bindHover(cv)}paint(id)}
function paint(id){
  const cfg=CH[id],cv=$(id);if(!cfg||!cv)return;
  const box=cv.parentElement;if(!box||!box.offsetWidth)return;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const w=box.clientWidth,h=box.clientHeight;
  if(w<40||h<40)return;
  cv.width=w*dpr;cv.height=h*dpr;cv.style.width=w+"px";cv.style.height=h+"px";
  const x=cv.getContext("2d");x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);
  const S=cfg.series||[];
  let n=cfg.n||0;S.forEach(s=>n=Math.max(n,s.y.length));
  if(cfg.band)n=Math.max(n,cfg.band.hi.length,cfg.band.lo.length);
  if(!n)return;
  const P={l:47,r:14,t:12,b:cfg.labels?26:18};
  const ys=[];S.forEach(s=>s.y.forEach(v=>{if(v!=null&&isFinite(v))ys.push(v)}));
  if(cfg.band)[...cfg.band.hi,...cfg.band.lo].forEach(v=>{if(v!=null)ys.push(v)});
  (cfg.refLines||(cfg.refLine?[cfg.refLine]:[])).forEach(r=>ys.push(r.v));
  if(!ys.length)return;
  let mn=Math.min(...ys),mx=Math.max(...ys);
  if(cfg.type==="bar"||cfg.zeroBase)mn=Math.min(0,mn);
  if(cfg.min!=null)mn=Math.min(mn,cfg.min);
  if(mx===mn)mx=mn+1;
  const span=(mx-mn);mn-=span*.08;mx+=span*.08;
  const X=i=>P.l+(w-P.l-P.r)*(n<2?.5:i/(n-1));
  const Y=v=>h-P.b-(h-P.t-P.b)*(v-mn)/(mx-mn);
  /* shaded index zones */
  (cfg.shades||[]).forEach(s=>{x.fillStyle=s.c;
    const sw=(w-P.l-P.r)/n;
    x.fillRect(P.l+s.from*sw,P.t,(s.to-s.from+1)*sw,h-P.t-P.b)});
  /* grid */
  const yF=cfg.yFmt||(v=>en(v));
  x.strokeStyle=CT.grid;x.fillStyle=CT.label;
  x.font="10px Vazirmatn,Tahoma,sans-serif";
  for(let g=0;g<=4;g++){const v=mn+(mx-mn)*g/4,y=Y(v);
    x.beginPath();x.moveTo(P.l,y);x.lineTo(w-P.r,y);x.stroke();
    x.textAlign="left";x.fillText(yF(v),5,y+3)}
  /* band between lo..hi */
  if(cfg.band){x.beginPath();let st=false;
    for(let i=0;i<n;i++){const v=cfg.band.hi[i];if(v==null){continue}
      st?x.lineTo(X(i),Y(v)):(x.moveTo(X(i),Y(v)),st=true)}
    for(let i=n-1;i>=0;i--){const v=cfg.band.lo[i];if(v==null)continue;x.lineTo(X(i),Y(v))}
    x.closePath();x.fillStyle=cfg.band.c;x.fill()}
  /* series */
  S.forEach(s=>{
    if(cfg.type==="bar"){
      const bw=(w-P.l-P.r)/n;
      s.y.forEach((v,i)=>{if(v==null)return;
        const bx=P.l+i*bw+bw*.17,bwid=bw*.66,y0=Y(0),y1=Y(v);
        x.fillStyle=s.c;x.globalAlpha=s.a??.85;
        rr(x,bx,Math.min(y0,y1),bwid,Math.abs(y1-y0)||1,Math.min(5,bwid/3));
        x.fill();x.globalAlpha=1});
    }else{
      x.strokeStyle=s.c;x.lineWidth=s.w||(s.dash?1.5:2.4);
      x.setLineDash(s.dash?[6,4]:[]);
      x.beginPath();let st=false,firstX=0,lastX=0;
      s.y.forEach((v,i)=>{if(v==null||!isFinite(v))return;
        const px=X(i),py=Y(v);
        st?x.lineTo(px,py):(x.moveTo(px,py),st=true,firstX=px);lastX=px});
      x.stroke();x.setLineDash([]);
      if(s.fill&&st){x.lineTo(lastX,Y(Math.max(0,mn)));x.lineTo(firstX,Y(Math.max(0,mn)));
        x.closePath();
        const g=x.createLinearGradient(0,P.t,0,h);
        g.addColorStop(0,s.c+"3d");g.addColorStop(1,s.c+"04");
        x.fillStyle=g;x.fill()}
    }});
  /* reference lines */
  (cfg.refLines||(cfg.refLine?[cfg.refLine]:[])).forEach(r=>{
    const y=Y(r.v);x.strokeStyle=r.c||"#f59e0b";x.setLineDash([6,4]);x.lineWidth=1.4;
    x.beginPath();x.moveTo(P.l,y);x.lineTo(w-P.r,y);x.stroke();x.setLineDash([]);
    if(r.label){x.fillStyle=r.c||"#f59e0b";x.font="10px Vazirmatn,Tahoma,sans-serif";
      x.textAlign="left";x.fillText(r.label,P.l+5,y-5)}});
  /* x labels */
  if(cfg.labels){x.fillStyle=CT.label;x.textAlign="center";
    x.font="10px Vazirmatn,Tahoma,sans-serif";
    const step=Math.max(1,Math.round(n/9));
    cfg.labels.forEach((lb,i)=>{if(i%step===0)x.fillText(lb,X(i),h-7)})}
  cv._geo={P,n};
}
function bindHover(cv){
  cv.addEventListener("mousemove",ev=>{
    const cfg=CH[cv.id],geo=cv._geo;if(!cfg||!geo)return;
    const rect=cv.getBoundingClientRect(),lx=ev.clientX-rect.left;
    const {P,n}=geo;
    const i=clamp(Math.round((lx-P.l)/((rect.width-P.l-P.r)/Math.max(1,n-1))),0,n-1);
    let html="";
    const title=cfg.hoverTitle?cfg.hoverTitle(i):(cfg.labels?cfg.labels[i]:null);
    if(title!=null&&title!=="")html+=`<b class="t">${title}</b>`;
    (cfg.series||[]).forEach(s=>{
      const v=s.y[i];if(v==null||!isFinite(v))return;
      const fm=s.fmt||cfg.vFmt||(vv=>en(vv));
      html+=`<div class="row"><span class="dt" style="background:${s.c}"></span>${s.name||""}<b>${fm(v)}</b></div>`});
    if(!html)return;
    tipEl.innerHTML=html;tipEl.style.display="block";
    const tw=tipEl.offsetWidth,th=tipEl.offsetHeight;
    let px=ev.clientX+16;if(px+tw>innerWidth-8)px=ev.clientX-tw-14;
    let py=ev.clientY+16;if(py+th>innerHeight-8)py=ev.clientY-th-12;
    tipEl.style.left=px+"px";tipEl.style.top=py+"px";
  });
  cv.addEventListener("mouseleave",()=>{tipEl.style.display="none"});
}
function repaintView(vid){
  const sec=$(vid);if(!sec||!sec.classList.contains("on"))return;
  sec.querySelectorAll("canvas").forEach(cv=>{if(CH[cv.id])paint(cv.id)})}

/* =====================================================================
   TABS
   ===================================================================== */
let CUR_VIEW="v-dash";
if($("mainnav"))$("mainnav").setAttribute("role","tablist");
function markTabs(){document.querySelectorAll(".tab").forEach(b=>{
  b.setAttribute("role","tab");b.setAttribute("aria-controls",b.dataset.v);
  b.setAttribute("aria-selected",b.classList.contains("on")?"true":"false")})}
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(b=>{b.classList.remove("on");b.setAttribute("aria-selected","false")});
    document.querySelectorAll("section.view").forEach(s=>s.classList.remove("on"));
    btn.classList.add("on");btn.setAttribute("aria-selected","true");
    CUR_VIEW=btn.dataset.v;$(CUR_VIEW).classList.add("on");
    requestAnimationFrame(()=>requestAnimationFrame(()=>repaintView(CUR_VIEW)));
  })});

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
  $("k-bw-dev").textContent=(devEnd>=0?"+":"")+devEnd.toFixed(1)+"%";
  $("k-mae").textContent=mae.toFixed(2)+"%";
  $("db-strain").textContent=LI(STRAINS[CUR_STRAIN_KEY].label)+" · "+LI(STRAINS[CUR_STRAIN_KEY].breeder);
  $("db-guide").textContent=LI(STRAINS[CUR_STRAIN_KEY].guide);
  $("k-fcr").textContent=fcrWin.toFixed(3);
  $("k-fcr-po").textContent=poWinFCR().toFixed(3);
  $("k-visits").textContent=en(Math.round(vMean));
  $("k-vrange").textContent=`${en(Math.round(vP5))}–${en(Math.round(vP95))}`;
  $("ms-deaths").textContent=fa(run.deaths.length);
  $("ms-fills").textContent=fa(run.fills.length);
  $("ms-ovl").textContent=fa(ovlTotal);
  $("ms-rows").textContent=fa(run.rowEstimate);
  $("h-mae").textContent=mae.toFixed(2)+"%";
  $("h-rows").textContent=fa(run.rowEstimate);

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
    refLines:[{v:poWinFCR(),label:"PO "+poWinFCR().toFixed(3),c:"#f59e0b"}],
    min:0,zeroBase:true,labels:penIds,vFmt:v=>(+v).toFixed(2),
    hoverTitle:i=>`${penIds[i]} (n=${PENS_CFG[penIds[i]].n})`});
  $("fcr-note").innerHTML=trf("fcr.note",{lo:Math.min(...fcrs).toFixed(3),
    hi:Math.max(...fcrs).toFixed(3),worst:worst,peak:Math.max(...busyPeaks).toFixed(0)});

  const dtot=run.diurnal.reduce((a,b)=>a+b,0)||1;
  const shares=run.diurnal.map(g=>100*g/dtot);
  chart("c-diurnal",{type:"bar",
    series:[{y:shares,c:"#8b5cf6",name:tr("lg.hourShare")}],
    labels:Array.from({length:24},(_,h)=>String(h)),
    shades:[{from:0,to:L_ON-1,c:"rgba(20,27,43,.75)"},{from:L_OFF,to:23,c:"rgba(20,27,43,.75)"}],
    zeroBase:true,vFmt:v=>v.toFixed(1)+"%",hoverTitle:i=>String(i)});

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
        <b class="num" style="width:48px;text-align:left;font-size:12px">${bp.toFixed(0)}%</b>
        <span class="dm" style="font-size:10.5px;width:74px">${tr("st.ovlShort")}: ${num(ovl)}</span>
        <span class="tag ${cls}">${verdict}</span></div>`}).join("");
  $("st-list").innerHTML=stRows;

  $("tb-val").innerHTML=pooled.map(r=>{
    const dev=100*(r.bw-poBW("ash",r.age))/poBW("ash",r.age);
    const cls=Math.abs(dev)<1.5?"ok":Math.abs(dev)<3?"wn":"bd";
    return `<tr><td>${fa(r.age)}</td><td class="num">${en(r.bw)}</td><td class="num">${en(poBW("ash",r.age))}</td>
      <td class="num" style="color:${dev>=0?'var(--acc)':'var(--warn)'}">${dev>=0?"+":""}${dev.toFixed(1)}%</td>
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
  $("l-day").textContent=(LANG==="fa"?"روز ":"Day ")+num(s.age);
  $("l-date").textContent=s.date;
  animNum($("l-bw"),s.meanBW,v=>en(v));
  $("l-bwpo").textContent=en(poBW("ash",s.age));
  $("l-temp").textContent=s.temp.toFixed(1);
  $("l-fi").textContent=en(s.fiPerBird);
  $("l-visits").textContent=en(Math.round(s.visits/s.alive));
  const b=$("l-busy");b.textContent=s.busyPct.toFixed(0)+"%";
  b.className="v "+(s.busyPct>=95?"bad":s.busyPct>=75?"org":"acc");
  $("pg").style.width=(100*LV.di/Math.max(1,LV.run.summaries.length))+"%";
  $("pg-lbl").textContent=trf("dyn.running",{pen:LV.pen,day:fa(s.age),date:s.date});
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
  $("dv-bird").textContent=bid||(LANG==="fa"?"؟؟؟":"???");
  $("dv-rssi").textContent=rssi;
  $("dv-w").textContent=w;$("dv-raw").textContent=raw;
  $("dv-binval").textContent=(+bin).toFixed(2);
  $("dv-delta").textContent=delta;
  const pct=clamp(100*bin/25,2,100);
  $("dv-gfill").style.height=pct+"%";
  $("dv-gauge").classList.toggle("low",bin<4);
  ["d-rfid","d-scale","d-bin"].forEach((id,i)=>{
    const el=$(id);el.classList.add("lit");
    clearTimeout(el._lt);el._lt=setTimeout(()=>el.classList.remove("lit"),480+i*90)});
  $("dv-status").textContent=(LANG==="fa"?"روز ":"Day ")+num(r[4])+" · "+LI(String(r[0]).slice(11))+
    " · 🌡"+LI(tp+"°C")+" · 💧"+LI(hm+"%")+" · "+(bid?tr("dyn.visitOk"):tr("dyn.readFail"));
}
function feedAppend(r){
  const feedEl=$("feed");
  const div=document.createElement("span");div.className="r flash";
  const [,fk,bid,sen,age,raw,w,bin,delta,tp,hm,rssi]=r;
  div.textContent="";
  div.innerHTML=`${r[0]} <span class="dm">${fk}</span> <span class="${bid?"id":"pos"}">${bid||"??"}</span> ${sen} ${age} ${raw} <b>${w}</b> <span class="neg">${(+bin).toFixed(2)}</span> <span class="neg">${delta}</span> ${tp} ${hm} <span class="dm">${rssi}</span>`;
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
    bw:en(LV.bws.at(-1)),fcr:fcr.toFixed(3)});
  $("pg-rows").textContent=trf("dyn.records",{n:fa(LV.allRows.length)});
  toast(trf("dyn.done",{rows:fa(LV.allRows.length),bw:en(LV.bws.at(-1)),fcr:fcr.toFixed(3)}));
  lvSetBtns()}
function lvStop(silent){
  clearTimeout(LVT);LVT=null;
  if(LV)LV.done=true;LV_PAUSED=false;
  $("btn-pause").textContent=(LANG==="fa"?"⏸ توقف موقت":"⏸ Pause");
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
  el.textContent=(dB>=0?"+":"")+dB.toFixed(0)+" g ("+(dBp>=0?"+":"")+dBp.toFixed(1)+"%)";
  el.className="v "+(dB>=0?"acc":"bad");
  $("d-bw-sub").textContent=(LANG==="fa"?"پایه: ":"base: ")+en(endB)+" g → "+en(endS)+" g";
  $("d-dip").textContent="-"+dipP.toFixed(1)+"%";
  $("d-dip-sub").textContent=trf("scn.dipSub",{age:num(dipAge)});
  const fB=fcrW(base),fS=fcrW(scn);
  $("d-fcr").textContent=`${fB.toFixed(3)} → ${fS.toFixed(3)}`;
  $("d-fcr").className="v blue";
  const fcrU=$("d-fcr").nextElementSibling;
  if(fcrU)fcrU.textContent=tr(mode==="heat"?"scn.fcrSub":"scn.dBusy");
  const wp=worstPen(base);
  const pkB=Math.max(...base.perPen[wp].busy),pkS=Math.max(...scn.perPen[wp].busy);
  $("d-busy").textContent=pkB.toFixed(0)+"% → "+pkS.toFixed(0)+"%";
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
      <td class="num" style="color:${dp>=0?'var(--acc)':'var(--warn)'}">${dp>=0?"+":""}${dp.toFixed(1)}%</td>
      <td class="num">${fB2.toFixed(3)}</td><td class="num">${fS2.toFixed(3)}</td>
      <td class="num">${pB.toFixed(0)}%</td><td class="num">${pS.toFixed(0)}%</td></tr>`}).join("");

  if(mode==="heat"){
    $("scn-note").innerHTML=trf("scn.noteHeat",{label,dip:dipP.toFixed(1),
      age:num(dipAge),dir:dBp<0?(LANG==="fa"?"پایین‌تر از پایه ":"lower than baseline ")
        :(LANG==="fa"?"بالاتر از پایه ":"higher than baseline "),
      dbw:Math.abs(dBp).toFixed(1)});
  }else{
    const ovB=base.summaries.reduce((s,x)=>s+x.overlap,0);
    const ovS=scn.summaries.reduce((s,x)=>s+x.overlap,0);
    $("scn-note").innerHTML=trf("scn.noteStn",{label,from:pkB.toFixed(0),
      to:pkS.toFixed(0),ovlB:fa(ovB),ovlS:fa(ovS)});
  }
  $("scn-res").style.display="block";
  requestAnimationFrame(()=>requestAnimationFrame(()=>repaintView("v-scn")));
  toast(tr("dyn.scnDone"));
});

/* =====================================================================
   INIT
   ===================================================================== */
let rzT=null;
window.addEventListener("resize",()=>{clearTimeout(rzT);
  rzT=setTimeout(()=>repaintView(CUR_VIEW),140)});
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

function summaryRows(summaries,sel){
  const cols=(sel&&sel.size)?SUM_COLS.filter(c=>sel.has(c.id)):SUM_COLS;
  const labelOf=t=>(TREATMENTS[t]&&TREATMENTS[t].labelEn)||t;
  const getters={pen:s=>s.pen,treatment:s=>labelOf(s.treat),age_day:s=>s.age,
    n_alive:s=>s.alive,mean_bw_g:s=>+s.meanBW.toFixed(1),
    fi_per_bird_g:s=>+s.fiPerBird.toFixed(1),fi_po_g:s=>s.fiPerBirdPo,
    visits_total:s=>s.visits,visits_per_bird:s=>+(s.visits/s.alive).toFixed(1),
    busy_pct:s=>+s.busyPct.toFixed(1),overlap_events:s=>s.overlap,
    bin_refills:s=>s.refills,bin_end_kg:s=>s.binEnd,
    temp_c:s=>+s.temp.toFixed(1),humidity_pct:s=>+s.hum.toFixed(1)};
  const head=["date",...cols.map(c=>c.en)];
  return [head,
    ...summaries.map(s=>[...cols.map(c=>{
      const g=getters[c.id];
      return c.id==="pen"?s.pen:g(s)})])]}
function deviceRows(rows){return [
  ["timestamp","flock_id","bird_id","sensor_id","age_day","raw_weight_g","weight_g",
   "feed_bin_kg","feed_delta_g","temp_c","humidity","rssi"],
  ...rows]}
function designRows(meta){return [
  ["pen_id","n_birds","treatment_key","treatment_label"],
  ...meta.map(p=>[p.pid,p.n,p.treat,trTreat(p.treat)])]}
function poSheetRows(){return [
  ["day","bw_ash_g","fi_ash_g","fcr_ash","bw_male_g","bw_female_g"],
  ...(()=>{const P=PO(),rows=[];
    for(let d=1;d<=P.maxDay;d++)rows.push([d,P.bwAsh[d-1],P.fiAsh[d-1],
      P.fcrAsh[d-1],P.bwM[d-1],P.bwF[d-1]]);
    return rows})()]}
function birdsSheetRows(run){
  if(!run.birdsDaily||!run.birdsDaily.length)return null;
  const last=new Map();
  for(const x of run.birdsDaily)last.set(x.id,x);
  const dead=new Set(run.deaths.map(d=>d.id));
  const rows=[["tag","pen","treatment","sex","cv_pct","age_day","final_bw_g",
    "cum_intake_g","window_fcr","status"]];
  const sorted=[...last.entries()].sort((a,b)=>
    a[1].pen.localeCompare(b[1].pen)||a[0].localeCompare(b[0]));
  for(const[id,x]of sorted){
    const fcr=x.fi/Math.max(60,x.bw-45);
    rows.push([id,x.pen,TREATMENTS[x.treat]?TREATMENTS[x.treat].label:x.treat,
      x.sex==="m"?"male":"female",+(x.cv*100).toFixed(1),x.age,Math.round(x.bw),
      Math.round(x.fi),+fcr.toFixed(3),dead.has(id)?"dead":"alive"])}
  return rows}
function buildWorkbook(run,extraRows){
  const sheets=[{name:"Daily summary",rows:summaryRows(run.summaries),
    widths:[11,7,15,8,9,10,12,10,10,13,9,13,11,10,8,12]}];
  let rows=extraRows||run.rows;
  const MAXDEV=500000;
  if(rows&&rows.length){
    let cut=false;
    if(rows.length>MAXDEV){rows=rows.slice(0,MAXDEV);cut=true}
    const dr=deviceRows(rows);
    if(cut)dr.push(["… truncated (row limit)", "", "", "", "", "", "", "", "", "", "", ""]);
    sheets.push({name:"Raw device data",rows:dr,rtl:false,
      widths:[19,9,9,9,9,12,10,12,13,8,9,7]})}
  const br=birdsSheetRows(run);
  if(br)sheets.push({name:"Per-bird records",rows:br,
    widths:[9,8,16,8,8,9,12,13,11,9]});
  const dr=designRows(run.pensMeta);
  dr.splice(1,0,["strain",CUR_STRAIN_KEY,STRAINS[CUR_STRAIN_KEY].breeder,
    STRAINS[CUR_STRAIN_KEY].guide]);
  sheets.push({name:"Trial design",rows:dr,widths:[10,10,14,24]});
  sheets.push({name:"Reference PO",rows:poSheetRows(),rtl:false,widths:[6,10,12,12]});
  return xlsxBuild(sheets)}

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
function expTotals(){return EXP.pens.reduce((s,p)=>s+p.n,0)}
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
on("btn-goto-exp","click",()=>{document.querySelector('.tab[data-v="v-exp"]').click()});
on("btn-exp-farm","click",()=>{
  document.querySelector('.tab[data-v="v-farm"]').click();
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
  $("fm-day").textContent=(LANG==="fa"?"روز ":"Day ")+num(curAge());
  $("fm-hour").textContent=String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
  $("fm-pg").style.width=((FM.di+FM.clock/86400)/fmCycle()*100).toFixed(1)+"%";
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
  $("fm-env").textContent=`🌡 ${temp.toFixed(1)}°C · 💧 ${hum.toFixed(0)}%`;
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
    hoverTitle:i=>(LANG==="fa"?"روز ":"day ")+H.ages[i]});
  $("lg-farm-growth").innerHTML=Object.entries(H.t).map(([k])=>
    `<span class="lg"><span class="sw" style="background:${TREATMENTS[k].color}"></span>${trTreat(k)}</span>`).join("")+
    `<span class="lg"><span class="sw" style="background:#8b96ad"></span>PO</span>`;
  chart("c-farm-fi",{labels:H.ages.map(a=>"d"+a),
    series:Object.entries(H.t).map(([k,v])=>({y:v.fi,c:TREATMENTS[k].color,name:trTreat(k),w:2.2})),
    hoverTitle:i=>(LANG==="fa"?"روز ":"day ")+H.ages[i]});
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
      [tr("bird.cv"),"±"+(lastS.cv*100).toFixed(1)+"%"],
      [tr("bird.status"),dead?'<span class="tag bd">'+tr("bird.dead")+'</span>'
                            :'<span class="tag ok">'+tr("bird.alive")+'</span>'],
      [tr("bird.bwNow"),`<b>${en(Math.round(lastS.bw))}</b> g <small class="${dev>=0?"acc":"org"}">(${dev>=0?"+":""}${dev.toFixed(1)}% ${tr("insp.vsPO")})</small>`],
      [tr("bird.fiTotal"),`<b>${en(Math.round(lastS.fi))}</b> g`],
      [tr("bio.fcr"),`<b>${fcrB.toFixed(2)}</b>`]];
    chart("c-insp",{labels:snaps.map(x=>"d"+x.age),min:0,
      series:[{y:snaps.map(x=>x.bw),c:trObj.color,fill:true,name:"BW"},
              {y:snaps.map(x=>poSex(x.age)),c:"#8b96ad",dash:true,w:1.4,name:"PO"}],
      hoverTitle:i=>(LANG==="fa"?"روز ":"day ")+snaps[i].age,yFmt:v=>en(v)});
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
      [tr("insp.meanBw"),`<b>${en(Math.round(s.meanBW))}</b> g <small class="${dev>=0?"acc":"org"}">(${dev>=0?"+":""}${dev.toFixed(1)}% ${tr("insp.vsPO")})</small>`],
      [tr("insp.fiToday"),`<b>${en(Math.round(s.fiPerBird))}</b> g`],
      [tr("insp.visitsToday"),num(s.visits)+` (${num(Math.round(s.visits/s.alive))}${tr("insp.perBird")})`],
      [tr("sim.busy"),`<b>${num(Math.round(s.busyPct))}%</b>`],
      [tr("insp.bin"),`${s.binEnd.toFixed(2)} kg`],
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
      [tr("insp.farmBw"),`<b>${en(Math.round(bwAvg))}</b> g <small class="${dev>=0?"acc":"org"}">(${dev>=0?"+":""}${dev.toFixed(1)}% ${tr("insp.vsPO")})</small>`],
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
  const sel=$("strain-sel");
  sel.innerHTML=Object.entries(STRAINS).map(([k,s])=>`<option value="${k}">${s.label}</option>`).join("");
  sel.value=CUR_STRAIN_KEY;setStrain(CUR_STRAIN_KEY);
  $("in-age1").max=STRAINS[CUR_STRAIN_KEY].maxDay;
  sel.addEventListener("change",()=>{
    CUR_STRAIN_KEY=sel.value;setStrain(sel.value);
    try{localStorage.setItem("rossim_strain",sel.value)}catch(e){}
    const md=STRAINS[sel.value].maxDay;
    $("in-age1").max=md;
    ["in-age0","in-age1"].forEach(id=>{const el=$(id);
      if(el&&+el.value>md)el.value=md});
    strainBanner();expMarkStale();
    runDashboard();
    toast(tr("dash.active")+" "+STRAINS[sel.value].label)});
  strainBanner()}
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
  if(d){d.classList.toggle("on",THEME==="dark");
    d.setAttribute("aria-pressed",THEME==="dark"?"true":"false")}
  if(l){l.classList.toggle("on",THEME==="light");
    l.setAttribute("aria-pressed",THEME==="light"?"true":"false")}}
function setTheme(t){
  if(THEME===t)return;THEME=t;
  try{localStorage.setItem("rossim_theme",t)}catch(e){}
  document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark");
  refreshChartTheme();applyThemeButtons();
  requestAnimationFrame(()=>requestAnimationFrame(()=>repaintView(CUR_VIEW)))}
/* ---------------- header drawer (tablet & below) ---------------- */
function drawerOpen(){return document.querySelector(".hctl")?.classList.contains("open")}
function openDrawer(){
  const hc=document.querySelector(".hctl"),bd=$("backdrop"),bg=$("nav-burger");
  if(!hc)return;
  hc.classList.add("open");if(bd)bd.classList.add("on");
  document.body.classList.add("drawer-open");
  if(bg)bg.setAttribute("aria-expanded","true");
  document.body.style.overflow="hidden"}
function closeDrawer(){
  const hc=document.querySelector(".hctl"),bd=$("backdrop"),bg=$("nav-burger");
  if(!hc)return;
  hc.classList.remove("open");if(bd)bd.classList.remove("on");
  document.body.classList.remove("drawer-open");
  if(bg)bg.setAttribute("aria-expanded","false");
  document.body.style.overflow=""}
function bindDrawer(){
  on("nav-burger","click",()=>drawerOpen()?closeDrawer():openDrawer());
  on("backdrop","click",closeDrawer);
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&drawerOpen())closeDrawer()});
  /* auto-close after choosing something inside the drawer */
  on("drawer-close","click",closeDrawer);
  let rw=innerWidth;
  window.addEventListener("resize",()=>{
    if(innerWidth>992&&drawerOpen())closeDrawer();
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
      <td class="num">${m.toFixed(2)} ± ${sd.toFixed(2)}</td>
      <td class="num">${e.toFixed(3)}</td>
      <td class="num">[${ci[0].toFixed(2)}, ${ci[1].toFixed(2)}]</td></tr>`}
  html+="</tbody></table></div>";
  /* anova */
  const av=BioStat.anova(keys.map(k=>groups[k]));
  if(av){
    html+=`<div class="note" style="margin-top:11px"><b>${tr("bio.anovaTitle")}:</b> `+
      trf("bio.anovaLine",{dfB:av.dfB,dfW:av.dfW,F:av.F.toFixed(2),
        p:av.p<.001?av.p.toExponential(1):av.p.toFixed(4),eta2:av.eta2.toFixed(3)})+
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
        html+=`<td>${pr.p<.001?"<0.001":pr.p.toFixed(3)} ${star}</td>`}
      html+="</tr>"}
    html+="</tbody></table>"}
  html+=`<div class="methtext" style="margin-top:9px">${tr("bio.method")}</div>`;
  out.innerHTML=html}
on("btn-bio-run","click",runBioStats);
function renderBioIfReady(){if($("bio-out").innerHTML)runBioStats()}

/* =====================================================================
   GUIDED TOUR — first-run animated walkthrough
   ===================================================================== */
const TOUR_STEPS=[
  {sel:null,title:"tour.welcomeT",text:"tour.welcomeP"},
  {sel:"#mainnav",title:"tour.navT",text:"tour.navP"},
  {sel:".hgroup:nth-of-type(1)",title:"tour.strainT",text:"tour.strainP"},
  {sel:".hgroup:nth-of-type(3)",title:"tour.langT",text:"tour.langP"},
  {sel:"#btn-reset",title:"tour.resetT",text:"tour.resetP"},
  {sel:null,done:true,title:"tour.doneT",text:"tour.doneP"}];
let TOUR={i:0,active:false,pending:false};
function prefersReduced(){return window.matchMedia &&
  matchMedia("(prefers-reduced-motion: reduce)").matches}
function tourClearSpot(){
  document.querySelectorAll(".tour-spot").forEach(e=>e.classList.remove("tour-spot"));
  const sh=$("tour-shade");if(sh)sh.classList.remove("on");
  const tip=$("tour-tip");if(tip)tip.style.display="none"}
function tourPlaceTip(rect){
  const tip=$("tour-tip");if(!tip)return;
  tip.style.display="block";
  const tw=tip.offsetWidth||320,th=tip.offsetHeight||160;
  let x,y;
  if(!rect){x=(innerWidth-tw)/2;y=(innerHeight-th)/2}
  else{
    x=clamp(rect.left+rect.width/2-tw/2,10,innerWidth-tw-10);
    y=rect.bottom+12;
    if(y+th>innerHeight-10)y=Math.max(10,rect.top-th-12)}
  tip.style.left=x+"px";tip.style.top=y+"px"}
function tourShow(i){
  if(i>=TOUR_STEPS.length){tourEnd(true);return}
  if(i<0)i=0;
  TOUR.i=i;tourClearSpot();
  const st=TOUR_STEPS[i];
  $("tt-step").textContent=(i+1)+"/"+TOUR_STEPS.length;
  $("tt-title").textContent=tr(st.title);
  $("tt-text").textContent=tr(st.text);
  $("tt-next").textContent=st.done?tr("tour.finish"):("› "+tr("tour.next"));
  $("tt-prev").style.visibility=i===0?"hidden":"visible";
  $("tt-skip").textContent=tr("tour.skip");
  const dots=$("tt-dots");
  dots.innerHTML=TOUR_STEPS.map((_,k)=>`<i class="${k===i?"on":""}"></i>`).join("");
  const shade=$("tour-shade");if(shade)shade.classList.add("on");
  if(st.sel){
    const el=document.querySelector(st.sel);
    if(el){
      el.scrollIntoView({block:"center",behavior:prefersReduced()?"auto":"smooth"});
      setTimeout(()=>{
        el.classList.add("tour-spot");
        const r=el.getBoundingClientRect();
        tourPlaceTip({left:r.left,top:r.top,bottom:r.bottom,width:r.width});
        TOUR.pending=false},prefersReduced()?0:380);
      TOUR.pending=true;return}}
  tourPlaceTip(null)}
function tourPendingFlush(){
  if(!TOUR.active||!TOUR.pending)return;
  const st=TOUR_STEPS[TOUR.i];if(!st||!st.sel)return;
  const el=document.querySelector(st.sel);if(!el)return;
  el.classList.add("tour-spot");
  const r=el.getBoundingClientRect();tourPlaceTip(r);TOUR.pending=false}
function tourStart(force){
  try{if(!force&&localStorage.getItem("rossim_tour")==="done")return}catch(e){}
  TOUR.active=true;TOUR.i=0;TOUR.pending=false;
  document.body.classList.add("tour-active");
  tourShow(0)}
function tourEnd(finished){
  TOUR.active=false;TOUR.pending=false;
  tourClearSpot();
  document.body.classList.remove("tour-active");
  try{localStorage.setItem("rossim_tour","done")}catch(e){}
  if(finished)toast(tr("tour.doneT"))}
function bindTour(){
  on("btn-help","click",()=>{tourClearSpot();tourStart(true)});
  on("tt-next","click",()=>tourShow(TOUR.i+1));
  on("tt-prev","click",()=>tourShow(TOUR.i-1));
  on("tt-skip","click",()=>tourEnd(false));
  window.addEventListener("resize",tourPendingFlush);
  /* tour is guidance-only: page stays fully interactive while it runs */}

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
      dl(`BroilerLab_${CUR_STRAIN_KEY}_${EX.ctx.kind}_v1.xlsx`,
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
      dl(`BroilerLab_${CUR_STRAIN_KEY}_${sh.id}.csv`,
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
        <td class="num" style="color:${r.dev42>=0?"var(--acc)":"var(--warn)"}">${r.dev42>=0?"+":""}${r.dev42.toFixed(1)}%</td>
        <td class="num">${r.fcr.toFixed(3)}</td><td class="num">${r.poFcr.toFixed(3)}</td>
        <td class="num">${en(r.visits)}</td>
        <td class="num"><span class="tag ${Math.abs(r.dev42)<2?"ok":"wn"}">${r.mae.toFixed(2)}%</span></td></tr>`}
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
function clearChart(id){delete CH[id];
  const cv=$(id);if(!cv)return;
  const ctx=cv.getContext("2d");
  if(ctx&&cv.width)ctx.clearRect(0,0,cv.width,cv.height)}
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
  runDashboard();repaintView(CUR_VIEW);
  toast(tr("dyn.resetDone"));
}
var resetArmed=0,resetTimer=null;
function bindReset(){
  var btn=$("btn-reset");if(!btn)return;
  btn.addEventListener("click",function(){
    if(resetArmed){
      resetArmed=0;clearTimeout(resetTimer);
      btn.classList.remove("armed");btn.textContent="\u267b\ufe0f";
      resetAll();
    }else{
      resetArmed=1;btn.classList.add("armed");btn.textContent="\u2757";
      toast(tr("dyn.resetArmed"));
      resetTimer=setTimeout(function(){
        resetArmed=0;btn.classList.remove("armed");btn.textContent="\u267b\ufe0f";
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
  if(e.key.toLowerCase()!=="t"||e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target;
  if(t&&(t.tagName==="INPUT"||t.tagName==="SELECT"||t.tagName==="TEXTAREA"||t.isContentEditable))return;
  setTheme(THEME==="dark"?"light":"dark")});
document.addEventListener("DOMContentLoaded",()=>{
  expLoad();initStrain();bindLang();bindTheme();applyLang();scnFill();
  bindReset();bindDrawer();bindExportCenter();bindTour();
  markTabs();
  document.documentElement.setAttribute("data-theme",THEME==="light"?"light":"dark");
  refreshChartTheme();
  $("fm-lbl").textContent=tr("dyn.ready");
  if($("fm-empty"))$("fm-empty").style.display="";
  setTimeout(runDashboard,40);
  if(document.fonts&&document.fonts.ready)
    document.fonts.ready.then(()=>setTimeout(()=>repaintView(CUR_VIEW),80));
});
