// Real DHR UI integration candidate. Disabled unless the server explicitly enables it.
const button=document.getElementById('btnForgotPin');
const modal=document.createElement('div');
modal.id='modalPinRecovery';modal.className='hidden fixed inset-0 bg-black bg-opacity-60 z-[100] overflow-y-auto p-4';
modal.innerHTML=`<section class="bg-white max-w-lg mx-auto my-8 p-6 rounded-xl shadow-xl" role="dialog" aria-modal="true" aria-labelledby="recoveryTitle">
<div class="flex justify-between"><h2 id="recoveryTitle" class="text-xl font-bold">กู้คืน PIN</h2><button id="recoveryClose" type="button" aria-label="ปิดหน้ากู้คืน PIN">ปิด</button></div>
<p id="recoveryMode" class="text-sm text-orange-800 mt-3"></p>
<form id="recoveryPhoneForm" class="space-y-3 mt-4"><label class="block" for="recoveryPhone">เบอร์มือถือที่ลงทะเบียน</label><input id="recoveryPhone" type="tel" maxlength="10" inputmode="numeric" class="w-full border rounded p-3" required>
<label class="flex gap-2 text-sm"><input id="recoveryConsent" type="checkbox" required><span>ยินยอมส่งเบอร์มือถือให้ Google/Firebase เพื่อยืนยันตัวตนและป้องกันการใช้งานผิดประเภท</span></label><p class="text-xs text-gray-500">ใช้ได้เฉพาะพนักงานขับรถและเจ้าหน้าที่ที่อนุมัติแล้ว หากเปลี่ยนเบอร์หรือติดปัญหาให้ติดต่อผู้ดูแล</p>
<div id="recoveryCaptcha"></div><button id="recoveryRequest" class="bg-blue-700 text-white rounded p-3 w-full">ขอรหัส OTP</button></form>
<form id="recoveryOtpForm" class="hidden space-y-3 mt-4"><label for="recoveryOtp" class="block">OTP 6 หลัก</label><input id="recoveryOtp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required class="w-full border rounded p-3"><p id="recoveryDemoCode" class="text-sm text-orange-800"></p><button class="w-full bg-blue-700 text-white rounded p-3">ยืนยัน OTP</button></form>
<form id="recoveryPinForm" class="hidden space-y-3 mt-4"><label for="recoveryNewPin" class="block">PIN ใหม่ 6 หลัก</label><input id="recoveryNewPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" required class="w-full border rounded p-3"><label for="recoveryConfirmPin" class="block">ยืนยัน PIN ใหม่</label><input id="recoveryConfirmPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" required class="w-full border rounded p-3"><button class="w-full bg-blue-700 text-white rounded p-3">ตั้ง PIN ใหม่</button></form>
<p id="recoveryMessage" role="status" aria-live="polite" class="mt-4 text-sm"></p><p class="text-xs text-gray-500 mt-3">คำขอมีอายุ 5 นาที หลังเปลี่ยน PIN ต้องเข้าสู่ระบบใหม่ทุกอุปกรณ์</p></section>`;
// Visible only while choosing a new PIN; login remains masked.
for(const id of ['recoveryNewPin','recoveryConfirmPin']) {
 const input=modal.querySelector('#'+id);
 input.type='text';input.pattern='[0-9]{6}';input.spellcheck=false;
 input.setAttribute('autocapitalize','off');
 input.addEventListener('input',()=>{input.value=input.value.replace(/[^0-9]/g,'').slice(0,6);});
}
document.body.appendChild(modal);
const $=id=>document.getElementById(id);let config,auth,sdk,verifier,confirmation,challengeId,idToken,busy=false;
const fail={RATE_LIMITED:'ขอรหัสบ่อยเกินไป กรุณารอก่อนลองใหม่',INVALID_PIN:'PIN ต้องเป็นตัวเลข 6 หลักและยืนยันตรงกัน',INVALID_PHONE:'กรุณาระบุเบอร์มือถือ 10 หลัก',RECOVERY_DENIED:'ไม่สามารถตั้ง PIN ใหม่ได้ กรุณาขอ OTP ใหม่หรือติดต่อผู้ดูแล',RECOVERY_DISABLED:'ยังไม่เปิดบริการกู้คืน PIN',RECOVERY_UNAVAILABLE:'บริการยืนยันตัวตนไม่พร้อม กรุณาลองภายหลัง'};
const firebaseErrors={'auth/billing-not-enabled':'Firebase ยังไม่อนุญาตส่ง SMS จริงจนกว่าจะตั้งค่า Billing กรุณาแจ้งผู้ดูแล (ระบบจะไม่เปิด Billing เอง)','auth/quota-exceeded':'โควตา SMS ของ Firebase เต็มแล้ว กรุณาหยุดลองและแจ้งผู้ดูแล','auth/too-many-requests':'Firebase จำกัดการร้องขอชั่วคราว กรุณาหยุดลองและรอภายหลัง','auth/unauthorized-domain':'โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase กรุณาใช้ลิงก์เว็บทดสอบหลัก','auth/captcha-check-failed':'การยืนยัน reCAPTCHA ไม่สำเร็จ กรุณาปิดหน้ากู้คืนแล้วลองใหม่','auth/invalid-verification-code':'OTP ไม่ถูกต้อง','auth/code-expired':'OTP หมดอายุ กรุณาขอใหม่'};
const message=text=>{$('recoveryMessage').textContent=text;};
async function api(op,payload){const response=await fetch('/api/recovery?op='+op,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'RECOVERY_UNAVAILABLE');return data;}
async function firebase(){if(auth)return;const appSdk=await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js');sdk=await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js');auth=sdk.getAuth(appSdk.initializeApp(config.firebase,'dhr-pin-recovery'));await sdk.setPersistence(auth,sdk.inMemoryPersistence);
 if(config.emulator){if(location.origin!=='http://127.0.0.1:8767')throw Error('RECOVERY_DISABLED');sdk.connectAuthEmulator(auth,'http://127.0.0.1:9099');}
}
async function run(form,fn){if(busy)return;busy=true;const submit=form.querySelector('button');submit.disabled=true;try{await fn();}catch(error){message(fail[error.message]||firebaseErrors[error.code]||'ไม่สำเร็จ กรุณาลองใหม่หรือติดต่อผู้ดูแล');if(form.id==='recoveryPhoneForm'&&!confirmation){if(verifier?.clear)verifier.clear();verifier=null;}}finally{busy=false;submit.disabled=false;}}
async function clear(){challengeId=null;confirmation=null;idToken=null;if(auth)await sdk.signOut(auth);if(verifier?.clear)verifier.clear();verifier=null;for(const id of ['recoveryOtp','recoveryNewPin','recoveryConfirmPin'])$(id).value='';$('recoveryPhoneForm').classList.remove('hidden');$('recoveryOtpForm').classList.add('hidden');$('recoveryPinForm').classList.add('hidden');$('recoveryDemoCode').textContent='';}
button.onclick=async()=>{await clear();message('');modal.classList.remove('hidden');$('recoveryPhone').focus();};
$('recoveryClose').onclick=async()=>{if(busy)return;await clear();modal.classList.add('hidden');button.focus();};
$('recoveryPhoneForm').onsubmit=e=>{e.preventDefault();run(e.currentTarget,async()=>{
 await firebase();const phone=$('recoveryPhone').value.trim();const result=await api('start',{phone});challengeId=result.challengeId;
 verifier=config.emulator?{type:'recaptcha',verify:async()=> 'emulator-only',_reset(){},clear(){}}:new sdk.RecaptchaVerifier(auth,'recoveryCaptcha',{size:'normal'});
 confirmation=await sdk.signInWithPhoneNumber(auth,'+66'+phone.slice(1),verifier);
 $('recoveryPhoneForm').classList.add('hidden');$('recoveryOtpForm').classList.remove('hidden');message(result.message);$('recoveryOtp').focus();
 if(config.emulator){const data=await(await fetch('/api/test/otp?phone='+encodeURIComponent(phone))).json();$('recoveryDemoCode').textContent='OTP จำลองเฉพาะการทดสอบบนเครื่อง: '+(data.code||'ยังไม่พร้อม');}
 });};
