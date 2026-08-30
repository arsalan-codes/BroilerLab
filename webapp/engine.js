/* =====================================================================
   RossSim Engine — faithful JS port of simulator.py (seed=308)
   Pure logic, no DOM. Validated against official Aviagen PO tables.
   Sources: see docs/RESEARCH_NOTES.md  [1][2][3][5][6][7][8]
   ===================================================================== */
"use strict";

/* strain catalogs (strains.js) — browser loads it as a global script;
   under node, pull it in for tests */
if(typeof STRAINS==="undefined"&&typeof require==="function"){
  try{globalThis.STRAINS=require("./strains.js").STRAINS}catch(e){}}

/* ---------------- deterministic RNG (mulberry32) ---------------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
let rnd=Math.random;
function setSeed(s){rnd=mulberry32(s)}
function gauss(){let u=0,v=0;while(u===0)u=rnd();while(v===0)v=rnd();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const weibull1=beta=>Math.pow(-Math.log(1-rnd()),1/beta); // random.weibullvariate(1,beta)

/* ---------------- official PO reference — multi-strain ----------------
   Catalogs live in strains.js; the active one is selected with setStrain().
   Default ross308 preserves the validated baseline path bit-for-bit. */
let CUR_STRAIN="ross308";
function setStrain(k){if(typeof STRAINS!=="undefined"&&STRAINS[k])CUR_STRAIN=k}
function PO(){return (typeof STRAINS!=="undefined")?STRAINS[CUR_STRAIN]:null}
const IDX15=14, IDX60=59;
function poBW(sex,age){const P=PO();const a=(sex==='m'?P.bwM:sex==='f'?P.bwF:P.bwAsh);
  if(age<=1)return a[0]; const md=P.maxDay;
  if(age>=md)return a[md-1];
  return a[age-1]}
function poFI(sex,age){ // daily intake, forward-filled
  const P=PO();const a=(sex==='m'?P.fiM:sex==='f'?P.fiF:P.fiAsh);
  const md=P.maxDay;age=clamp(age,1,md);
  for(let d=Math.min(age,md);d>=1;d--)if(a[d-1]!=null)return a[d-1];
  return 20}

/* ---------------- environment models [1][8] ---------------- */
const L_ON=5,L_OFF=23;
function tempForBW(w){const P=[[44,30],[100,28],[180,27],[290,26],[425,25],[590,24],
  [790,23],[1015,22],[1260,21],[1530,20]];for(const[wg,t]of P)if(w<=wg)return t;return 20}
function hourWeight(h){if(h<L_ON||h>=L_OFF)return 0;
  const g=(mu,s)=>Math.exp(-((h-mu)**2)/(2*s*s));
  return g(6.5,1.8)+g(20.5,1.8)+0.45*g(13,3.5)}
const HOURS=[];for(let h=L_ON;h<L_OFF;h++)HOURS.push(h);
const HCUM=(()=>{let c=0;return HOURS.map(h=>c+=hourWeight(h)+1e-9)})();
const HTOT=HCUM[HCUM.length-1];
function sampleHour(){let x=rnd()*HTOT,lo=0,hi=HCUM.length-1;
  while(lo<hi){const m=(lo+hi)>>1;if(HCUM[m]<x)lo=m+1;else hi=m}
  return HOURS[lo]+rnd()}

/* ---------------- behaviour engine [5][7][8] ---------------- */
const boutLen=age=>Math.min(135,45+2.192*(age-15));
function visitPlan(fiDay,age){
  const rate=1+.055*(age-15);
  const n=Math.max(6,Math.round(fiDay/rate*60/boutLen(age)));
  const ws=[];let s=0;
  for(let i=0;i<n;i++){const w=weibull1(1.35);ws.push(w);s+=w}
  const plan=[];
  for(const w of ws){const meal=fiDay*w/s;
    plan.push({t:sampleHour(),meal,dur:clamp(meal/rate*60,12,240)})}
  plan.sort((a,b)=>a.t-b.t);return plan}

