import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createInventoryMaster} from '../inventory-master.js';
test('Migrasi supplier/rak idempoten, kode unik dan relasi mempertahankan data persediaan',()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec("PRAGMA foreign_keys=ON;CREATE TABLE items(id INTEGER PRIMARY KEY,supplier TEXT,rack TEXT,qty REAL,cost REAL);INSERT INTO items VALUES(1,'JH','A-01',2,3000000),(2,'jh','A-01',3,100),(3,'','',1,10)");
 const master=createInventoryMaster(db);assert.equal(master.list('suppliers').length,1);assert.equal(master.list('racks').length,1);assert.equal(master.list('suppliers')[0].code,'SUP-00001');
 const rows=db.prepare('SELECT * FROM items').all();assert.equal(rows[0].supplier_id,rows[1].supplier_id);assert.equal(rows[0].rack_id,rows[1].rack_id);assert.equal(rows[2].supplier_id,null);
 createInventoryMaster(db);assert.equal(master.list('suppliers').length,1);assert.equal(db.prepare('SELECT qty FROM items WHERE id=1').get().qty,2);assert.equal(db.prepare('SELECT cost FROM items WHERE id=1').get().cost,3000000);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.throws(()=>master.save({role:'Finance'},'racks',{name:'X'}),/hak akses/);
 assert.throws(()=>master.save({role:'Admin'},'suppliers',{name:'X'}),/hak akses/);
 }finally{db.close()}
});
