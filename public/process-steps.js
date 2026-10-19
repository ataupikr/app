export function visitSteps(visit,approvals=[],financial=true){
 const credit=approvals.some(a=>a.kind==='Piutang keluar'&&a.source===visit.id&&a.status==='Disetujui');
 const qc=Boolean(visit.qc),work=qc||visit.progress==='QC'||visit.progress==='Selesai';
 const invoice=Boolean(visit.invoice),paid=invoice&&Number(visit.paid)>=Number(visit.total);
 const stages=[
 {label:'Kendaraan masuk',done:Boolean(visit.entered),hint:'Pilih kendaraan dari master, catat keluhan, lalu simpan data kendaraan masuk.'},
 {label:'Pengerjaan',done:work,hint:visit.progress==='Menunggu Persetujuan'?'Catat keputusan pelanggan pada estimasi terbaru sebelum melanjutkan pekerjaan.':visit.progress==='Di Negosiasi'?'Selesaikan negosiasi dan catat keputusan pada Persetujuan Estimasi.':visit.progress==='Tidak Jadi'?'Pelanggan tidak melanjutkan pekerjaan. Proses pengembalian kendaraan sesuai prosedur bengkel.':visit.progress==='Siap Dikerjakan'?'Estimasi disetujui pelanggan. Teknisi dapat memulai dan memperbarui progres menjadi Dikerjakan.':visit.progress==='Menunggu Sparepart'?'Periksa ketersediaan dan proses kebutuhan sparepart.':'Tugaskan teknisi, catat diagnosis, jasa, dan pemakaian sparepart. Progres saat ini: '+(visit.progress||'Baru')+'.'},
 {label:'Pemeriksaan QC',done:qc,hint:'Periksa hasil pekerjaan, lalu perbarui progres menjadi Selesai setelah QC lulus.'},
 ...(financial?[
 {label:'Invoice',done:invoice,hint:'Pastikan QC selesai dan seluruh reservasi diproses, lalu terbitkan invoice.'},
 {label:credit&&!paid?'Piutang disetujui':'Pembayaran',done:paid||invoice&&credit,hint:'Catat pembayaran sampai lunas, atau ajukan persetujuan piutang bila diperlukan.'}
 ]:[]),
 {label:'Gate Pass OUT',done:Boolean(visit.exited),hint:financial?'Pastikan syarat keluar terpenuhi, isi penerima kendaraan, lalu cetak Gate Pass OUT.':'Finance memproses invoice, pembayaran, dan konfirmasi kendaraan keluar setelah QC.'}
 ];
 let first=stages.findIndex(s=>!s.done);
 if(visit.exited)first=-1;
 return {steps:stages.map((s,i)=>({...s,state:s.done?'done':i===first?'current':'pending'})),hint:first<0?'Kunjungan selesai. Gate Pass OUT tersedia untuk dicetak.':stages[first].hint};
}
export function estimateSteps(estimate){
 const decided=['Estimasi Disetujui','Tidak Jadi'].includes(estimate.status);
 return {steps:[{label:'Rincian biaya',state:'done'},{label:'Estimasi tersimpan',state:'done'},{label:'Keputusan pelanggan',state:decided?'done':'current'}],hint:estimate.status==='Tidak Jadi'?'Pelanggan tidak melanjutkan pekerjaan berdasarkan estimasi ini.':estimate.status==='Di Negosiasi'?'Diskusikan harga dan rincian dengan pelanggan, lalu catat hasil negosiasi.':estimate.status==='Estimasi Disetujui'?'Persetujuan pelanggan sudah dicatat untuk revisi ini.':'Sampaikan estimasi kepada pelanggan, lalu catat keputusan beserta buktinya.'};
}