/* ---------------- birds ---------------- */
class Bird{
  constructor(id,sex,cv){this.id=id;this.sex=sex;this.cv=cv;
    this.wiggle=0;this.alive=true;this.cumTar=1e-9;this.cumAct=1e-9;this._tr=null}
  /* growth coupling: intake-deficit power law (calibrated) x direct heat dip.
     Baseline path -> exactly 1 (no drift vs validated PO results). */
  factor(heatActive,dT){
    const f=Math.pow(clamp(this.cumAct/this.cumTar,.55,1.18),.35);
    return f*(heatActive?Math.exp(-.012*dT):1)}
  bw(age,nMult,heatActive,dT){this.wiggle=.9*this.wiggle+gauss()*.008;
    return poBW(this.sex,age)*(1+this.cv+this.wiggle)*nMult*
      (this._tr?this._tr.bw(age):1)*this.factor(heatActive,dT)}
}

/* ---------------- configuration ---------------- */
const PENS_CFG={P01:{n:3},P02:{n:5},P03:{n:7},P04:{n:8},P05:{n:10},P06:{n:12}};
const BASE_DATE=new Date(Date.UTC(2026,7,19)); // 2026-08-19 == age 15
const BIN_CAP=25,BIN_START=18.5,BIN_TRIG=3,DEATH_P=.0008;

/* ---------------- treatments (calibrated assumptions, documented) ----------------
   fi(a): intake multiplier · bw(a): live-weight multiplier
   heat: pen-level stress window (overrides run-level heat) · deathMult(a)
   All effects are identity (=1) for "control" → baseline stays validated. */
const TREATMENTS={
  control:{label:"شاهد",labelEn:"Control",color:"#8b96ad",fi:()=>1,bw:()=>1},
  probiotic:{label:"پروبیوتیک",labelEn:"Probiotic",color:"#22d3a5",fi:()=>1.01,bw:()=>1.015},
  agp:{label:"افزاینده رشد",labelEn:"Growth promoter",color:"#a78bfa",fi:()=>1.02,bw:()=>1.025},
  vaccine:{label:"واکسن d۱۹–۲۲",labelEn:"Vaccine d19-22",color:"#60a5fa",fi:a=>(a>=19&&a<=22)?.90:1,bw:()=>1},
  lowprot:{label:"کم‌پروتئین",labelEn:"Low protein",color:"#f59e0b",fi:()=>1.04,bw:()=>.975},
  heat:{label:"تنش گرمایی d۳۲–۳۸",labelEn:"Heat stress d32-38",color:"#ef4444",fi:()=>1,bw:()=>1,
    heat:{from:32,to:38,dT:5},deathMult:a=>(a>=32&&a<=38)?2.5:1},
};
/* normalize cfg.pens (preset ids) or cfg.pensCustom ({id,n,treat}) to one shape */
function normPens(cfg){
  if(cfg.pensCustom&&cfg.pensCustom.length)
    return cfg.pensCustom.map(p=>{
      const safeId=String(p.id||"P?").replace(/[^A-Za-z0-9_-]/g,"").slice(0,8)||"P?";
      return{pid:safeId,n:clamp(p.n|0||10,1,400),
        treat:TREATMENTS[p.treat]?p.treat:"control"}});
  const ids=(cfg.pens&&cfg.pens.length)?cfg.pens:Object.keys(PENS_CFG);
  return ids.map(id=>({pid:id,n:(PENS_CFG[id]||{n:10}).n,treat:"control"}));
}

/* date string "YYYY-MM-DD" for age given run start-age anchored at BASE_DATE */
function dateForAge(age,ageStart){
  const d=new Date(BASE_DATE);d.setUTCDate(d.getUTCDate()+age-Math.min(ageStart,15));
  return d.toISOString().slice(0,10)}

/* =====================================================================
   simulateRun(cfg) -> {summaries[], diurnal[24], fills, deaths,
                        rows[]?, visitsLog[]?, perPen{}, pensMeta[]}
   cfg = {ageStart, ageEnd, pens:["P01"..] | pensCustom:[{id,n,treat}],
          stations:1|2, heat:null|{from,to,dT}, seed:int,
          collectRows:bool, collectVisits:bool}
   Faithful port of simulator.py::simulate() — baseline path (control
   treatments, no heat, one station) reproduces the validated output.
   ===================================================================== */
