import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vehicleFrequency,jakartaVisitDay} from '../public/vehicle-frequency.js';

const fixture=()=>({vehicles:[{id:1,plate:'B 1 AA',active:1,model_active:1},{id:2,plate:'B 2 BB',active:1,model_active:1},{id:3,plate:'B 3 CC',active:0}],visits:[
 {id:1,vehicle_id:1,plate:'B 1 AA',unit:'Jeep',customer:'Andi',entered:'2026-09-30T17:00:00Z',progress:'Selesai',exited:'2026-10-02'},
 {id:2,plate:'b1aa',unit:'Jeep',customer:'Andi',entered:'2026-10-10T00:00:00Z',progress:'Dikerjakan'},
 {id:3,vehicle_id:2,plate:'B 2 BB',unit:'Toyota',customer:'Budi',entered:'2026-10-31T16:59:59Z'},
 {id:4,vehicle_id:2,plate:'B 2 BB',unit:'Toyota',customer:'Budi',entered:'2026-10-31T17:00:00Z'},
 {id:5,vehicle_id:3,plate:'B 3 CC',entered:'2026-10-12T00:00:00Z'},
 {id:6,plate:'B 3 CC',entered:'2026-10-13T00:00:00Z'},
 {id:7,plate:'B 9 ZZ',entered:'invalid'}
]});

test('Peringkat menghitung kunjungan masuk, menyatukan data lama dan mengabaikan master nonaktif',()=>{
 const data=vehicleFrequency(fixture());assert.equal(data.totalVisits,4);assert.equal(data.uniqueVehicles,2);assert.equal(data.repeatVehicles,2);
 assert.equal(data.top.key,'vehicle:2');assert.equal(data.rows[1].count,2);assert.deepEqual(data.rows[1].visits.map(v=>v.id),[2,1]);
});
test('Batas tanggal WIB inklusif dan indikator berulang mengikuti periode',()=>{
 assert.equal(jakartaVisitDay('2026-09-30T17:00:00Z'),'2026-10-01');
 const data=vehicleFrequency(fixture(),{from:'2026-10-01',to:'2026-10-31'});
 assert.equal(data.totalVisits,3);assert.equal(data.repeatVehicles,1);assert.equal(data.top.key,'vehicle:1');
 assert.equal(data.rows[1].count,1);assert.equal(data.rows[1].last,'2026-10-31T16:59:59Z');
});
test('Pencarian pelanggan mempertahankan seluruh riwayat kendaraan dalam periode',()=>{
 const state=fixture();state.visits[1].customer='Pemilik Baru';
 const data=vehicleFrequency(state,{search:'andi'});assert.equal(data.uniqueVehicles,1);assert.equal(data.totalVisits,2);assert.equal(data.top.customer,'Pemilik Baru');
 assert.equal(vehicleFrequency(state,{search:'tidak ditemukan'}).totalVisits,0);
});
test('Identitas master tetap konsisten ketika plat berubah, plat kosong tidak digabung',()=>{
 const state=fixture();state.visits[0].plate='D 123';state.visits.push({id:8,plate:'',entered:'2026-10-12'},{id:9,plate:'',entered:'2026-10-12'});
 const data=vehicleFrequency(state);assert.equal(data.rows.find(r=>r.key==='vehicle:1').count,2);assert.equal(data.uniqueVehicles,4);
});
test('Tipe nonaktif dikecualikan dan data terbatas tetap dihitung sesuai kunjungan tersedia',()=>{
 const state=fixture();state.vehicles[0].model_id=4;state.vehicle_models=[{id:4,active:0}];assert.equal(vehicleFrequency(state).totalVisits,2);
 const assigned={visits:[state.visits[0]]};assert.equal(vehicleFrequency(assigned).totalVisits,1);assert.equal(vehicleFrequency(assigned).repeatVehicles,0);
});
test('Periode salah ditolak, hasil tanpa data dan periode tanpa kunjungan tetap nol',()=>{
 for(const filter of [{from:'2026-10-31',to:'2026-10-01'},{from:'2026-13-01'},{to:'2026-02-30'}])assert.throws(()=>vehicleFrequency(fixture(),filter),/Periode tidak valid/);
 assert.equal(vehicleFrequency({}).top,null);assert.equal(vehicleFrequency(fixture(),{from:'2027-01-01'}).totalVisits,0);
});
