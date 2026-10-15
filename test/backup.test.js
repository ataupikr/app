import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {totp,verifyTotp} from '../auth.js';
test('TOTP RFC 6238 dan penolakan kode salah',()=>{assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',59000),'287082');assert.equal(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ','invalid'),false)});
test('Backup terenkripsi dapat dipulihkan; kata sandi salah ditolak',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'26motor-backup-'));try{
 const original=path.join(dir,'original'),restored=path.join(dir,'restored');mkdirSync(original);const db=new DatabaseSync(path.join(original,'workshop.sqlite'));db.exec("CREATE TABLE proof(value TEXT); INSERT INTO proof VALUES('dokumen tersimpan')");db.close();
 const script=fileURLToPath(new URL('../scripts/backup.mjs',import.meta.url));const password=randomBytes(24).toString('hex');const env={...process.env,BACKUP_PASSWORD:password,DATA_DIR:original};
 execFileSync(process.execPath,[script,'backup'],{cwd:dir,env,stdio:'pipe'});const file=path.join(dir,'backups',readdirSync(path.join(dir,'backups'))[0]);assert.ok(file.endsWith('.enc'));
 assert.throws(()=>execFileSync(process.execPath,[script,'restore',file],{cwd:dir,env:{...env,BACKUP_PASSWORD:'wrongpassword123456',DATA_DIR:restored},stdio:'pipe'}));
 execFileSync(process.execPath,[script,'restore',file],{cwd:dir,env:{...env,DATA_DIR:restored},stdio:'pipe'});const check=new DatabaseSync(path.join(restored,'workshop.sqlite'));assert.equal(check.prepare('SELECT value FROM proof').get().value,'dokumen tersimpan');check.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});
