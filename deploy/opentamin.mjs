// Constitutional pre-effect admission and post-release smoke for the Open-Tamin-owned controller.
// No Cloudflare mutation and no ability to waive a failing gate.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { inspectCloudflare } from "./inventory.mjs";
const HERE = fileURLToPath(new URL(".", import.meta.url));
export const CONFIG = JSON.parse(readFileSync(join(HERE,"opentamin.json"),"utf8"));
const HEX40=/^[a-f0-9]{40}$/;
const sha256=buffer=>createHash("sha256").update(buffer).digest("hex");
const deny=(message)=>{ throw Error("T=0 DENIED: "+message); };
async function readUrl(url,fetcher) {
  const res=await fetcher(url,{method:"GET",redirect:"error",headers:{"cache-control":"no-cache"},signal:AbortSignal.timeout(12000)});
  const body=await res.text();
  let json=null;
  try { json=JSON.parse(body); } catch {}
  return {status:res.status,json,contentType:res.headers.get("content-type"),length:body.length};
}
export async function inspectLive(fetcher=fetch) {
  const origin=CONFIG.origin;
  const [build,health,kish]=await Promise.all([
    readUrl(origin+"/api/build",fetcher),
    readUrl(origin+"/api/health",fetcher),
    readUrl(origin+"/kish/",fetcher)
  ]);
  return {build,health,kish};
}
export function admission({sourceCommit,source,live,inventory,githubRepository,githubRef,capabilities}) {
  const reasons=[];
  if(githubRepository!==CONFIG.owner || githubRef!=="refs/heads/main")reasons.push("release authority must be owner main only");
  if(!HEX40.test(sourceCommit||""))reasons.push("source commit is not a full immutable SHA");
  if(source?.project!==CONFIG.project)reasons.push("source release project identity mismatch");
  if(source?.deployer?.repository!==CONFIG.owner || source?.deployer?.environment!==CONFIG.environment)
    reasons.push("release authority still external or not registered in Open-Tamin");
  const declaredWranglers=source?.workers?.map(w=>w.wrangler);
  if(!Array.isArray(declaredWranglers) || JSON.stringify(declaredWranglers)!==JSON.stringify(CONFIG.wranglers))
    reasons.push("Worker impact scope and release order differ from the owner contract");
  if(source?.state!=="ready")reasons.push("legacy release state is not proven READY; do not bootstrap a live Worker");
  if(inventory?.ok!==true || inventory.accountVerified!==true)
    reasons.push("Cloudflare Worker/D1/R2/zone resources not verified as OpenTamin-owned");
  if(live?.health?.status!==200 || live.health.json?.ok!==true)
    reasons.push("live independent monitor is not healthy; require verified recovery admission");
  if(live?.build?.status!==200 || !HEX40.test(live.build.json?.commit||""))
    reasons.push("current production commit cannot be read and reconciled");
  if(live?.kish?.status!==404 && live?.kish?.status!==401)
    reasons.push("existing Kish route is not a known 404 or authenticated denial; inspect current route before mutation");
  for(const cap of ["CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID","OPS_NOTIFY_TO","SOURCE_DEPLOY_KEY"]) {
    if(!capabilities?.[cap])reasons.push("missing protected release capability "+cap);
  }
  return {allowed:reasons.length===0,reasons};
}
export async function plan(sourceRoot,sourceCommit,options={}) {
  const release=JSON.parse(readFileSync(join(resolve(sourceRoot),"release.json"),"utf8"));
  const live=await inspectLive(options.fetcher);
  const inventory=await inspectCloudflare(options.capabilities??process.env,options.inventoryFetcher??fetch);
  const result=admission({
    sourceCommit,source:release,live,inventory,
    githubRepository:options.githubRepository??process.env.GITHUB_REPOSITORY,
    githubRef:options.githubRef??process.env.GITHUB_REF,
    capabilities:options.capabilities??process.env
  });
  const receipt={
    schema:"opentamin.owner-admission.v1",
    at:new Date().toISOString(),
    owner:CONFIG.owner,
    source:CONFIG.source,
    sourceCommit,
    releaseSha256:sha256(readFileSync(join(resolve(sourceRoot),"release.json"))),
    live,inventory,
    allowed:result.allowed,
    reasons:result.reasons
  };
  const folder=resolve(process.cwd(),"evidence");
  mkdirSync(folder,{recursive:true});
  writeFileSync(join(folder,"admission.json"),JSON.stringify(receipt,null,2)+"\n");
  if(!result.allowed)deny(result.reasons.join("; "));
  return receipt;
}
export async function smoke(sourceCommit,fetcher=fetch) {
  if(!HEX40.test(sourceCommit||""))deny("smoke must name immutable SHA");
  const responses={};
  for(const c of CONFIG.smoke){
    const r=await readUrl(CONFIG.origin+c.path,fetcher);
    responses[c.id]={path:c.path,status:r.status,contentType:r.contentType};
    if(r.status!==c.status)deny("smoke "+c.id+" expected "+c.status+" got "+r.status);
    if(c.id==="build" && r.json?.commit!==sourceCommit)
      deny("deployed commit does not equal tested source HEAD");
    if(c.id==="health" && r.json?.ok!==true)
      deny("health response is not monitor-verified");
  }
  return {schema:"opentamin.smoke.v1",sourceCommit,at:new Date().toISOString(),responses};
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  const command=process.argv[2],arg=process.argv[3],commit=process.argv[4];
  try {
    if(command==="admit")await plan(arg,commit);
    else if(command==="smoke") {
      const receipt=await smoke(arg);
      mkdirSync("evidence",{recursive:true});
      writeFileSync("evidence/smoke.json",JSON.stringify(receipt,null,2)+"\n");
      console.log("Verified deployed SHA and every OpenTamin/Kish smoke");
    } else deny("unknown CLI operation");
  }catch(e){console.error(e.message);process.exitCode=1;}
}
