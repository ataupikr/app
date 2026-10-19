const ACTIVE=['Direncanakan','Dikonfirmasi'];
const ROLES=['Super Admin','Admin','Finance'];
export function createArrivalPlans(db){
 const one=(sql,...p)=>db.prepare(sql).get(...p),all=(sql,...p)=>db.prepare(sql).all(...p),run=(sql,...p)=>db.prepare(sql).run(...p);
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
 const allow=u=>{if(!ROLES.includes(u.role))fail('Akses rencana mobil masuk terbatas untuk Super Admin, Admin dan Finance.',403)};
 const text=(value,max)=>{const result=String(value??'').trim();if(result.length>max)fail('Isian rencana terlalu panjang');return result};
 db.exec(`CREATE TABLE IF NOT EXISTS arrival_plans(id INTEGER PRIMARY KEY AUTOINCREMENT,vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),reminder_id INTEGER REFERENCES crm_reminders(id),planned_date TEXT NOT NULL,planned_time TEXT NOT NULL DEFAULT '',service_name TEXT NOT NULL,complaint TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Direncanakan',visit_id INTEGER UNIQUE REFERENCES visits(id),version INTEGER NOT NULL DEFAULT 1,created_by INTEGER NOT NULL REFERENCES users(id),updated_by INTEGER NOT NULL REFERENCES users(id),created TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS arrival_active_vehicle_day ON arrival_plans(vehicle_id,planned_date) WHERE status IN ('Direncanakan','Dikonfirmasi');
 CREATE UNIQUE INDEX IF NOT EXISTS arrival_active_reminder ON arrival_plans(reminder_id) WHERE reminder_id IS NOT NULL AND status NOT IN ('Dibatalkan','Tidak Hadir');
 CREATE TABLE IF NOT EXISTS arrival_plan_events(id INTEGER PRIMARY KEY,plan_id INTEGER NOT NULL REFERENCES arrival_plans(id),actor INTEGER NOT NULL REFERENCES users(id),action TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',created TEXT NOT NULL);`);
 const get=id=>one('SELECT * FROM arrival_plans WHERE id=?',Number(id));
 const event=(id,u,action,detail)=>run('INSERT INTO arrival_plan_events(plan_id,actor,action,detail,created) VALUES(?,?,?,?,?)',id,u.id,action,detail,new Date().toISOString());
 function current(id,version){const plan=get(id);if(!plan)fail('Rencana mobil masuk tidak ditemukan',404);if(Number(version)!==plan.version)fail('Rencana berubah. Muat data terbaru sebelum melanjutkan.',409);return plan}
 function save(u,b){
  allow(u);const previous=b.id?current(b.id,b.version):null;if(previous&&!ACTIVE.includes(previous.status))fail('Rencana sudah ditutup atau kendaraan sudah masuk');
  const vehicle_id=Number(b.vehicle_id),vehicle=one('SELECT v.*,m.active model_active FROM vehicles v JOIN vehicle_models m ON m.id=v.model_id WHERE v.id=?',vehicle_id);
  if(!vehicle||!vehicle.active||!vehicle.model_active)fail('Pilih kendaraan master yang aktif');if(previous&&vehicle_id!==previous.vehicle_id)fail('Kendaraan rencana tersimpan tidak dapat diganti');
  const date=text(b.planned_date,10),time=text(b.planned_time,5),parsed=Date.parse(date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==date)fail('Tanggal rencana tidak valid');
  if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))fail('Jam rencana tidak valid');
  const service=text(b.service_name,200),complaint=text(b.complaint,3000),notes=text(b.notes,2000),status=b.status||'Direncanakan';
  if(!service)fail('Keperluan servis wajib diisi');if(!ACTIVE.includes(status))fail('Status rencana tidak valid');
  const reminder_id=b.reminder_id?Number(b.reminder_id):null;
  if(reminder_id){const reminder=one('SELECT * FROM crm_reminders WHERE id=?',reminder_id);if(!reminder||reminder.vehicle_id!==vehicle_id||['Selesai','Dibatalkan'].includes(reminder.status))fail('Reminder harus aktif dan milik kendaraan yang sama');if(one("SELECT id FROM arrival_plans WHERE reminder_id=? AND status NOT IN ('Dibatalkan','Tidak Hadir') AND id<>?",reminder_id,previous?.id||0))fail('Reminder sudah memiliki rencana masuk aktif');}
  if(one("SELECT id FROM arrival_plans WHERE vehicle_id=? AND planned_date=? AND status IN ('Direncanakan','Dikonfirmasi') AND id<>?",vehicle_id,date,previous?.id||0))fail('Kendaraan sudah memiliki rencana aktif pada tanggal yang sama');
  const now=new Date().toISOString();let id=previous?.id;
  if(previous)run('UPDATE arrival_plans SET reminder_id=?,planned_date=?,planned_time=?,service_name=?,complaint=?,notes=?,status=?,version=version+1,updated_by=?,updated=? WHERE id=?',reminder_id,date,time,service,complaint,notes,status,u.id,now,id);
  else id=Number(run('INSERT INTO arrival_plans(vehicle_id,reminder_id,planned_date,planned_time,service_name,complaint,notes,status,created_by,updated_by,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',vehicle_id,reminder_id,date,time,service,complaint,notes,status,u.id,u.id,now,now).lastInsertRowid);
  event(id,u,previous?'Rencana diperbarui':'Rencana dibuat',JSON.stringify({date,time,status,reminder_id,previous_date:previous?.planned_date}));return {ok:true,id};
 }
 function changeStatus(u,b){allow(u);const plan=current(b.id,b.version);if(!ACTIVE.includes(plan.status))fail('Rencana sudah ditutup');if(!['Direncanakan','Dikonfirmasi','Dibatalkan','Tidak Hadir'].includes(b.status))fail('Status rencana tidak valid');const note=text(b.note,2000);if(!note)fail('Catatan perubahan status wajib diisi');if(b.status==='Tidak Hadir'&&plan.planned_date>new Date(Date.now()+7*3600000).toISOString().slice(0,10))fail('Rencana mendatang belum dapat ditandai tidak hadir');run('UPDATE arrival_plans SET status=?,version=version+1,updated_by=?,updated=? WHERE id=?',b.status,u.id,new Date().toISOString(),plan.id);event(plan.id,u,b.status,note);return {ok:true,id:plan.id}}
 function prepareIntake(u,b){
  if(!b.arrival_plan_id)return null;allow(u);const plan=get(b.arrival_plan_id);if(!plan)fail('Rencana tidak ditemukan',404);if(plan.vehicle_id!==Number(b.vehicle_id))fail('Kendaraan masuk berbeda dari rencana');
  if(plan.visit_id)return {...plan,reused:true};current(plan.id,b.arrival_plan_version);if(!ACTIVE.includes(plan.status))fail('Rencana dibatalkan atau tidak hadir');
  if(one('SELECT id FROM visits WHERE vehicle_id=? AND exited IS NULL',plan.vehicle_id))fail('Kendaraan masih tercatat di bengkel. Hubungkan rencana ke kunjungan yang sudah ada.');return plan;
 }
 function connect(u,plan,visitId){
  const visit=one('SELECT * FROM visits WHERE id=?',Number(visitId));if(!visit||visit.vehicle_id!==plan.vehicle_id||visit.exited)fail('Pilih kunjungan aktif untuk kendaraan yang sama');if(one('SELECT id FROM arrival_plans WHERE visit_id=? AND id<>?',visit.id,plan.id))fail('Kunjungan sudah terhubung ke rencana lain');
  run("UPDATE arrival_plans SET visit_id=?,status='Sudah Masuk',version=version+1,updated_by=?,updated=? WHERE id=?",visit.id,u.id,new Date().toISOString(),plan.id);event(plan.id,u,'Kendaraan masuk',JSON.stringify({visit_id:visit.id}));return {ok:true,id:plan.id,visit_id:visit.id};
 }
 function linkExisting(u,b){allow(u);const plan=current(b.id,b.version);if(!ACTIVE.includes(plan.status))fail('Rencana sudah ditutup');return connect(u,plan,b.visit_id)}
 function list(u){if(!ROLES.includes(u.role))return [];return all(`SELECT p.*,v.plate,v.customer,v.phone,v.active vehicle_active,m.active model_active,trim(m.brand||' '||m.model||' '||m.variant||' '||m.engine) unit,visit.progress visit_progress,visit.exited visit_exited FROM arrival_plans p JOIN vehicles v ON v.id=p.vehicle_id JOIN vehicle_models m ON m.id=v.model_id LEFT JOIN visits visit ON visit.id=p.visit_id ORDER BY p.planned_date,p.planned_time,p.id`).map(p=>({...p,events:all('SELECT e.*,u.name actor_name FROM arrival_plan_events e JOIN users u ON u.id=e.actor WHERE plan_id=? ORDER BY e.id DESC',p.id)}))}
 return {save,changeStatus,prepareIntake,connect,linkExisting,list};
}
