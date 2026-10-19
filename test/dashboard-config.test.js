import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dashboardAllowed,dashboardPages} from '../public/dashboard-config.js';
test('Empat dashboard tersedia dengan akses akuntansi terbatas pada peran keuangan',()=>{
 assert.equal(dashboardPages.length,4);assert.ok(dashboardPages.some(([id])=>id==='vehicleFrequency'));
 for(const role of ['Super Admin','Finance','Akuntan','Admin','Admin Stock','Teknisi']){
  assert.equal(dashboardAllowed('dashboard',role),true);assert.equal(dashboardAllowed('masterDashboard',role),true);
  assert.equal(dashboardAllowed('accountingDashboard',role),['Super Admin','Finance','Akuntan'].includes(role));
 }
});
