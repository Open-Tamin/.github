import { test } from "node:test";
import assert from "node:assert/strict";
import { admission,smoke,CONFIG,inspectLive } from "./opentamin.mjs";
const sha="a".repeat(40);
const caps=Object.fromEntries(["CLOUDFLARE_API_TOKEN","CLOUDFLARE_ACCOUNT_ID","OPS_NOTIFY_TO","SOURCE_DEPLOY_KEY"].map(k=>[k,"test-capability-not-a-credential"]));
const source=()=>({
  project:"opentamin",state:"ready",
  deployer:{repository:"Open-Tamin/.github",environment:"production-opentamin"},
  workers:CONFIG.wranglers.map(wrangler=>({wrangler}))
});
const live=()=>({build:{status:200,json:{commit:"b".repeat(40)}},health:{status:200,json:{ok:true}},kish:{status:401}});
const args=()=>({sourceCommit:sha,source:source(),live:live(),githubRepository:"Open-Tamin/.github",githubRef:"refs/heads/main",capabilities:caps});
test("a complete owner-only, scoped, healthy T=0 receipt permits a release",()=>{
 assert.deepEqual(admission(args()),{allowed:true,reasons:[]});
});
test("any bootstrap, KYE release authority, red monitor, missing secret, scope diff, ref change denies before side effects",()=>{
 const x=args();x.source.state="bootstrap";assert.equal(admission(x).allowed,false);
 const y=args();y.source.deployer.repository="KYE-Protocol/kye-deploy";assert.equal(admission(y).allowed,false);
 const z=args();z.live.health.status=503;assert.equal(admission(z).allowed,false);
 const q=args();q.capabilities={};assert.equal(admission(q).allowed,false);
 const p=args();p.source.workers=[p.source.workers[0]];assert.equal(admission(p).allowed,false);
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
