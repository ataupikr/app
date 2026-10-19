import {isActiveRecord} from './counters.js';

const plateKey=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function jakartaVisitDay(value){
 const time=Date.parse(value);return Number.isFinite(time)?new Date(time+7*60*60*1000).toISOString().slice(0,10):'';
}
// One visit is one recorded vehicle intake, regardless of its work/payment status.
export function vehicleFrequency(state,{from='',to='',search=''}={}){
 const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 if((from&&!validDay(from))||(to&&!validDay(to))||(from&&to&&from>to))throw Error('Periode tidak valid. Tanggal akhir harus sama atau setelah tanggal awal.');
 const masters=state.vehicles||[],models=state.vehicle_models||[],byId=new Map(masters.map(v=>[String(v.id),v])),byPlate=new Map(masters.filter(v=>plateKey(v.plate)).map(v=>[plateKey(v.plate),v]));
 const groups=new Map();
 for(const visit of state.visits||[]){
  const day=jakartaVisitDay(visit.entered);if(!day||!isActiveRecord(visit))continue;
  const master=byId.get(String(visit.vehicle_id))||byPlate.get(plateKey(visit.plate));
  if(master&&(!isActiveRecord(master)||[false,0,'0'].includes(master.model_active)||models.some(m=>m.id===master.model_id&&!isActiveRecord(m))))continue;
  const key=master?'vehicle:'+master.id:visit.vehicle_id?'vehicle:'+visit.vehicle_id:plateKey(visit.plate)?'plate:'+plateKey(visit.plate):'visit:'+visit.id;
  if(!groups.has(key))groups.set(key,{key,visits:[],allVisits:[]});
  const group=groups.get(key);group.allVisits.push(visit);
  if((!from||day>=from)&&(!to||day<=to))group.visits.push(visit);
 }
 const needle=search.trim().toLocaleLowerCase('id-ID');
 const rows=[...groups.values()].filter(g=>g.visits.length).map(g=>{
  g.visits.sort((a,b)=>Date.parse(b.entered)-Date.parse(a.entered)||b.id-a.id);
  const latest=g.visits[0];return {...g,plate:latest.plate||'Belum diisi',unit:latest.unit||'',customer:latest.customer||'',count:g.visits.length,lifetime:g.allVisits.length,first:g.visits.at(-1).entered,last:latest.entered,inWorkshop:g.visits.filter(v=>!v.exited).length};
 }).filter(g=>!needle||g.visits.some(v=>[v.plate,v.unit,v.customer].join(' ').toLocaleLowerCase('id-ID').includes(needle)))
 .sort((a,b)=>b.count-a.count||Date.parse(b.last)-Date.parse(a.last)||a.plate.localeCompare(b.plate,'id-ID'));
 return {rows,totalVisits:rows.reduce((n,r)=>n+r.count,0),uniqueVehicles:rows.length,repeatVehicles:rows.filter(r=>r.count>=2).length,top:rows[0]||null};
}
