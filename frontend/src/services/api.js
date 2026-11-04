import { auth } from '../firebase';
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export async function api(path, options={}){
  const headers={'Content-Type':'application/json', ...(options.headers||{})};
  const user=auth.currentUser;
  if(user) headers.Authorization=`Bearer ${await user.getIdToken()}`;
  const response=await fetch(`${BASE}${path}`,{...options,headers});
  const data= response.status===204 ? {} : await response.json().catch(()=>({message:'Unexpected server response'}));
  if(!response.ok) throw new Error(data.message||'Request failed');
  return data;
}
