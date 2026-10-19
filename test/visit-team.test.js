import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createVisitTeam} from '../visit-team.js';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
test('Migrasi teknisi tunggal menjadi tim dan PIC idempoten',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,role TEXT,active INTEGER);CREATE TABLE visits(id INTEGER PRIMARY KEY,technician INTEGER);INSERT INTO users VALUES(1,'Adi','Teknisi',1);INSERT INTO visits VALUES(1,1),(2,NULL)");
 const team=createVisitTeam(db);createVisitTeam(db);assert.equal(team.members(1).length,1);assert.equal(db.prepare('SELECT pic_technician_id FROM visits WHERE id=1').get().pic_technician_id,1);assert.equal(team.has(1,1),true);assert.equal(team.has(2,1),false);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db.close()}
});
test('Edit kendaraan masuk, beberapa teknisi, PIC, akses anggota tim, dan penguncian transaksi',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'26motor-team-')),port=3409;
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,DATA_DIR:dir,PORT:String(port),INITIAL_PASSWORD:'TeamTest123!'},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Startup '+code+': '+errors)))});
 let cookie='';const req=async(endpoint,body,session=cookie)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/'+endpoint,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',cookie:session},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 const ok=async p=>{const r=await p;assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
 try{
 cookie=(await req('login',{email:'admin@26motor.local',password:'TeamTest123!'})).cookie;
 const model=(await ok(req('vehicle-models',{brand:'Toyota',model:'Avanza'}))).id;
 const vehicle=(await ok(req('vehicle-master',{model_id:model,plate:'B 1 TIM',customer:'Budi',phone:'0812345'}))).id;
 const other=(await ok(req('vehicle-master',{model_id:model,plate:'B 2 TIM',customer:'Sari'}))).id;
 for(const name of ['adi','budi','candra'])await ok(req('users',{name,email:name+'@test.local',password:'TechPassword123!',role:'Teknisi'}));
 const users=(await ok(req('state'))).users,adi=users.find(u=>u.name==='adi').id,budi=users.find(u=>u.name==='budi').id,candra=users.find(u=>u.name==='candra').id;
 const visit=(await ok(req('visits',{vehicle_id:vehicle,complaint:'Servis',technician_ids:[adi,budi],pic_technician_id:budi}))).id;
 let v=(await ok(req('state'))).visits.find(v=>v.id===visit);
 assert.deepEqual(v.technician_ids.sort(),[adi,budi].sort());assert.equal(v.pic_technician_id,budi);assert.equal(v.pic_technician_name,'budi');
 await t.test('Anggota tim melihat dan memperbarui progres; teknisi lain ditolak',async()=>{
 for(const name of ['adi','budi']){const session=(await req('login',{email:name+'@test.local',password:'TechPassword123!'})).cookie;assert.equal((await ok(req('state',undefined,session))).visits.length,1);await ok(req('progress',{id:visit,progress:'Diagnosis'},session));assert.equal((await req('edit-visit',{id:visit},session)).status,403)}
 const session=(await req('login',{email:'candra@test.local',password:'TechPassword123!'})).cookie;assert.equal((await ok(req('state',undefined,session))).visits.length,0);assert.equal((await req('progress',{id:visit,progress:'Diagnosis'},session)).status,403);
 });
 await t.test('Edit menjaga nomor, waktu masuk, snapshot master, dan jejak audit',async()=>{
 v=(await ok(req('state'))).visits.find(v=>v.id===visit);const payload={id:visit,edit_version:v.edit_version,vehicle_id:vehicle,complaint:'Keluhan diperbaiki',km:12345,courier:'Pengantar',condition:'Baik',accessories:'Dongkrak',technician_ids:[adi,budi,candra],pic_technician_id:adi};
 await ok(req('edit-visit',payload));const state=await ok(req('state')),saved=state.visits.find(v=>v.id===visit);assert.equal(saved.entered,v.entered);assert.equal(saved.km,12345);assert.equal(saved.complaint,'Keluhan diperbaiki');assert.equal(saved.technician_ids.length,3);assert.equal(saved.pic_technician_id,adi);assert.equal(state.vehicles.find(v=>v.id===vehicle).plate,'B 1 TIM');assert.ok(state.audit.some(a=>a.action==='edit-visit'));assert.equal((await req('edit-visit',payload)).status,409);
 });
 await t.test('PIC harus anggota teknisi; kendaraan dan data transaksi tetap aman',async()=>{
 v=(await ok(req('state'))).visits.find(v=>v.id===visit);
 const payload={id:visit,edit_version:v.edit_version,vehicle_id:vehicle,complaint:'Servis',technician_ids:[adi],pic_technician_id:budi};assert.equal((await req('edit-visit',payload)).status,400);assert.equal((await req('assignment',{visit,technician_ids:[1],pic_technician_id:1})).status,400);
 await ok(req('line',{visit,description:'Jasa servis',qty:1,price:100000}));assert.equal((await req('edit-visit',{...payload,pic_technician_id:adi,vehicle_id:other})).status,400);assert.equal((await req('edit-visit',{...payload,pic_technician_id:adi,km:-1})).status,400);
 await ok(req('assignment',{visit,technician_ids:[adi,budi],pic_technician_id:budi}));
 const session=(await req('login',{email:'candra@test.local',password:'TechPassword123!'})).cookie;assert.equal((await ok(req('state',undefined,session))).visits.length,0);
 await ok(req('progress',{id:visit,progress:'Selesai'}));await ok(req('invoice',{visit}));v=(await ok(req('state'))).visits.find(v=>v.id===visit);assert.equal((await req('edit-visit',{...payload,edit_version:v.edit_version,pic_technician_id:adi})).status,400);assert.equal((await req('assignment',{visit,technician:adi})).status,400);
 await ok(req('payment',{invoice:v.invoice,amount:100000,method:'Tunai'}));await ok(req('release',{visit,receiver:'Budi'}));assert.equal((await req('edit-visit',{...payload,edit_version:v.edit_version,pic_technician_id:adi})).status,400);
 });
 }finally{const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;await rm(dir,{recursive:true,force:true})}
});
