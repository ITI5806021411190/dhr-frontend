'use strict';
// Disabled by default. NEVER enable an emulator in this deployable handler.
const {makeGateway}=require('../lib/gateway.cjs');
let gateway;
async function runtime() {
 if(gateway) return gateway;
 const env=process.env,enabled=env.DHR_PIN_RECOVERY_ENABLED==='true';
 if(env.VERCEL_PROJECT_ID!=='prj_ZQyfrf64uA0lbvqNxLkeXOVz9f4J'||env.VERCEL_ENV!=='production')throw Error('RECOVERY_DISABLED');
 if(env.FIREBASE_AUTH_EMULATOR_HOST) throw Error('RECOVERY_DISABLED');
 if(!enabled) return makeGateway({enabled:false,secret:env.DHR_PIN_BRIDGE_SECRET});
 if(!env.DHR_FIREBASE_WEB_API_KEY||!env.DHR_FIREBASE_WEB_APP_ID) throw Error('RECOVERY_DISABLED');
 if(env.FIREBASE_AUTH_EMULATOR_HOST||env.DHR_FIREBASE_PROJECT_ID!=='dhr-driver-readiness-2569'||
    env.DHR_APPS_SCRIPT_URL!=='https://script.google.com/macros/s/AKfycbxnURSmrkk7KcMX9-ZLaX8FxG7L2shTkxaaC5QatqSohIXPvG7pFX7Ote3UKnV_Xhrr/exec') throw Error('RECOVERY_DISABLED');
 const {getApps,initializeApp}=require('firebase-admin/app');
 const {getAuth}=require('firebase-admin/auth');
 const {createFederatedCredential}=require('../lib/federated-credential.cjs');
 const app=getApps().find(a=>a.name==='dhr-recovery')||initializeApp({projectId:env.DHR_FIREBASE_PROJECT_ID,credential:await createFederatedCredential()},'dhr-recovery');
 gateway=makeGateway({enabled,secret:env.DHR_PIN_BRIDGE_SECRET,projectId:env.DHR_FIREBASE_PROJECT_ID,
  publicConfig:{apiKey:env.DHR_FIREBASE_WEB_API_KEY,authDomain:env.DHR_FIREBASE_PROJECT_ID+'.firebaseapp.com',projectId:env.DHR_FIREBASE_PROJECT_ID,appId:env.DHR_FIREBASE_WEB_APP_ID},
  verifyIdToken:token=>getAuth(app).verifyIdToken(token,true),
  requestDhr:async envelope=>{
   const response=await fetch(env.DHR_APPS_SCRIPT_URL,{method:'POST',headers:{'content-type':'text/plain'},body:JSON.stringify(envelope),signal:AbortSignal.timeout(25000)});
   if(!response.ok) throw Error('RECOVERY_UNAVAILABLE');const data=await response.json();
   if(!data.ok) throw Error(data.error==='PIN rate limited'?'RATE_LIMITED':'RECOVERY_DENIED');return data;
  }});return gateway;
}
async function readBody(req) {
 if(req.body) {const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw)>16384)throw Error('BAD_REQUEST');return JSON.parse(raw);}
 let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>16384)throw Error('BAD_REQUEST');}return JSON.parse(raw);
}
module.exports=async function handler(req,res) {
 res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');
 try {
  const origin='https://dhr-frontend.vercel.app';
  const op=new URL(req.url,origin).searchParams.get('op');
  if(req.headers.origin&&req.headers.origin!==origin) throw Error('RECOVERY_DENIED');
  const execute=await runtime();
  if(op==='config'&&req.method==='GET') {res.statusCode=200;return res.end(JSON.stringify(await execute('config')));}
  if(req.method!=='POST'||!String(req.headers['content-type']).startsWith('application/json')) throw Error('BAD_REQUEST');
  const data=await readBody(req);const client=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').slice(0,128);
  const result=await execute(op,data,client);res.statusCode=200;res.end(JSON.stringify(result));
 } catch(error) {
  const known=['RECOVERY_DISABLED','RECOVERY_DENIED','INVALID_PIN','INVALID_PHONE','RATE_LIMITED','BAD_REQUEST'];
  const code=known.includes(error.message)?error.message:'RECOVERY_UNAVAILABLE';
  res.statusCode=code==='RATE_LIMITED'?429:code==='RECOVERY_DISABLED'||code==='RECOVERY_UNAVAILABLE'?503:400;
  res.end(JSON.stringify({ok:false,error:code}));
 }
};
