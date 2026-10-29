'use strict';
const {sign}=require('../lib/gateway.cjs');
module.exports=async(req,res)=>{res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');
 if(req.method!=='GET'||process.env.VERCEL_PROJECT_ID!=='prj_ZQyfrf64uA0lbvqNxLkeXOVz9f4J'){res.statusCode=403;return res.end('{"ok":false}');}
 try{const secret=process.env.DHR_PIN_BRIDGE_SECRET;if(!secret||secret.length<32)throw Error('NOT_READY');
 const r=await fetch('https://script.google.com/macros/s/AKfycbxnURSmrkk7KcMX9-ZLaX8FxG7L2shTkxaaC5QatqSohIXPvG7pFX7Ote3UKnV_Xhrr/exec',{method:'POST',headers:{'content-type':'text/plain'},body:JSON.stringify(sign(secret,'__pinStatus',{})),signal:AbortSignal.timeout(25000)});
 const d=await r.json();if(!d.ok||!d.production)throw Error('NOT_READY');res.end(JSON.stringify(d));
 }catch{res.statusCode=503;res.end('{"ok":false,"error":"PIN_BRIDGE_NOT_READY"}');}};
