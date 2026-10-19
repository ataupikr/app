const ROLES=['Super Admin','Admin','Finance'];
const statuses=['Menunggu','Sudah Dihubungi','Selesai','Dibatalkan'];
export function createCrmReminders(db){
 const one=(s,...p)=>db.prepare(s).get(...p),all=(s,...p)=>db.prepare(s).all(...p),run=(s,...p)=>db.prepare(s).run(...p);
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
 const allow=u=>{if(!ROLES.includes(u.role))fail('Reminder CRM hanya dapat dikelola Super Admin, Admin, dan Finance.',403)};
 const text=(v,max)=>{const value=String(v??'').trim();if(value.length>max)fail('Isian reminder terlalu panjang');return value};
 const date=(v,required=false)=>{const value=text(v,10);if(!value&&!required)return '';const time=Date.parse(value+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)fail('Tanggal reminder tidak valid');return value};
 const whole=(v,max)=>{if(v===undefined||v===null||v==='')return null;const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>max)fail('Interval atau kilometer reminder tidak valid');return n};
 db.exec(`CREATE TABLE IF NOT EXISTS crm_reminders(id INTEGER PRIMARY KEY AUTOINCREMENT,vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),service_name TEXT NOT NULL COLLATE NOCASE,last_service_date TEXT NOT NULL DEFAULT '',due_date TEXT NOT NULL,interval_months INTEGER,due_km INTEGER,notes TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Menunggu',contacted_at TEXT,contact_channel TEXT NOT NULL DEFAULT '',contact_note TEXT NOT NULL DEFAULT '',completed_date TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created_by INTEGER NOT NULL REFERENCES users(id),updated_by INTEGER NOT NULL REFERENCES users(id),created TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS crm_pending_vehicle_service ON crm_reminders(vehicle_id,service_name) WHERE status IN ('Menunggu','Sudah Dihubungi');
 CREATE INDEX IF NOT EXISTS crm_due_date ON crm_reminders(due_date);
 CREATE TABLE IF NOT EXISTS crm_reminder_events(id INTEGER PRIMARY KEY,reminder_id INTEGER NOT NULL REFERENCES crm_reminders(id),actor INTEGER NOT NULL REFERENCES users(id),action TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created TEXT NOT NULL);`);
 const get=id=>one('SELECT * FROM crm_reminders WHERE id=?',Number(id));
 const current=b=>{const r=get(b.id);if(!r)fail('Reminder tidak ditemukan',404);if(Number(b.version)!==r.version)fail('Reminder telah berubah. Muat ulang sebelum menyimpan.',409);return r};
 function event(id,u,action,note=''){run('INSERT INTO crm_reminder_events(reminder_id,actor,action,note,created) VALUES(?,?,?,?,?)',id,u.id,action,note,new Date().toISOString())}
 function save(u,b){
  allow(u);const old=b.id?current(b):null;if(old&&['Selesai','Dibatalkan'].includes(old.status))fail('Reminder sudah ditutup. Buat jadwal berikutnya untuk servis baru.');
  const vehicleId=Number(b.vehicle_id);if(old&&vehicleId!==old.vehicle_id)fail('Kendaraan reminder tersimpan tidak dapat diganti');const v=one('SELECT v.*,m.active model_active FROM vehicles v JOIN vehicle_models m ON m.id=v.model_id WHERE v.id=?',vehicleId);
  if(!v||!v.active||!v.model_active)fail('Pilih kendaraan master yang aktif');
  const name=text(b.service_name,200);if(!name)fail('Nama servis wajib diisi');
  const last=date(b.last_service_date),due=date(b.due_date,true),interval=whole(b.interval_months,120),km=whole(b.due_km,10000000),notes=text(b.notes,2000);
  if(last&&due<last)fail('Jadwal servis berikutnya tidak boleh sebelum tanggal servis terakhir');if(interval===0)fail('Interval minimal 1 bulan atau kosongkan');
  const duplicate=one("SELECT id FROM crm_reminders WHERE vehicle_id=? AND service_name=? AND status IN ('Menunggu','Sudah Dihubungi') AND id<>?",vehicleId,name,old?.id||0);if(duplicate)fail('Masih ada reminder aktif untuk kendaraan dan servis yang sama');
  const now=new Date().toISOString();let id=old?.id;
  if(old)run('UPDATE crm_reminders SET vehicle_id=?,service_name=?,last_service_date=?,due_date=?,interval_months=?,due_km=?,notes=?,version=version+1,updated_by=?,updated=? WHERE id=?',vehicleId,name,last,due,interval,km,notes,u.id,now,id);
  else id=Number(run('INSERT INTO crm_reminders(vehicle_id,service_name,last_service_date,due_date,interval_months,due_km,notes,created_by,updated_by,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)',vehicleId,name,last,due,interval,km,notes,u.id,u.id,now,now).lastInsertRowid);
  event(id,u,old?'Jadwal diperbarui':'Jadwal dibuat');return {ok:true,id};
 }
 function updateStatus(u,b){
  allow(u);const r=current(b),status=b.status;if(!statuses.includes(status)||status==='Menunggu')fail('Status reminder tidak valid');if(['Selesai','Dibatalkan'].includes(r.status))fail('Reminder sudah ditutup');
  const note=text(b.note,2000);if(!note)fail('Catatan tindak lanjut wajib diisi');
  let channel=r.contact_channel,contacted=r.contacted_at,completed=r.completed_date;
  if(status==='Sudah Dihubungi'){channel=text(b.channel,30);if(!['WhatsApp','Telepon','SMS','Lainnya'].includes(channel))fail('Pilih saluran kontak');contacted=new Date().toISOString();}
  if(status==='Selesai'){completed=date(b.completed_date,true);const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);if(completed>today||(r.last_service_date&&completed<r.last_service_date))fail('Tanggal servis selesai tidak valid');}
  run('UPDATE crm_reminders SET status=?,contact_channel=?,contacted_at=?,contact_note=?,completed_date=?,version=version+1,updated_by=?,updated=? WHERE id=?',status,channel,contacted,note,completed,u.id,new Date().toISOString(),r.id);
  event(r.id,u,status,status==='Sudah Dihubungi'?channel+' · '+note:note);return {ok:true,id:r.id};
 }
 function list(u){if(!ROLES.includes(u.role))return [];return all(`SELECT r.*,v.plate,v.customer,v.phone,v.model_id,v.year,v.active vehicle_active,trim(m.brand||' '||m.model||' '||m.variant||' '||m.engine) unit,m.active model_active FROM crm_reminders r JOIN vehicles v ON v.id=r.vehicle_id JOIN vehicle_models m ON m.id=v.model_id ORDER BY r.due_date,r.id`).map(r=>({...r,events:all('SELECT e.*,u.name actor_name FROM crm_reminder_events e JOIN users u ON u.id=e.actor WHERE reminder_id=? ORDER BY e.id DESC',r.id)}))}
 return {save,updateStatus,list};
}
