import ExcelJS from 'exceljs';
const fail=message=>{throw Object.assign(Error(message),{status:400})};
export function excelCell(value,heading){
 if(typeof value==='number'&&Number.isFinite(value))return {value,numFmt:/tahun|revisi/i.test(heading)?'0':'#,##0.###'};
 const text=String(value??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');if(text.length>32767)fail('Isi sel terlalu panjang untuk Excel');
 if(/kode|nomor|no\.|telepon|kontak|referensi|periode|email|tanggal|waktu|baris excel/i.test(heading))return {value:text};
 const currency=/^-?\s*Rp\s*-?[\d.]+(?:,\d+)?$/.test(text.trim());
 const quantitative=/qty|jumlah|debit|kredit|total|harga|modal|saldo|sisa|terbayar|nilai|minimum|neto|hpp|laba|pajak|diskon/i.test(heading);
 if(currency){const number=Number(text.replace(/Rp|\s|\./g,'').replace(',','.'));if(Number.isFinite(number))return {value:number,numFmt:'"Rp" #,##0;[Red]-"Rp" #,##0'};}
 if(quantitative&&/^[+-]?\d+(?:[.,]\d+)?$/.test(text.trim())){const number=Number(text.trim().replace(',','.'));if(Number.isFinite(number))return {value:number,numFmt:'#,##0.###'};}
 if(/margin|persen|pajak/i.test(heading)&&/^-?\d+(?:[.,]\d+)?%$/.test(text.trim()))return {value:Number(text.trim().replace('%','').replace(',','.'))/100,numFmt:'0.0%'};
 return {value:text};
}
export async function buildExcelOutput(payload,creator='26 Motor Premium'){
 const {columns,rows}=payload;if(!Array.isArray(columns)||!columns.length||columns.length>50||!columns.every(c=>typeof c==='string'&&c.length<=200)||!Array.isArray(rows)||!rows.length||rows.length>5000||!rows.every(row=>Array.isArray(row)&&row.length===columns.length&&row.every(v=>v===null||typeof v==='string'||typeof v==='number')))fail('Data ekspor Excel tidak valid');
 const workbook=new ExcelJS.Workbook();workbook.creator=creator;workbook.created=new Date();const title=String(payload.title||'Data').replace(/[\[\]:*?/\\]/g,' ').slice(0,31)||'Data';const sheet=workbook.addWorksheet(title,{views:[{state:'frozen',ySplit:1}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 sheet.addRow(columns);for(const source of rows){const row=sheet.addRow([]);source.forEach((value,index)=>{const cell=excelCell(value,columns[index]);row.getCell(index+1).value=cell.value;if(cell.numFmt)row.getCell(index+1).numFmt=cell.numFmt});}
 sheet.eachRow((row,index)=>{row.alignment={vertical:'top',wrapText:true};row.font={name:'Arial',size:11};if(index===1){row.height=28;row.font={name:'Arial',size:11,bold:true,color:{argb:'FFFFFFFF'}};row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF075AC9'}};}else{row.height=Math.min(240,Math.max(28,...row.values.filter(Boolean).map(v=>String(v).split('\n').length*16+12)));if(index%2===0)row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F6FD'}};}});
 sheet.columns.forEach((column,index)=>{column.width=Math.min(50,Math.max(18,columns[index].length+3,...rows.slice(0,100).map(row=>Math.min(44,String(row[index]??'').split('\n').reduce((max,line)=>Math.max(max,line.length),0))+2)))});sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:columns.length}};return Buffer.from(await workbook.xlsx.writeBuffer());
}
