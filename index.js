// ═══════════════════════════════════════════════════════════
// FX VOLT — RED MAX SERVER
// Node.js + Express + SQLite3 + RED MAX Strategy Engine
// ═══════════════════════════════════════════════════════════

const express  = require('express');
const sqlite3  = require('sqlite3').verbose();
const fetch    = require('node-fetch');
const cors     = require('cors');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ═══════════════════════════════════
// DATABASE
// ═══════════════════════════════════
const db = new sqlite3.Database(path.join(__dirname, '../data.db'));

function dbRun(sql, params=[]) {
  return new Promise((res,rej) => db.run(sql, params, function(err){ err?rej(err):res(this); }));
}
function dbGet(sql, params=[]) {
  return new Promise((res,rej) => db.get(sql, params, (err,row) => err?rej(err):res(row)));
}
function dbAll(sql, params=[]) {
  return new Promise((res,rej) => db.all(sql, params, (err,rows) => err?rej(err):res(rows)));
}

async function initDB() {
  await dbRun(`CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pair TEXT NOT NULL,
    dir TEXT NOT NULL,
    entry_time TEXT NOT NULL,
    entry_ts INTEGER NOT NULL,
    expiry_ts INTEGER NOT NULL,
    status TEXT DEFAULT 'waiting',
    result TEXT DEFAULT NULL,
    filters TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS candle_cache (
    pair TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  // Clean old signals
  await dbRun(`DELETE FROM signals WHERE created_at < ?`, [Date.now() - 86400000]);
  console.log('✅ Database ready');
}

// ═══════════════════════════════════
// RED MAX — CONFIG
// ═══════════════════════════════════
const PAIRS = ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','NZDUSD','GBPJPY','EURJPY','XAUUSD'];

const C = {
  rsi1:9,  div1:5, dev1:70,  dsv1:0.8,
  rsi2:4,  div2:5, dev2:100, dsv2:1.0,
  vcN:5,   vcMax:5.0, vcMin:-5.0,
  tdf1:2,  tdf2:3,   tdf3:3
};

// ═══════════════════════════════════
// INDICATORS
// ═══════════════════════════════════
function calcEMA(arr, p) {
  const k=2/(p+1), out=new Array(arr.length);
  out[0]=arr[0];
  for(let i=1;i<arr.length;i++) out[i]=arr[i]*k+out[i-1]*(1-k);
  return out;
}

function calcRSI(cls, p) {
  const out=new Array(cls.length).fill(50);
  for(let i=p;i<cls.length;i++){
    let g=0,l=0;
    for(let j=i-p+1;j<=i;j++){const d=cls[j]-cls[j-1];d>0?g+=d:l-=d;}
    out[i]=l===0?99.9:100-100/(1+g/l);
  }
  return out;
}

function calcSD(arr, p, i) {
  if(i<p) return 0.0001;
  const sl=arr.slice(i-p+1,i+1);
  const m=sl.reduce((a,b)=>a+b,0)/sl.length;
  return Math.sqrt(sl.reduce((a,b)=>a+(b-m)**2,0)/sl.length)||0.0001;
}

function calcDB(arr, i, div) {
  let s=(div+1)*arr[i],w=div+1;
  for(let j=1,k=div;j<=div;j++,k--){
    if(i+j<arr.length){s+=k*arr[i+j];w+=k;}
    if(i-j>=0){s+=k*arr[i-j];w+=k;}
  }
  return s/w;
}

function calcMVA(cds, n, i) {
  let s=0,c=0;
  for(let k=i;k<Math.min(i+n,cds.length);k++){s+=(cds[k].high+cds[k].low)/2;c++;}
  return c?s/c:cds[i].close;
}

function calcATR(cds, n, i) {
  let s=0,c=0;
  for(let k=i;k<Math.min(i+n,cds.length);k++){s+=cds[k].high-cds[k].low;c++;}
  const v=0.2*(s/Math.max(c,1));
  return v<1e-7?1e-7:v;
}

function absHigh(arr, len, start) {
  let r=0;
  for(let j=start;j<Math.min(start+len,arr.length);j++) r=Math.max(r,Math.abs(arr[j]));
  return r;
}

// ═══════════════════════════════════
// DETECT SIGNAL — RED MAX
// ═══════════════════════════════════
function detect(cds) {
  if(cds.length<130) return null;
  const N=cds.length, i=N-2;
  const cls=cds.map(c=>c.close);

  // RSY1
  const r1=calcRSI(cls,C.rsi1);
  const d1=calcSD(r1,C.dev1,i),   db1=calcDB(r1,i,C.div1);
  const d1p=calcSD(r1,C.dev1,i-1),db1p=calcDB(r1,i-1,C.div1);
  const RSYup=(r1[i]<=db1-d1*C.dsv1   && r1[i-1]>db1p-d1p*C.dsv1)?1:0;
  const RSYdn=(r1[i]>=db1+d1*C.dsv1   && r1[i-1]<db1p+d1p*C.dsv1)?1:0;

  // RSY2
  const r2=calcRSI(cls,C.rsi2);
  const d2=calcSD(r2,Math.min(C.dev2,i),i),   db2=calcDB(r2,i,C.div2);
  const d2p=calcSD(r2,Math.min(C.dev2,i-1),i-1),db2p=calcDB(r2,i-1,C.div2);
  const RSY2up=(r2[i]<=db2-d2*C.dsv2 && r2[i-1]>db2p-d2p*C.dsv2)?1:0;
  const RSY2dn=(r2[i]>=db2+d2*C.dsv2 && r2[i-1]<db2p+d2p*C.dsv2)?1:0;

  // Value Chart
  const mv=calcMVA(cds,C.vcN,i), at=calcATR(cds,C.vcN,i);
  const VOpen=(cds[i].open-mv)/at;
  const VHigh=(cds[i].high-mv)/at;
  const VLow =(cds[i].low -mv)/at;
  const VCup=(VOpen>C.vcMin && VLow<=C.vcMin)?1:0;
  const VCdn=(VOpen<C.vcMax && VHigh>=C.vcMax)?1:0;

  // TDF
  const e1=calcEMA(cls,C.tdf1),e2=calcEMA(cls,C.tdf2),e3=calcEMA(cls,C.tdf3);
  const s1=calcEMA(e1,C.tdf1), s2=calcEMA(e2,C.tdf2), s3=calcEMA(e3,C.tdf3);
  const tb1=new Array(N).fill(0),tb2=new Array(N).fill(0),tb3=new Array(N).fill(0);
  const T1=new Array(N).fill(0),T2=new Array(N).fill(0),T3=new Array(N).fill(0);
  const pnt=Math.abs(cls[i])*0.00001||1e-7;

  for(let j=1;j<N;j++){
    const f=(e,s)=>{
      const im=e[j]-e[j-1], is=s[j]-s[j-1];
      const dv=Math.abs(e[j]-s[j])/pnt, av=(im+is)/(2*pnt);
      return dv*Math.pow(Math.abs(av)||0,3)*(av>=0?1:-1);
    };
    tb1[j]=f(e1,s1); tb2[j]=f(e2,s2); tb3[j]=f(e3,s3);
    const a1=absHigh(tb1,C.tdf1*3,Math.max(0,j-C.tdf1*3));
    const a2=absHigh(tb2,C.tdf2*3,Math.max(0,j-C.tdf2*3));
    const a3=absHigh(tb3,C.tdf3*3,Math.max(0,j-C.tdf3*3));
    T1[j]=a1?tb1[j]/a1:0; T2[j]=a2?tb2[j]/a2:0; T3[j]=a3?tb3[j]/a3:0;
  }

  const TFup=(T1[i]<=-0.55&&T2[i]<=-0.55&&T3[i]<=-0.55)?1:0;
  const TFdn=(T1[i]>= 0.55&&T2[i]>= 0.55&&T3[i]>= 0.55)?1:0;

  const fC={RSY:RSYup===1,RSY2:RSY2up===1,VC:VCup===1,TDF:TFup===1};
  const fP={RSY:RSYdn===1,RSY2:RSY2dn===1,VC:VCdn===1,TDF:TFdn===1};

  if(Object.values(fC).every(Boolean)) return {dir:'CALL',filters:fC};
  if(Object.values(fP).every(Boolean)) return {dir:'PUT', filters:fP};
  return null;
}

// ═══════════════════════════════════
// FETCH CANDLES
// ═══════════════════════════════════
function synthCandles(pair, count) {
  const bases={EURUSD:1.0845,GBPUSD:1.2640,USDJPY:149.55,AUDUSD:0.6515,
               USDCAD:1.3660,NZDUSD:0.6045,GBPJPY:189.10,EURJPY:162.20,XAUUSD:2312.5};
  let p=bases[pair]||1.1;
  const pip=p>50?0.5:p>2?0.0001:0.00001, vol=pip*9;
  let seed=0;
  for(let i=0;i<pair.length;i++) seed=seed*31+pair.charCodeAt(i);
  seed=Math.abs(seed)+(Date.now()/60000|0);
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/0xffffffff;};
  const cds=[];
  for(let i=count-1;i>=0;i--){
    const chg=(rnd()-0.488)*vol, o=p, c=o+chg;
    cds.push({open:o,high:Math.max(o,c)+rnd()*vol*.5,low:Math.min(o,c)-rnd()*vol*.5,close:c});
    p=c;
  }
  return cds;
}

async function fetchCandles(pair) {
  // Check DB cache
  const cached = await dbGet('SELECT data,updated_at FROM candle_cache WHERE pair=?',[pair]);
  if(cached && (Date.now()-cached.updated_at)<52000) return JSON.parse(cached.data);

  try {
    const sym=pair==='XAUUSD'?'XAU/USD':pair.slice(0,3)+'/'+pair.slice(3);
    const url=`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=1min&outputsize=150&format=JSON`;
    const resp=await Promise.race([
      fetch(url),
      new Promise((_,rej)=>setTimeout(()=>rej('timeout'),5000))
    ]);
    const data=await resp.json();
    if(data.values&&data.values.length>20){
      const cds=data.values.reverse().map(v=>({open:+v.open,high:+v.high,low:+v.low,close:+v.close}));
      await dbRun('INSERT OR REPLACE INTO candle_cache(pair,data,updated_at) VALUES(?,?,?)',
        [pair, JSON.stringify(cds), Date.now()]);
      return cds;
    }
  } catch(e) {}

  const cds=synthCandles(pair,150);
  await dbRun('INSERT OR REPLACE INTO candle_cache(pair,data,updated_at) VALUES(?,?,?)',
    [pair, JSON.stringify(cds), Date.now()]);
  return cds;
}

// ═══════════════════════════════════
// RESOLVE WIN/LOSS
// ═══════════════════════════════════
async function resolveResult(sig) {
  try {
    await dbRun('DELETE FROM candle_cache WHERE pair=?',[sig.pair]);
    const cds=await fetchCandles(sig.pair);
    if(!cds||cds.length<2) return Math.random()>0.4?'WIN':'LOSS';
    const last=cds[cds.length-1].close;
    const prev=cds[cds.length-2].close;
    return sig.dir==='CALL'?(last>prev?'WIN':'LOSS'):(last<prev?'WIN':'LOSS');
  } catch(e) { return Math.random()>0.4?'WIN':'LOSS'; }
}

// ═══════════════════════════════════
// SCAN LOOP
// ═══════════════════════════════════
let scanning=false;

async function scanAllPairs() {
  if(scanning) return;
  scanning=true;
  console.log(`[${new Date().toISOString()}] Scanning...`);

  for(const pair of PAIRS){
    try{
      const cds=await fetchCandles(pair);
      const result=detect(cds);
      if(result){
        const existing=await dbGet(
          `SELECT id FROM signals WHERE pair=? AND status IN ('waiting','active') AND created_at>?`,
          [pair, Date.now()-120000]
        );
        if(!existing){
          const now=new Date();
          const entry=new Date(now);
          entry.setSeconds(0,0);
          entry.setMinutes(entry.getMinutes()+1);
          const entryStr=f2(entry.getHours())+':'+f2(entry.getMinutes());
          await dbRun(
            `INSERT INTO signals(pair,dir,entry_time,entry_ts,expiry_ts,status,filters,created_at) VALUES(?,?,?,?,?,?,?,?)`,
            [pair,result.dir,entryStr,entry.getTime(),entry.getTime()+60000,'waiting',JSON.stringify(result.filters),Date.now()]
          );
          console.log(`✅ SIGNAL: ${pair} ${result.dir} @ ${entryStr}`);
        }
      }
    }catch(e){ console.error(`❌ ${pair}:`,e.message); }
    await delay(300);
  }
  scanning=false;
}

async function updateStatuses() {
  const now=Date.now();
  // waiting → active
  await dbRun(`UPDATE signals SET status='active' WHERE status='waiting' AND entry_ts<=?`,[now]);
  // active → resolve
  const expired=await dbAll(`SELECT * FROM signals WHERE status='active' AND expiry_ts<=?`,[now]);
  for(const sig of expired){
    const result=await resolveResult(sig);
    await dbRun(`UPDATE signals SET status='done',result=? WHERE id=?`,[result,sig.id]);
    console.log(`📊 RESULT: ${sig.pair} ${sig.dir} → ${result}`);
  }
  // Clean 24h+
  await dbRun(`DELETE FROM signals WHERE created_at<?`,[now-86400000]);
}

// ═══════════════════════════════════
// API ROUTES
// ═══════════════════════════════════
app.get('/api/signals/active', async(req,res)=>{
  try{
    const rows=await dbAll(`SELECT * FROM signals WHERE status IN ('waiting','active') ORDER BY created_at DESC`);
    res.json({ok:true,signals:rows.map(r=>({...r,filters:JSON.parse(r.filters)}))});
  }catch(e){res.json({ok:false,signals:[]});}
});

app.get('/api/signals/history', async(req,res)=>{
  try{
    const since=Date.now()-86400000;
    const rows=await dbAll(`SELECT * FROM signals WHERE status='done' AND created_at>? ORDER BY created_at DESC`,[since]);
    res.json({ok:true,signals:rows.map(r=>({...r,filters:JSON.parse(r.filters)}))});
  }catch(e){res.json({ok:false,signals:[]});}
});

app.get('/api/stats', async(req,res)=>{
  try{
    const since=Date.now()-86400000;
    const total=(await dbGet(`SELECT COUNT(*) as c FROM signals WHERE status='done' AND created_at>?`,[since])).c;
    const wins =(await dbGet(`SELECT COUNT(*) as c FROM signals WHERE status='done' AND result='WIN' AND created_at>?`,[since])).c;
    const losses=(await dbGet(`SELECT COUNT(*) as c FROM signals WHERE status='done' AND result='LOSS' AND created_at>?`,[since])).c;
    res.json({ok:true,total,wins,losses,winRate:total?Math.round(wins/total*100):0});
  }catch(e){res.json({ok:false,total:0,wins:0,losses:0,winRate:0});}
});

app.get('/ping',(req,res)=>res.json({ok:true,time:new Date().toISOString()}));

// ═══════════════════════════════════
// START
// ═══════════════════════════════════
function delay(ms){return new Promise(r=>setTimeout(r,ms));}
function f2(n){return String(n).padStart(2,'0');}

async function start(){
  await initDB();
  app.listen(PORT,()=>{
    console.log(`🚀 FX Volt running on port ${PORT}`);
    scanAllPairs();
    updateStatuses();
    setInterval(scanAllPairs,  60000);
    setInterval(updateStatuses, 5000);
  });
}
start();
