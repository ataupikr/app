import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,writeFileSync,unlinkSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const dataDir=path.resolve(process.env.DATA_DIR||'data');
const database=path.join(dataDir,'workshop.sqlite');
const masters=['users','items','vehicles','vehicle_models','item_vehicle_models','suppliers','racks','service_catalog'];
const cleared=['arrival_plan_events','arrival_plans','crm_reminder_events','crm_reminders','cashbacks','estimate_events','estimate_lines','estimates','visit_technicians','payments','supplier_payments','reservations','lines','invoices','approvals','visits','expenses','movements','journals','periods','audit'];
const known=new Set([...masters,...cleared,'inventory_imports','sessions','estimate_workflow_migrations']);
const counts=db=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(({name})=>{if(!known.has(name))throw Error('Tabel belum diklasifikasi: '+name);return [name,db.prepare('SELECT count(*) n FROM "'+name+'"').get().n]}));
const snapshot=db=>Object.fromEntries(masters.map(name=>[name,createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM "'+name+'" ORDER BY '+(name==='item_vehicle_models'?'item_id,model_id':'id')).all())).digest('hex')]));
function clear(db){db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');try{const before=snapshot(db);for(const name of cleared)db.exec('DELETE FROM "'+name+'"');
 for(const row of db.prepare('SELECT id,archive,summary FROM inventory_imports').all()){const archive=JSON.parse(row.archive),summary=JSON.parse(row.summary);archive.sheets=Object.fromEntries(Object.entries(archive.sheets||{}).filter(([name])=>name==='Master Sparepart'));summary.incoming_rows=0;summary.outgoing_rows=0;summary.sheets=Object.keys(archive.sheets).length;summary.transaction_archives_cleared=true;db.prepare('UPDATE inventory_imports SET archive=?,summary=? WHERE id=?').run(JSON.stringify(archive),JSON.stringify(summary),row.id);}
 if(JSON.stringify(before)!==JSON.stringify(snapshot(db)))throw Error('Master data berubah');if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Relasi database tidak valid');for(const name of cleared)if(db.prepare('SELECT count(*) n FROM "'+name+'"').get().n)throw Error('Data belum kosong: '+name);if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Integritas database gagal');db.exec('COMMIT');return counts(db);
 }catch(e){db.exec('ROLLBACK');throw e;}}
const db=new DatabaseSync(database);const before=counts(db);
if(!process.argv.includes('--apply')){console.log(JSON.stringify({preview:true,cleared:Object.fromEntries(cleared.map(name=>[name,before[name]])),preserved:Object.fromEntries(masters.map(name=>[name,before[name]])),stock:'Saldo stok saat ini dipertahankan',archive:'Hanya lembar Master Sparepart dipertahankan'},null,2));db.close();process.exit(0)}
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backupDir=path.join(dataDir,'maintenance','before-clear-'+stamp);mkdirSync(backupDir,{recursive:true});const backupFile=path.join(backupDir,'workshop.sqlite');await backup(db,backupFile);chmodSync(backupFile,0o600);
const verification=path.join(backupDir,'verification.sqlite');await backup(db,verification);const check=new DatabaseSync(verification);clear(check);check.close();unlinkSync(verification);
const after=clear(db);db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();const report={created:new Date().toISOString(),backup:backupFile,before,after,master_data_unchanged:true,stock_preserved:true,transaction_archives_cleared:true};writeFileSync(path.join(backupDir,'report.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));
