import {createArrivalPlans} from './arrival-plans.js';
import {createCrmReminders} from './crm-reminders.js';
import {createBilling} from './billing.js';
import {buildExcelOutput} from './excel-output.js';
import {buildGatePassPdf} from './gatepass-document.js';
import {createInventoryImports} from './inventory-imports.js';
import {buildEstimatePdf,buildInvoicePdf} from './estimate-document.js';
import {createVisitTeam} from './visit-team.js';
import {createInventoryMaster} from './inventory-master.js';
import {createServiceCatalog} from './service-catalog.js';
import {createEstimates} from './estimates.js';
import {createVehicleMaster} from './vehicle-master.js';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const dir=process.env.DATA_DIR||'data'; fs.mkdirSync(dir,{recursive:true});
const db=new DatabaseSync(path.join(dir,'workshop.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT,email TEXT UNIQUE,role TEXT,password TEXT,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER,expires INTEGER);
CREATE TABLE IF NOT EXISTS visits(id INTEGER PRIMARY KEY AUTOINCREMENT,customer TEXT,phone TEXT,plate TEXT,unit TEXT,km INTEGER,complaint TEXT,technician INTEGER,status TEXT DEFAULT 'Di Bengkel',progress TEXT DEFAULT 'Baru',entered TEXT,exited TEXT,receiver TEXT,invoice INTEGER,qc INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY,sku TEXT UNIQUE,name TEXT,category TEXT,brand TEXT,rack TEXT,supplier TEXT,qty REAL,cost REAL,price INTEGER,minimum REAL);
CREATE TABLE IF NOT EXISTS movements(id INTEGER PRIMARY KEY,item INTEGER,qty REAL,cost REAL,type TEXT,source TEXT,actor INTEGER,created TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS receipt_source ON movements(item,source) WHERE type='Penerimaan';
CREATE TABLE IF NOT EXISTS lines(id INTEGER PRIMARY KEY,visit INTEGER,item INTEGER,description TEXT,qty REAL,price INTEGER,cost REAL,returned REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS invoices(id INTEGER PRIMARY KEY AUTOINCREMENT,visit INTEGER UNIQUE,total INTEGER,created TEXT);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,invoice INTEGER,amount INTEGER,method TEXT,reference TEXT,actor INTEGER,created TEXT);
CREATE TABLE IF NOT EXISTS journals(id INTEGER PRIMARY KEY,source TEXT UNIQUE,memo TEXT,entries TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor INTEGER,action TEXT,detail TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS periods(month TEXT PRIMARY KEY,closed INTEGER);
CREATE TABLE IF NOT EXISTS reservations(id INTEGER PRIMARY KEY,item INTEGER,visit INTEGER,qty REAL,requester INTEGER,status TEXT DEFAULT 'Aktif');
CREATE TABLE IF NOT EXISTS expenses(id INTEGER PRIMARY KEY,amount INTEGER,category TEXT,method TEXT,recipient TEXT,reference TEXT,actor INTEGER,created TEXT);
CREATE TABLE IF NOT EXISTS supplier_payments(id INTEGER PRIMARY KEY,movement INTEGER,amount INTEGER,method TEXT,reference TEXT,actor INTEGER,created TEXT);
CREATE TABLE IF NOT EXISTS approvals(id INTEGER PRIMARY KEY,kind TEXT,source INTEGER,reason TEXT,requester INTEGER,approver INTEGER,status TEXT DEFAULT 'Diajukan',payload TEXT);
`);
for(const [table,col,def] of [['users','mfa_secret',"TEXT DEFAULT ''"],['users','mfa_pending',"TEXT DEFAULT ''"],['users','gatepass','INTEGER DEFAULT 0'],['visits','accessories',"TEXT DEFAULT ''"],['visits','condition',"TEXT DEFAULT ''"],['visits','courier',"TEXT DEFAULT ''"],['visits','customer_approval',"TEXT DEFAULT ''"],['items','unit',"TEXT DEFAULT 'unit'"],['items','compatibility',"TEXT DEFAULT ''"]]){if(!db.prepare('PRAGMA table_info('+table+')').all().some(c=>c.name===col))db.exec('ALTER TABLE '+table+' ADD COLUMN '+col+' '+def)}
for(const suffix of ['','-wal','-shm']){const file=path.join(dir,'workshop.sqlite'+suffix);if(fs.existsSync(file))fs.chmodSync(file,0o600)}
const inventoryMaster=createInventoryMaster(db);
const inventoryImports=createInventoryImports(db);
const vehicleMaster=createVehicleMaster(db);
const visitTeam=createVisitTeam(db);
const crmReminders=createCrmReminders(db);
const arrivalPlans=createArrivalPlans(db);
const serviceCatalog=createServiceCatalog(db);
const estimates=createEstimates(db,vehicleMaster,serviceCatalog);
for(const [name,type] of [['estimate_id','INTEGER'],['estimate_revision','INTEGER'],['estimate_line_id','INTEGER']])if(!db.prepare('PRAGMA table_info(lines)').all().some(c=>c.name===name))db.exec('ALTER TABLE lines ADD COLUMN '+name+' '+type);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS line_estimate_source ON lines(visit,estimate_id,estimate_revision,estimate_line_id) WHERE estimate_line_id IS NOT NULL');
const now=()=>new Date().toISOString();
const month=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).formatToParts(new Date());return p.find(x=>x.type==='year').value+'-'+p.find(x=>x.type==='month').value};
function hash(p,s=randomBytes(16).toString('hex')){return s+':'+scryptSync(p,s,64).toString('hex')}
function verify(p,h){const [s,k]=h.split(':');return timingSafeEqual(Buffer.from(k,'hex'),scryptSync(p,s,64))}
if(!db.prepare('SELECT id FROM users LIMIT 1').get()){
 const password=process.env.INITIAL_PASSWORD||randomBytes(12).toString('base64url');
 db.prepare('INSERT INTO users(name,email,role,password) VALUES(?,?,?,?)').run('Administrator','admin@26motor.local','Super Admin',hash(password));
 fs.writeFileSync(path.join(dir,'initial-access.txt'),`Email: admin@26motor.local\nPassword: ${password}\n`,{mode:0o600});
}
const all=(s,...p)=>db.prepare(s).all(...p),one=(s,...p)=>db.prepare(s).get(...p),run=(s,...p)=>db.prepare(s).run(...p);
function fail(message,status=400){throw Object.assign(new Error(message),{status})}
function privilegedRole(u){return ['Super Admin','Finance','Akuntan'].includes(u.role)}
function gate(u){if(u.role==='Finance'&&!u.gatepass)fail('Izin Gate Pass belum diberikan oleh Super Admin.',403)}
function allow(u,roles){if(!roles.includes(u.role))fail('Anda tidak memiliki izin untuk tindakan ini.',403)}
function audit(u,a,d){run('INSERT INTO audit(actor,action,detail,created) VALUES(?,?,?,?)',u.id,a,JSON.stringify(d),now())}
function journal(source,memo,entries){if(one('SELECT closed FROM periods WHERE month=?',month())?.closed)fail('Periode akuntansi telah dikunci.');const debit=entries.reduce((a,e)=>a+(e.debit||0),0),credit=entries.reduce((a,e)=>a+(e.credit||0),0);if(debit!==credit)fail('Jurnal tidak seimbang');run('INSERT INTO journals(source,memo,entries,created) VALUES(?,?,?,?)',source,memo,JSON.stringify(entries),now())}
function tx(f){db.exec('BEGIN IMMEDIATE');try{const r=f();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}
function required(b,keys){for(const k of keys)if(b[k]===undefined||String(b[k]).trim()==='')fail(`Kolom ${k} wajib diisi.`)}
function amount(n){n=Number(n);if(!Number.isFinite(n)||n<=0)fail('Jumlah harus lebih dari nol.');return n}
function integer(n){n=amount(n);if(!Number.isSafeInteger(n))fail('Nilai rupiah harus berupa bilangan bulat.');return n}
const billing=createBilling(db,{journal,now});
async function api(req,res,url){
 let b={};if(req.method==='POST'){let raw='';for await(const c of req){raw+=c;if(raw.length>1000000)fail('Data terlalu besar',413)}try{b=JSON.parse(raw||'{}')}catch{fail('JSON tidak valid')}}
 const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));
 if(url==='/api/login'){
  const u=one('SELECT * FROM users WHERE email=? AND active=1',String(b.email||'').toLowerCase());if(!u||!verify(String(b.password||''),u.password)){fail('Email atau kata sandi salah.',401)}
  const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',token,u.id,Date.now()+8*3600000);res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.SECURE_COOKIE?' ; Secure':''}`);audit(u,'Login',{});return {ok:true};
 }
 const u=one('SELECT u.id,u.name,u.email,u.role,u.gatepass,u.mfa_secret FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1',cookies.session||'',Date.now());if(!u)fail('Silakan masuk terlebih dahulu.',401);
 if(req.method==='POST'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)fail('Origin tidak diizinkan',403);
 delete u.mfa_secret;
 if(url.startsWith('/api/mfa/'))fail('MFA telah dinonaktifkan.',404);
 if(url==='/api/logout'){run('DELETE FROM sessions WHERE token=?',cookies.session);return {ok:true}}
 if(url==='/api/export-excel'&&req.method==='POST'){res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename="26motor-export.xlsx"');return await buildExcelOutput(b,u.name)}
 const gateDocument=url.match(/^\/api\/gate-pass-document\/(\d+)\/(IN|OUT)\.pdf$/);if(gateDocument&&req.method==='GET'){const visit=one('SELECT * FROM visits WHERE id=?',Number(gateDocument[1]));if(!visit)fail('Kunjungan tidak ditemukan',404);if(u.role==='Teknisi'&&!visitTeam.has(visit.id,u.id))fail('Bukan tugas Anda',403);if(gateDocument[2]==='OUT'&&!visit.exited)fail('Kendaraan belum keluar');res.setHeader('Content-Disposition','attachment; filename="GatePass-'+gateDocument[2]+'-'+visit.id+'.pdf"');return await buildGatePassPdf(visit,gateDocument[2])}
 const documentMatch=url.match(/^\/api\/estimate-document\/(\d+)-r(\d+)-d(\d+)\.pdf$/);if(documentMatch&&req.method==='GET'){const [,id,revision,decision]=documentMatch,e=estimates.document(u,id,revision,decision);res.setHeader('Content-Disposition','attachment; filename="EST-'+String(e.id).padStart(5,'0')+'-Rev-'+e.revision+'.pdf"');return await buildEstimatePdf(e)}
 const invoiceDocumentMatch=url.match(/^\/api\/invoice-document\/(\d+)\.pdf$/);if(invoiceDocumentMatch&&req.method==='GET'){
  allow(u,['Super Admin','Finance','Akuntan']);const invoice=billing.document(Number(invoiceDocumentMatch[1]));res.setHeader('Content-Disposition','attachment; filename="INV-'+String(invoice.id).padStart(5,'0')+'.pdf"');return await buildInvoicePdf(invoice);
 }
 const archiveMatch=url.match(/^\/api\/import-archive\/(\d+)$/);if(archiveMatch&&req.method==='GET')return inventoryImports.read(u,Number(archiveMatch[1]));
 if(url==='/api/state'){

  const tech=u.role==='Teknisi';const visits=all(`SELECT v.*,u.name technician_name,i.total,i.estimate_id invoice_estimate_id,i.estimate_revision invoice_estimate_revision,i.created invoice_created,COALESCE((SELECT SUM(amount) FROM payments WHERE invoice=i.id),0) paid FROM visits v LEFT JOIN users u ON u.id=v.technician LEFT JOIN invoices i ON i.visit=v.id ${tech?'WHERE EXISTS (SELECT 1 FROM visit_technicians vt WHERE vt.visit_id=v.id AND vt.technician_id=?)':''} ORDER BY v.id DESC`,...(tech?[u.id]:[]));
  visitTeam.decorate(visits);estimates.decorateVisits(visits);
  const ids=new Set(visits.map(v=>v.id));const items=all('SELECT * FROM items ORDER BY name').map(i=>{if(tech){delete i.cost;delete i.price}else{i.reserved=one("SELECT COALESCE(SUM(qty),0) n FROM reservations WHERE item=? AND status='Aktif'",i.id).n}i.available=i.qty-one("SELECT COALESCE(SUM(qty),0) n FROM reservations WHERE item=? AND status='Aktif'",i.id).n;return i});
  return {user:u,visits,items,crm_reminders:crmReminders.list(u),arrival_plans:arrivalPlans.list(u),estimate_billing:billing.list(u),cashbacks:privilegedRole(u)?all('SELECT * FROM cashbacks ORDER BY id DESC'):[],work_order_estimates:estimates.workOrders(u,visits),import_batches:inventoryImports.list(u),suppliers:tech?[]:inventoryMaster.list('suppliers'),racks:inventoryMaster.list('racks'),estimates:estimates.list(u),service_catalog:serviceCatalog.list(u),vehicle_models:vehicleMaster.models(),vehicles:vehicleMaster.vehicles().filter(v=>!tech||visits.some(visit=>visit.vehicle_id===v.id)),item_vehicle_models:vehicleMaster.itemModels(),lines:all('SELECT * FROM lines').filter(l=>ids.has(l.visit)).map(l=>{if(tech)delete l.cost;return l}),users:all('SELECT id,name,role,active,email,gatepass FROM users'),payments:['Super Admin','Finance','Akuntan'].includes(u.role)?all('SELECT * FROM payments ORDER BY id DESC'):[],journals:['Super Admin','Akuntan'].includes(u.role)?all('SELECT * FROM journals ORDER BY id DESC'):[],audit:all(`SELECT a.*,u.name actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor ${['Super Admin','Akuntan'].includes(u.role)?'':'WHERE actor=?'} ORDER BY a.id DESC LIMIT 200`,...(['Super Admin','Akuntan'].includes(u.role)?[]:[u.id])),movements:tech?[]:all('SELECT m.*,i.name item_name FROM movements m JOIN items i ON i.id=m.item ORDER BY m.id DESC'),approvals:tech?[]:all('SELECT * FROM approvals ORDER BY id DESC'),expenses:privilegedRole(u)?all('SELECT * FROM expenses ORDER BY id DESC'):[],supplier_payments:privilegedRole(u)?all('SELECT * FROM supplier_payments ORDER BY id DESC'):[],reservations:all('SELECT * FROM reservations ORDER BY id DESC').filter(r=>!tech||ids.has(r.visit)),periods:all('SELECT * FROM periods')};
 }
 if(req.method!=='POST')fail('Tidak ditemukan',404);
 return tx(()=>{
 let result={ok:true};
 if(['/api/suppliers','/api/racks','/api/toggle-supplier','/api/toggle-rack'].includes(url)){
  const kind=url.includes('supplier')?'suppliers':'racks';const change=url.includes('/toggle-')?inventoryMaster.toggle(u,kind,b):inventoryMaster.save(u,kind,b);audit(u,url.slice(5),change);return {ok:true,id:change.id};
 }else if(url==='/api/arrival-plans'){
  result=arrivalPlans.save(u,b);
 }else if(url==='/api/arrival-plan-status'){
  result=arrivalPlans.changeStatus(u,b);
 }else if(url==='/api/arrival-plan-link'){
  allow(u,['Super Admin','Finance']);gate(u);result=arrivalPlans.linkExisting(u,b);
 }else if(url==='/api/crm-reminders'){
  result=crmReminders.save(u,b);
 }else if(url==='/api/crm-reminder-status'){
  result=crmReminders.updateStatus(u,b);
 }else if(url==='/api/service-catalog'){

  result=serviceCatalog.save(u,b);
 }else if(url==='/api/toggle-service'){
  result=serviceCatalog.toggle(u,b);
 }else if(url==='/api/estimates'){
  result=estimates.save(u,b);
 }else if(url==='/api/link-estimate-visit'){
  result=estimates.linkVisit(u,b);
 }else if(url==='/api/estimate-preview'){
  result=estimates.preview(u,b);
 }else if(url==='/api/estimate-decision'){
  result=estimates.decide(u,b);
 }else if(url==='/api/vehicle-models'){
  allow(u,['Super Admin','Finance','Admin Stock']);result.id=vehicleMaster.saveModel(b);
 }else if(url==='/api/vehicle-master'){
  allow(u,['Super Admin','Finance']);result.id=vehicleMaster.saveVehicle(b);
 }else if(url==='/api/toggle-vehicle-model'){
  allow(u,['Super Admin','Finance','Admin Stock']);vehicleMaster.toggle('vehicle_models',b);
 }else if(url==='/api/toggle-vehicle'){
  allow(u,['Super Admin','Finance']);vehicleMaster.toggle('vehicles',b);
 }else if(url==='/api/item-fitment'){
  allow(u,['Super Admin','Admin Stock']);vehicleMaster.setFitment(Number(b.item),b);
 }else if(url==='/api/visits'){
  allow(u,['Super Admin','Finance']);gate(u);const arrivalPlan=arrivalPlans.prepareIntake(u,b);if(arrivalPlan?.reused)return {ok:true,id:arrivalPlan.visit_id,reused:true};required(b,['complaint']);const vehicle=vehicleMaster.resolveVisit(b);const team=visitTeam.validate(b),technician=team.pic;
  const r=run('INSERT INTO visits(customer,phone,plate,unit,km,complaint,technician,entered) VALUES(?,?,?,?,?,?,?,?)',vehicle.customer,vehicle.phone,vehicle.plate,vehicle.unit,Number(b.km)||0,b.complaint,technician,now());result.id=Number(r.lastInsertRowid);run('UPDATE visits SET vehicle_id=?,model_id=?,vehicle_year=? WHERE id=?',vehicle.id,vehicle.model_id,vehicle.year,result.id);run('UPDATE visits SET accessories=?,condition=?,courier=? WHERE id=?',b.accessories||'',b.condition||'',b.courier||'',result.id);visitTeam.assign(result.id,team);if(arrivalPlan)arrivalPlans.connect(u,arrivalPlan,result.id);
 }else if(url==='/api/edit-visit'){
  allow(u,['Super Admin','Finance']);gate(u);const v=one('SELECT * FROM visits WHERE id=?',b.id);if(!v)fail('Kunjungan tidak ditemukan',404);if(v.exited||v.invoice)fail('Kunjungan yang sudah berinvoice atau keluar tidak dapat diedit');if(Number(b.edit_version)!==v.edit_version)fail('Kunjungan telah diperbarui. Muat ulang sebelum mengedit.',409);
  required(b,['complaint']);const km=Number(b.km||0);if(!Number.isFinite(km)||km<0)fail('Kilometer tidak valid');
  const team=visitTeam.validate(b,v),vehicleId=Number(b.vehicle_id);if(!Number.isSafeInteger(vehicleId)||vehicleId<1)fail('Pilih kendaraan dari master');
  const changed=vehicleId!==v.vehicle_id;
  if(changed){if(one('SELECT id FROM arrival_plans WHERE visit_id=?',v.id)||one('SELECT id FROM lines WHERE visit=?',v.id)||one('SELECT id FROM reservations WHERE visit=?',v.id)||one('SELECT id FROM estimates WHERE visit_id=?',v.id))fail('Kendaraan tidak dapat diganti setelah memiliki rincian pekerjaan, reservasi, atau estimasi');const vehicle=vehicleMaster.resolveVisit({vehicle_id:vehicleId});run('UPDATE visits SET vehicle_id=?,model_id=?,vehicle_year=?,customer=?,phone=?,plate=?,unit=? WHERE id=?',vehicle.id,vehicle.model_id,vehicle.year,vehicle.customer,vehicle.phone,vehicle.plate,vehicle.unit,v.id)}
  const details={};for(const key of ['complaint','courier','condition','accessories']){if(b[key]!==undefined&&typeof b[key]!=='string')fail('Isian kunjungan tidak valid');details[key]=String(b[key]??'').trim();if(details[key].length>3000)fail('Isian maksimal 3000 karakter');}
  run('UPDATE visits SET km=?,complaint=?,courier=?,condition=?,accessories=? WHERE id=?',km,details.complaint,details.courier,details.condition,details.accessories,v.id);const before={...v,technicians:visitTeam.members(v.id)};visitTeam.assign(v.id,team);audit(u,'edit-visit',{before,after:{...one('SELECT * FROM visits WHERE id=?',v.id),technicians:visitTeam.members(v.id)}});return {ok:true,id:v.id};
 }else if(url==='/api/progress'){

  allow(u,['Super Admin','Finance','Teknisi']);const v=one('SELECT * FROM visits WHERE id=?',b.id);if(!v)fail('Kunjungan tidak ditemukan');if(u.role==='Teknisi'&&!visitTeam.has(v.id,u.id))fail('Bukan tugas Anda',403);if(v.exited)fail('Kendaraan sudah keluar');if(!['Baru','Diagnosis','Menunggu Persetujuan','Di Negosiasi','Tidak Jadi','Siap Dikerjakan','Menunggu Sparepart','Dikerjakan','QC','Selesai'].includes(b.progress))fail('Status tidak valid');if(v.invoice)fail('Invoice sudah diterbitkan; progres pekerjaan tidak dapat diubah.');estimates.assertWorkProgress(v.id,b.progress);run('UPDATE visits SET progress=?,qc=?,status=? WHERE id=?',b.progress,b.progress==='Selesai'?1:0,b.progress==='Selesai'?'Siap Keluar':'Di Bengkel',b.id);
 }else if(url==='/api/item-details'){
  allow(u,['Super Admin','Admin Stock']);
  const item=one('SELECT * FROM items WHERE id=?',b.id);if(!item)fail('Sparepart tidak ditemukan',404);
  if(['qty','cost','price','fitment_mode','model_ids'].some(key=>Object.hasOwn(b,key)))fail('Gunakan fitur stok, harga, atau relasi kendaraan untuk perubahan ini.');
  const links=inventoryMaster.resolve(b,item);Object.assign(b,links);const fields=['sku','name','category','brand','rack','supplier'],details={};
  for(const key of fields){if(typeof b[key]!=='string')fail('Data sparepart tidak lengkap');details[key]=b[key].trim();if(details[key].length>200)fail('Isian maksimal 200 karakter');}
  details.sku=details.sku.toUpperCase();required(details,['sku','name','category']);
  const minimum=Number(b.minimum);if(b.minimum===''||b.minimum===null||!Number.isFinite(minimum)||minimum<0)fail('Stok minimum tidak valid');details.minimum=minimum;
  if(one('SELECT id FROM items WHERE UPPER(sku)=? AND id<>?',details.sku,item.id))fail('Kode Sparepart sudah digunakan');
  run('UPDATE items SET sku=?,name=?,category=?,brand=?,rack=?,supplier=?,minimum=? WHERE id=?',...fields.map(key=>details[key]),minimum,item.id);run('UPDATE items SET supplier_id=?,rack_id=? WHERE id=?',links.supplier_id,links.rack_id,item.id);
  audit(u,'item-details',{id:item.id,before:Object.fromEntries([...fields,'minimum'].map(key=>[key,item[key]])),after:details,supplier_id:links.supplier_id,rack_id:links.rack_id});return {ok:true,id:item.id};
 }else if(url==='/api/item-import-values'){
  result=inventoryImports.fillValues(u,b,journal);
 }else if(url==='/api/items') {
  allow(u,['Super Admin','Admin Stock']);Object.assign(b,inventoryMaster.resolve(b));required(b,['sku','name','category']);const qty=Number(b.qty||0),cost=Number(b.cost||0),price=Number(b.price||0);if(![qty,cost,price].every(n=>Number.isFinite(n)&&n>=0))fail('Angka tidak valid');if(!Number.isInteger(price))fail('Harga jual harus rupiah bulat');const r=run('INSERT INTO items(sku,name,category,brand,rack,supplier,qty,cost,price,minimum) VALUES(?,?,?,?,?,?,?,?,?,?)',b.sku.toUpperCase(),b.name,b.category,b.brand||'',b.rack||'',b.supplier||'',qty,cost,price,Number(b.minimum)||0);const id=Number(r.lastInsertRowid);run('UPDATE items SET supplier_id=?,rack_id=? WHERE id=?',b.supplier_id,b.rack_id,id);vehicleMaster.setFitment(id,b);if(qty){run('INSERT INTO movements(item,qty,cost,type,source,actor,created) VALUES(?,?,?,?,?,?,?)',id,qty,cost,'Saldo awal','OPEN-'+id,u.id,now());const val=Math.round(qty*cost);journal('OPEN-'+id,'Saldo awal persediaan',[{account:'Persediaan',debit:val},{account:'Ekuitas saldo awal',credit:val}])}
 }else if(url==='/api/receipt'){
  allow(u,['Super Admin','Admin Stock']);required(b,['reference']);const i=one('SELECT * FROM items WHERE id=?',b.item);if(!i)fail('Item tidak ditemukan');if(i.qty>0&&i.cost===null)fail('Lengkapi modal saldo awal impor sebelum penerimaan tambahan.');const qty=amount(b.qty),cost=amount(b.cost),fees=Number(b.fees||0);if(!Number.isFinite(fees)||fees<0)fail('Biaya tidak valid');const value=Math.round(qty*cost+fees),avg=(i.qty*i.cost+value)/(i.qty+qty);run('UPDATE items SET qty=qty+?,cost=? WHERE id=?',qty,avg,i.id);const r=run('INSERT INTO movements(item,qty,cost,type,source,actor,created) VALUES(?,?,?,?,?,?,?)',i.id,qty,value/qty,'Penerimaan',b.reference,u.id,now());journal('RECEIPT-'+r.lastInsertRowid,'Penerimaan '+b.reference,[{account:'Persediaan',debit:value},{account:'Hutang supplier',credit:value}]);
 }else if(url==='/api/line'){
  allow(u,['Super Admin','Admin Stock','Finance']);const v=one('SELECT * FROM visits WHERE id=?',b.visit);if(!v||v.exited||v.invoice)fail('Work order tidak dapat diubah');let source=null;if(b.estimate_line_id){source=estimates.executionLine(b,v);const existing=one('SELECT id FROM lines WHERE visit=? AND estimate_id=? AND estimate_revision=? AND estimate_line_id=?',v.id,source.estimate_id,source.revision,source.id);if(existing)return {ok:true,id:existing.id,duplicate:true};b.qty=source.qty;b.description=source.description;b.price=source.price;}const qty=amount(b.qty);let price,cost=0,item=null,description=b.description;
  if(b.item){allow(u,['Super Admin','Admin Stock']);const i=one('SELECT * FROM items WHERE id=?',b.item);if(!i)fail('Item tidak ditemukan');if(i.cost===null||i.price===null)fail('Lengkapi modal dan harga jual sparepart impor sebelum pemakaian.');vehicleMaster.assertFits(i,v);const reserved=one("SELECT COALESCE(SUM(qty),0) n FROM reservations WHERE item=? AND status='Aktif' AND visit<>?",i.id,v.id).n;if(i.qty-reserved<qty)fail('Stok tersedia tidak cukup.');const own=all("SELECT * FROM reservations WHERE item=? AND visit=? AND status='Aktif' ORDER BY id",i.id,v.id);let consume=qty;for(const r of own){const take=Math.min(consume,r.qty);if(take===r.qty)run("UPDATE reservations SET status='Dipakai' WHERE id=?",r.id);else run('UPDATE reservations SET qty=qty-? WHERE id=?',take,r.id);consume-=take;if(!consume)break}item=i.id;price=source?source.price:i.price;cost=i.cost;description=source?source.description:i.name;run('UPDATE items SET qty=qty-? WHERE id=?',qty,i.id);run('INSERT INTO movements(item,qty,cost,type,source,actor,created) VALUES(?,?,?,?,?,?,?)',i.id,-qty,cost,'Pemakaian','WO-'+v.id,u.id,now());const value=Math.round(qty*cost);journal('ISSUE-'+one('SELECT last_insert_rowid() id').id,'Sparepart WO-'+v.id,[{account:'Barang dalam proses',debit:value},{account:'Persediaan',credit:value}]);
  }else{allow(u,['Super Admin','Finance']);required(b,['description']);price=source?source.price:integer(b.price)}
  run('INSERT INTO lines(visit,item,description,qty,price,cost,estimate_id,estimate_revision,estimate_line_id) VALUES(?,?,?,?,?,?,?,?,?)',v.id,item,description,qty,price,cost,source?.estimate_id??null,source?.revision??null,source?.id??null);
 }else if(url==='/api/return'){
  allow(u,['Super Admin','Admin Stock']);const l=one('SELECT * FROM lines WHERE id=?',b.line);if(!l||!l.item)fail('Baris tidak ditemukan');if(one('SELECT invoice FROM visits WHERE id=?',l.visit).invoice)fail('Invoice sudah diposting; perlu credit note');const qty=amount(b.qty);if(qty>l.qty-l.returned)fail('Retur melebihi pemakaian');run('UPDATE lines SET returned=returned+? WHERE id=?',qty,l.id);const i=one('SELECT * FROM items WHERE id=?',l.item);run('UPDATE items SET qty=qty+?,cost=? WHERE id=?',qty,(i.qty*i.cost+qty*l.cost)/(i.qty+qty),i.id);const r=run('INSERT INTO movements(item,qty,cost,type,source,actor,created) VALUES(?,?,?,?,?,?,?)',i.id,qty,l.cost,'Retur','LINE-'+l.id,u.id,now());const val=Math.round(qty*l.cost);journal('RETURN-'+r.lastInsertRowid,'Retur pemakaian LINE-'+l.id,[{account:'Persediaan',debit:val},{account:'Barang dalam proses',credit:val}]);
 }else if(url==='/api/invoice'){
  result=billing.issue(u,b);
 }else if(url==='/api/payment'){
  result=billing.pay(u,b);
 }else if(url==='/api/release'){
  allow(u,['Super Admin','Finance']);gate(u);const v=one('SELECT * FROM visits WHERE id=?',b.visit);if(!v)fail('Kunjungan tidak ditemukan');if(v.exited)return {ok:true,id:v.id};if(!v.qc||!v.invoice)fail('QC dan invoice harus selesai.');const i=one('SELECT * FROM invoices WHERE id=?',v.invoice),paid=one('SELECT COALESCE(SUM(amount),0) n FROM payments WHERE invoice=?',v.invoice).n;if(paid<i.total&&!one("SELECT id FROM approvals WHERE kind='Piutang keluar' AND source=? AND status='Disetujui'",v.id))fail('Invoice belum lunas. Perlu persetujuan piutang oleh petugas lain.');required(b,['receiver']);run("UPDATE visits SET exited=?,receiver=?,status='Keluar' WHERE id=?",now(),b.receiver,v.id);
 }else if(url==='/api/approval'){
  allow(u,['Super Admin','Finance','Admin Stock']);required(b,['reason']);if(!['Piutang keluar','Penyesuaian stok','Perubahan harga','Buka periode'].includes(b.kind))fail('Jenis persetujuan tidak valid');if(b.kind==='Piutang keluar'&&!one('SELECT id FROM visits WHERE id=?',b.source))fail('Kunjungan tidak ditemukan');if(['Penyesuaian stok','Perubahan harga'].includes(b.kind)){allow(u,['Super Admin','Admin Stock']);if(!one('SELECT id FROM items WHERE id=?',b.source))fail('Item tidak ditemukan');const val=Number(b.value);if(!Number.isFinite(val)||val<0)fail('Nilai tidak valid')}if(b.kind==='Buka periode')fail('Akuntan mengajukan melalui menu periode.');run('INSERT INTO approvals(kind,source,reason,requester,payload) VALUES(?,?,?,?,?)',b.kind,b.source,b.reason,u.id,JSON.stringify({value:Number(b.value)}));
 }else if(url==='/api/approve'){
  allow(u,['Super Admin']);const a=one('SELECT * FROM approvals WHERE id=?',b.id);if(!a||a.status!=='Diajukan')fail('Pengajuan tidak tersedia');if(a.requester===u.id)fail('Pengaju tidak dapat menyetujui sendiri.');const p=JSON.parse(a.payload);if(a.kind==='Penyesuaian stok'){const i=one('SELECT * FROM items WHERE id=?',a.source);const reserved=one("SELECT COALESCE(SUM(qty),0) n FROM reservations WHERE item=? AND status='Aktif'",i.id).n;if(p.value<reserved)fail('Stok fisik tidak boleh kurang dari reservasi');if(i.cost===null)fail('Lengkapi modal saldo awal impor sebelum penyesuaian stok.');const delta=p.value-i.qty;run('UPDATE items SET qty=? WHERE id=?',p.value,i.id);run('INSERT INTO movements(item,qty,cost,type,source,actor,created) VALUES(?,?,?,?,?,?,?)',i.id,delta,i.cost,'Penyesuaian','APP-'+a.id,u.id,now());const val=Math.round(Math.abs(delta*i.cost));journal('ADJ-'+a.id,'Penyesuaian stok: '+a.reason,delta>=0?[{account:'Persediaan',debit:val},{account:'Selisih stok',credit:val}]:[{account:'Selisih stok',debit:val},{account:'Persediaan',credit:val}])}if(a.kind==='Perubahan harga'){if(!Number.isSafeInteger(p.value))fail('Harga harus rupiah bulat');run('UPDATE items SET price=? WHERE id=?',p.value,a.source)}if(a.kind==='Buka periode')run('UPDATE periods SET closed=0 WHERE month=?',p.month);run("UPDATE approvals SET approver=?,status='Disetujui' WHERE id=?",u.id,a.id);
 }else if(url==='/api/users'){
  allow(u,['Super Admin']);required(b,['name','email','password','role']);if(!['Super Admin','Admin','Teknisi','Admin Stock','Finance','Akuntan'].includes(b.role))fail('Peran tidak valid');if(b.password.length<12)fail('Kata sandi minimal 12 karakter');run('INSERT INTO users(name,email,role,password,gatepass) VALUES(?,?,?,?,?)',b.name,b.email.toLowerCase(),b.role,hash(b.password),b.gatepass==='1'?1:0);
 }else if(url==='/api/gate-permission'){
 allow(u,['Super Admin']);const account=one("SELECT id FROM users WHERE id=? AND role='Finance'",b.id);if(!account)fail('Akun Finance tidak ditemukan');run('UPDATE users SET gatepass=? WHERE id=?',b.enabled?1:0,b.id);
 }else if(url==='/api/reset-user'){
 allow(u,['Super Admin']);if(Number(b.id)===u.id)fail('Gunakan menu ubah kata sandi untuk akun sendiri');required(b,['password']);if(b.password.length<12)fail('Kata sandi minimal 12 karakter');run('UPDATE users SET password=? WHERE id=?',hash(b.password),b.id);run('DELETE FROM sessions WHERE user_id=?',b.id);
 }else if(url==='/api/toggle-user'){
  allow(u,['Super Admin']);if(Number(b.id)===u.id)fail('Tidak dapat menonaktifkan akun sendiri');run('UPDATE users SET active=1-active WHERE id=?',b.id);run('DELETE FROM sessions WHERE user_id=?',b.id);
 }else if(url==='/api/assignment'){
 allow(u,['Super Admin','Finance']);const v=one('SELECT * FROM visits WHERE id=?',b.visit);if(!v||v.exited||v.invoice)fail('Kunjungan tidak dapat diubah');if(b.edit_version!==undefined&&Number(b.edit_version)!==v.edit_version)fail('Kunjungan telah diperbarui. Muat ulang sebelum mengedit.',409);const before=visitTeam.members(v.id),team=visitTeam.validate(b,v);visitTeam.assign(v.id,team);audit(u,'assignment',{visit:v.id,before,after:visitTeam.members(v.id),pic_technician_id:team.pic});return {ok:true,id:v.id};
 }else if(url==='/api/customer-approval'){
 allow(u,['Super Admin','Finance']);required(b,['evidence']);const v=one('SELECT * FROM visits WHERE id=?',b.visit);if(!v||v.exited)fail('Kunjungan tidak aktif');run('UPDATE visits SET customer_approval=? WHERE id=?',b.evidence,b.visit);
 }else if(url==='/api/reserve'){
 allow(u,['Super Admin','Admin Stock','Teknisi']);const v=one('SELECT * FROM visits WHERE id=?',b.visit),i=one('SELECT * FROM items WHERE id=?',b.item);if(!v||v.exited||v.invoice||!i)fail('Kunjungan atau item tidak tersedia');vehicleMaster.assertFits(i,v);if(u.role==='Teknisi'&&!visitTeam.has(v.id,u.id))fail('Bukan tugas Anda',403);const qty=amount(b.qty),reserved=one("SELECT COALESCE(SUM(qty),0) n FROM reservations WHERE item=? AND status='Aktif'",i.id).n;if(qty>i.qty-reserved)fail('Stok tersedia tidak cukup');run('INSERT INTO reservations(item,visit,qty,requester) VALUES(?,?,?,?)',i.id,v.id,qty,u.id);
 }else if(url==='/api/cancel-reservation'){
 allow(u,['Super Admin','Admin Stock','Teknisi']);const r=one('SELECT * FROM reservations WHERE id=?',b.id);if(!r||r.status!=='Aktif')fail('Reservasi tidak aktif');if(u.role==='Teknisi'&&r.requester!==u.id)fail('Bukan reservasi Anda',403);run("UPDATE reservations SET status='Dibatalkan' WHERE id=?",r.id);
 }else if(url==='/api/expense'){
 allow(u,['Super Admin','Finance']);required(b,['category','recipient','reference']);const n=integer(b.amount);if(!['Tunai','Transfer'].includes(b.method))fail('Metode tidak valid');const r=run('INSERT INTO expenses(amount,category,method,recipient,reference,actor,created) VALUES(?,?,?,?,?,?,?)',n,b.category,b.method,b.recipient,b.reference,u.id,now());journal('EXP-'+r.lastInsertRowid,b.category+' — '+b.recipient,[{account:'Beban '+b.category,debit:n},{account:b.method==='Tunai'?'Kas':'Bank',credit:n}]);
 }else if(url==='/api/supplier-payment'){
 allow(u,['Super Admin','Finance']);const m=one("SELECT * FROM movements WHERE id=? AND type='Penerimaan'",b.movement);if(!m)fail('Penerimaan tidak ditemukan');const paid=one('SELECT COALESCE(SUM(amount),0) n FROM supplier_payments WHERE movement=?',m.id).n;const n=integer(b.amount);if(n>Math.round(m.qty*m.cost)-paid)fail('Pembayaran melebihi saldo hutang');if(!['Tunai','Transfer'].includes(b.method))fail('Metode tidak valid');const r=run('INSERT INTO supplier_payments(movement,amount,method,reference,actor,created) VALUES(?,?,?,?,?,?)',m.id,n,b.method,b.reference||'',u.id,now());journal('SUPPAY-'+r.lastInsertRowid,'Pembayaran supplier '+m.source,[{account:'Hutang supplier',debit:n},{account:b.method==='Tunai'?'Kas':'Bank',credit:n}]);
 }else if(url==='/api/manual-journal'){
 allow(u,['Akuntan']);required(b,['memo']);if(!Array.isArray(b.entries)||b.entries.length<2)fail('Minimal dua baris jurnal');for(const e of b.entries){if(!e.account||!Number.isSafeInteger(e.debit||0)||!Number.isSafeInteger(e.credit||0)||(e.debit||0)<0||(e.credit||0)<0||((e.debit||0)>0&&(e.credit||0)>0))fail('Baris jurnal tidak valid')}const id=randomBytes(8).toString('hex');journal('MANUAL-'+id,b.memo,b.entries);
 }else if(url==='/api/reopen-period'){
 allow(u,['Akuntan']);required(b,['month','reason']);if(!one('SELECT closed FROM periods WHERE month=?',b.month)?.closed)fail('Periode tidak terkunci');run('INSERT INTO approvals(kind,source,reason,requester,payload) VALUES(?,?,?,?,?)','Buka periode',0,b.reason,u.id,JSON.stringify({month:b.month}));
 }else if(url==='/api/password'){
  required(b,['current','password']);const record=one('SELECT password FROM users WHERE id=?',u.id);if(!verify(b.current,record.password))fail('Kata sandi lama salah');if(b.password.length<12)fail('Kata sandi minimal 12 karakter');run('UPDATE users SET password=? WHERE id=?',hash(b.password),u.id);run('DELETE FROM sessions WHERE user_id=? AND token<>?',u.id,cookies.session);
 }else if(url==='/api/period'){
  allow(u,['Akuntan']);if(!/^\d{4}-\d{2}$/.test(b.month))fail('Periode tidak valid');if(one('SELECT closed FROM periods WHERE month=?',b.month)?.closed)fail('Pembukaan kembali memerlukan alur persetujuan terpisah');run('INSERT INTO periods VALUES(?,1) ON CONFLICT(month) DO UPDATE SET closed=1',b.month);
 }else fail('Tidak ditemukan',404);
 audit(u,url.replace('/api/',''),{...b,password:undefined,current:undefined});return result;
 });
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.mjs':'text/javascript','.txt':'text/plain'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost').pathname;res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'");if(url==='/downloads/26motor-premium.apk'&&req.method==='GET'){const apk=path.join('output','android','26Motor-Premium-1.1.0.apk');if(!fs.existsSync(apk)){res.writeHead(404);return res.end('APK belum tersedia')}res.setHeader('Content-Type','application/vnd.android.package-archive');res.setHeader('Content-Disposition','attachment; filename=26Motor-Premium-1.1.0.apk');res.setHeader('Cache-Control','no-store');return fs.createReadStream(apk).pipe(res)}if(url.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');const output=await api(req,res,url);if(Buffer.isBuffer(output)){if(res.getHeader('Content-Type')==='application/json')res.setHeader('Content-Type','application/pdf');res.end(output)}else res.end(JSON.stringify(output));}else{const file=url==='/'?'index.html':url.slice(1);if(!['index.html','app.js','pdf-preview.js','row-exports.js','mobile.js','mobile-actions.js','manifest.webmanifest','service-worker.js','dashboard-config.js','vehicle-frequency.js','crm-reminder-tools.js','counters.js','estimate-math.js','rupiah-input.js','process-steps.js','style.css','vendor/pdf.min.mjs','vendor/pdf.worker.min.mjs','vendor/pdfjs-LICENSE.txt','assets/logo-premium.png','assets/app-icon.svg','assets/workshop.webp','assets/dm-sans.ttf'].includes(file)){res.writeHead(404);return res.end('Not found')}res.setHeader('Content-Type',mime[path.extname(file)]);res.end(fs.readFileSync(path.join('public',file)))}}catch(e){res.statusCode=e.status||400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message.includes('UNIQUE')?'Nomor atau email sudah digunakan.':e.message}));}});
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('26 Motor berjalan pada port '+(process.env.PORT||3000)));
