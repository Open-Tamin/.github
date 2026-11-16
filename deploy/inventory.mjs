// Read-only Cloudflare inventory: no write method, token never logged, errors fail closed.
// Binds OpenTamin's exact Worker/D1/R2/zone before any production side effect.
import { CONFIG } from "./opentamin.mjs";
const ID=/^[a-fA-F0-9]{32}$/;
const PREFIX="https://api.cloudflare.com/client/v4";
const expected={
  workers:CONFIG.workers,
  d1:["opentamin-web","opentamin-monitor"],
  r2:["opentamin-backups"]
};
export function inventoryVerdict(actual) {
 const missing=Object.fromEntries(Object.entries(expected).map(([key,names])=>[
   key,names.filter(name=>!(actual[key]||[]).includes(name))
 ]));
 return {ok:Object.values(missing).every(a=>a.length===0)&&actual.zone==="opentamin.com",
  missing, zoneMatched:actual.zone==="opentamin.com"};
}
export async function inspectCloudflare({CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account}={},fetcher=fetch) {
 if(!ID.test(account||"")||!token)throw Error("T=0 DENIED: OpenTamin Cloudflare credential or account boundary missing");
 const endpoints={
  workers:"/accounts/"+account+"/workers/scripts",
  d1:"/accounts/"+account+"/d1/database",
  r2:"/accounts/"+account+"/r2/buckets",
  zones:"/zones?name=opentamin.com&account.id="+account
 };
 async function get(path) {
  const response=await fetcher(PREFIX+path,{
    method:"GET",redirect:"error",
    headers:{authorization:"Bearer "+token,accept:"application/json"},
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error("T=0 DENIED: Cloudflare inventory HTTP "+response.status);
  const data=await response.json();
  if(data?.success!==true)throw Error("T=0 DENIED: Cloudflare inventory API rejected the request");
  return data.result;
 }
 const [workers,d1,r2,zones]=await Promise.all(Object.values(endpoints).map(get));
 const names=(rows,key="name")=>Array.isArray(rows)?rows.map(x=>x?.[key]).filter(x=>typeof x==="string"):[];
 const actual={
  workers:names(workers,"id"),
  d1:names(d1),
  r2:names(Array.isArray(r2)?r2:r2?.buckets),
  zone:Array.isArray(zones)&&zones.some(z=>z.name==="opentamin.com"&&z.account?.id===account)?"opentamin.com":null
 };
 // Store only the exact OWNED resources from the approved contract, not unrelated account inventory.
 const verdict=inventoryVerdict(actual);
 return {schema:"opentamin.cloudflare-inventory.v1",
    ...verdict,
    observed:Object.fromEntries(Object.entries(expected).map(([key,arr])=>[
      key,arr.filter(name=>actual[key].includes(name))
    ])),
    accountVerified:verdict.zoneMatched,
    requestMethods:["GET"]
 };
}
