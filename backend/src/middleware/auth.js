import {authAdmin} from '../lib/firebaseAdmin.js';
export async function auth(req,res,next){
  const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):null;
  if(!token)return res.status(401).json({message:'Authentication required'});
  try{
    const decoded=await authAdmin().verifyIdToken(token);
    const profile=await (await import('../lib/firebaseAdmin.js')).database().ref(`users/${decoded.uid}`).get();
    const data=profile.val()||{};
    if(data.disabled)return res.status(403).json({message:'Account disabled'});
    req.user={uid:decoded.uid,phoneNumber:decoded.phone_number,role:data.role||'INSTITUTION_ADMIN',institutionId:data.institutionId||decoded.uid,...decoded};
    next();
  }catch(e){return res.status(401).json({message:'Invalid or expired Firebase ID token'});}
}
export function allow(...roles){return(req,res,next)=>{if(!req.user||!roles.includes(req.user.role))return res.status(403).json({message:'Insufficient permissions'});next()}}
