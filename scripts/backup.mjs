import {DatabaseSync,backup} from 'node:sqlite';
import {randomBytes,scryptSync,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';
const password=process.env.BACKUP_PASSWORD;
if(!password||password.length<16)throw Error('BACKUP_PASSWORD wajib diisi minimal 16 karakter melalui environment.');
const mode=process.argv[2]||'backup',dir=process.env.DATA_DIR||'data',database=path.join(dir,'workshop.sqlite');
if(mode==='backup'){
 mkdirSync('backups',{recursive:true});const tmp=path.join('backups','snapshot-'+Date.now()+'.sqlite');const db=new DatabaseSync(database,{readOnly:true});await backup(db,tmp);db.close();const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(password,salt,32),cipher=createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([cipher.update(readFileSync(tmp)),cipher.final()]);const dest=tmp+'.enc';writeFileSync(dest,Buffer.concat([Buffer.from('26BK1'),salt,iv,cipher.getAuthTag(),encrypted]),{mode:0o600});unlinkSync(tmp);console.log('Backup terenkripsi disimpan: '+dest);
}else if(mode==='restore'){
 const source=process.argv[3];if(!source)throw Error('Gunakan: npm run restore -- path/backup.sqlite.enc. Hentikan server lebih dahulu.');const bytes=readFileSync(source);if(bytes.subarray(0,5).toString()!=='26BK1')throw Error('Format backup tidak valid');const key=scryptSync(password,bytes.subarray(5,21),32),decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(21,33));decipher.setAuthTag(bytes.subarray(33,49));const plain=Buffer.concat([decipher.update(bytes.subarray(49)),decipher.final()]);mkdirSync(dir,{recursive:true});const tmp=database+'.restore-'+Date.now();writeFileSync(tmp,plain,{mode:0o600});const check=new DatabaseSync(tmp,{readOnly:true});if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup gagal pemeriksaan integritas');check.close();if(existsSync(database+'-wal'))throw Error('WAL masih ada. Pastikan server berhenti dan checkpoint database sebelum restore.');if(existsSync(database))renameSync(database,database+'.before-restore-'+Date.now());renameSync(tmp,database);console.log('Database berhasil dipulihkan dan integrity_check lulus.');
}else throw Error('Mode tidak dikenal');
