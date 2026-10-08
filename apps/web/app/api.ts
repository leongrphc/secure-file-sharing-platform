export async function api<T>(path:string,options:RequestInit={}):Promise<T> {
 const response=await fetch('/api'+path,{...options,credentials:'same-origin',headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}});
 if(!response.ok) {const body=await response.json().catch(()=>({error:'Request failed'}));throw new Error(body.error||'Request failed');}
 if(response.status===204) return undefined as T;
 return response.json();
}
