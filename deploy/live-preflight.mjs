// Read-only T=0 live audit. This never deploys, migrates, modifies DNS, or writes to Cloudflare.
import { mkdirSync, writeFileSync } from "node:fs";
import { inspectCloudflare } from "./inventory.mjs";
import { inspectLive, CONFIG } from "./opentamin.mjs";
const report={schema:"opentamin.live-admission.v1",at:new Date().toISOString(),owner:CONFIG.owner,
  origin:CONFIG.origin,checks:{},allowed:false};
try{
 if(process.env.GITHUB_REPOSITORY!==CONFIG.owner||process.env.GITHUB_REF!=="refs/heads/main")
   throw Error("Controller is not running from approved Open-Tamin main");
 report.checks.live=await inspectLive();
 if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)
   throw Error("Protected Open-Tamin Cloudflare secrets are not provisioned for this environment");
 report.checks.inventory=await inspectCloudflare(process.env);
 const h=report.checks.live.health;
 report.allowed=report.checks.inventory.ok===true&&h.status===200&&h.json?.ok===true;
 if(!report.allowed)report.reason="Existing resource or health evidence does not satisfy T=0";
}catch(err){report.reason=err?.message||"Unknown admission failure";}
finally{
 mkdirSync("evidence",{recursive:true});
 writeFileSync("evidence/live-preflight.json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({schema:report.schema,allowed:report.allowed,
  liveStatus:report.checks.live?.health?.status??null,
  inventoryOK:report.checks.inventory?.ok??null,reason:report.reason||null}));
 if(!report.allowed)process.exitCode=1;
}
