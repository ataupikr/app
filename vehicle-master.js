// Vehicle catalog, reusable customer vehicles, and sparepart fitment relations.
export function createVehicleMaster(db){
 const all=(sql,...p)=>db.prepare(sql).all(...p),one=(sql,...p)=>db.prepare(sql).get(...p),run=(sql,...p)=>db.prepare(sql).run(...p);
 const fail=message=>{throw new Error(message)};
 const text=v=>String(v??'').trim().replace(/\s+/g,' ');
 const plateKey=v=>text(v).toUpperCase().replace(/[\s-]/g,'');
 const year=v=>{if(v===undefined||v===null||v==='')return null;const n=Number(v);if(!Number.isInteger(n)||n<1900||n>new Date().getFullYear()+2)fail('Tahun kendaraan tidak valid');return n};
 const label=m=>[m.brand,m.model,m.variant,m.engine].filter(Boolean).join(' ')+(m.year_start||m.year_end?` (${m.year_start||'…'}–${m.year_end||'…'})`:'');
 db.exec(`CREATE TABLE IF NOT EXISTS vehicle_models(id INTEGER PRIMARY KEY,brand TEXT NOT NULL DEFAULT '',model TEXT NOT NULL,variant TEXT NOT NULL DEFAULT '',engine TEXT NOT NULL DEFAULT '',year_start INTEGER,year_end INTEGER,model_key TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS vehicles(id INTEGER PRIMARY KEY,plate TEXT NOT NULL,plate_key TEXT NOT NULL UNIQUE,model_id INTEGER NOT NULL REFERENCES vehicle_models(id),year INTEGER,customer TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',vin TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS item_vehicle_models(item_id INTEGER NOT NULL REFERENCES items(id),model_id INTEGER NOT NULL REFERENCES vehicle_models(id),PRIMARY KEY(item_id,model_id));`);
 for(const [table,col,type] of [['visits','vehicle_id','INTEGER REFERENCES vehicles(id)'],['visits','model_id','INTEGER REFERENCES vehicle_models(id)'],['visits','vehicle_year','INTEGER'],['items','fitment_mode',"TEXT NOT NULL DEFAULT 'unverified'"]])if(!all('PRAGMA table_info('+table+')').some(c=>c.name===col))db.exec('ALTER TABLE '+table+' ADD COLUMN '+col+' '+type);
 function saveModel(b,legacy=false){
  const brand=text(b.brand),model=text(b.model),variant=text(b.variant),engine=text(b.engine),start=year(b.year_start),end=year(b.year_end);
  if(!model||(!legacy&&!brand))fail('Merek dan model kendaraan wajib diisi');if(start&&end&&start>end)fail('Rentang tahun tidak valid');
  if([brand,model,variant,engine].some(v=>v.length>120))fail('Data tipe kendaraan terlalu panjang');
  const key=JSON.stringify([brand,model,variant,engine,start,end].map(v=>typeof v==='string'?v.toLowerCase():v));
  const same=one('SELECT id FROM vehicle_models WHERE model_key=?',key);if(same&&same.id!==Number(b.id)){if(legacy)return same.id;fail('Tipe kendaraan sudah terdaftar')}
  if(b.id){if(!one('SELECT id FROM vehicle_models WHERE id=?',Number(b.id)))fail('Tipe kendaraan tidak ditemukan');
   if(one('SELECT id FROM vehicles WHERE model_id=? AND year IS NOT NULL AND ((? IS NOT NULL AND year<?) OR (? IS NOT NULL AND year>?))',Number(b.id),start,start,end,end))fail('Rentang tahun tidak mencakup kendaraan yang sudah terdaftar');
   run('UPDATE vehicle_models SET brand=?,model=?,variant=?,engine=?,year_start=?,year_end=?,model_key=? WHERE id=?',brand,model,variant,engine,start,end,key,Number(b.id));return Number(b.id)}
  return Number(run('INSERT INTO vehicle_models(brand,model,variant,engine,year_start,year_end,model_key) VALUES(?,?,?,?,?,?,?)',brand,model,variant,engine,start,end,key).lastInsertRowid);
 }
 function saveVehicle(b){
  const plate=text(b.plate).toUpperCase(),key=plateKey(plate),customer=text(b.customer),model=one('SELECT * FROM vehicle_models WHERE id=? AND active=1',Number(b.model_id)),y=year(b.year);
  if(!plate||!key||plate.length>30||!customer)fail('Nomor polisi dan nama pemilik wajib diisi');if(!model)fail('Pilih tipe kendaraan yang aktif');
  if(y&&((model.year_start&&y<model.year_start)||(model.year_end&&y>model.year_end)))fail('Tahun kendaraan di luar rentang tipe yang dipilih');
  const duplicate=one('SELECT id FROM vehicles WHERE plate_key=?',key);if(duplicate&&duplicate.id!==Number(b.id))fail('Nomor polisi sudah terdaftar di master kendaraan');
  if(b.id){if(!one('SELECT id FROM vehicles WHERE id=?',Number(b.id)))fail('Kendaraan tidak ditemukan');run('UPDATE vehicles SET plate=?,plate_key=?,model_id=?,year=?,customer=?,phone=?,vin=?,notes=? WHERE id=?',plate,key,model.id,y,customer,text(b.phone),text(b.vin),text(b.notes),Number(b.id));return Number(b.id)}
  return Number(run('INSERT INTO vehicles(plate,plate_key,model_id,year,customer,phone,vin,notes) VALUES(?,?,?,?,?,?,?,?)',plate,key,model.id,y,customer,text(b.phone),text(b.vin),text(b.notes)).lastInsertRowid);
 }
 function legacyVehicle(b){
  let vehicle=one('SELECT * FROM vehicles WHERE plate_key=?',plateKey(b.plate));if(vehicle)return vehicle;
  const modelId=saveModel({model:text(b.unit)||'Belum diklasifikasikan'},true);
  const id=saveVehicle({plate:b.plate,customer:b.customer,phone:b.phone,model_id:modelId});return one('SELECT * FROM vehicles WHERE id=?',id);
 }
 // Backfill only missing relations. Historical visit text is deliberately preserved.
 db.exec('BEGIN IMMEDIATE');try{for(const v of all('SELECT * FROM visits WHERE vehicle_id IS NULL ORDER BY id DESC')){const vehicle=legacyVehicle(v);const historicalModel=saveModel({model:text(v.unit)||'Belum diklasifikasikan'},true);run('UPDATE visits SET vehicle_id=?,model_id=?,vehicle_year=? WHERE id=?',vehicle.id,historicalModel,vehicle.year,v.id)}db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 function resolveVisit(b){
  let v;if(b.vehicle_id){v=one('SELECT * FROM vehicles WHERE id=? AND active=1',Number(b.vehicle_id));if(!v)fail('Pilih kendaraan aktif dari master')}else{if(!text(b.unit)||!text(b.plate)||!text(b.customer))fail('Pilih kendaraan dari Master Data Kendaraan');v=legacyVehicle(b)}
  const model=one('SELECT * FROM vehicle_models WHERE id=? AND active=1',v.model_id);if(!model||!v.active)fail('Kendaraan atau tipe kendaraan tidak aktif');
  return {...v,unit:label(model),vehicle_id:v.id};
 }
 function setFitment(itemId,b){
  if(!one('SELECT id FROM items WHERE id=?',itemId))fail('Sparepart tidak ditemukan');
  const mode=b.fitment_mode??'unverified';if(!['universal','specific','unverified'].includes(mode))fail('Jenis kecocokan tidak valid');
  let ids=b.model_ids??[];if(!Array.isArray(ids))fail('Daftar tipe kendaraan tidak valid');ids=[...new Set(ids.map(Number))];
  if(mode==='specific'&&!ids.length)fail('Pilih minimal satu tipe kendaraan untuk sparepart khusus');
  if(mode!=='specific')ids=[];
  for(const id of ids)if(!Number.isSafeInteger(id)||!one('SELECT id FROM vehicle_models WHERE id=? AND active=1',id))fail('Tipe kendaraan relasi tidak aktif atau tidak ditemukan');
  if(mode==='specific'&&all("SELECT v.model_id FROM reservations r JOIN visits v ON v.id=r.visit WHERE r.item=? AND r.status='Aktif'",itemId).some(v=>!ids.includes(v.model_id)))fail('Masih ada reservasi aktif untuk tipe kendaraan yang akan dikeluarkan dari relasi');
  run('DELETE FROM item_vehicle_models WHERE item_id=?',itemId);for(const id of ids)run('INSERT INTO item_vehicle_models(item_id,model_id) VALUES(?,?)',itemId,id);
  run('UPDATE items SET fitment_mode=? WHERE id=?',mode,itemId);
 }
 function assertFits(item,visit){if(item.fitment_mode==='specific'&&!one('SELECT item_id FROM item_vehicle_models WHERE item_id=? AND model_id=?',item.id,visit.model_id))fail('Sparepart tidak cocok dengan tipe kendaraan pada work order')}
 function toggle(table,b){if(!['vehicles','vehicle_models'].includes(table))fail('Master tidak valid');if(!one('SELECT id FROM '+table+' WHERE id=?',Number(b.id)))fail('Data master tidak ditemukan');run('UPDATE '+table+' SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?',Number(b.id))}
 return {saveModel,saveVehicle,resolveVisit,setFitment,assertFits,toggle,
  models:()=>all('SELECT * FROM vehicle_models ORDER BY brand,model,variant').map(m=>({...m,label:label(m)})),
  vehicles:()=>all('SELECT v.*,m.active model_active FROM vehicles v JOIN vehicle_models m ON m.id=v.model_id ORDER BY v.plate'),
  itemModels:()=>all('SELECT * FROM item_vehicle_models ORDER BY item_id,model_id')};
}
