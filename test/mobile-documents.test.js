import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import {saveDocumentBlob} from '../public/mobile.js';
test('Unduhan Android meneruskan isi PDF dan nama file ke penyimpanan native',async()=>{
 const previousWindow=globalThis.window,previousReader=globalThis.FileReader,calls=[];
 try{globalThis.window={AndroidDocuments:{saveDocument:(...args)=>calls.push(args)}};globalThis.FileReader=class {readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');this.onload()})}};
 await saveDocumentBlob(new Blob(['%PDF-1.7'],{type:'application/pdf'}),'EST-00001-Rev-1.pdf');
 assert.deepEqual(calls,[['data:application/pdf;base64,JVBERi0xLjc=','EST-00001-Rev-1.pdf']]);
 }finally{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;if(previousReader===undefined)delete globalThis.FileReader;else globalThis.FileReader=previousReader}
});
test('Service worker tidak mengintersep API, transaksi POST, dokumen atau unduhan APK',()=>{
 const handlers={};runInNewContext(readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8'),{self:{addEventListener:(name,fn)=>handlers[name]=fn},location:{origin:'https://bengkel.test'},URL});
 for(const [url,method] of [['/api/state','GET'],['/api/estimate-document/1-r1-d1.pdf','GET'],['/api/line','POST'],['/downloads/26motor-premium.apk','GET']]){let intercepted=false;handlers.fetch({request:{url:'https://bengkel.test'+url,method},respondWith:()=>{intercepted=true}});assert.equal(intercepted,false,url)}
});

test('Excel pada APK lama meminta pembaruan; APK baru menerima file XLSX',async()=>{
 const previousWindow=globalThis.window,previousReader=globalThis.FileReader,calls=[];
 try{globalThis.window={AndroidDocuments:{saveDocument:(...args)=>calls.push(args)}};
 await assert.rejects(saveDocumentBlob(new Blob(['PK']), 'Data.xlsx'),/Perbarui APK/);
 globalThis.window.AndroidDocuments.supportsExcel=()=>true;
 globalThis.FileReader=class {readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');this.onload()})}};
 await saveDocumentBlob(new Blob(['PK'],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'Data.xlsx');assert.equal(calls.length,1);assert.equal(calls[0][1],'Data.xlsx');assert.match(calls[0][0],/spreadsheetml.sheet;base64,UEs=/);
 }finally{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;if(previousReader===undefined)delete globalThis.FileReader;else globalThis.FileReader=previousReader}
});
