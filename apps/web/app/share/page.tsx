'use client';
import {useEffect,useState} from 'react';
import {api} from '../api';
export default function SharePage(){
 const [token,setToken]=useState('');const [password,setPassword]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [done,setDone]=useState(false);
 useEffect(()=>{const value=window.location.hash.slice(1);setToken(value);window.history.replaceState(null,'','/share');},[]);
 async function download(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await api<{url:string}>('/shares/redeem',{method:'POST',body:JSON.stringify({token,password})});window.location.assign(r.url);setDone(true);setPassword('');}catch(e){setError(e instanceof Error?e.message:'Download failed');}finally{setBusy(false);}}
 return <main><header><h1>Shared file</h1><a href="/">Your dashboard</a></header><p>This link may have a password, expiry and download limit. Opening this page does not use a download.</p>
 {error&&<p role="alert" className="notice error">{error}</p>}
 {!token?<p className="notice">Open the complete share link, including the part after #.</p>:done?<p role="status" className="notice">Download requested. This authorization has been used. If it failed, reopen the original link to request access again.</p>:<form className="auth" onSubmit={download}><label>Link password (if provided)<input type="password" value={password} onChange={e=>setPassword(e.target.value)} maxLength={128} autoComplete="off"/></label><button disabled={busy}>{busy?'Requesting…':'Download file'}</button></form>}
 <footer>Files are sent as attachments. Use sample files in this demo.</footer></main>;
}
