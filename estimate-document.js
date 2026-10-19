import PDFDocument from 'pdfkit';
import path from 'node:path';
const money=n=>'Rp '+Number(n||0).toLocaleString('id-ID');
const clean=v=>String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
const documentDate=value=>value?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'long',year:'numeric'}).format(new Date(value)):'Belum tersedia';
export function buildEstimatePdf(estimate){return buildDocumentPdf(estimate,false)}
export function buildInvoicePdf(invoice){return buildDocumentPdf(invoice,true)}
function buildDocumentPdf(estimate,invoice){return new Promise((resolve,reject)=>{
 const e=estimate,code=(invoice?'INV-':'EST-')+String(e.id).padStart(5,'0'),revision=invoice?'':' / Revisi '+e.revision,doc=new PDFDocument({size:'A4',margins:{left:42,right:42,top:136,bottom:58},autoFirstPage:false,bufferPages:true,info:{Title:(invoice?'Invoice ':'Estimasi ')+code+revision,Author:'26 Motor Premium',Subject:invoice?'Invoice jasa dan sparepart':'Estimasi biaya jasa dan sparepart'}}),chunks=[];
 doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
 try{
 doc.registerFont('Main',path.resolve('public/assets/dm-sans.ttf'));doc.font('Main');
 const left=42,right=553,width=511;
 const line=(y)=>doc.strokeColor('#dbe4ef').lineWidth(.6).moveTo(left,y).lineTo(right,y).stroke();
 function header(){doc.image(path.resolve('public/assets/logo-premium.png'),left,30,{fit:[140,65]});doc.fontSize(20).fillColor('#1268cf').text(invoice?'INVOICE':'ESTIMASI BIAYA',267,39,{width:286,align:'right'});doc.fontSize(9).fillColor('#50617a').text(code+revision,267,69,{width:286,align:'right'});doc.fontSize(9).text('26 MOTOR PREMIUM',left,105,{width:300});line(123);doc.y=140;}
 doc.on('pageAdded',header);doc.addPage();
 function ensure(height){if(doc.y+height>doc.page.height-65)doc.addPage();}
 function paragraph(value,size=10,color='#233b59'){doc.fontSize(size).fillColor(color).text(clean(value),left,doc.y,{width,lineGap:3});doc.moveDown(.5)}
 paragraph('Kepada Yth. '+e.customer,12);paragraph('Kendaraan: '+e.plate+' | '+e.unit,10);
 paragraph('Tanggal penerbitan '+(invoice?'invoice':'estimasi')+': '+documentDate(e.created),10);
 if(!invoice&&e.revision>1){const revised=e.events?.find(event=>event.action==='Direvisi'&&event.revision===e.revision);if(revised)paragraph('Tanggal revisi '+e.revision+': '+documentDate(revised.created),9,'#50617a');}
 if(invoice){paragraph('Work Order: WO-'+String(e.visit).padStart(5,'0'),9,'#50617a');if(e.estimate_id)paragraph('Estimasi disetujui: EST-'+String(e.estimate_id).padStart(5,'0')+' / Revisi '+e.estimate_revision,9,'#50617a');}
 else paragraph('Status: '+(e.status==='Menunggu Persetujuan'?'Menunggu Persetujuan Pelanggan':e.status),9,'#50617a');
 doc.moveDown(.5);
 function tableHead(){ensure(34);const y=doc.y;doc.rect(left,y,width,25).fill('#edf4fd');doc.fillColor('#355677').fontSize(9).text('RINCIAN JASA / SPAREPART',50,y+7,{width:273});doc.text('QTY',326,y+7,{width:40,align:'right'});doc.text('HARGA',372,y+7,{width:80,align:'right'});doc.text('JUMLAH',458,y+7,{width:87,align:'right'});doc.y=y+31;}
 tableHead();
 for(const row of e.lines){const description=(row.kind==='part'?'Sparepart: ':'Jasa: ')+clean(row.description)+(row.kind==='part'&&row.sku?' ('+clean(row.sku)+')':'');doc.fontSize(9.5);const h=Math.max(32,doc.heightOfString(description,{width:265})+18);if(doc.y+h>doc.page.height-65){doc.addPage();tableHead()}const y=doc.y;doc.fillColor('#233b59').text(description,50,y+5,{width:265});doc.fontSize(9).text(Number(row.qty).toLocaleString('id-ID'),326,y+5,{width:40,align:'right'});doc.text(money(row.price),372,y+5,{width:80,align:'right'});doc.text(money(row.line_total),458,y+5,{width:87,align:'right'});line(y+h);doc.y=y+h+3;}
 ensure(210);doc.moveDown(.6);
 const totals=invoice?[['Biaya jasa',e.services],['Biaya sparepart',e.parts],...(e.estimate_id?[['Subtotal',e.subtotal],['Diskon',-e.discount_amount],['Pajak ('+e.tax_rate+'%)',e.tax_amount],['Penyesuaian deal',e.deal_adjustment]]:[]),['Total invoice',e.total],...(e.paid!==undefined?[['Pembayaran diterima',e.paid],['Sisa tagihan',e.remaining]]:[])]:[['Biaya jasa',e.services],['Biaya sparepart',e.parts],['Subtotal',e.subtotal],['Diskon',-e.discount_amount],['Pajak estimasi ('+e.tax_rate+'%)',e.tax_amount],['Total estimasi',e.total]];
 if(!invoice&&e.deal_price!==null&&e.deal_price!==undefined){totals.push(['Penyesuaian deal',e.deal_price-e.total],['Harga deal (total akhir)',e.deal_price]);}
 for(const [label,value] of totals){ensure(25);const y=doc.y,emphasis=label==='Harga deal (total akhir)'||label==='Total estimasi'||label==='Total invoice';if(emphasis)doc.rect(284,y-3,269,25).fill(label==='Harga deal (total akhir)'?'#e7f5ec':'#edf4fd');doc.fontSize(9.5).fillColor('#233b59').text(label,292,y+3,{width:150});doc.text((value<0?'- ':'')+money(Math.abs(value)),444,y+3,{width:101,align:'right'});doc.y=y+27;}
 doc.moveDown(.8);
 if(e.notes){paragraph('Catatan untuk customer',10);paragraph(e.notes,9,'#50617a');}
 ensure(90);if(!invoice)paragraph(e.deal_price!==null&&e.deal_price!==undefined?'Harga deal adalah total akhir kesepakatan. Rincian diskon dan pajak di atas merupakan acuan estimasi sebelum penyesuaian deal.':'Dokumen ini adalah estimasi biaya. Harga akhir mengikuti kesepakatan pekerjaan dengan customer.',9,'#50617a');
 if(invoice&&e.payment_status)paragraph('Status pembayaran: '+e.payment_status,10);
 paragraph(invoice?'Status pembayaran sesuai catatan sistem saat dokumen diunduh.':'Dokumen estimasi ini bukan invoice atau bukti pembayaran.',9,'#50617a');
 const count=doc.bufferedPageRange().count;
 for(let i=0;i<count;i++){doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.fontSize(8).fillColor('#7a8b9f').text(code+revision+' | Halaman '+(i+1)+' dari '+count,left,doc.page.height-38,{width,lineBreak:false,align:'center'});doc.page.margins.bottom=bottom;}
 doc.end();
 }catch(error){doc.destroy();reject(error)}
 });}
