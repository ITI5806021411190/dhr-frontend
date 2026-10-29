'use strict';
const crypto=require('node:crypto'),{promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const pattern=/^S2\$32768\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;
const mac=(secret,text)=>crypto.createHmac('sha256',secret).update(text).digest('hex');
function sign(secret,action,payload) {const request={action,payload,timestamp:Date.now(),nonce:crypto.randomUUID()};return {...request,signature:mac(secret,JSON.stringify(request))};}
function verifyEnvelope(secret,request,operation) {
 const canonical={action:request.action,payload:request.payload,timestamp:request.timestamp,nonce:request.nonce};
 const expected=mac(secret,JSON.stringify(canonical));
 return request.action===operation&&Number.isFinite(request.timestamp)&&Math.abs(Date.now()-request.timestamp)<60000&&
   /^[a-f0-9-]{36}$/.test(request.nonce||'')&&/^[a-f0-9]{64}$/.test(request.signature||'')&&crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(request.signature));
}
async function hash(pin) {
 if(!/^\d{6}$/.test(String(pin||''))) throw Error('INVALID_PIN');
 const salt=crypto.randomBytes(16).toString('hex');const key=await scrypt(String(pin),salt,64,{N:32768,r:8,p:1,maxmem:67108864});
 return 'S2$32768$8$1$'+salt+'$'+key.toString('hex');
}
async function verify(pin,pinHash) {
 const parts=pattern.exec(String(pinHash||''));if(!parts||!/^\d{6}$/.test(String(pin||''))) return false;
 const key=await scrypt(String(pin),parts[1],64,{N:32768,r:8,p:1,maxmem:67108864});return crypto.timingSafeEqual(key,Buffer.from(parts[2],'hex'));
}
function makeGateway({enabled=false,secret,projectId,publicConfig,verifyIdToken,requestDhr}) {
 const ready=()=>enabled&&typeof secret==='string'&&secret.length>=32&&projectId&&verifyIdToken&&requestDhr;
 return async function execute(op,data={},client='unknown') {
  if(op==='config') return ready()?{ok:true,enabled:true,firebase:publicConfig}:{ok:true,enabled:false};
  if(op==='hash'||op==='verify') {
   if(typeof secret!=='string'||secret.length<32) throw Error('RECOVERY_DISABLED');
   if(!verifyEnvelope(secret,data,op)) throw Error('RECOVERY_DENIED');
   return op==='hash'?{ok:true,pinHash:await hash(data.payload.pin)}:{ok:true,verified:await verify(data.payload.pin,data.payload.pinHash)};
  }
  if(!ready()) throw Error('RECOVERY_DISABLED');
  if(op==='start') {
   if(!/^0\d{9}$/.test(String(data.phone||''))) throw Error('INVALID_PHONE');
   return requestDhr(sign(secret,'__pinStart',{phone:data.phone,clientTag:mac(secret,'client:'+client)}));
  }
  if(op==='finish') {
   if(!/^\d{6}$/.test(String(data.newPin||''))||data.newPin!==data.confirmPin) throw Error('INVALID_PIN');
   if(typeof data.idToken!=='string'||data.idToken.length>8192) throw Error('RECOVERY_DENIED');
   await requestDhr(sign(secret,'__pinAttempt',{challengeId:data.challengeId,clientTag:mac(secret,'client:'+client)}));
   let claims;try{claims=await verifyIdToken(data.idToken);}catch{throw Error('RECOVERY_DENIED');}
   const now=Date.now(),authTime=claims.auth_time;
   if(claims.aud!==projectId||claims.iss!=='https://securetoken.google.com/'+projectId||!claims.sub||
      claims.firebase?.sign_in_provider!=='phone'||!/^\+66\d{9}$/.test(claims.phone_number||'')||
      !Number.isFinite(authTime)||now-authTime*1000>300000||authTime*1000>now+5000||!Number.isFinite(claims.exp)||claims.exp*1000<=now) throw Error('RECOVERY_DENIED');
   return requestDhr(sign(secret,'__pinFinish',{challengeId:data.challengeId,verifiedPhone:'0'+claims.phone_number.slice(3),
     authTime,tokenExpiresAt:claims.exp*1000,proofHash:crypto.createHash('sha256').update(data.idToken).digest('hex'),pinHash:await hash(data.newPin)}));
  }
  throw Error('NOT_FOUND');
 };
}
module.exports={makeGateway,hash,verify,sign,verifyEnvelope,pattern};
