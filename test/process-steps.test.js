import test from 'node:test';
import assert from 'node:assert/strict';
import {visitSteps,estimateSteps} from '../public/process-steps.js';
const visit={id:1,entered:'2026-10-15',progress:'Baru',qc:0,invoice:null,exited:null};
test('Step kunjungan mengikuti pengerjaan, QC, invoice, dan pembayaran nyata',()=>{
 assert.deepEqual(visitSteps(visit).steps.map(s=>s.state),['done','current','pending','pending','pending','pending']);
 const qc=visitSteps({...visit,progress:'QC'});assert.equal(qc.steps[1].state,'done');assert.equal(qc.steps[2].state,'current');
 const invoiced={...visit,progress:'Selesai',qc:1,invoice:2,total:100000,paid:50000};assert.equal(visitSteps(invoiced).steps[4].state,'current');assert.equal(visitSteps(invoiced).steps[5].state,'pending');
 assert.equal(visitSteps({...invoiced,paid:100000}).steps[5].state,'current');
 assert.ok(visitSteps({...invoiced,paid:100000,exited:'2026-10-15'}).steps.every(s=>s.state==='done'));
});
test('Piutang hanya dianggap disetujui untuk kunjungan yang sesuai dan tidak disebut lunas',()=>{
 const invoice={...visit,progress:'Selesai',qc:1,invoice:2,total:100,paid:0};
 assert.equal(visitSteps(invoice,[{kind:'Piutang keluar',source:2,status:'Disetujui'}]).steps[4].state,'current');
 assert.equal(visitSteps(invoice,[{kind:'Piutang keluar',source:1,status:'Diajukan'}]).steps[4].state,'current');
 const flow=visitSteps(invoice,[{kind:'Piutang keluar',source:1,status:'Disetujui'}]);assert.equal(flow.steps[4].label,'Piutang disetujui');assert.equal(flow.steps[4].state,'done');
});
test('Panduan teknisi dan stock tidak menampilkan tahap keuangan',()=>{
 const flow=visitSteps(visit,[],false);assert.deepEqual(flow.steps.map(s=>s.label),['Kendaraan masuk','Pengerjaan','Pemeriksaan QC','Gate Pass OUT']);
 assert.match(visitSteps({...visit,progress:'Menunggu Sparepart'}).hint,/sparepart/);
 assert.match(visitSteps({...visit,progress:'Menunggu Persetujuan'}).hint,/keputusan pelanggan/);
});
test('Step keputusan estimasi membedakan menunggu, setuju, dan tidak setuju',()=>{
 assert.equal(estimateSteps({status:'Menunggu Persetujuan'}).steps[2].state,'current');
 assert.equal(estimateSteps({status:'Estimasi Disetujui'}).steps[2].state,'done');
 assert.equal(estimateSteps({status:'Di Negosiasi'}).steps[2].state,'current');assert.match(estimateSteps({status:'Di Negosiasi'}).hint,/negosiasi/);
 const rejected=estimateSteps({status:'Tidak Jadi'});assert.equal(rejected.steps[2].state,'done');assert.match(rejected.hint,/tidak melanjutkan/);
});
