export function createVisitTeam(db){
 const all=(s,...p)=>db.prepare(s).all(...p),one=(s,...p)=>db.prepare(s).get(...p),run=(s,...p)=>db.prepare(s).run(...p);
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
 db.exec('BEGIN IMMEDIATE');try{
 for(const [col,type] of [['pic_technician_id','INTEGER REFERENCES users(id)'],['edit_version','INTEGER NOT NULL DEFAULT 1']])if(!all('PRAGMA table_info(visits)').some(c=>c.name===col))db.exec('ALTER TABLE visits ADD COLUMN '+col+' '+type);
 db.exec('CREATE TABLE IF NOT EXISTS visit_technicians(visit_id INTEGER NOT NULL REFERENCES visits(id),technician_id INTEGER NOT NULL REFERENCES users(id),PRIMARY KEY(visit_id,technician_id))');
 for(const v of all('SELECT id,technician,pic_technician_id FROM visits WHERE technician IS NOT NULL')){if(one("SELECT id FROM users WHERE id=? AND role='Teknisi'",v.technician)){run('INSERT OR IGNORE INTO visit_technicians VALUES(?,?)',v.id,v.technician);if(!v.pic_technician_id)run('UPDATE visits SET pic_technician_id=? WHERE id=?',v.technician,v.id)}}
 db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e}
 const members=id=>all('SELECT u.id,u.name,u.active FROM visit_technicians t JOIN users u ON u.id=t.technician_id WHERE t.visit_id=? ORDER BY u.name,u.id',id);
 function validate(b,existing=null){
 let ids=b.technician_ids;if(ids===undefined)ids=b.technician?[b.technician]:[];
 if(!Array.isArray(ids))fail('Daftar teknisi tidak valid');ids=[...new Set(ids.map(Number))];
 const previous=existing?members(existing.id).map(t=>t.id):[];
 for(const id of ids){if(!Number.isSafeInteger(id)||!one("SELECT id FROM users WHERE id=? AND role='Teknisi'",id))fail('Teknisi tidak valid');if(!one('SELECT id FROM users WHERE id=? AND active=1',id)&&!previous.includes(id))fail('Pilih teknisi aktif');}
 const raw=b.pic_technician_id!==undefined?b.pic_technician_id:b.technician_ids===undefined?(ids[0]??null):null;
 const pic=raw===''||raw===null?null:Number(raw);
 if(ids.length&&!ids.includes(pic))fail('PIC Work Order harus dipilih dari teknisi yang ditugaskan');if(!ids.length&&pic!==null)fail('Pilih teknisi terlebih dahulu');
 return {ids,pic};
 }
 function assign(id,team){run('DELETE FROM visit_technicians WHERE visit_id=?',id);for(const technician of team.ids)run('INSERT INTO visit_technicians VALUES(?,?)',id,technician);run('UPDATE visits SET technician=?,pic_technician_id=?,edit_version=edit_version+1 WHERE id=?',team.pic??team.ids[0]??null,team.pic,id)}
 function decorate(visits){for(const v of visits){v.technicians=members(v.id);v.technician_ids=v.technicians.map(t=>t.id);v.technician_name=v.technicians.map(t=>t.name).join(', ');v.pic_technician_name=v.technicians.find(t=>t.id===v.pic_technician_id)?.name||''}return visits}
 return {validate,assign,decorate,members,has:(visit,id)=>Boolean(one('SELECT 1 FROM visit_technicians WHERE visit_id=? AND technician_id=?',visit,id))};
}
