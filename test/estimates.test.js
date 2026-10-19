import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateEstimate} from '../public/estimate-math.js';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const sample={lines:[{kind:'part',qty:2,price:150000},{kind:'service',qty:1,price:100000}],discount_type:'percent',discount_value:10,tax_rate:11};
test('Estimasi menghitung jasa + sparepart, diskon, lalu pajak dari nilai setelah diskon',()=>{const c=calculateEstimate(sample);assert.equal(c.parts,300000);assert.equal(c.services,100000);assert.equal(c.subtotal,400000);assert.equal(c.discount_amount,40000);assert.equal(c.tax_base,360000);assert.equal(c.tax_amount,39600);assert.equal(c.total,399600);assert.equal(c.total,c.subtotal-c.discount_amount+c.tax_amount);assert.equal(calculateEstimate({...sample,discount_type:'amount',discount_value:25000,tax_rate:12}).total,420000)});
test('Kuantitas pecahan dibulatkan per baris ke rupiah; diskon penuh menghasilkan nol',()=>{const c=calculateEstimate({lines:[{kind:'part',qty:.125,price:19999}],discount_type:'percent',discount_value:100,tax_rate:11});assert.equal(c.subtotal,2500);assert.equal(c.total,0);assert.equal(c.tax_amount,0)});
test('Angka invalid, presisi berlebih, diskon berlebihan, dan persentase di luar rentang ditolak',()=>{for(const b of [{...sample,discount_value:101},{...sample,tax_rate:101},{...sample,discount_type:'amount',discount_value:400001},{...sample,tax_rate:-1},{...sample,tax_rate:1.234},{...sample,lines:[]},{...sample,lines:[{kind:'service',qty:0,price:1}]},{...sample,lines:[{kind:'part',qty:.0001,price:1}]},{...sample,lines:[{kind:'service',qty:1,price:1.5}]},{...sample,lines:[{kind:'part',qty:1,price:NaN}]}])assert.throws(()=>calculateEstimate(b));});

