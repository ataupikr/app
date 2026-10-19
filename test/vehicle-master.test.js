import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createVehicleMaster} from '../vehicle-master.js';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Migrasi master kendaraan idempoten dan mempertahankan snapshot kunjungan lama',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec("PRAGMA foreign_keys=ON; CREATE TABLE visits(id INTEGER PRIMARY KEY,plate TEXT,unit TEXT,customer TEXT,phone TEXT);CREATE TABLE items(id INTEGER PRIMARY KEY);INSERT INTO visits VALUES(1,'B 123 ABC','Jeep Cherokee','Pemilik Lama','123'),(2,'B123ABC','Jeep Wrangler','Pemilik Baru','456')");
 createVehicleMaster(db);assert.equal(db.prepare('SELECT COUNT(*) n FROM vehicles').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM vehicle_models').get().n,2);assert.equal(db.prepare('SELECT customer FROM vehicles').get().customer,'Pemilik Baru');assert.equal(db.prepare('SELECT customer FROM visits WHERE id=1').get().customer,'Pemilik Lama');assert.equal(db.prepare('SELECT vehicle_id FROM visits WHERE id=1').get().vehicle_id,1);assert.notEqual(db.prepare('SELECT model_id FROM visits WHERE id=1').get().model_id,db.prepare('SELECT model_id FROM visits WHERE id=2').get().model_id);createVehicleMaster(db);assert.equal(db.prepare('SELECT COUNT(*) n FROM vehicles').get().n,1);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db.close()}
});

