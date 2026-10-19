import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {workshopPlanning} from '../public/crm-reminder-tools.js';

test('Rencana masuk terhubung reminder, jadwal, penerimaan dan WO tanpa membuat kunjungan ganda',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'26motor-arrival-')),port=8600+Math.floor(Math.random()*300);
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,DATA_DIR:dir,PORT:String(port),INITIAL_PASSWORD:'ArrivalTest123!'},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',d=>errors+=d);
 let cookie='';const req=async(endpoint,body,session=cookie)=>{const response=await fetch(`http://127.0.0.1:${port}/api/${endpoint}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',cookie:session},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}};
 const ok=async promise=>{const r=await promise;assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
 let model,vehicle,vehicle2,reminder,plan,visit,body;
 try{
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Startup '+code+': '+errors)))});
  cookie=(await req('login',{email:'admin@26motor.local',password:'ArrivalTest123!'})).cookie;
  model=(await ok(req('vehicle-models',{brand:'Jeep',model:'JK'}))).id;
  vehicle=(await ok(req('vehicle-master',{model_id:model,plate:'B 123 PLAN',customer:'Andi',phone:'081234567890'}))).id;
  vehicle2=(await ok(req('vehicle-master',{model_id:model,plate:'B 124 PLAN',customer:'Budi'}))).id;
  reminder=(await ok(req('crm-reminders',{vehicle_id:vehicle,service_name:'Ganti oli',due_date:'2027-01-15',interval_months:6}))).id;
  body={vehicle_id:vehicle,reminder_id:reminder,planned_date:'2027-01-16',planned_time:'09:30',service_name:'Ganti oli',complaint:'Servis berkala',status:'Direncanakan'};
  await t.test('Menyimpan rencana tanpa posting kunjungan, stok atau akuntansi dan menggantikan jadwal reminder',async()=>{
   plan=(await ok(req('arrival-plans',body))).id;const s=await ok(req('state'));assert.equal(s.visits.length,0);assert.equal(s.journals.length,0);assert.equal(s.movements.length,0);assert.equal(s.crm_reminders[0].due_date,'2027-01-15');
   assert.deepEqual(workshopPlanning(s).days.map(d=>[d.date,d.vehicleCount,d.planCount,d.reminderCount]),[['2027-01-16',1,1,0]]);
   assert.equal((await req('arrival-plans',body)).status,400);assert.equal((await req('arrival-plans',{...body,planned_date:'2027-01-17'})).status,400);
   for(const bad of [{planned_date:'2027-02-30'},{planned_time:'25:00'},{vehicle_id:vehicle2},{service_name:''}])assert.equal((await req('arrival-plans',{...body,...bad})).status,400);
  });
  await t.test('Edit dan konfirmasi memakai versi, menolak tidak hadir untuk tanggal mendatang',async()=>{
   await ok(req('arrival-plans',{...body,id:plan,version:1,planned_time:'10:00'}));
   assert.equal((await req('arrival-plans',{...body,id:plan,version:1})).status,409);
   assert.equal((await req('arrival-plan-status',{id:plan,version:2,status:'Tidak Hadir',note:'Tes'})).status,400);
   await ok(req('arrival-plan-status',{id:plan,version:2,status:'Dikonfirmasi',note:'Pelanggan setuju jadwal'}));
  });
  await t.test('Hak akses Admin dan Finance tetap mematuhi izin pendataan / Gate Pass',async()=>{
   for(const [role,email,gatepass] of [['Admin','admin-plan@test.local','0'],['Finance','finance-plan@test.local','0'],['Teknisi','tech-plan@test.local','0']])await ok(req('users',{name:role,email,role,gatepass,password:'PlanRole123456!'}));
   const intake={vehicle_id:vehicle,complaint:'Servis berkala',arrival_plan_id:plan,arrival_plan_version:3};
   for(const email of ['admin-plan@test.local','finance-plan@test.local']){const session=(await req('login',{email,password:'PlanRole123456!'})).cookie;assert.equal((await req('visits',intake,session)).status,403)}
   const tech=(await req('login',{email:'tech-plan@test.local',password:'PlanRole123456!'})).cookie;assert.deepEqual((await ok(req('state',undefined,tech))).arrival_plans,[]);assert.equal((await req('arrival-plans',body,tech)).status,403);
  });
  await t.test('Kendaraan datang menjadi satu kunjungan meski dua request dikirim, langsung tersedia sebagai WO',async()=>{
   const intake={vehicle_id:vehicle,complaint:'Servis berkala',km:45000,courier:'Pemilik',arrival_plan_id:plan,arrival_plan_version:3};
   assert.equal((await req('visits',{...intake,arrival_plan_version:2})).status,409);assert.equal((await req('visits',{...intake,vehicle_id:vehicle2})).status,400);
   const results=await Promise.all([ok(req('visits',intake)),ok(req('visits',intake))]);assert.equal(results[0].id,results[1].id);visit=results[0].id;
   const s=await ok(req('state'));assert.equal(s.visits.length,1);assert.equal(s.visits[0].vehicle_id,vehicle);assert.equal(s.visits[0].progress,'Baru');assert.equal(s.arrival_plans[0].status,'Sudah Masuk');assert.equal(s.arrival_plans[0].visit_id,visit);assert.equal(s.arrival_plans[0].visit_progress,'Baru');assert.equal(s.crm_reminders[0].status,'Menunggu');assert.equal(workshopPlanning(s).days.length,0);assert.equal(workshopPlanning(s).present.length,1);
   assert.equal((await req('arrival-plans',{...body,id:plan,version:4})).status,400);assert.equal((await req('arrival-plans',{...body,planned_date:'2027-01-18'})).status,400);
   assert.equal(s.journals.length,0);assert.equal(s.payments.length,0);
  });
  await t.test('Kunjungan manual dapat ditautkan, sedangkan kendaraan yang masih masuk tidak dibuat ulang',async()=>{
   const second=(await ok(req('arrival-plans',{...body,reminder_id:null,planned_date:'2027-01-18'}))).id;
   assert.equal((await req('visits',{vehicle_id:vehicle,complaint:'Tes',arrival_plan_id:second,arrival_plan_version:1})).status,400);
   assert.equal((await req('arrival-plan-link',{id:second,version:1,visit_id:visit})).status,400);
   const manual=(await ok(req('visits',{vehicle_id:vehicle2,complaint:'Servis manual'}))).id;
   const other=(await ok(req('arrival-plans',{...body,vehicle_id:vehicle2,reminder_id:null}))).id;
   await ok(req('arrival-plan-link',{id:other,version:1,visit_id:manual}));assert.equal((await ok(req('state'))).visits.length,2);
   assert.equal((await req('edit-visit',{id:manual,edit_version:2,vehicle_id:vehicle,complaint:'Ganti identitas'})).status,400);
  });
  await t.test('Pembatalan rencana mengembalikan reminder ke jadwal asal dan seluruh perubahan diaudit',async()=>{
   const rem=(await ok(req('crm-reminders',{vehicle_id:vehicle2,service_name:'Ganti filter',due_date:'2027-03-01'}))).id;
   const cancel=(await ok(req('arrival-plans',{vehicle_id:vehicle2,reminder_id:rem,planned_date:'2027-03-02',service_name:'Ganti filter'}))).id;
   await ok(req('arrival-plan-status',{id:cancel,version:1,status:'Dibatalkan',note:'Pelanggan ubah rencana'}));const s=await ok(req('state'));assert.ok(workshopPlanning(s).days.some(d=>d.date==='2027-03-01'));assert.ok(s.audit.some(a=>a.action==='arrival-plan-status'));
  });
 }finally{if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped}await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