test('API estimasi: harga inventory, stok, persetujuan, revisi, dan pembatasan peran',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'26motor-estimate-')),port=6800+Math.floor(Math.random()*500);
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,DATA_DIR:dir,PORT:String(port),INITIAL_PASSWORD:'EstimateTest123!'},stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',d=>stderr+=d);await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Startup '+code+': '+stderr)))});
 let cookie='';const req=async(endpoint,body,session=cookie)=>{const r=await fetch(`http://127.0.0.1:${port}/api/${endpoint}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',cookie:session},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};const ok=async promise=>{const r=await promise;assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
 let vehicle,visit,item,otherItem,quote,admin,body,originalStock,movementCount;
 try{cookie=(await req('login',{email:'admin@26motor.local',password:'EstimateTest123!'})).cookie;
 const jeep=(await ok(req('vehicle-models',{brand:'Jeep',model:'Wrangler'}))).id,toyota=(await ok(req('vehicle-models',{brand:'Toyota',model:'Avanza'}))).id;
 vehicle=(await ok(req('vehicle-master',{plate:'B 1 EST',customer:'Budi',model_id:jeep}))).id;visit=(await ok(req('visits',{vehicle_id:vehicle,complaint:'Servis'}))).id;
 await ok(req('items',{sku:'EST-JEEP',name:'Filter Jeep',category:'Filter',qty:5,cost:100000,price:150000,fitment_mode:'specific',model_ids:[jeep]}));await ok(req('items',{sku:'EST-TOYOTA',name:'Filter Toyota',category:'Filter',qty:2,cost:100000,price:150000,fitment_mode:'specific',model_ids:[toyota]}));
 let s=await ok(req('state'));item=s.items.find(i=>i.sku==='EST-JEEP').id;otherItem=s.items.find(i=>i.sku==='EST-TOYOTA').id;originalStock=s.items.find(i=>i.id===item).qty;movementCount=s.movements.length;
 await ok(req('users',{name:'Admin Estimasi',email:'admin-est@test.local',role:'Admin',password:'AdminEstimate123!'}));admin=(await req('login',{email:'admin-est@test.local',password:'AdminEstimate123!'})).cookie;
 body={vehicle_id:vehicle,visit_id:visit,lines:[{kind:'part',item_id:item,qty:2,price:150000},{kind:'service',description:'Jasa servis',qty:1,price:100000}],discount_type:'percent',discount_value:10,tax_rate:11,notes:'Catatan estimasi'};
 await t.test('Admin menyimpan estimasi dengan total server; simulasi tidak mengubah stok atau jurnal',async()=>{
  quote=(await ok(req('estimates',{...body,total:1},admin))).id;s=await ok(req('state',undefined,admin));const e=s.estimates.find(e=>e.id===quote);assert.equal(e.total,399600);assert.equal(e.status,'Menunggu Persetujuan');assert.equal(e.lines[0].price,150000);assert.equal(s.items.find(i=>i.id===item).qty,originalStock);assert.equal(s.movements.length,movementCount);assert.equal(s.reservations.length,0);assert.equal(s.visits[0].invoice,null);
 });
 await t.test('Harga palsu, sparepart tidak cocok, dan diskon melebihi subtotal ditolak',async()=>{
  assert.equal((await req('estimates',{...body,lines:[{kind:'part',item_id:item,qty:1,price:1}]})).status,400);
  assert.equal((await req('estimates',{...body,lines:[{kind:'part',item_id:otherItem,qty:1,price:150000}]})).status,400);
  assert.equal((await req('estimates',{...body,discount_type:'amount',discount_value:999999999})).status,400);
  assert.equal((await ok(req('state'))).estimates.length,1);
 });
 await t.test('Kekurangan stok menjumlahkan baris item yang sama dan simulasi menghitung reservasi kunjungan sendiri',async()=>{
  const preview=await ok(req('estimate-preview',{...body,lines:[{kind:'part',item_id:item,qty:4},{kind:'part',item_id:item,qty:4}]}));assert.equal(preview.stock[0].requested,8);assert.equal(preview.stock[0].shortage,3);
  await ok(req('reserve',{visit,item,qty:2}));const own=await ok(req('estimate-preview',{...body,lines:[{kind:'part',item_id:item,qty:4}]}));assert.equal(own.stock[0].available,5);assert.equal(own.stock[0].shortage,0);
  const standalone=await ok(req('estimate-preview',{...body,visit_id:null,lines:[{kind:'part',item_id:item,qty:4}]}));assert.equal(standalone.stock[0].available,3);assert.equal(standalone.stock[0].shortage,1);
 });
 await t.test('Keputusan pelanggan memerlukan bukti dan terekam menurut revisi',async()=>{
  assert.equal((await req('estimate-decision',{id:quote,revision:1,status:'Setuju'},admin)).status,400);await ok(req('estimate-decision',{id:quote,revision:1,status:'Tidak Jadi',approval_note:'Pelanggan menolak via telepon'},admin));await ok(req('estimate-decision',{id:quote,revision:1,status:'Setuju',approval_note:'Pelanggan menyetujui via WhatsApp'},admin));s=await ok(req('state'));const e=s.estimates.find(e=>e.id===quote);assert.equal(e.status,'Estimasi Disetujui');assert.equal(s.visits.find(v=>v.id===visit).estimate_status,'Estimasi Disetujui');assert.ok(e.decision_at);assert.equal(e.events.filter(ev=>ev.action==='Keputusan pelanggan').length,2);
 });
 await t.test('Harga lama tetap snapshot; revisi mereset persetujuan dan versi basi ditolak',async()=>{
  const db=new DatabaseSync(path.join(dir,'workshop.sqlite'));db.prepare('UPDATE items SET price=200000 WHERE id=?').run(item);db.close();s=await ok(req('state'));let e=s.estimates.find(e=>e.id===quote);assert.equal(e.lines[0].price,150000);assert.equal(e.lines[0].current_price,200000);
  const edited={...body,id:quote,revision:e.revision,lines:e.lines.map(l=>({...l,qty:l.kind==='part'?3:l.qty}))};await ok(req('estimates',edited,admin));s=await ok(req('state'));e=s.estimates.find(e=>e.id===quote);assert.equal(e.revision,2);assert.equal(e.status,'Menunggu Persetujuan');assert.equal(s.visits.find(v=>v.id===visit).estimate_status,'Menunggu Persetujuan');assert.equal(e.approval_note,'');assert.equal(e.lines[0].price,150000);assert.equal((await req('estimates',edited)).status,409);
  const original=JSON.parse(e.events.find(ev=>ev.action==='Dibuat').detail).snapshot;assert.equal(original.lines[0].qty,2);assert.equal(original.total,399600);
  await ok(req('estimates',{...body,id:quote,revision:e.revision,lines:e.lines.map(l=>({...l,price:l.kind==='part'?200000:l.price,refresh_price:true}))},admin));s=await ok(req('state'));e=s.estimates.find(e=>e.id===quote);assert.equal(e.revision,3);assert.equal(e.lines[0].price,200000);assert.equal((await req('estimate-decision',{id:quote,revision:2,status:'Setuju',approval_note:'Basi'})).status,409);
 });
 let catalogService,serviceQuote;
 await t.test('Admin mengelola katalog harga jasa dengan kode unik dan validasi harga',async()=>{
  catalogService=(await ok(req('service-catalog',{code:'JSA-001',name:'Jasa servis berkala',category:'Servis',unit:'pekerjaan',price:100000},admin))).id;
  assert.equal((await req('service-catalog',{code:'jsa-001',name:'Duplikat',price:1},admin)).status,400);
  assert.equal((await req('service-catalog',{code:'JSA-002',name:'Harga invalid',price:-1},admin)).status,400);
  assert.equal((await req('service-catalog',{code:'JSA-002',name:'Harga pecahan',price:1.5},admin)).status,400);
  assert.equal((await req('service-catalog',{id:catalogService,version:0,code:'JSA-001',name:'Basi',price:1},admin)).status,409);
 });
 await t.test('Harga jasa dapat disesuaikan di estimasi tanpa mengubah katalog dan metadata acuan tidak dapat dipalsukan',async()=>{
  serviceQuote=(await ok(req('estimates',{vehicle_id:vehicle,visit_id:visit,lines:[{kind:'service',service_id:catalogService,description:'Nama palsu',qty:2,price:125000,standard_price:1,adjustment_note:'Pekerjaan tambahan'}]},admin))).id;
  s=await ok(req('state'));let e=s.estimates.find(e=>e.id===serviceQuote);assert.equal(e.total,250000);assert.equal(e.lines[0].price,125000);assert.equal(e.lines[0].standard_price,100000);assert.equal(e.lines[0].description,'Jasa servis berkala');assert.equal(e.lines[0].service_code,'JSA-001');assert.equal(e.lines[0].adjustment_note,'Pekerjaan tambahan');assert.equal(s.service_catalog.find(c=>c.id===catalogService).price,100000);
  await ok(req('estimate-decision',{id:serviceQuote,revision:1,status:'Setuju',approval_note:'Setuju harga khusus'},admin));
  await ok(req('service-catalog',{id:catalogService,version:1,code:'JSA-001',name:'Jasa servis berkala',category:'Servis',unit:'pekerjaan',price:200000},admin));
  s=await ok(req('state'));e=s.estimates.find(e=>e.id===serviceQuote);assert.equal(e.lines[0].standard_price,100000);assert.equal(e.lines[0].price,125000);assert.equal(e.lines[0].current_standard_price,200000);assert.equal(e.status,'Estimasi Disetujui');
  const unchanged=await ok(req('estimates',{vehicle_id:vehicle,visit_id:visit,id:e.id,revision:e.revision,lines:e.lines},admin));assert.equal(unchanged.revision,1);
 });
 await t.test('Revisi harga jasa mereset persetujuan; jasa nonaktif mempertahankan snapshot dan tidak ditawarkan untuk estimasi baru',async()=>{
  s=await ok(req('state'));let e=s.estimates.find(e=>e.id===serviceQuote);
  await ok(req('estimates',{vehicle_id:vehicle,visit_id:visit,id:e.id,revision:e.revision,lines:e.lines.map(l=>({...l,price:150000}))},admin));
  s=await ok(req('state'));e=s.estimates.find(e=>e.id===serviceQuote);assert.equal(e.status,'Menunggu Persetujuan');assert.equal(e.revision,2);assert.equal(e.lines[0].standard_price,100000);
  await ok(req('toggle-service',{id:catalogService,version:2},admin));
  assert.equal((await req('estimates',{vehicle_id:vehicle,lines:[{kind:'service',service_id:catalogService,qty:1,price:200000}]},admin)).status,400);
  await ok(req('estimates',{vehicle_id:vehicle,visit_id:visit,id:e.id,revision:e.revision,lines:e.lines.map(l=>({...l,price:160000}))},admin));
  s=await ok(req('state'));e=s.estimates.find(e=>e.id===serviceQuote);assert.equal(e.lines[0].standard_price,100000);assert.equal(e.lines[0].price,160000);
  assert.equal((await req('estimates',{vehicle_id:vehicle,visit_id:visit,id:e.id,revision:e.revision,lines:e.lines.map(l=>({...l,refresh_service:true,price:200000}))},admin)).status,400);
  await ok(req('toggle-service',{id:catalogService,version:3},admin));
  await ok(req('estimates',{vehicle_id:vehicle,visit_id:visit,id:e.id,revision:e.revision,lines:e.lines.map(l=>({...l,refresh_service:true,price:200000}))},admin));s=await ok(req('state'));e=s.estimates.find(e=>e.id===serviceQuote);assert.equal(e.lines[0].standard_price,200000);assert.equal(e.total,400000);assert.equal(s.items.find(i=>i.id===item).qty,originalStock);
 });
 await t.test('Harga deal tervalidasi, status Estimasi Disetujui, PDF terlindungi, dan revisi menghapus kesepakatan lama',async()=>{
  const id=(await ok(req('estimates',{vehicle_id:vehicle,lines:[{kind:'service',description:'Jasa dokumen customer',qty:1,price:250000}],discount_type:'amount',discount_value:10000,tax_rate:11,notes:'Catatan untuk customer'},admin))).id;
  let e=(await ok(req('state',undefined,admin))).estimates.find(e=>e.id===id);
  const payload={id,revision:e.revision,decision_version:e.decision_version,status:'Estimasi Disetujui',approval_note:'Kesepakatan via WhatsApp'};
  for(const deal_price of [null,'',-1,1.5,'abc',true])assert.equal((await req('estimate-decision',{...payload,deal_price},admin)).status,400);
  await ok(req('estimate-decision',{...payload,deal_price:260000},admin));assert.equal((await req('estimate-decision',{...payload,deal_price:250000},admin)).status,409);
  e=(await ok(req('state',undefined,admin))).estimates.find(e=>e.id===id);assert.equal(e.status,'Estimasi Disetujui');assert.equal(e.deal_price,260000);assert.equal(e.total,266400);assert.equal(JSON.parse(e.events[0].detail).deal_price,260000);
  const url='http://127.0.0.1:'+port+'/api/estimate-document/'+id+'-r'+e.revision+'-d'+e.decision_version+'.pdf';const response=await fetch(url,{headers:{cookie:admin}});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/pdf/);assert.match(response.headers.get('content-disposition'),/attachment/);assert.ok(Buffer.from(await response.arrayBuffer()).subarray(0,5).equals(Buffer.from('%PDF-')));
  assert.equal((await fetch(url)).status,401);
  const unchanged=await ok(req('estimates',{...e,lines:e.lines},admin));assert.equal(unchanged.revision,e.revision);assert.equal((await ok(req('state',undefined,admin))).estimates.find(e=>e.id===id).deal_price,260000);
  await ok(req('estimates',{...e,lines:e.lines.map(l=>({...l,price:300000}))},admin));e=(await ok(req('state',undefined,admin))).estimates.find(e=>e.id===id);assert.equal(e.status,'Menunggu Persetujuan');assert.equal(e.deal_price,null);assert.equal((await fetch(url,{headers:{cookie:admin}})).status,409);
 });
 await t.test('Empat status persetujuan mencatat negosiasi dan pembatalan tanpa harga deal',async()=>{
  const id=(await ok(req('estimates',{vehicle_id:vehicle,lines:[{kind:'service',description:'Jasa negosiasi',qty:1,price:100000}]},admin))).id;
  let e=(await ok(req('state',undefined,admin))).estimates.find(e=>e.id===id);assert.equal(e.status,'Menunggu Persetujuan');
  for(const status of ['Di Negosiasi','Tidak Jadi','Estimasi Disetujui','Di Negosiasi','Menunggu Persetujuan']){
   if(status!=='Menunggu Persetujuan')assert.equal((await req('estimate-decision',{id,revision:e.revision,decision_version:e.decision_version,status,deal_price:90000},admin)).status,400);
   await ok(req('estimate-decision',{id,revision:e.revision,decision_version:e.decision_version,status,deal_price:90000,approval_note:'Keputusan customer tercatat'},admin));
   e=(await ok(req('state',undefined,admin))).estimates.find(e=>e.id===id);assert.equal(e.status,status);assert.equal(e.deal_price,status==='Estimasi Disetujui'?90000:null);if(status==='Menunggu Persetujuan')assert.equal(e.decision_at,null);
  }
  assert.equal((await req('estimate-decision',{id,revision:e.revision,status:'Status tidak dikenal',approval_note:'X'},admin)).status,400);
 });
 await t.test('Estimasi terbaru menyinkronkan WO, mencegah pengerjaan tanpa persetujuan, dan menjaga pekerjaan final',async()=>{
  const v=(await ok(req('visits',{vehicle_id:vehicle,complaint:'Sinkronisasi estimasi'}))).id;
  const draft={vehicle_id:vehicle,visit_id:v,lines:[{kind:'service',description:'Servis sinkronisasi',qty:1,price:100000}]};
  const first=(await ok(req('estimates',draft,admin))).id;
  const currentVisit=async()=>(await ok(req('state'))).visits.find(row=>row.id===v);
  const currentEstimate=async id=>(await ok(req('state',undefined,admin))).estimates.find(row=>row.id===id);
  const decide=async(id,status)=>{const e=await currentEstimate(id);return ok(req('estimate-decision',{id,revision:e.revision,decision_version:e.decision_version,status,deal_price:90000,approval_note:'Keputusan customer'},admin))};
  assert.equal((await currentVisit()).progress,'Menunggu Persetujuan');
  assert.equal((await req('progress',{id:v,progress:'Dikerjakan'})).status,400);
  await decide(first,'Di Negosiasi');assert.equal((await currentVisit()).progress,'Di Negosiasi');
  await decide(first,'Tidak Jadi');assert.equal((await currentVisit()).progress,'Tidak Jadi');
  await decide(first,'Estimasi Disetujui');assert.equal((await currentVisit()).progress,'Siap Dikerjakan');
  await ok(req('progress',{id:v,progress:'Dikerjakan'}));await decide(first,'Estimasi Disetujui');assert.equal((await currentVisit()).progress,'Dikerjakan');
  const second=(await ok(req('estimates',draft,admin))).id;assert.equal((await currentVisit()).progress,'Menunggu Persetujuan');
  await decide(first,'Estimasi Disetujui');assert.equal((await currentVisit()).progress,'Menunggu Persetujuan');
  await decide(second,'Estimasi Disetujui');assert.equal((await currentVisit()).progress,'Siap Dikerjakan');
  let e=await currentEstimate(second);await ok(req('estimates',{...e,notes:'Revisi rincian untuk customer'},admin));assert.equal((await currentVisit()).progress,'Menunggu Persetujuan');
  await decide(second,'Estimasi Disetujui');await ok(req('progress',{id:v,progress:'QC'}));await decide(second,'Estimasi Disetujui');assert.equal((await currentVisit()).progress,'QC');
  await ok(req('progress',{id:v,progress:'Selesai'}));e=await currentEstimate(second);await ok(req('estimates',{...e,notes:'Catatan sesudah QC'},admin));assert.equal((await currentVisit()).progress,'Selesai');assert.equal((await currentVisit()).qc,1);
  await ok(req('line',{visit:v,description:'Jasa servis final',qty:1,price:100000}));assert.equal((await req('invoice',{visit:v})).status,400);await decide(second,'Estimasi Disetujui');await ok(req('invoice',{visit:v}));assert.equal((await req('estimate-decision',{id:second,revision:e.revision+1,status:'Di Negosiasi',approval_note:'Basi'},admin)).status,400);
  assert.equal((await req('progress',{id:v,progress:'Dikerjakan'})).status,400);
  const before=(await currentVisit()).progress;await ok(req('estimates',{...draft,visit_id:null},admin));assert.equal((await currentVisit()).progress,before);
 });
 await t.test('Finance, Admin Stock, dan Teknisi tidak dapat menulis atau membaca estimasi',async()=>{
  for(const role of ['Finance','Admin Stock','Teknisi']){const email=role.replaceAll(' ','').toLowerCase()+'@test.local';await ok(req('users',{name:role,email,role,password:'TestingPassword123!'}));const session=(await req('login',{email,password:'TestingPassword123!'})).cookie;for(const endpoint of ['estimates','estimate-preview','estimate-decision','service-catalog','toggle-service'])assert.equal((await req(endpoint,{...body,id:quote,revision:3,status:'Setuju',approval_note:'Tidak berwenang'},session)).status,403,role+' '+endpoint);assert.equal((await req('estimate-document/1-r1-d1.pdf',undefined,session)).status,403);assert.equal((await ok(req('state',undefined,session))).estimates.length,0);assert.equal((await ok(req('state',undefined,session))).service_catalog.length,0)}
  assert.equal((await req('items',{sku:'ADMIN-NO',name:'X',category:'X'},admin)).status,403);assert.equal((await req('users',{name:'X',email:'x@test.local',role:'Super Admin',password:'TestingPassword123!'},admin)).status,403);
 });
 await t.test('Sparepart dan jasa manual tersimpan, direvisi, masuk PDF, dan tidak mengubah inventory',async()=>{
  const before=await ok(req('state',undefined,admin)),draft={vehicle_id:vehicle,lines:[{kind:'part',manual:true,description:'Selang khusus pesanan',sku:'CUSTOM-01',qty:2,price:125000},{kind:'service',description:'Fabrikasi khusus',qty:1,price:200000}],discount_type:'percent',discount_value:10,tax_rate:11};
  const preview=await ok(req('estimate-preview',draft,admin));assert.equal(preview.total,449550);assert.deepEqual(preview.stock,[]);
  const saved=await ok(req('estimates',draft,admin));let state=await ok(req('state',undefined,admin)),e=state.estimates.find(e=>e.id===saved.id);assert.equal(e.lines[0].manual,true);assert.equal(e.lines[0].item_id,null);assert.equal(e.lines[0].sku,'CUSTOM-01');assert.equal(e.lines[1].service_id,null);assert.equal(e.parts,250000);assert.equal(e.services,200000);assert.equal(e.total,449550);assert.deepEqual(state.items.map(i=>[i.id,i.qty,i.price]),before.items.map(i=>[i.id,i.qty,i.price]));assert.equal(state.journals.length,before.journals.length);assert.equal(state.movements.length,before.movements.length);assert.equal(state.service_catalog.length,before.service_catalog.length);
  assert.equal((await ok(req('estimates',{...e},admin))).revision,e.revision);
  const lines=e.lines.map(l=>({...l,price:l.kind==='part'?150000:l.price}));await ok(req('estimates',{...e,lines},admin));e=(await ok(req('state',undefined,admin))).estimates.find(x=>x.id===e.id);assert.equal(e.revision,2);assert.equal(e.parts,300000);
  const pdf=await fetch(`http://127.0.0.1:${port}/api/estimate-document/${e.id}-r${e.revision}-d${e.decision_version}.pdf`,{headers:{cookie:admin}});assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  for(const line of [{kind:'part',manual:true,description:'',qty:1,price:1},{kind:'part',manual:true,item_id:item,description:'Tidak boleh',qty:1,price:1},{kind:'part',description:'Tanpa mode manual',qty:1,price:1},{kind:'part',manual:true,description:'X',qty:1,price:-1},{kind:'service',description:'',qty:1,price:1}])assert.equal((await req('estimates',{...draft,lines:[line]},admin)).status,400);
 });
 }finally{const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;await rm(dir,{recursive:true,force:true})}
});
