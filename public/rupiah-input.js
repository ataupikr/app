// Display Indonesian currency while keeping submitted values numeric.
export function rupiahRaw(value){
 const text=String(value??'').replace(/Rp/gi,'').replace(/[^0-9,]/g,'');
 const [whole,...fraction]=text.split(',');
 if(!whole&&!fraction.length)return '';
 return (whole.replace(/^0+(?=\d)/,'')||'0')+(fraction.length?'.'+fraction.join('').slice(0,2):'');
}
export function rupiahDisplay(raw){
 if(raw===''||raw===null||raw===undefined)return '';
 const [whole,fraction]=String(raw).split('.');
 return 'Rp '+whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(fraction!==undefined?','+fraction:'');
}
export function moneyValue(input){return input.hasAttribute('data-rupiah')?rupiahRaw(input.value):input.value}
export function setMoneyMode(input,enabled){
 const raw=input.type==='number'?input.value:moneyValue(input);input.type=enabled?'text':'number';
 if(enabled){input.setAttribute('data-rupiah','');input.inputMode='decimal';input.value=rupiahDisplay(raw);validate(input)}
 else{input.removeAttribute('data-rupiah');input.removeAttribute('inputmode');input.value=raw;input.setCustomValidity('')}
}
function validate(input){
 const raw=moneyValue(input),n=Number(raw);
 input.setCustomValidity(raw!==''&&(!Number.isFinite(n)||!Number.isSafeInteger(Math.trunc(n)))?'Nominal terlalu besar.':raw!==''&&input.hasAttribute('min')&&n<Number(input.min)?'Nominal minimal Rp '+Number(input.min).toLocaleString('id-ID')+'.':'');
}
export function enhanceRupiah(root){
 root.querySelectorAll('input[data-rupiah]').forEach(input=>{if(input.dataset.rupiahReady)return;input.dataset.rupiahReady='1';setMoneyMode(input,true);validate(input)});
 root.querySelectorAll('form').forEach(form=>{if(form.dataset.rupiahReady)return;form.dataset.rupiahReady='1';form.addEventListener('formdata',e=>{form.querySelectorAll('input[data-rupiah][name]:not(:disabled)').forEach(input=>e.formData.set(input.name,moneyValue(input)))})});
}
export function bindRupiah(root){
 root.addEventListener('input',e=>{
 const input=e.target;if(!input.matches('input[data-rupiah]')||e.isComposing)return;
 const before=input.value,position=input.selectionStart??before.length;
 const significant=before.slice(0,position).replace(/[^0-9,]/g,'').length;
 input.value=rupiahDisplay(rupiahRaw(before));validate(input);
 let caret=3,count=0;for(;caret<input.value.length&&count<significant;caret++)if(/[0-9,]/.test(input.value[caret]))count++;
 input.setSelectionRange(caret,caret);
 },true);
}
