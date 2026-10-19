export function createInventoryMaster(db){
 const all=(s,...p)=>db.prepare(s).all(...p),one=(s,...p)=>db.prepare(s).get(...p),run=(s,...p)=>db.prepare(s).run(...p);
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
 const text=(v,max=200)=>{if(v!==undefined&&v!==null&&typeof v!=='string')fail('Isian teks tidak valid');const s=String(v??'').trim();if(s.length>max)fail('Isian terlalu panjang');return s};
 const tableOf=kind=>{if(!['suppliers','racks'].includes(kind))fail('Master tidak valid');return kind};
 const fieldsOf=kind=>kind==='suppliers'?['name','address','phone','contact_person','email','notes']:['name','zone','notes'];
 const prefix=kind=>kind==='suppliers'?'SUP':'RAK';
 db.exec('BEGIN IMMEDIATE');
 try{
 db.exec(`CREATE TABLE IF NOT EXISTS suppliers(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE,name TEXT NOT NULL COLLATE NOCASE UNIQUE,address TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',contact_person TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS racks(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE,name TEXT NOT NULL COLLATE NOCASE UNIQUE,zone TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1);`);
 for(const [col,definition] of [['supplier_id','INTEGER REFERENCES suppliers(id)'],['rack_id','INTEGER REFERENCES racks(id)']])if(!all('PRAGMA table_info(items)').some(c=>c.name===col))db.exec('ALTER TABLE items ADD COLUMN '+col+' '+definition);
 for(const [kind,column] of [['suppliers','supplier'],['racks','rack']])for(const item of all('SELECT id,'+column+' name FROM items WHERE '+column+"<>'' AND "+column+'_id IS NULL')){
 const name=text(item.name);if(!name)continue;
 let record=one('SELECT * FROM '+kind+' WHERE name=? COLLATE NOCASE',name);
 if(!record){const id=Number(run('INSERT INTO '+kind+'(name,notes) VALUES(?,?)',name,'Hasil migrasi data sparepart; lengkapi data master.').lastInsertRowid);run('UPDATE '+kind+' SET code=? WHERE id=?',prefix(kind)+'-'+String(id).padStart(5,'0'),id);record={id};}
 run('UPDATE items SET '+column+'_id=? WHERE id=?',record.id,item.id);
 }
 db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error}
 const authorize=u=>{if(!['Super Admin','Admin Stock'].includes(u.role))fail('Tidak memiliki hak akses',403)};
 function save(u,kind,b){authorize(u);const table=tableOf(kind),fields=fieldsOf(kind),data=Object.fromEntries(fields.map(key=>[key,text(b[key],['address','notes'].includes(key)?1000:200)]));
 if(!data.name)fail('Nama wajib diisi');
 if(kind==='suppliers'&&(!data.address||!data.phone))fail('Alamat dan nomor kontak supplier wajib diisi');
 if(data.phone&&!/^[+0-9().\s-]{5,40}$/.test(data.phone))fail('Nomor kontak tidak valid');
 if(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))fail('Email tidak valid');
 const duplicate=one('SELECT id FROM '+table+' WHERE name=? COLLATE NOCASE',data.name);if(duplicate&&duplicate.id!==Number(b.id))fail('Nama '+(kind==='suppliers'?'supplier':'rak')+' sudah digunakan');
 let before=null,id;
 if(b.id){before=one('SELECT * FROM '+table+' WHERE id=?',Number(b.id));if(!before)fail('Data master tidak ditemukan',404);if(Number(b.version)!==before.version)fail('Data telah diperbarui. Muat ulang sebelum mengedit.',409);id=before.id;run('UPDATE '+table+' SET '+fields.map(key=>key+'=?').join(',')+',version=version+1 WHERE id=?',...fields.map(key=>data[key]),id)}
 else{id=Number(run('INSERT INTO '+table+'('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+')',...fields.map(key=>data[key])).lastInsertRowid);run('UPDATE '+table+' SET code=? WHERE id=?',prefix(kind)+'-'+String(id).padStart(5,'0'),id)}
 const column=kind==='suppliers'?'supplier':'rack';run('UPDATE items SET '+column+'=? WHERE '+column+'_id=?',data.name,id);
 return {id,before,after:one('SELECT * FROM '+table+' WHERE id=?',id)};
 }
 function toggle(u,kind,b){authorize(u);const table=tableOf(kind),before=one('SELECT * FROM '+table+' WHERE id=?',Number(b.id));if(!before)fail('Data master tidak ditemukan',404);if(Number(b.version)!==before.version)fail('Data telah diperbarui. Muat ulang sebelum mengubah status.',409);run('UPDATE '+table+' SET active=1-active,version=version+1 WHERE id=?',before.id);return {id:before.id,before,after:one('SELECT * FROM '+table+' WHERE id=?',before.id)}}
 function resolve(b,existing={}){
 const out={};
 for(const [kind,column] of [['suppliers','supplier'],['racks','rack']]){
 const key=column+'_id';
 if(Object.hasOwn(b,key)){
 if(b[key]===''||b[key]===null){out[key]=null;out[column]='';continue}
 const id=Number(b[key]);if(!Number.isSafeInteger(id)||id<=0)fail('Pilihan master tidak valid');const record=one('SELECT * FROM '+kind+' WHERE id=?',id);if(!record||(!record.active&&existing[key]!==id))fail('Pilih '+(column==='supplier'?'supplier':'rak')+' yang aktif');out[key]=id;out[column]=record.name;
 }else if(Object.hasOwn(b,column)){
 // Compatibility for existing integrations: only accept already registered names.
 const name=text(b[column]),record=name?one('SELECT * FROM '+kind+' WHERE name=? COLLATE NOCASE',name):null;
 if(name&&(!record||(!record.active&&existing[key]!==record.id)))fail('Pilih '+column+' dari master data terlebih dahulu');out[key]=record?.id??null;out[column]=record?.name??'';
 }else{out[key]=existing[key]??null;out[column]=existing[column]??''}
 }
 return out;
 }
 return {save,toggle,resolve,list:kind=>all('SELECT * FROM '+tableOf(kind)+' ORDER BY name')};
}
