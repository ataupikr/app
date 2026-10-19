import {enhanceRowExports,setRowExportSaver} from './row-exports.js';
export function enhanceMobileTables(root){
 enhanceRowExports(root);
 for(const table of root.querySelectorAll('table')){
  if(table.closest('.gatepass'))continue;
  const headings=Array.from(table.querySelectorAll('thead tr:first-child th')).map(th=>th.textContent.trim());if(!headings.length)continue;
  table.classList.add('mobile-data-table');
  for(const row of table.querySelectorAll('tbody tr'))Array.from(row.cells).forEach((cell,index)=>{cell.dataset.label=headings[index]||'Aksi'});
 }
}
export function enableMobileApp(){
 const update=()=>{document.documentElement.classList.toggle('app-offline',!navigator.onLine);for(const status of document.querySelectorAll('.mobile-connection'))status.textContent=navigator.onLine?'Terhubung ke server':'Tidak terhubung · transaksi memerlukan koneksi'};
 window.addEventListener('online',update);window.addEventListener('offline',update);update();
 if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
 return update;
}
export async function saveDocumentBlob(blob,filename){
 if(window.AndroidDocuments?.saveDocument){if(filename.endsWith('.xlsx')&&!window.AndroidDocuments.supportsExcel?.())throw Error('Perbarui APK Android dari menu Aksi Mobile untuk mengunduh Excel.');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});window.AndroidDocuments.saveDocument(data,filename);return;}
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}

setRowExportSaver(saveDocumentBlob);
