/* Arian — Export data row builders (services/export.js) */
"use strict";
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
function expTotals(){return EXP.pens.reduce((s,p)=>s+p.n,0)}
