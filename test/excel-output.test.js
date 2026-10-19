import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {buildExcelOutput} from '../excel-output.js';
test('Excel mempertahankan kode dan teks literal, serta mengubah rupiah menjadi angka',async()=>{
 const bytes=await buildExcelOutput({title:'Data / Sparepart',columns:['Kode Sparepart','Nama','Harga','Kontak','Margin'],rows:[['00123','=HYPERLINK("x")','Rp 3.500.000','081234567890','14.3%'],['00002','Busi',null,'','0%']]},'Admin');
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);const sheet=workbook.worksheets[0];
 assert.equal(sheet.rowCount,3);assert.equal(sheet.getCell('A2').value,'00123');assert.equal(sheet.getCell('B2').value,'=HYPERLINK("x")');assert.equal(sheet.getCell('C2').value,3500000);assert.match(sheet.getCell('C2').numFmt,/Rp/);assert.equal(sheet.getCell('D2').value,'081234567890');assert.equal(sheet.getCell('E2').value,.14300000000000002);assert.equal(sheet.getCell('C3').value,'');assert.equal(sheet.views[0].state,'frozen');
});
test('Excel menolak payload tidak valid dan isi melebihi batas sel',async()=>{
 for(const payload of [{columns:[],rows:[]},{columns:['Nama'],rows:[[1,2]]},{columns:['Nama'],rows:[['a'.repeat(32768)]]}])await assert.rejects(buildExcelOutput(payload),e=>e.status===400);
});
