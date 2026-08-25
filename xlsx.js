/* =====================================================================
   XLSX writer — pure JS, zero dependencies (offline).
   Builds a minimal valid OOXML spreadsheet inside a ZIP (store method):
   [Content_Types].xml, _rels, workbook, styles (teal bold header),
   worksheets with inline strings + frozen header + RTL sheet view.
   ===================================================================== */
"use strict";

/* ---------------- CRC32 ---------------- */
const CRC_T=(()=>{const t=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;
    for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u8){let c=0xFFFFFFFF;
  for(let i=0;i<u8.length;i++)c=CRC_T[(c^u8[i])&255]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0}

/* ---------------- ZIP (store, no compression) ---------------- */
function zipStore(files){
  const enc=new TextEncoder(),chunks=[],central=[];
  let offset=0;
  const d=new Date();
  const dosTime=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1);
  const dosDate=(((d.getFullYear()-1980)&127)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  for(const f of files){
    const nameU8=enc.encode(f.name),data=f.data,crc=crc32(data);
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);
    lh.setUint16(8,0,true);lh.setUint16(10,dosTime,true);lh.setUint16(12,dosDate,true);
    lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);
    lh.setUint16(26,nameU8.length,true);lh.setUint16(28,0,true);
    chunks.push(new Uint8Array(lh.buffer),nameU8,data);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);
    ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);
    ch.setUint16(12,dosTime,true);ch.setUint16(14,dosDate,true);
    ch.setUint32(16,crc,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);
    ch.setUint16(28,nameU8.length,true);ch.setUint16(30,0,true);ch.setUint16(32,0,true);
    ch.setUint16(34,0,true);ch.setUint16(36,0,true);ch.setUint32(38,0,true);
    ch.setUint32(42,offset,true);
    central.push(new Uint8Array(ch.buffer),nameU8);
    offset+=30+nameU8.length+data.length;
  }
  let cdSize=0;central.forEach(c=>cdSize+=c.length);
  const eocd=new DataView(new ArrayBuffer(22));
  eocd.setUint32(0,0x06054b50,true);eocd.setUint16(4,0,true);eocd.setUint16(6,0,true);
  eocd.setUint16(8,files.length,true);eocd.setUint16(10,files.length,true);
  eocd.setUint32(12,cdSize,true);eocd.setUint32(16,offset,true);eocd.setUint16(20,0,true);
  const out=new Uint8Array(offset+cdSize+22);let p=0;
  for(const c of[...chunks,...central,new Uint8Array(eocd.buffer)]){out.set(c,p);p+=c.length}
  return out}

/* ---------------- XML helpers ---------------- */
function xmlEsc(s){return String(s).replace(/[&<>"']/g,c=>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]))}
function colName(i){let s="";i++;
  while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s}

function sheetXML(rows,opt){
  opt=opt||{};
  const rtl=opt.rtl!==false;
  let cols="";
  if(opt.widths)cols="<cols>"+opt.widths.map((w,i)=>
    `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("")+"</cols>";
  let body="";
  rows.forEach((r,ri)=>{
    body+=`<row r="${ri+1}">`;
    r.forEach((cell,ci)=>{
      if(cell==null||cell==="")return;
      const ref=colName(ci)+(ri+1),sty=ri===0?' s="1"':"";
      if(typeof cell==="number"&&isFinite(cell))
        body+=`<c r="${ref}"${sty}><v>${cell}</v></c>`;
      else{
        let sv=String(cell);
        if(/^[=+\-@\t\r]/.test(sv))sv="'"+sv;
        body+=`<c r="${ref}"${sty} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(sv)}</t></is></c>`;
      }
    });
    body+="</row>"});
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView ${rtl?'rightToLeft="1" ':""}workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${body}</sheetData></worksheet>`}

/* sheets: [{name, rows:[[cell,...]], widths:[..]}] -> Uint8Array */
function xlsxBuild(sheets){
  const enc=new TextEncoder();
  const ct=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xmlEsc(s.name.slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets></workbook>`;
  const wbRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF0A5C48"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD7F2E9"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;
  const files=[
    {name:"[Content_Types].xml",data:enc.encode(ct)},
    {name:"_rels/.rels",data:enc.encode(rels)},
    {name:"xl/workbook.xml",data:enc.encode(wb)},
    {name:"xl/_rels/workbook.xml.rels",data:enc.encode(wbRels)},
    {name:"xl/styles.xml",data:enc.encode(styles)},
    ...sheets.map((s,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,
      data:enc.encode(sheetXML(s.rows,{widths:s.widths}))}))];
  return zipStore(files)}

if(typeof module!=="undefined")
  module.exports={crc32,zipStore,xlsxBuild,sheetXML,colName,xmlEsc};
