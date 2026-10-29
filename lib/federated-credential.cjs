'use strict';
// Short-lived Google credentials from the exact dedicated Vercel production identity.
async function createFederatedCredential(env=process.env) {
 if(env.VERCEL_PROJECT_ID!=='prj_ZQyfrf64uA0lbvqNxLkeXOVz9f4J'||env.VERCEL_ENV!=='production'||env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('STAGING_IDENTITY_REQUIRED');
 const {ExternalAccountClient}=await import('google-auth-library');
 const number='989574107355',project='dhr-driver-readiness-2569';
 const email='dhr-pin-production@'+project+'.iam.gserviceaccount.com';
 const client=ExternalAccountClient.fromJSON({type:'external_account',
  audience:`//iam.googleapis.com/projects/${number}/locations/global/workloadIdentityPools/dhr-pin-production/providers/vercel-production`,
  subject_token_type:'urn:ietf:params:oauth:token-type:jwt',token_url:'https://sts.googleapis.com/v1/token',
  service_account_impersonation_url:`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:generateAccessToken`,
  subject_token_supplier:{getSubjectToken:async()=>{const {getVercelOidcToken}=await import('@vercel/oidc');return getVercelOidcToken();}},
  scopes:['https://www.googleapis.com/auth/cloud-platform']});
 if(!client)throw Error('IDENTITY_UNAVAILABLE');
 return {getAccessToken:async()=>{const response=await client.getAccessToken();if(!response.token)throw Error('IDENTITY_UNAVAILABLE');return {access_token:response.token,expires_in:Math.max(1,Math.floor(((client.credentials.expiry_date||Date.now()+300000)-Date.now())/1000))};}};
}
module.exports={createFederatedCredential};
