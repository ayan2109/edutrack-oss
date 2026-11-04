import admin from 'firebase-admin';

let app;
function getAdminApp(){
  if(app) return app;
  if(admin.apps.length) { app=admin.app(); return app; }
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let credential;
  if(raw){
    const serviceAccount=JSON.parse(raw);
    credential=admin.credential.cert(serviceAccount);
  } else if(process.env.GOOGLE_APPLICATION_CREDENTIALS){
    credential=admin.credential.applicationDefault();
  } else {
    throw new Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS in backend/.env');
  }
  app=admin.initializeApp({credential,databaseURL:process.env.FIREBASE_DATABASE_URL});
  return app;
}
export function authAdmin(){getAdminApp();return admin.auth();}
export function database(){getAdminApp();return admin.database();}
