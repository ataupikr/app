import {test} from 'node:test';import assert from 'node:assert/strict';import {mobileActionsFor} from '../public/mobile-actions.js';
test('Aksi mobile mengikuti peran dan izin Gate Pass Finance',()=>{
 const actions=role=>mobileActionsFor({role,gatepass:0});
 assert.deepEqual(actions('Teknisi').map(a=>a.page),['orders']);
 assert.deepEqual(actions('Admin').map(a=>a.action||a.page),['estimates','new-estimate','new-catalog-service']);
 assert.ok(!actions('Finance').some(a=>a.action==='new-visit'));assert.ok(mobileActionsFor({role:'Finance',gatepass:1}).some(a=>a.action==='new-visit'));
 assert.ok(actions('Admin Stock').some(a=>a.action==='receipt'));assert.ok(!actions('Admin Stock').some(a=>a.page==='finance'));
 assert.deepEqual(actions('Akuntan').map(a=>a.action),['manual-journal','period']);assert.ok(!actions('Super Admin').some(a=>a.action==='manual-journal'));
 assert.equal(actions('Unknown').length,0);for(const a of actions('Super Admin'))assert.ok(Boolean(a.page)!==Boolean(a.action));
});
