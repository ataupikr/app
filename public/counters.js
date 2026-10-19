export const isCompletedWork=visit=>visit.progress==='Selesai'||Boolean(visit.exited);
// Records without an activation flag (for example legacy spareparts) remain active.
export const isActiveRecord=row=>![false,0,'0'].includes(row.active)&&row.status!=='Nonaktif';
// Detail datasets shared by counter cards and their linked lists.
export function counterData(state,label){
 const visits=state.visits||[],items=(state.items||[]).filter(isActiveRecord),payments=state.payments||[],movements=state.movements||[],invoices=visits.filter(v=>v.invoice);
 const financial=['Penerimaan Kas','Pembayaran Diterima','Penjualan Terposting','Penjualan','Piutang Pelanggan','Invoice Aktif','HPP Sparepart','Laba Kotor','Hutang Supplier','Pengeluaran Operasional'];
 const privileged=['Super Admin','Finance','Akuntan'].includes(state.user.role);
 if(financial.includes(label)&&!privileged)return null;
 if(label==='Nilai Persediaan'&&state.user.role==='Teknisi')return null;
 if(['Jurnal Terposting','Periode Terkunci'].includes(label)&&!['Super Admin','Akuntan'].includes(state.user.role))return null;
 if(['Supplier Aktif','Rak Aktif','Supplier Belum Lengkap'].includes(label)&&state.user.role==='Teknisi')return null;
 const col=(label,format='text')=>({label,format});
 const result=(columns,rows,total=rows.length,unit='data',note='')=>({label,columns,rows,total,unit,note});
 const vehicles=list=>result([col('Work Order'),col('Kendaraan'),col('Pelanggan'),col('Teknisi'),col('Progres'),col('Status')],list.map(v=>({visitId:v.id,exportFields:{'Nomor Work Order':`WO-${String(v.id).padStart(5,'0')}`,'Nomor Polisi':v.plate,'Kendaraan':v.unit,'Pelanggan':v.customer,'Teknisi':v.technician_name||'Belum ditugaskan','Status Pekerjaan':v.progress,'Status Kendaraan':v.status},values:[`WO-${String(v.id).padStart(5,'0')}`,`${v.plate} · ${v.unit}`,v.customer,v.technician_name||'Belum ditugaskan',v.progress,v.status]})));
 const active=visits.filter(v=>!v.exited);
 if(label==='Kendaraan di Bengkel')return vehicles(active);
 if(label==='Antrean Pekerjaan')return vehicles(active.filter(v=>!isCompletedWork(v)));
 if(label==='Pekerjaan Selesai')return vehicles(visits.filter(isCompletedWork));
 if(label==='Work Order Aktif')return vehicles(active.filter(v=>!['Selesai','Tidak Jadi'].includes(v.progress)));
 if(label==='Siap Keluar')return vehicles(visits.filter(v=>v.status==='Siap Keluar'));
 if(label==='Kendaraan Masuk Hari Ini'){
  const day=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date(d));
  return vehicles(visits.filter(v=>v.entered&&day(v.entered)===day(Date.now())));
 }
 if(label==='Siap Dikerjakan')return vehicles(active.filter(v=>v.progress==='Siap Dikerjakan'));
 if(['Supplier Aktif','Rak Aktif','Supplier Belum Lengkap'].includes(label)){const supplier=label!=='Rak Aktif',list=(state[supplier?'suppliers':'racks']||[]).filter(isActiveRecord).filter(r=>label!=='Supplier Belum Lengkap'||!String(r.address||'').trim()||!String(r.phone||'').trim());return result([col('Kode'),col('Nama'),col(supplier?'Alamat':'Zona'),col(supplier?'Kontak':'Keterangan')],list.map(r=>({values:[r.code,r.name,supplier?r.address:r.zone,supplier?r.phone:r.notes]})))}
 if(label==='Sparepart Belum Dipetakan')return result([col('Kode Sparepart'),col('Sparepart'),col('Kategori')],items.filter(i=>!i.fitment_mode||i.fitment_mode==='unverified').map(i=>({values:[i.sku,i.name,i.category]})));
 if(label==='Pengeluaran Operasional'){const list=state.expenses||[];return result([col('Waktu','date'),col('Kategori'),col('Penerima'),col('Referensi'),col('Jumlah','money')],list.map(e=>({values:[e.created,e.category,e.recipient,e.reference,e.amount]})),list.reduce((sum,e)=>sum+e.amount,0),'rupiah','Pengeluaran operasional tercatat, tidak termasuk pembayaran supplier.');}
 if(label==='Hutang Supplier'){const rows=movements.filter(m=>m.type==='Penerimaan').map(m=>{const paid=(state.supplier_payments||[]).filter(p=>p.movement===m.id).reduce((sum,p)=>sum+p.amount,0),total=Math.round(m.qty*m.cost);return {values:[m.source,m.item_name,total,paid,total-paid]}}).filter(r=>r.values[4]>0);return result([col('Referensi'),col('Sparepart'),col('Nilai penerimaan','money'),col('Terbayar','money'),col('Sisa hutang','money')],rows,rows.reduce((sum,r)=>sum+r.values[4],0),'rupiah');}
 if(label==='Jurnal Terposting')return result([col('Sumber'),col('Waktu','date'),col('Keterangan'),col('Debit','money'),col('Kredit','money')],(state.journals||[]).map(j=>{const entries=JSON.parse(j.entries);return {values:[j.source,j.created,j.memo,entries.reduce((sum,e)=>sum+(e.debit||0),0),entries.reduce((sum,e)=>sum+(e.credit||0),0)]}}));
 if(label==='Periode Terkunci')return result([col('Periode'),col('Status')],(state.periods||[]).filter(p=>p.closed).map(p=>({values:[p.month,'Terkunci']})));
 if(label==='Kendaraan Terdaftar')return result([col('Nomor polisi'),col('Tipe'),col('Tahun'),col('Pemilik'),col('Status')],(state.vehicles||[]).filter(v=>isActiveRecord(v)&&![false,0,'0'].includes(v.model_active)&&!(state.vehicle_models||[]).some(m=>m.id===v.model_id&&!isActiveRecord(m))).map(v=>({values:[v.plate,(state.vehicle_models||[]).find(m=>m.id===v.model_id)?.label||'—',v.year||'—',v.customer,v.active&&v.model_active?'Aktif':'Nonaktif']})));
 if(label==='Tipe Kendaraan')return result([col('Tipe kendaraan'),col('Status')],(state.vehicle_models||[]).filter(isActiveRecord).map(m=>({values:[m.label,m.active?'Aktif':'Nonaktif']})));
 if(label==='Sparepart Terpetakan')return result([col('Kode Sparepart'),col('Sparepart'),col('Kecocokan')],items.filter(i=>i.fitment_mode&&i.fitment_mode!=='unverified').map(i=>({values:[i.sku,i.name,i.fitment_mode==='universal'?'Universal':(state.item_vehicle_models||[]).filter(r=>r.item_id===i.id).map(r=>(state.vehicle_models||[]).find(m=>m.id===r.model_id)?.label||'—').join(', ')]})));
 if(['Menunggu Persetujuan','Estimasi Disetujui','Di Negosiasi','Tidak Jadi'].includes(label)){if(!['Super Admin','Admin'].includes(state.user.role))return null;const status={'Menunggu Persetujuan':'Menunggu Persetujuan','Estimasi Disetujui':'Estimasi Disetujui','Di Negosiasi':'Di Negosiasi','Tidak Jadi':'Tidak Jadi'}[label];return result([col('Estimasi'),col('Kendaraan'),col('Pelanggan'),col('Total estimasi','money'),col('Harga deal','money'),col('Keputusan')],(state.estimates||[]).filter(e=>isActiveRecord(e)&&e.status===status).map(e=>({values:['EST-'+String(e.id).padStart(5,'0'),e.plate,e.customer,e.total,e.deal_price??null,e.status]})))}
 if(['Total Jasa Katalog','Jasa Katalog Aktif','Jasa Katalog Nonaktif'].includes(label)){if(!['Super Admin','Admin'].includes(state.user.role))return null;return result([col('Kode'),col('Nama jasa'),col('Kategori'),col('Harga standar','money'),col('Satuan'),col('Status')],(state.service_catalog||[]).filter(s=>label==='Jasa Katalog Nonaktif'?!isActiveRecord(s):isActiveRecord(s)).map(s=>({values:[s.code,s.name,s.category,s.price,s.unit,s.active?'Aktif':'Nonaktif']})))}
 const stockLabels=['Total Kode Sparepart','Item Sparepart','Total Item','Unit Tersedia','Stok Kritis','Nilai Persediaan'];
 if(stockLabels.includes(label)){
  const list=label==='Stok Kritis'?items.filter(i=>i.qty<i.minimum):items;
  const valued=label==='Nilai Persediaan';
  const columns=[col('Kode Sparepart'),col('Sparepart'),col('Kategori'),col('Stok fisik','number'),col('Minimum','number')];
  if(valued)columns.push(col('Modal / unit','money'),col('Nilai persediaan','money'));
  const rows=list.map(i=>({values:[i.sku,i.name,i.category,i.qty,i.minimum,...(valued?[i.cost,i.qty>0&&i.cost===null?null:i.qty*i.cost]:[])]}));
  const missingValue=valued&&list.some(i=>i.qty>0&&i.cost===null);
  const total=missingValue?null:valued?list.reduce((s,i)=>s+i.qty*i.cost,0):label==='Unit Tersedia'?list.reduce((s,i)=>s+i.qty,0):list.length;
  return result(columns,rows,total,valued?'rupiah':label==='Unit Tersedia'?'unit':'data',missingValue?'Nilai persediaan belum lengkap: ada modal stok impor yang belum diisi. Lengkapi harga di Persediaan Sparepart.':label==='Unit Tersedia'?'Rincian per satuan: '+Object.entries(list.reduce((s,i)=>(s[i.unit||'unit']=(s[i.unit||'unit']||0)+i.qty,s),{})).map(([u,q])=>q+' '+u).join(', '):valued?'Nilai setiap item = stok fisik × modal rata-rata.':'');
 }
 if(label==='Kategori'){
  const categories=[...new Set(items.map(i=>i.category))];
  return result([col('Kategori'),col('Jumlah Kode Sparepart','number')],categories.map(category=>({values:[category||'Tanpa kategori',items.filter(i=>i.category===category).length]})),categories.length,'kategori');
 }
 if(label==='Penerimaan Kas'||label==='Pembayaran Diterima')return result([col('Waktu','date'),col('Invoice'),col('Metode'),col('Referensi'),col('Jumlah','money')],payments.map(p=>({values:[p.created,p.invoice?`INV-${String(p.invoice).padStart(5,'0')}`:`EST-${String(p.estimate_id).padStart(5,'0')}`,p.method,p.reference||'—',p.amount]})),payments.reduce((s,p)=>s+p.amount,0),'rupiah');
 if(['Penjualan Terposting','Penjualan','Piutang Pelanggan','Invoice Aktif'].includes(label)){
  const outstanding=label==='Piutang Pelanggan'||label==='Invoice Aktif';
  const list=outstanding?invoices.filter(v=>v.total>v.paid):invoices;
  return result([col('Invoice'),col('Pelanggan'),col('Kendaraan'),col('Total','money'),col('Terbayar','money'),col('Sisa','money')],list.map(v=>({visitId:v.id,values:[`INV-${String(v.invoice).padStart(5,'0')}`,v.customer,v.plate,v.total,v.paid,v.total-v.paid]})),label==='Invoice Aktif'?list.length:list.reduce((s,v)=>s+(outstanding?v.total-v.paid:v.total),0),label==='Invoice Aktif'?'data':'rupiah');
 }
 const sold=(state.lines||[]).filter(l=>l.item&&invoices.some(v=>v.id===l.visit));
 if(label==='HPP Sparepart')return result([col('Work Order'),col('Sparepart'),col('Jumlah neto','number'),col('Modal snapshot','money'),col('HPP','money')],sold.map(l=>({visitId:l.visit,values:[`WO-${String(l.visit).padStart(5,'0')}`,l.description,l.qty-l.returned,l.cost,Math.round((l.qty-l.returned)*l.cost)]})),sold.reduce((s,l)=>s+Math.round((l.qty-l.returned)*l.cost),0),'rupiah','HPP memakai modal saat transaksi dan dikurangi jumlah retur.');
 if(label==='Laba Kotor'){
  const rows=invoices.map(v=>{const cost=sold.filter(l=>l.visit===v.id).reduce((s,l)=>s+Math.round((l.qty-l.returned)*l.cost),0);return {visitId:v.id,values:[`INV-${String(v.invoice).padStart(5,'0')}`,v.customer,v.total,cost,v.total-cost]}});
  return result([col('Invoice'),col('Pelanggan'),col('Penjualan','money'),col('HPP','money'),col('Laba kotor','money')],rows,rows.reduce((s,r)=>s+r.values[4],0),'rupiah','Laba kotor = penjualan termasuk jasa − HPP sparepart, sebelum beban.');
 }
 if(label==='Total Mutasi')return result([col('Waktu','date'),col('Item'),col('Jenis'),col('Jumlah','number'),col('Referensi')],movements.map(m=>({values:[m.created,m.item_name,m.type,m.qty,m.source]})));
 if(label==='Perlu Perhatian'){
  const rows=items.filter(i=>i.qty<i.minimum).map(i=>({exportFields:{'Jenis':'Stok kritis','Referensi':i.sku,'Keterangan':i.name,'Stok':i.qty,'Minimum Stok':i.minimum,'Alasan':''},values:['Stok kritis',i.sku,i.name,`${i.qty} unit · minimum ${i.minimum}`]}));
  rows.push(...(state.approvals||[]).filter(a=>a.status==='Diajukan').map(a=>({exportFields:{'Jenis':'Persetujuan','Referensi':`VIS-${String(a.source).padStart(5,'0')}`,'Keterangan':a.kind,'Stok':'','Minimum Stok':'','Alasan':a.reason||''},values:['Persetujuan',`VIS-${String(a.source).padStart(5,'0')}`,a.kind,a.reason]})));
  return result([col('Jenis'),col('Referensi'),col('Keterangan'),col('Rincian')],rows);
 }
 return null;
}