test('Master kendaraan dan relasi sparepart: validasi, snapshot, kecocokan, dan hak akses',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'26motor-master-'));const port=5500+Math.floor(Math.random()*1000);
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,DATA_DIR:dir,PORT:String(port),INITIAL_PASSWORD:'MasterTest123!'},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',b=>errors+=b);await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Startup '+code+': '+errors)))});
 let cookie='';const req=async(endpoint,body,session=cookie)=>{const r=await fetch(`http://127.0.0.1:${port}/api/${endpoint}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',cookie:session},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 const ok=async promise=>{const r=await promise;assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
 let jeep,toyota,vehicle,visit,item,otherItem;
 try{cookie=(await req('login',{email:'admin@26motor.local',password:'MasterTest123!'})).cookie;
 await t.test('Tipe unik, tahun valid, dan nomor polisi dinormalisasi',async()=>{
  jeep=(await ok(req('vehicle-models',{brand:'Jeep',model:'Wrangler',variant:'JK',engine:'3.6 V6',year_start:2012,year_end:2018}))).id;
  toyota=(await ok(req('vehicle-models',{brand:'Toyota',model:'Avanza'}))).id;
  assert.equal((await req('vehicle-models',{brand:' jeep ',model:'Wrangler',variant:'JK',engine:'3.6 V6',year_start:2012,year_end:2018})).status,400);
  assert.equal((await req('vehicle-models',{brand:'X',model:'Y',year_start:2020,year_end:2010})).status,400);
  assert.equal((await req('vehicle-master',{plate:'B 1 ABC',model_id:jeep,year:2020,customer:'Budi'})).status,400);
  vehicle=(await ok(req('vehicle-master',{plate:'b 1 abc',model_id:jeep,year:2015,customer:'Budi',phone:'0812',vin:'VIN-001'}))).id;
  assert.equal((await req('vehicle-master',{plate:'B1ABC',model_id:jeep,customer:'Duplikat'})).status,400);
 });
 await t.test('Kunjungan memakai master dan mengabaikan identitas palsu dari formulir',async()=>{
  visit=(await ok(req('visits',{vehicle_id:vehicle,customer:'Palsu',plate:'Palsu',unit:'Palsu',complaint:'Servis'}))).id;
  let s=await ok(req('state'));const v=s.visits.find(v=>v.id===visit);assert.equal(v.plate,'B 1 ABC');assert.equal(v.customer,'Budi');assert.equal(v.vehicle_id,vehicle);assert.equal(v.model_id,jeep);assert.equal(v.vehicle_year,2015);
  await ok(req('vehicle-master',{id:vehicle,plate:'B 1 ABC',model_id:jeep,year:2015,customer:'Nama Baru'}));s=await ok(req('state'));assert.equal(s.visits.find(v=>v.id===visit).customer,'Budi');assert.equal(s.vehicles[0].customer,'Nama Baru');
  assert.equal((await req('vehicle-models',{id:jeep,brand:'Jeep',model:'Wrangler',year_start:2017})).status,400);
 });
 await t.test('Sparepart multi-tipe disimpan sebagai relasi; tipe yang salah ditolak atomik',async()=>{
  await ok(req('items',{sku:'JK-01',name:'Filter Jeep',category:'Filter',qty:5,cost:100,price:150,fitment_mode:'specific',model_ids:[jeep]}));
  await ok(req('items',{sku:'AV-01',name:'Filter Avanza',category:'Filter',qty:5,cost:100,price:150,fitment_mode:'specific',model_ids:[toyota]}));
  let s=await ok(req('state'));item=s.items.find(i=>i.sku==='JK-01').id;otherItem=s.items.find(i=>i.sku==='AV-01').id;
  assert.equal((await req('line',{visit,item:otherItem,qty:1})).status,400);assert.equal((await req('reserve',{visit,item:otherItem,qty:1})).status,400);
  s=await ok(req('state'));assert.equal(s.items.find(i=>i.id===otherItem).qty,5);assert.equal(s.reservations.length,0);assert.equal(s.lines.length,0);
  await ok(req('line',{visit,item,qty:1}));await ok(req('reserve',{visit,item,qty:1}));assert.equal((await req('item-fitment',{item,fitment_mode:'specific',model_ids:[toyota]})).status,400);
  await ok(req('item-fitment',{item,fitment_mode:'specific',model_ids:[jeep,toyota]}));s=await ok(req('state'));assert.equal(s.item_vehicle_models.filter(r=>r.item_id===item).length,2);
  assert.equal((await req('item-fitment',{item,fitment_mode:'specific',model_ids:[]})).status,400);assert.equal((await req('item-fitment',{item,fitment_mode:'specific',model_ids:[99999]})).status,400);
  s=await ok(req('state'));assert.equal(s.item_vehicle_models.filter(r=>r.item_id===item).length,2);
  await ok(req('item-fitment',{item,fitment_mode:'universal',model_ids:[]}));s=await ok(req('state'));assert.equal(s.item_vehicle_models.filter(r=>r.item_id===item).length,0);
 });
 await t.test('Master supplier dan rak membuat kode otomatis, relasi, dan status yang tervalidasi',async()=>{
  const supplier=await ok(req('suppliers',{name:'Supplier Baru',address:'Jl. Pengujian 1',phone:'081234567890',contact_person:'Budi',email:'supplier@test.local'}));
  const rack=await ok(req('racks',{name:'A-02',zone:'Gudang A'}));
  const rack2=await ok(req('racks',{name:'B-03',zone:'Gudang B'}));
  let s=await ok(req('state'));assert.equal(s.suppliers.find(r=>r.id===supplier.id).code,'SUP-00001');assert.equal(s.racks.find(r=>r.id===rack.id).code,'RAK-00001');assert.equal(s.racks.find(r=>r.id===rack2.id).code,'RAK-00002');
  assert.equal((await req('suppliers',{name:'Kurang data'})).status,400);
  assert.equal((await req('suppliers',{name:'Nomor salah',address:'Alamat',phone:'abcde'})).status,400);
  assert.equal((await req('racks',{name:'a-02'})).status,400);
  const original=s.items.find(i=>i.id===item),payload={id:item,sku:original.sku,name:original.name,category:original.category,brand:original.brand||'',supplier_id:supplier.id,rack_id:rack.id,minimum:original.minimum};
  await ok(req('item-details',payload));s=await ok(req('state'));assert.equal(s.items.find(i=>i.id===item).supplier_id,supplier.id);assert.equal(s.items.find(i=>i.id===item).rack_id,rack.id);
  const record=s.racks.find(r=>r.id===rack.id);await ok(req('toggle-rack',{id:record.id,version:record.version}));
  assert.equal((await req('toggle-rack',{id:record.id,version:record.version})).status,409);
  await ok(req('item-details',payload));
  assert.equal((await req('items',{sku:'INACTIVE',name:'X',category:'X',rack_id:rack.id,fitment_mode:'universal'})).status,400);
  assert.equal((await req('item-details',{...payload,supplier_id:99999})).status,400);
  s=await ok(req('state'));await ok(req('toggle-rack',{id:rack.id,version:s.racks.find(r=>r.id===rack.id).version}));
  const sup=s.suppliers.find(r=>r.id===supplier.id);await ok(req('suppliers',{...sup,name:'Supplier Diperbarui',version:sup.version}));
  assert.equal((await ok(req('state'))).items.find(i=>i.id===item).supplier,'Supplier Diperbarui');
  const latest=(await ok(req('state'))).suppliers.find(r=>r.id===supplier.id);await ok(req('suppliers',{...latest,name:'Supplier Baru'}));
 });
 await t.test('Edit master sparepart memperbaiki rak tanpa mengubah stok, transaksi, dan relasi',async()=>{
  const before=await ok(req('state')),i=before.items.find(i=>i.id===item),payload={id:item,sku:i.sku,name:i.name,category:i.category,brand:i.brand||'',rack:'A-02',supplier:'Supplier Baru',minimum:3};
  await ok(req('item-details',payload));let after=await ok(req('state')),saved=after.items.find(i=>i.id===item);
  assert.equal(saved.rack,'A-02');assert.equal(saved.supplier,'Supplier Baru');assert.equal(saved.minimum,3);
  for(const key of ['qty','cost','price','fitment_mode'])assert.equal(saved[key],i[key]);
  for(const key of ['movements','journals','lines','reservations','item_vehicle_models'])assert.deepEqual(after[key],before[key]);
  const audit=after.audit.find(a=>a.action==='item-details');assert.equal(JSON.parse(audit.detail).after.rack,'A-02');assert.equal(JSON.parse(audit.detail).before.rack,i.rack);
  for(const invalid of [{price:1},{qty:999},{cost:0},{minimum:-1},{name:' '},{sku:'AV-01'}])assert.equal((await req('item-details',{...payload,...invalid})).status,400);
  assert.equal((await req('item-details',{...payload,id:99999})).status,404);
  assert.equal((await ok(req('state'))).items.find(i=>i.id===item).rack,'A-02');
 });
 await t.test('Master nonaktif ditolak untuk kunjungan baru; riwayat tetap tersedia',async()=>{
  await ok(req('toggle-vehicle',{id:vehicle}));assert.equal((await req('visits',{vehicle_id:vehicle,complaint:'X'})).status,400);await ok(req('toggle-vehicle',{id:vehicle}));await ok(req('toggle-vehicle-model',{id:jeep}));assert.equal((await req('visits',{vehicle_id:vehicle,complaint:'X'})).status,400);assert.equal((await ok(req('state'))).visits.length,1);await ok(req('toggle-vehicle-model',{id:jeep}));
 });
 await t.test('Teknisi tidak dapat mengubah master atau relasi; Admin Stock dapat memetakan sparepart',async()=>{
  await ok(req('users',{name:'Teknisi',email:'tech@test.local',password:'TechPassword123!',role:'Teknisi'}));const tech=(await req('login',{email:'tech@test.local',password:'TechPassword123!'})).cookie;
  assert.equal((await req('vehicle-models',{brand:'X',model:'X'},tech)).status,403);assert.equal((await req('vehicle-master',{plate:'X',customer:'X',model_id:jeep},tech)).status,403);assert.equal((await req('suppliers',{name:'X'},tech)).status,403);assert.equal((await req('racks',{name:'X'},tech)).status,403);assert.equal((await ok(req('state',undefined,tech))).suppliers.length,0);assert.equal((await req('item-details',{id:item},tech)).status,403);assert.equal((await req('item-fitment',{item,fitment_mode:'universal'},tech)).status,403);assert.equal((await ok(req('state',undefined,tech))).vehicles.length,0);
  await ok(req('users',{name:'Stock',email:'stock@test.local',password:'StockPassword123!',role:'Admin Stock'}));const stock=(await req('login',{email:'stock@test.local',password:'StockPassword123!'})).cookie;await ok(req('item-fitment',{item,fitment_mode:'specific',model_ids:[jeep]},stock));const i=(await ok(req('state'))).items.find(i=>i.id===item);await ok(req('item-details',{id:item,sku:i.sku,name:i.name,category:i.category,brand:i.brand||'',rack:'B-03',supplier:i.supplier||'',minimum:i.minimum},stock));assert.equal((await ok(req('state'))).items.find(i=>i.id===item).rack,'B-03');assert.equal((await req('vehicle-master',{plate:'Z',customer:'Z',model_id:jeep},stock)).status,403);
 });
 }finally{const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;await rm(dir,{recursive:true,force:true})}
});
