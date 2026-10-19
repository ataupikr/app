export const crmAllowed=role=>['Super Admin','Admin','Finance'].includes(role);
export function addServiceMonths(day,months){
 const n=Number(months);if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isInteger(n)||n<1||n>120)return '';
 const [year,month,date]=day.split('-').map(Number),last=new Date(Date.UTC(year,month-1+n+1,0)).getUTCDate();
 const result=new Date(Date.UTC(year,month-1+n,Math.min(date,last)));return result.toISOString().slice(0,10);
}
export function serviceCountdown(row,today){
 if(['Selesai','Dibatalkan'].includes(row.status))return {days:null,label:row.status,tone:row.status==='Selesai'?'success':'neutral'};
 if(!row.vehicle_active||!row.model_active)return {days:null,label:'Master Nonaktif',tone:'neutral'};
 const days=Math.round((Date.parse(row.due_date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
 if(!Number.isFinite(days))return {days:null,label:'Jadwal belum valid',tone:'neutral'};
 return {days,label:days<0?'Terlambat '+Math.abs(days)+' hari':days===0?'Hari ini':days+' hari lagi',tone:days<=0?'urgent':days<=7?'attention':'progress'};
}
export function reminderUrgency(row,today){
 if(['Selesai','Dibatalkan'].includes(row.status))return row.status;
 if(!row.vehicle_active||!row.model_active)return 'Master Nonaktif';
 const {days}=serviceCountdown(row,today);if(days===null)return 'Jadwal belum valid';
 return days<0?'Terlambat':days===0?'Hari Ini':days<=7?'7 Hari Mendatang':'Terjadwal';
}
export function reminderMessage(r){return 'Halo '+r.customer+', pengingat servis rutin dari 26 Motor Premium. Kendaraan '+r.plate+' ('+r.unit+') dijadwalkan untuk '+r.service_name+' pada '+r.due_date+(r.due_km?' / odometer '+Number(r.due_km).toLocaleString('id-ID')+' km':'')+'. Silakan hubungi bengkel untuk mengatur jadwal. Terima kasih.'}

// Count vehicles once per date, even when they have several service reminders.
export function workshopPlanning(state){
 const masters=state.vehicles||[],models=state.vehicle_models||[],byId=new Map(masters.map(v=>[String(v.id),v])),plateKey=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,''),byPlate=new Map(masters.filter(v=>plateKey(v.plate)).map(v=>[plateKey(v.plate),v]));
 const active=value=>![false,0,'0'].includes(value);
 const masterOf=row=>byId.get(String(row.vehicle_id))||byPlate.get(plateKey(row.plate));
 const enabled=row=>{const master=masterOf(row);return active(row.active)&&active(row.vehicle_active)&&active(row.model_active)&&(!master||(active(master.active)&&active(master.model_active)&&!models.some(m=>m.id===master.model_id&&!active(m.active))))};
 const key=row=>row.vehicle_id||masterOf(row)?.id?'vehicle:'+(row.vehicle_id||masterOf(row).id):plateKey(row.plate)?'plate:'+plateKey(row.plate):'record:'+row.id;
 const dates=new Map(),linkedReminders=new Set((state.arrival_plans||[]).filter(p=>!['Dibatalkan','Tidak Hadir'].includes(p.status)&&p.reminder_id).map(p=>p.reminder_id));
 const vehicleFor=(date,row)=>{if(!dates.has(date))dates.set(date,new Map());const vehicles=dates.get(date),id=key(row);if(!vehicles.has(id))vehicles.set(id,{key:id,vehicle_id:row.vehicle_id,plate:row.plate,unit:row.unit,customer:row.customer,phone:row.phone,reminders:[],plans:[]});return vehicles.get(id)};
 for(const plan of state.arrival_plans||[]){if(!enabled(plan)||!['Direncanakan','Dikonfirmasi'].includes(plan.status))continue;vehicleFor(plan.planned_date,plan).plans.push(plan)}
 for(const reminder of state.crm_reminders||[]){
  if(!enabled(reminder)||linkedReminders.has(reminder.id)||['Selesai','Dibatalkan'].includes(reminder.status)||!/^\d{4}-\d{2}-\d{2}$/.test(reminder.due_date))continue;
  vehicleFor(reminder.due_date,reminder).reminders.push(reminder);
 }
 const presentMap=new Map();
 for(const visit of state.visits||[]){if(visit.exited||!enabled(visit))continue;const id=key(visit);if(!presentMap.has(id))presentMap.set(id,{key:id,plate:visit.plate,unit:visit.unit,customer:visit.customer,visits:[]});presentMap.get(id).visits.push(visit)}
 return {days:[...dates].sort(([a],[b])=>a.localeCompare(b)).map(([date,vehicles])=>({date,vehicles:[...vehicles.values()].sort((a,b)=>(a.plate||'').localeCompare(b.plate||'')),vehicleCount:vehicles.size,reminderCount:[...vehicles.values()].reduce((n,v)=>n+v.reminders.length,0),planCount:[...vehicles.values()].reduce((n,v)=>n+v.plans.length,0)})),present:[...presentMap.values()]};
}
