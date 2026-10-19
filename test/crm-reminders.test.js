import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createCrmReminders} from '../crm-reminders.js';
import {crmAllowed,addServiceMonths,reminderUrgency,reminderMessage,serviceCountdown} from '../public/crm-reminder-tools.js';
import {dashboardAllowed} from '../public/dashboard-config.js';

function fixture(t){const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO users VALUES(1,'Admin');
 CREATE TABLE vehicle_models(id INTEGER PRIMARY KEY,brand TEXT,model TEXT,variant TEXT,engine TEXT,active INTEGER);INSERT INTO vehicle_models VALUES(1,'Jeep','JK','','3000',1);
 CREATE TABLE vehicles(id INTEGER PRIMARY KEY,plate TEXT,customer TEXT,phone TEXT,model_id INTEGER,year INTEGER,active INTEGER);INSERT INTO vehicles VALUES(1,'B 14 RMY','Taupik','081234567890',1,2014,1);`);
 const crm=createCrmReminders(db),u={id:1,role:'Admin'},body={vehicle_id:1,service_name:'Ganti Oli',last_service_date:'2026-01-31',due_date:'2026-07-31',interval_months:6,due_km:55000,notes:'Pakai oli sesuai spesifikasi'};return {db,crm,u,body};}

test('Reminder menyimpan jadwal, memuat ulang data master dan memisahkan catatan kontak',t=>{
 const {db,crm,u,body}=fixture(t),id=crm.save(u,body).id;
 let r=createCrmReminders(db).list(u)[0];assert.equal(r.id,id);assert.equal(r.phone,'081234567890');assert.equal(r.due_date,'2026-07-31');assert.equal(r.version,1);
 crm.updateStatus(u,{id,version:1,status:'Sudah Dihubungi',channel:'WhatsApp',note:'Pelanggan minta jadwal Sabtu'});
 r=crm.list(u)[0];assert.equal(r.status,'Sudah Dihubungi');assert.ok(r.contacted_at);assert.match(r.events[0].note,/WhatsApp/);assert.equal(r.events.length,2);
 assert.throws(()=>crm.save(u,{...body,id,version:1}),e=>e.status===409);
 crm.save(u,{...body,id,version:2,due_date:'2026-08-01'});assert.equal(crm.list(u)[0].version,3);
});
test('Reminder ganda ditolak dan servis selesai bisa dilanjutkan dengan jadwal baru',t=>{
 const {crm,u,body}=fixture(t),id=crm.save(u,body).id;
 assert.throws(()=>crm.save(u,{...body,service_name:'ganti oli'}),/Masih ada reminder aktif/);
 crm.updateStatus(u,{id,version:1,status:'Selesai',completed_date:'2026-07-30',note:'Servis sudah dilakukan'});
 assert.throws(()=>crm.save(u,{...body,id,version:2}),/sudah ditutup/);
 assert.throws(()=>crm.updateStatus(u,{id,version:2,status:'Sudah Dihubungi',channel:'Telepon',note:'Tes'}),/sudah ditutup/);
 const next=crm.save(u,{...body,last_service_date:'2026-07-30',due_date:'2027-01-30'});assert.notEqual(next.id,id);assert.equal(crm.list(u).length,2);
});
test('Validasi tanggal, master aktif, kilometer, interval dan catatan tindak lanjut',t=>{
 const {db,crm,u,body}=fixture(t);
 for(const bad of [{due_date:'2026-02-30'},{due_date:'2025-01-01'},{interval_months:0},{interval_months:1.5},{due_km:-1},{service_name:''}])assert.throws(()=>crm.save(u,{...body,...bad}));
 db.exec('UPDATE vehicles SET active=0');assert.throws(()=>crm.save(u,body),/aktif/);db.exec('UPDATE vehicles SET active=1');
 const id=crm.save(u,body).id;
 assert.throws(()=>crm.updateStatus(u,{id,version:1,status:'Sudah Dihubungi',channel:'WhatsApp',note:''}),/Catatan/);
 assert.throws(()=>crm.updateStatus(u,{id,version:1,status:'Selesai',completed_date:'2099-01-01',note:'Tes'}),/Tanggal/);
 crm.updateStatus(u,{id,version:1,status:'Dibatalkan',note:'Kendaraan dijual'});assert.equal(crm.list(u)[0].status,'Dibatalkan');
});
test('Hak akses menu, daftar dan penulisan reminder konsisten',t=>{
 const {crm,u,body}=fixture(t);crm.save(u,body);
 for(const role of ['Super Admin','Admin','Finance','Teknisi','Admin Stock','Akuntan']){
  const allowed=['Super Admin','Admin','Finance'].includes(role);assert.equal(crmAllowed(role),allowed);assert.equal(dashboardAllowed('crmReminders',role),allowed);
  assert.equal(crm.list({...u,role}).length,allowed?1:0);if(!allowed)assert.throws(()=>crm.save({...u,role},body),e=>e.status===403);
 }
});
test('Interval kalender menangani akhir bulan dan tahun kabisat',()=>{
 assert.equal(addServiceMonths('2026-01-31',1),'2026-02-28');assert.equal(addServiceMonths('2027-08-31',6),'2028-02-29');assert.equal(addServiceMonths('2026-10-19',6),'2027-04-19');assert.equal(addServiceMonths('2026-10-19',''), '');
});
test('Jatuh tempo memakai tanggal WIB serta mengecualikan master nonaktif dan reminder ditutup',()=>{
 const base={status:'Menunggu',vehicle_active:1,model_active:1};for(const [due,label] of [['2026-10-18','Terlambat'],['2026-10-19','Hari Ini'],['2026-10-26','7 Hari Mendatang'],['2026-10-27','Terjadwal']])assert.equal(reminderUrgency({...base,due_date:due},'2026-10-19'),label);
 assert.equal(reminderUrgency({...base,vehicle_active:0},'2026-10-19'),'Master Nonaktif');assert.equal(reminderUrgency({...base,status:'Selesai'},'2026-10-19'),'Selesai');
 assert.match(reminderMessage({customer:'Andi',plate:'B 123',unit:'Jeep',service_name:'Ganti oli',due_date:'2026-10-26',due_km:50000}),/B 123.*Ganti oli.*2026-10-26.*50\.000 km/);
});
test('Hitung mundur servis memakai selisih hari kalender dan status reminder',()=>{
 const row={status:'Menunggu',vehicle_active:1,model_active:1,due_date:'2027-04-16'};
 assert.deepEqual(serviceCountdown(row,'2026-10-19'),{days:179,label:'179 hari lagi',tone:'progress'});
 assert.deepEqual(serviceCountdown({...row,due_date:'2026-10-26'},'2026-10-19'),{days:7,label:'7 hari lagi',tone:'attention'});
 assert.deepEqual(serviceCountdown({...row,due_date:'2026-10-19'},'2026-10-19'),{days:0,label:'Hari ini',tone:'urgent'});
 assert.deepEqual(serviceCountdown({...row,due_date:'2026-10-16'},'2026-10-19'),{days:-3,label:'Terlambat 3 hari',tone:'urgent'});
 assert.equal(serviceCountdown({...row,due_date:'2028-03-01'},'2028-02-28').days,2);
 for(const status of ['Selesai','Dibatalkan'])assert.equal(serviceCountdown({...row,status},'2026-10-19').days,null);
 assert.equal(serviceCountdown({...row,vehicle_active:0},'2026-10-19').label,'Master Nonaktif');
 assert.equal(serviceCountdown({...row,due_date:'invalid'},'2026-10-19').days,null);
});