function simulateRun(cfg){
  const ageStart=cfg.ageStart??15, ageEnd=cfg.ageEnd??60;
  if(cfg.strain)setStrain(cfg.strain);
  const P=PO();
  const maxAge=Math.min(ageEnd,P.maxDay); // clamp to strain horizon
  const pensL=normPens(cfg);
  const stations=cfg.stations||1;
  const heat=cfg.heat||null;
  setSeed(cfg.seed??308);

  /* birds — BLOCKED creation for experimental design: the i-th bird of every
     pen shares sex & cv (common random numbers) so pen-level comparisons
     isolate the treatment effect, not sampling luck. Wiggle AR(1) stays
     per-bird. Baseline statistics remain within the validated band. */
  const brng=mulberry32(((cfg.seed??308)*7919+13)|0);
  const bgauss=()=>{let u=0,v=0;while(u===0)u=brng();while(v===0)v=brng();
    return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};
  const maxN=pensL.reduce((m,p)=>Math.max(m,p.n),1);
  const sexPool=[],cvPool=[],penEff=[];
  for(let i=0;i<maxN;i++){sexPool.push(brng()<.5?"m":"f");cvPool.push(Math.max(0,bgauss()*.05))}
  /* pen-level environmental random effect (experimental replicates):
     ~N(0,1.2%) on BW — makes between-replicate variance realistic for the
     biostatistics module. Only applied to user-designed runs. */
  for(let i=0;i<pensL.length;i++)penEff.push(bgauss()*.012)
  const birds=[];let bid=0;
  for(const{pid,n,treat}of pensL)for(let i=0;i<n;i++){bid++;
    const b=new Bird("B"+String(bid).padStart(3,"0"),sexPool[i],cvPool[i]);
    b.pen=pid;b.treat=treat;b._tr=TREATMENTS[treat];birds.push(b)}

  const penBWmult=n=>clamp(1-.004*(n-7),.96,1.03);

  const summaries=[],deaths=[],fills=[],visitsLog=[];
  const trackBirds=!!cfg.trackBirds;
  const birdsDaily=trackBirds?[]:null;
  const birdAgg=trackBirds?new Map():null;
  if(trackBirds)for(const b of birds)birdAgg.set(b.id,{fi:0,w:null});
  const diurnal=new Array(24).fill(0);
  let rowEstimate=0;
  const rows=cfg.collectRows?[]:null;
  const binState={},perPen={};
  pensL.forEach((p,pi)=>{binState[p.pid]=BIN_START;
    perPen[p.pid]={pid:p.pid,n:p.n,treat:p.treat,
      penEff:cfg.pensCustom&&cfg.penNoise!==false?+penEff[pi].toFixed(4):0,
      ages:[],bw:[],fi:[],fiPo:[],busy:[],visits:[],ovl:[],refills:[],bin:[]}})

  for(let age=ageStart;age<=maxAge;age++){
    const dateStr=dateForAge(age,ageStart);
    for(const penO of pensL){
      const pid=penO.pid,n=penO.n,tr=TREATMENTS[penO.treat];
      /* per-pen heat window: treatment-level overrides run-level */
      const heat=(tr&&tr.heat)||cfg.heat||null;
      const all=birds.filter(b=>b.pen===pid);
      /* mortality roll from d21 [unverified ~3% cumulative] */
      if(age>=21){
        const dm=tr&&tr.deathMult?tr.deathMult(age):1;
        for(const b of all)if(b.alive&&rnd()<DEATH_P*dm){b.alive=false;deaths.push({pen:pid,id:b.id,age})}
      }
      const alive=all.filter(b=>b.alive);
      if(!alive.length)continue;

      const pEff=perPen[pid].penEff;
      const nMult=penBWmult(n)*(cfg.pensCustom?(1+pEff):1);
      const heatActive=!!(heat&&age>=heat.from&&age<=heat.to);
      const dTnow=heatActive?heat.dT:0;
      let meanBWPot=0;for(const b of alive)meanBWPot+=b.bw(age,nMult,heatActive,dTnow);meanBWPot/=alive.length;
      const tBase=tempForBW(meanBWPot)+dTnow+gauss()*.3;
      const hum=clamp(58+.12*(age-ageStart)+3*Math.sin((age%30)/30*6.283)+gauss()*1.5,45,70);

      /* plan every visit of every bird, then serialise at station(s).
         cumTar/cumAct track intake WITHOUT per-bird noise and WITHOUT the
         treatment fi multiplier — treatments act directly on eaten feed
         (tr.fi) and weight (tr.bw), keeping the coupling baseline at exactly
         1 and preserving validated-path identity. */
      const visits=[];
      const hM=(!heat||age<heat.from||age>heat.to)?1:Math.exp(-.045*heat.dT);
      const fiMultPen=clamp(1+.005*(n-7),.94,1.04)*tr.fi(age);
      const fiMultPen0=clamp(1+.005*(n-7),.94,1.04);
      for(const b of alive){
        const baseT=poFI(b.sex,age)*fiMultPen0;
        const wr=Math.pow(b.bw(age,nMult,heatActive,dTnow)/poBW(b.sex,age),.8);
        b.cumTar+=baseT*wr;
        /* heat efficiency loss: feed eaten in full, but conversion credit
           discounted (~4%/°C) → permanent BW & FCR impact [calibrated] */
        b.cumAct+=baseT*hM*wr*(heatActive?Math.exp(-.04*dTnow):1);
        const fiBird=baseT*fiMultPen*hM*wr*Math.exp(gauss()*.1);
        for(const v of visitPlan(fiBird,age)){
          visits.push({t:v.t,b,meal:v.meal,dur:v.dur});
          if(visitsLog)visitsLog.push({p:pid,bird:b.id,age,t:v.t,dur:v.dur,meal:v.meal});
        }
      }
      visits.sort((a,b)=>a.t-b.t);

      let bin=binState[pid],busy=0,overlap=0,refillsToday=0;
      const freeAt=new Array(stations).fill(-1e9);
      const dayRows=rows?[]:null;

      for(const v of visits){
        let start=Math.floor(v.t*3600);
        /* pick earliest free slot (single head-hole per station) */
        let si=0;for(let s=1;s<stations;s++)if(freeAt[s]<freeAt[si])si=s;
        if(start<freeAt[si]){
          if(freeAt[si]-start<=90)start=freeAt[si]; else overlap++;
        }
        if(bin<BIN_TRIG){bin=BIN_CAP;refillsToday++;fills.push({pen:pid,age})}
        const end=start+Math.floor(v.dur);
        freeAt[si]=end+2;busy+=v.dur;
        const trueW=v.b.bw(age,nMult,heatActive,dTnow);
        if(trackBirds){const A=birdAgg.get(v.b.id);
          if(A){A.fi+=v.meal;A.w=trueW}}
        let ema=trueW+gauss()*3,prevFrac=0;
        const pts=[...new Set([start,(start+end)>>1,end-1])].sort((a,b)=>a-b);
        for(const ts of pts){
          const frac=clamp((ts-start)/Math.max(1,v.dur),prevFrac,1);
          const newly=(frac-prevFrac)*v.meal;prevFrac=frac;
          const raw=Math.round(trueW+gauss()*4);
          ema=.5*ema+.5*raw;
          bin-=newly/1000;
          diurnal[Math.floor(v.t)%24]+=newly;
          if(rows){
            let rssi=clamp(Math.round(gauss()*5-65),-90,-42);
            const weak=rnd()<.02,missing=rnd()<.004;if(weak)rssi-=20;
            const temp=tBase-Math.sin((ts/3600-14)/24*6.283);
            const hh=String(Math.floor(ts/3600)).padStart(2,"0"),
                  mm=String(Math.floor(ts%3600/60)).padStart(2,"0"),
                  ss=String(ts%60).padStart(2,"0");
            dayRows.push([`${dateStr} ${hh}:${mm}:${ss}`,"F01",missing?"":v.b.id,"S"+pid.slice(1),
              age,raw,Math.round(ema),+bin.toFixed(2),Math.round(-v.meal*frac),
              +temp.toFixed(1),+(hum+gauss()*.8).toFixed(1),rssi]);
          }else{
            /* aggregate mode: no per-row draws needed */
          }
        }
        rowEstimate+=pts.length;
      }
      binState[pid]=bin;

      let endMeanBW=0;for(const b of alive)endMeanBW+=b.bw(age,nMult,heatActive,dTnow);endMeanBW/=alive.length;
      const dayFI=visits.reduce((s,v)=>s+v.meal,0);
      const busyPct=100*busy/(stations*(L_OFF-L_ON)*3600);
      summaries.push({date:dateStr,pen:pid,treat:penO.treat,n,alive:alive.length,age,meanBW:endMeanBW,
        dayFI,fiPerBird:dayFI/alive.length,fiPerBirdPo:poFI("ash",age),
        visits:visits.length,busyPct,overlap:overlap,refills:refillsToday,temp:tBase,hum,
        binEnd:+bin.toFixed(2)});
      const pp=perPen[pid];
      pp.ages.push(age);pp.bw.push(endMeanBW);pp.fi.push(dayFI/alive.length);
      pp.fiPo.push(poFI("ash",age));pp.busy.push(busyPct);
      pp.visits.push(visits.length/n);pp.ovl.push(overlap);pp.refills.push(refillsToday);
      pp.bin.push(+bin.toFixed(2));
      if(birdsDaily)for(const b of alive){
        const A=birdAgg.get(b.id);
        birdsDaily.push({age,id:b.id,pen:pid,treat:penO.treat,sex:b.sex,
          cv:+b.cv.toFixed(4),
          bw:+(A.w??0).toFixed(1),fi:+A.fi.toFixed(1),alive:1})}
      if(dayRows)rows.push(...dayRows);
    }
  }
  return {summaries,diurnal,fills,deaths,rows,visitsLog,birdsDaily,rowEstimate,perPen,
    pensMeta:pensL,
    birdsMeta:birds.map(b=>({id:b.id,pen:b.pen,treat:b.treat,sex:b.sex,cv:+b.cv.toFixed(4)}))};
}

