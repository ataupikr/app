const MAX_MONEY=1_000_000_000_000;
function number(value,name){if(value===null||value===undefined||value==='')throw Error(name+' wajib diisi');const n=Number(value);if(!Number.isFinite(n)||n<0)throw Error(name+' tidak valid');return n}
function money(value,name){const n=number(value,name);if(!Number.isSafeInteger(n)||n>MAX_MONEY)throw Error(name+' harus rupiah bulat dan tidak melebihi batas');return n}
function units(value,scale,name,max){const n=number(value,name),scaled=Math.round(n*scale);if(n>max||Math.abs(n*scale-scaled)>0.000001)throw Error(name+' memiliki presisi atau nilai yang tidak valid');return scaled}
const rounded=(value,denominator)=>Number((BigInt(value)+BigInt(denominator)/2n)/BigInt(denominator));
export function calculateEstimate(input){
 if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>200)throw Error('Isi 1 sampai 200 baris jasa / sparepart');
 const lines=input.lines.map(line=>{if(!['part','service'].includes(line.kind))throw Error('Jenis baris tidak valid');const qtyUnits=units(line.qty,1000,'Jumlah',1_000_000);if(qtyUnits<=0)throw Error('Jumlah harus lebih dari nol');const price=money(line.price,'Harga satuan');const total=rounded(BigInt(qtyUnits)*BigInt(price),1000);if(total>MAX_MONEY)throw Error('Subtotal baris terlalu besar');return {...line,qty:qtyUnits/1000,price,line_total:total}});
 const parts=lines.filter(l=>l.kind==='part').reduce((s,l)=>s+l.line_total,0),services=lines.filter(l=>l.kind==='service').reduce((s,l)=>s+l.line_total,0),subtotal=parts+services;if(subtotal>MAX_MONEY)throw Error('Subtotal terlalu besar');
 const discount_type=input.discount_type||'amount';if(!['amount','percent'].includes(discount_type))throw Error('Jenis diskon tidak valid');
 const discount_value=discount_type==='percent'?units(input.discount_value??0,100,'Persentase diskon',100)/100:money(input.discount_value??0,'Diskon');
 const discount_amount=discount_type==='percent'?rounded(BigInt(subtotal)*BigInt(Math.round(discount_value*100)),10000):discount_value;if(discount_amount>subtotal)throw Error('Diskon tidak boleh melebihi subtotal');
 const taxUnits=units(input.tax_rate??0,100,'Persentase pajak',100),tax_base=subtotal-discount_amount,tax_amount=rounded(BigInt(tax_base)*BigInt(taxUnits),10000),total=tax_base+tax_amount;if(total>MAX_MONEY)throw Error('Total terlalu besar');
 return {lines,parts,services,subtotal,discount_type,discount_value,discount_amount,tax_rate:taxUnits/100,tax_base,tax_amount,total};
}
