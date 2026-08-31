/* Arian — Chart engine (components/chart.js) */
"use strict";
function rr(x,x0,y0,w,h,r){r=Math.max(0,Math.min(r,h/2,w/2));x.beginPath();
  x.moveTo(x0+r,y0);x.arcTo(x0+w,y0,x0+w,y0+h,r);x.arcTo(x0+w,y0+h,x0,y0+h,r);
  x.arcTo(x0,y0+h,x0,y0,r);x.arcTo(x0,y0,x0+w,y0,r);x.closePath()}
function refreshChartTheme(){
  const cs=getComputedStyle(document.documentElement);
  CT.grid=(cs.getPropertyValue("--chart-grid")||"").trim()||CT.grid;
  CT.label=(cs.getPropertyValue("--chart-label")||"").trim()||CT.label}
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
function clearChart(id){delete CH[id];
  const cv=$(id);if(!cv)return;
  const ctx=cv.getContext("2d");
  if(ctx&&cv.width)ctx.clearRect(0,0,cv.width,cv.height)}