/* pooled-by-age helpers for validation dashboard */
function poolByAge(summaries){
  const m=new Map();
  for(const s of summaries){
    if(!m.has(s.age))m.set(s.age,{age:s.age,bws:[],fis:[],poFis:[],visits:[],busy:[],n:0});
    const r=m.get(s.age);r.bws.push(s.meanBW);r.fis.push(s.fiPerBird);
    r.poFis.push(s.fiPerBirdPo);r.visits.push(s.visits/s.alive);r.busy.push(s.busyPct);r.n++}
  return [...m.values()].map(r=>({age:r.age,bw:r.bws.reduce((a,x)=>a+x,0)/r.bws.length,
    fi:r.fis.reduce((a,x)=>a+x,0)/r.fis.length,fiPo:r.poFis[0],
    visits:r.visits.reduce((a,x)=>a+x,0)/r.visits.length,
    busyMax:Math.max(...r.busy)})).sort((a,b)=>a.age-b.age)}

function maeVsPO(pooled){let s=0,c=0;
  for(const r of pooled){if(r.age<IDX15+1)continue;s+=Math.abs(100*(r.bw-poBW("ash",r.age))/poBW("ash",r.age));c++}
  return c?s/c:0}

/* window FCR per pen over the run: sum(fi_per_bird)/(bw_end-bw_start) */
function windowFCR(pp){
  const gain=pp.bw[pp.bw.length-1]-pp.bw[0];
  return pp.fi.reduce((a,x)=>a+x,0)/gain}

/* CSV export of collected rows */
function rowsToCSV(rows){
  /* spreadsheet-formula injection guard: neutralize leading =,+,-,@ in text cells */
  const guard=v=>{const st=String(v);
    return /^[=+@]|^-[^0-9.]/.test(st)?"'"+st:st};
  const head="timestamp,flock_id,bird_id,sensor_id,age_day,raw_weight_g,weight_g,feed_bin_kg,feed_delta_g,temp_c,humidity,rssi";
  return head+"\n"+rows.map(r=>r.map(c=>guard(c)).join(",")).join("\n")}

if(typeof module!=="undefined")module.exports={setSeed,gauss,PO,poBW,poFI,
  tempForBW,sampleHour,visitPlan,Bird,simulateRun,poolByAge,maeVsPO,windowFCR,rowsToCSV,
  PENS_CFG,dateForAge,IDX15,IDX60,L_ON,L_OFF,TREATMENTS,normPens};
