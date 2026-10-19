import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('API CRM menyimpan jadwal, tindak lanjut, audit dan melindungi akses peran',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'26motor-crm-')),port=8100+Math.floor(Math.random()*400);
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,DATA_DIR:dir,PORT:String(port),INITIAL_PASSWORD:'CrmTest123456!'},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',data=>errors+=data);
 let cookie='';
 const request=async(endpoint,body,session=cookie)=>{const r=await fetch(`http://127.0.0.1:${port}/api/${endpoint}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',cookie:session},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 const ok=async call=>{const r=await call;assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
 try{
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Startup '+code+': '+errors)))});
  cookie=(await request('login',{email:'admin@26motor.local',password:'CrmTest123456!'})).cookie;
  const model=(await ok(request('vehicle-models',{brand:'Jeep',model:'Wrangler'}))).id;
  const vehicle=(await ok(request('vehicle-master',{plate:'B 123 CRM',customer:'Andi',phone:'081234567890',model_id:model}))).id;
  const payload={vehicle_id:vehicle,service_name:'Ganti oli',due_date:'2026-12-19',interval_months:6};
  const id=(await ok(request('crm-reminders',payload))).id;
  let state=await ok(request('state'));assert.equal(state.crm_reminders[0].id,id);assert.equal(state.crm_reminders[0].status,'Menunggu');
  await ok(request('crm-reminder-status',{id,version:1,status:'Sudah Dihubungi',channel:'Telepon',note:'Pelanggan bersedia datang'}));
  assert.equal((await request('crm-reminders',{...payload,id,version:1})).status,409);
  state=await ok(request('state'));assert.equal(state.crm_reminders[0].status,'Sudah Dihubungi');assert.ok(state.audit.some(a=>a.action==='crm-reminder-status'));
  await ok(request('users',{name:'Teknisi CRM',email:'tech@crm.local',role:'Teknisi',password:'CrmTech123456!'}));
  const tech=(await request('login',{email:'tech@crm.local',password:'CrmTech123456!'})).cookie;
  assert.deepEqual((await ok(request('state',undefined,tech))).crm_reminders,[]);assert.equal((await request('crm-reminders',payload,tech)).status,403);
  const response=await fetch(`http://127.0.0.1:${port}/crm-reminder-tools.js`);assert.equal(response.status,200);
 }finally{if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped}await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
