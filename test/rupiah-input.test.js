import test from 'node:test';
import assert from 'node:assert/strict';
import {rupiahRaw,rupiahDisplay,moneyValue} from '../public/rupiah-input.js';
test('nominal rupiah dipisahkan ribuan dan dikembalikan menjadi angka untuk transaksi',()=>{
 for(const [raw,display] of [['1250000','Rp 1.250.000'],['0','Rp 0'],['1250.75','Rp 1.250,75'],['',''],['1500.','Rp 1.500,']]){
  assert.equal(rupiahDisplay(raw),display);assert.equal(rupiahRaw(display),raw);
 }
 assert.equal(rupiahRaw('0001234'),'1234');
 assert.equal(moneyValue({hasAttribute:()=>true,value:'Rp 1.250.000'}),'1250000');
 assert.equal(moneyValue({hasAttribute:()=>false,value:'11.5'}),'11.5');
});
