import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newSecret(){let bits=0,value=0,out='';for(const b of randomBytes(20)){value=(value<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5}}return out}
function decode(s){let bits=0,value=0,out=[];for(const c of s){const n=alphabet.indexOf(c);if(n<0)throw Error('Secret tidak valid');value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8}}return Buffer.from(out)}
export function totp(secret,time=Date.now()){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(time/30000)));const h=createHmac('sha1',decode(secret)).update(counter).digest(),offset=h[19]&15;return String((h.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
export function verifyTotp(secret,code){if(!/^\d{6}$/.test(String(code||'')))return false;return [-1,0,1].some(d=>timingSafeEqual(Buffer.from(totp(secret,Date.now()+d*30000)),Buffer.from(String(code))))}