$('recoveryOtpForm').onsubmit=e=>{e.preventDefault();run(e.currentTarget,async()=>{const result=await confirmation.confirm($('recoveryOtp').value);idToken=await result.user.getIdToken();$('recoveryOtpForm').classList.add('hidden');$('recoveryPinForm').classList.remove('hidden');message('ยืนยันแล้ว กรุณาตั้ง PIN ใหม่');$('recoveryNewPin').focus();});};
$('recoveryPinForm').onsubmit=e=>{e.preventDefault();run(e.currentTarget,async()=>{const result=await api('finish',{challengeId,idToken,newPin:$('recoveryNewPin').value,confirmPin:$('recoveryConfirmPin').value});for(const key of ['dhr_session','dhr_saved_login','dhr_auto_login'])localStorage.removeItem(key);await clear();$('recoveryPhoneForm').classList.add('hidden');message(result.message);});};
try{const response=await fetch('/api/recovery?op=config');config=await response.json();if(response.ok&&config.enabled){button.classList.remove('hidden');$('recoveryMode').textContent=config.emulator?'ชุดทดสอบ DHR — ใช้บัญชีจำลอง ไม่ส่ง SMS และไม่แก้ข้อมูลจริง':'สำหรับพนักงานขับรถและเจ้าหน้าที่ที่อนุมัติแล้วเท่านั้น ขอได้ไม่เกิน 3 ครั้งต่อ 24 ชั่วโมง หากเปลี่ยนเบอร์หรือติดปัญหาโปรดติดต่อผู้ดูแล';}}catch{/* Closed by default; do not interrupt existing login. */}
