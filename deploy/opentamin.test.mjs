import { test } from "node:test";
import assert from "node:assert/strict";
import { admission,smoke,CONFIG,inspectLive } from "./opentamin.mjs";
import { inspectCloudflare } from "./inventory.mjs";
const sha="a".repeat(40);
const caps=Object.fromEntries(["CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID","OPS_NOTIFY_TO","SOURCE_DEPLOY_KEY"].map(k=>[k,"test-capability-not-a-credential"]));
const source=()=>({
  project:"opentamin",state:"ready",
  deployer:{repository:"Open-Tamin/.github",environment:"production-opentamin"},
  workers:CONFIG.wranglers.map(wrangler=>({wrangler}))
});
const live=()=>({build:{status:200,json:{commit:"b".repeat(40)}},health:{status:200,json:{ok:true}},kish:{status:401}});
const args=()=>({sourceCommit:sha,source:source(),live:live(),inventory:{ok:true,accountVerified:true},githubRepository:"Open-Tamin/.github",githubRef:"refs/heads/main",capabilities:caps});
test("a complete owner-only, scoped, healthy T=0 receipt permits a release",()=>{
 assert.deepEqual(admission(args()),{allowed:true,reasons:[]});
});
test("any bootstrap, KYE release authority, red monitor, missing secret, scope diff, ref change denies before side effects",()=>{
 const x=args();x.source.state="bootstrap";assert.equal(admission(x).allowed,false);
 const y=args();y.source.deployer.repository="KYE-Protocol/kye-deploy";assert.equal(admission(y).allowed,false);
 const z=args();z.live.health.status=503;assert.equal(admission(z).allowed,false);
 const q=args();q.capabilities={};assert.equal(admission(q).allowed,false);
 const p=args();p.source.workers=[p.source.workers[0]];assert.equal(admission(p).allowed,false);
 const inv=args();inv.inventory={ok:false,accountVerified:true};assert.equal(admission(inv).allowed,false);
 const b=args();b.githubRef="refs/heads/feature";assert.equal(admission(b).allowed,false);
});
function mocked(url){
 const path=new URL(url).pathname;
 if(path==="/api/build")return new Response(JSON.stringify({commit:sha}),{status:200,headers:{"content-type":"application/json"}});
 if(path==="/api/health")return new Response(JSON.stringify({ok:true}),{status:200,headers:{"content-type":"application/json"}});
 if(path==="/kish/")return new Response("Denied",{status:401});
 if(path==="/kish/assets/client.js")return new Response("Denied",{status:403});
 if(path==="/")return new Response("Landing",{status:200});
 if(path.startsWith("/fonts/"))return new Response("font",{status:200,headers:{"content-type":"font/ttf"}});
 return new Response("missing",{status:404});
}
test("post-production smoke binds all seven routes to exact tested SHA",async()=>{
 const doc=await smoke(sha,mocked);
 assert.equal(Object.keys(doc.responses).length,7);
 assert.equal(doc.responses["kish-unauth"].status,401);
});
test("smoke denies an unverifiable build",async()=>{
 await assert.rejects(()=>smoke("b".repeat(40),mocked),/T=0 DENIED/);
});
test("read-only inventory includes build, health and denied Kish before any write",async()=>{
 const x=await inspectLive(mocked);
 assert.equal(x.health.json.ok,true);
 assert.equal(x.kish.status,401);
});

test("only read-only Cloudflare list operations can establish an owner resource receipt",async()=>{
 const account="a".repeat(32),calls=[];
 const mock=async(url,options)=>{
  calls.push({url,method:options.method});
  const path=new URL(url).pathname;
  let result;
  if(path.endsWith("/workers/scripts"))result=CONFIG.workers.map(id=>({id}));
  else if(path.endsWith("/d1/database"))result=[{name:"opentamin-web"},{name:"opentamin-monitor"}];
  else if(path.endsWith("/r2/buckets"))result={buckets:[{name:"opentamin-backups"}]};
  else if(path.endsWith("/zones"))result=[{name:"opentamin.com",account:{id:account}}];
  else throw Error("Unexpected inventory endpoint");
  return new Response(JSON.stringify({success:true,result}),{status:200,headers:{"content-type":"application/json"}});
 };
 const proof=await inspectCloudflare({CLOUDFLARE_API_TOKEN:"test-token",CLOUDFLARE_ACCOUNT_ID:account},mock);
 assert.equal(proof.ok,true);
 assert.equal(proof.accountVerified,true);
 assert.equal(calls.length,4);
 assert.ok(calls.every(x=>x.method==="GET"));
 assert.equal(JSON.stringify(proof).includes("test-token"),false);
});
test("missing or cross-account Cloudflare inventory is a constitutional denial",async()=>{
 await assert.rejects(()=>inspectCloudflare({CLOUDFLARE_ACCOUNT_ID:"wrong"}),/T=0 DENIED/);
 const account="a".repeat(32);
 const mock=async()=>new Response(JSON.stringify({success:true,result:[]}),{status:200});
 const verdict=await inspectCloudflare({CLOUDFLARE_API_TOKEN:"test",CLOUDFLARE_ACCOUNT_ID:account},mock);
 assert.equal(verdict.ok,false);
 assert.ok(verdict.missing.workers.length>0);
});
