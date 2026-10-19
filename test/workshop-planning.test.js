import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workshopPlanning} from '../public/crm-reminder-tools.js';

const reminder=(id,vehicle,date,extra={})=>({id,vehicle_id:vehicle,plate:'B '+vehicle,customer:'Pelanggan '+vehicle,due_date:date,service_name:'Servis '+id,status:'Menunggu',vehicle_active:1,model_active:1,...extra});
test('Jadwal bersamaan menghitung kendaraan unik walaupun servis kendaraan lebih dari satu',()=>{
 const data=workshopPlanning({crm_reminders:[reminder(1,1,'2026-10-21'),reminder(2,1,'2026-10-21'),reminder(3,2,'2026-10-21'),reminder(4,1,'2026-10-22')]});
 assert.deepEqual(data.days.map(d=>[d.date,d.vehicleCount,d.reminderCount]),[['2026-10-21',2,3],['2026-10-22',1,1]]);
 assert.equal(data.days[0].vehicles[0].reminders.length,2);
});
test('Reminder selesai, dibatalkan, master nonaktif dan tanggal kosong dikecualikan',()=>{
 const data=workshopPlanning({vehicles:[{id:3,active:0}],crm_reminders:[reminder(1,1,'2026-10-21',{status:'Selesai'}),reminder(2,2,'2026-10-21',{status:'Dibatalkan'}),reminder(3,3,'2026-10-21'),reminder(4,4,'2026-10-21',{model_active:0}),reminder(5,5,''),reminder(6,6,'2026-10-21',{status:'Sudah Dihubungi'})]});
 assert.equal(data.days.length,1);assert.equal(data.days[0].vehicleCount,1);assert.equal(data.days[0].vehicles[0].vehicle_id,6);
});
test('Kendaraan masih di bengkel dihitung terpisah dari jadwal dan tidak menggandakan plat legacy',()=>{
 const data=workshopPlanning({vehicles:[{id:1,plate:'B 1 AA',active:1},{id:2,plate:'B 2 AA',active:0}],visits:[{id:1,vehicle_id:1,plate:'B 1 AA'},{id:2,plate:'b1aa'},{id:3,vehicle_id:2,plate:'B 2 AA'},{id:4,plate:'B 4',exited:'2026-10-19'}],crm_reminders:[reminder(1,5,'2026-10-21')]});
 assert.equal(data.present.length,1);assert.equal(data.present[0].visits.length,2);assert.equal(data.days[0].vehicleCount,1);assert.equal(data.days[0].vehicles[0].vehicle_id,5);
});
test('Jadwal terurut dan data kosong tidak membuat proyeksi kendaraan fiktif',()=>{
 assert.deepEqual(workshopPlanning({}),{days:[],present:[]});
 const data=workshopPlanning({crm_reminders:[reminder(1,1,'2026-12-01'),reminder(2,2,'2026-10-01')]});assert.equal(data.days[0].date,'2026-10-01');assert.equal(data.present.length,0);
});
