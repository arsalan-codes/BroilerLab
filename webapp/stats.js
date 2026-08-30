/* =====================================================================
   BioStat — biostatistics toolkit (pure JS, offline)
   Descriptive stats, Welch t-test, one-way ANOVA (F), eta², Holm adjust.
   p-values via regularized incomplete beta function (Numerical Recipes
   betacf/betai, accurate to ~1e-7).
   ===================================================================== */
"use strict";
const BioStat=(()=>{
  const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const sd=a=>{const n=a.length;if(n<2)return 0;const m=mean(a);
    return Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/(n-1))};
  const se=a=>sd(a)/Math.sqrt(a.length);
  const ci95=a=>{const n=a.length;if(n<2)return[NaN,NaN];const m=mean(a),
    e=tCrit(.975,n-1)*se(a);return[m-e,m+e]};
  const quantile=(sorted,p)=>{const i=(sorted.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);
    return sorted.length?sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo):NaN};

  /* ---- special functions ---- */
  function lgamma(x){
    const g=[676.5203681218851,-1259.1392167224028,771.32342877765313,
      -176.61502916214059,12.507343278686905,-0.13857109526572012,
      9.9843695780195716e-6,1.5056327351493116e-7];
    if(x<0.5)return Math.log(Math.PI/Math.sin(Math.PI*x))-lgamma(1-x);
    let xx=x-1,a=0.99999999999980993,t=xx+7.5;
    for(let i=0;i<8;i++)a+=g[i]/(xx+i+1);
    return 0.5*Math.log(2*Math.PI)+(xx+0.5)*Math.log(t)-t+Math.log(a)}
  function betacf(a,b,x){const MAXIT=200,EPS=3e-12,FPMIN=1e-300;
    const qab=a+b,qap=a+1,qam=a-1;let c=1,d=1-qab*x/qap;
    if(Math.abs(d)<FPMIN)d=FPMIN;d=1/d;let h=d;
    for(let m=1;m<=MAXIT;m++){const m2=2*m;
      let aa=m*(b-m)*x/((qam+m2)*(a+m2));
      d=1+aa*d;if(Math.abs(d)<FPMIN)d=FPMIN;c=1+aa/c;if(Math.abs(c)<FPMIN)c=FPMIN;
      d=1/d;h*=d*c;
      aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));
      d=1+aa*d;if(Math.abs(d)<FPMIN)d=FPMIN;c=1+aa/c;if(Math.abs(c)<FPMIN)c=FPMIN;
      d=1/d;const del=d*c;h*=del;
      if(Math.abs(del-1)<EPS)break}
    return h}
  function betai(a,b,x){
    if(x<=0)return 0;if(x>=1)return 1;
    const bt=Math.exp(lgamma(a+b)-lgamma(a)-lgamma(b)+a*Math.log(x)+b*Math.log(1-x));
    return x<(a+1)/(a+b+2)?bt*betacf(a,b,x)/a:1-bt*betacf(b,a,1-x)/b}
  /* Student-t two-tailed p */
  function tTestP(t,df){return betai(df/2,0.5,df/(df+t*t))}
  function tCdf(t,df){const p=tTestP(t,df);return t>0?1-p/2:p/2}
  /* critical t (two-sided) by bisection on tTestP */
  function tCrit(conf,df){let lo=0,hi=100;
    for(let i=0;i<200;i++){const mid=(lo+hi)/2;
      (tTestP(mid,df)>1-conf)?lo=mid:hi=mid}
    return(hi+lo)/2}
  /* F-distribution upper-tail p */
  function fTestP(f,df1,df2){if(f<=0)return 1;return betai(df2/2,df1/2,df2/(df2+df1*f))}

  /* ---- inferential ---- */
  function welchT(a,b){
    const n1=a.length,n2=b.length,m1=mean(a),m2=mean(b);
    const v1=sd(a)**2,v2=sd(b)**2;
    const se2=v1/n1+v2/n2,t=(m1-m2)/Math.sqrt(se2);
    const df=se2*se2/((v1*v1)/(n1*n1*(n1-1))+(v2*v2)/(n2*n2*(n2-1)));
    return{t,df,p:tTestP(t,df)}}
  function anova(groups){
    const gs=groups.filter(g=>g.length>1);
    const k=gs.length,N=gs.reduce((s,g)=>s+g.length,0);
    if(k<2||N<=k)return null;
    const gm=mean(gs.flat());
    let ssb=0,ssw=0;
    for(const g of gs){const m=mean(g);ssb+=g.length*(m-gm)**2;
      ssw+=g.reduce((s,x)=>s+(x-m)**2,0)}
    const dfB=k-1,dfW=N-k,msb=ssb/dfB,msw=ssw/dfW,F=msb/msw;
    return{F,dfB,dfW,p:fTestP(F,dfB,dfW),eta2:ssb/(ssb+ssw)}}
  function holm(ps){const idx=ps.map((p,i)=>[p,i]).sort((x,y)=>x[0]-y[0]);
    const m=ps.length,out=new Array(m).fill(0);let prev=0;
    for(let r=0;r<m;r++){const adj=Math.min(1,(m-r)*idx[r][0]);
      prev=Math.max(prev,adj);out[idx[r][1]]=prev}
    return out}
  const stars=p=>p<.001?"***":p<.01?"**":p<.05?"*":"ns";
  return{mean,sd,se,ci95,quantile,tTestP,tCrit,welchT,anova,holm,stars,
    betai,fTestP};
})();
if(typeof module!=="undefined")module.exports={BioStat};
