export function createInventoryImports(db){
 const all=(s,...p)=>db.prepare(s).all(...p),one=(s,...p)=>db.prepare(s).get(...p),run=(s,...p)=>db.prepare(s).run(...p);
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
 db.exec(`CREATE TABLE IF NOT EXISTS inventory_imports(id INTEGER PRIMARY KEY,source_name TEXT NOT NULL,sha256 TEXT NOT NULL UNIQUE,created TEXT NOT NULL,actor INTEGER NOT NULL REFERENCES users(id),summary TEXT NOT NULL,archive TEXT NOT NULL);`);
 for(const [name,type] of [['import_note',"TEXT NOT NULL DEFAULT ''"],['import_id','INTEGER REFERENCES inventory_imports(id)']])if(!all('PRAGMA table_info(items)').some(c=>c.name===name))db.exec('ALTER TABLE items ADD COLUMN '+name+' '+type);
 const canRead=u=>['Super Admin','Admin Stock','Finance','Akuntan'].includes(u.role);
 function list(u){return canRead(u)?all('SELECT id,source_name,created,summary FROM inventory_imports ORDER BY id DESC').map(r=>({...r,summary:JSON.parse(r.summary)})):[]}
 function read(u,id){if(!canRead(u))fail('Tidak memiliki akses arsip impor',403);const row=one('SELECT * FROM inventory_imports WHERE id=?',id);if(!row)fail('Arsip tidak ditemukan',404);const archive=JSON.parse(row.archive);return {...row,summary:JSON.parse(row.summary),archive:undefined,sheets:Object.entries(archive.sheets).filter(([name])=>u.role!=='Admin Stock'||!name.startsWith('Pembayaran')).map(([name,rows])=>({name,rows}))}}
 function apply(u,manifest){
  if(u.role!=='Super Admin')fail('Impor hanya oleh Super Admin',403);
  const previous=one('SELECT id,summary FROM inventory_imports WHERE sha256=?',manifest.sha256);if(previous)return {ok:true,id:previous.id,duplicate:true,summary:JSON.parse(previous.summary)};
  if(!Array.isArray(manifest.items)||!manifest.items.length)fail('Tidak ada master sparepart');
  const codes=new Set();for(const item of manifest.items){if(!item.sku||!item.name||codes.has(item.sku.toUpperCase())||!Number.isFinite(item.qty)||item.qty<0)fail('Data master tidak valid atau duplikat');codes.add(item.sku.toUpperCase());if(one('SELECT id FROM items WHERE upper(sku)=upper(?) OR trim(name)=trim(?) COLLATE NOCASE',item.sku,item.name))fail('Sparepart sudah ada: '+item.sku+'. Cocokkan sebelum impor.');}
  const now=new Date().toISOString(),summary={items:manifest.items.length,stock_units:manifest.items.reduce((s,i)=>s+i.qty,0),...manifest.summary};
  const id=Number(run('INSERT INTO inventory_imports(source_name,sha256,created,actor,summary,archive) VALUES(?,?,?,?,?,?)',manifest.source_name,manifest.sha256,now,u.id,JSON.stringify(summary),JSON.stringify(manifest.archive)).lastInsertRowid);
  for(const item of manifest.items){let supplierId=null;if(item.supplier){let supplier=one('SELECT id FROM suppliers WHERE name=? COLLATE NOCASE',item.supplier);if(!supplier){const sid=Number(run("INSERT INTO suppliers(name,notes) VALUES(?,?)",item.supplier,'Dari '+manifest.source_name+'; alamat dan kontak belum diisi.').lastInsertRowid);run('UPDATE suppliers SET code=? WHERE id=?','SUP-'+String(sid).padStart(5,'0'),sid);supplier={id:sid}}supplierId=supplier.id;}
   const itemId=Number(run("INSERT INTO items(sku,name,category,brand,rack,supplier,qty,cost,price,minimum,unit,supplier_id,fitment_mode,import_note,import_id) VALUES(?,?,'Belum Dikategorikan','','',?,?,NULL,NULL,0,?,?,'unverified',?,?)",item.sku.toUpperCase(),item.name,item.supplier||'',item.qty,item.unit,supplierId,item.note,id).lastInsertRowid);
   if(item.qty)run('INSERT INTO movements(item,qty,cost,type,source,actor,created) VALUES(?,?,NULL,?,?,?,?)',itemId,item.qty,'Saldo awal','IMPORT-'+id+'-'+itemId,u.id,now);
  }
  run('INSERT INTO audit(actor,action,detail,created) VALUES(?,?,?,?)',u.id,'Impor master dan saldo sparepart Excel',JSON.stringify({import_id:id,source:manifest.source_name,sha256:manifest.sha256,...summary,accounting_posted:false}),now);
  return {ok:true,id,summary};
 }
 function fillValues(u,b,journal){
  if(!['Super Admin','Admin Stock'].includes(u.role))fail('Tidak memiliki hak akses',403);
  const i=one('SELECT * FROM items WHERE id=?',Number(b.id));if(!i||!i.import_id)fail('Sparepart impor tidak ditemukan');
  const fields=['cost','price'].filter(key=>i[key]===null);if(!fields.length)fail('Harga sudah lengkap. Gunakan proses perubahan harga.');
  const changes={};for(const key of fields){const raw=b[key],value=Number(raw);if(raw===undefined||raw===null||String(raw).trim()===''||typeof raw==='boolean'||!Number.isSafeInteger(value)||value<0)fail('Isi modal dan harga jual dalam rupiah bulat, minimal nol.');changes[key]=value;}
  if(fields.includes('cost')){if(all('SELECT id FROM lines WHERE item=?',i.id).length)fail('Sudah ada pemakaian; modal tidak dapat diinisialisasi');const value=Math.round(i.qty*changes.cost);if(value)journal('IMPORT-VALUE-'+i.id,'Penilaian saldo awal impor '+i.sku,[{account:'Persediaan',debit:value},{account:'Ekuitas saldo awal',credit:value}]);run("UPDATE movements SET cost=? WHERE item=? AND type='Saldo awal' AND source LIKE 'IMPORT-%'",changes.cost,i.id);}
  run('UPDATE items SET '+fields.map(k=>k+'=?').join(',')+' WHERE id=?',...fields.map(k=>changes[k]),i.id);
  run('INSERT INTO audit(actor,action,detail,created) VALUES(?,?,?,?)',u.id,'Lengkapi harga sparepart impor',JSON.stringify({id:i.id,before:{cost:i.cost,price:i.price},after:changes}),new Date().toISOString());return {ok:true,id:i.id};
 }
 return {list,read,apply,fillValues};
}
