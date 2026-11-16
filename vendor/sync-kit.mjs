// Open-Tamin's public, content-addressed supply mirror.
// Deliberately no user data, no Cloudflare secrets, no build execution, and no cross-org code at runtime.
// On a protected main run, fetch the public Kit distribution, hash it, and publish identical bytes
// to an Open-Tamin-owned GitHub Release. Consumers read ONLY this same-org release.
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

export const SOURCE = "https://pub-0606a30e9cbf48169d4823ebeaec8395.r2.dev/kit-main.json";
export const OWNER_REPO = "Open-Tamin/.github";
const digits = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const sha = buf => createHash("sha256").update(buf).digest("hex");
const exec = (args) => execFileSync("gh", args, { encoding:"utf8", stdio:["ignore","pipe","pipe"], timeout:120000, env:process.env });

export function validateSource(doc) {
  assert.equal(doc?.v,1,"supported Kit head contract");
  assert.equal(doc.repository,"https://github.com/Iran-Open-Finance/kit","authenticated upstream project identity");
  assert.equal(doc.ref,"main","canonical branch");
  assert.match(doc.sha,digits);
  assert.match(doc.archive?.sha256,digest);
  assert.ok(Number.isInteger(doc.archive.bytes) && doc.archive.bytes>10000 && doc.archive.bytes<100000000,"bounded artifact size");
  assert.equal(doc.archive.url,"https://pub-0606a30e9cbf48169d4823ebeaec8395.r2.dev/kit-"+doc.sha+".tar.gz","content addressed upstream archive");
  return doc;
}
export function mirrorDocument(doc) {
  validateSource(doc);
  const tag="kit-"+doc.sha;
  const name=tag+".tar.gz";
  return {
    ...doc,
    archive:{
      ...doc.archive,
      key:name,
      url:"https://github.com/"+OWNER_REPO+"/releases/download/"+tag+"/"+name
    }
  };
}
async function download(url,limit) {
  const result=await fetch(url,{headers:{"accept":"application/octet-stream","cache-control":"no-cache"},signal:AbortSignal.timeout(180000)});
  if(!result.ok)throw Error("Upstream source refused: "+result.status);
  const size=Number(result.headers.get("content-length")||0);
  if(size>limit)throw Error("Download declared too large");
  const bytes=Buffer.from(await result.arrayBuffer());
  if(bytes.length>limit)throw Error("Download larger than bound");
  return bytes;
}
export async function sync() {
  if(!process.env.GH_TOKEN)throw Error("GH_TOKEN is required only to publish the verified public release");
  if(process.env.GITHUB_REF!=="refs/heads/main" || process.env.GITHUB_REPOSITORY!==OWNER_REPO)
    throw Error("Only reviewed Open-Tamin/.github main may publish the mirror");
  const manifestBytes=await download(SOURCE,300000);
  const canonical=validateSource(JSON.parse(manifestBytes.toString("utf8")));
  const artifact=await download(canonical.archive.url,100000000);
  if(artifact.length!==canonical.archive.bytes || sha(artifact)!==canonical.archive.sha256)
    throw Error("Mirror rejected: archive bytes/hash do not match canonical Kit manifest");
  const mirrored=mirrorDocument(canonical);
  const tag="kit-"+canonical.sha;
  const dir=mkdtempSync(join(tmpdir(),"opentamin-kit-"));
  try {
    const manifest=join(dir,"kit-main.json");
    const tar=join(dir,tag+".tar.gz");
    writeFileSync(manifest,JSON.stringify(mirrored,null,2)+"\n");
    writeFileSync(tar,artifact);
    let exists=false;
    try {
      exec(["release","view",tag,"--repo",OWNER_REPO,"--json","tagName"]);
      exists=true;
    } catch(e) {
      if(!/release not found|HTTP 404/i.test(String(e.stderr||e.message)))throw e;
    }
    if(exists){
      const existing=join(dir,"existing");
      exec(["release","download",tag,"--repo",OWNER_REPO,"--pattern","kit-main.json","--pattern",tag+".tar.gz","--dir",existing]);
      const got=JSON.parse(readFileSync(join(existing,"kit-main.json"),"utf8"));
      const gotBytes=readFileSync(join(existing,tag+".tar.gz"));
      if(got.sha!==canonical.sha || got.archive.sha256!==canonical.archive.sha256 ||
         sha(gotBytes)!==canonical.archive.sha256 || JSON.stringify(got)!==JSON.stringify(mirrored))
        throw Error("Existing release differs from source: refuse replacement");
      exec(["release","edit",tag,"--repo",OWNER_REPO,"--latest"]);
      console.log("Verified existing immutable Open-Tamin mirror: "+tag);
    } else {
      exec(["release","create",tag,manifest,tar,"--repo",OWNER_REPO,
        "--title","Open-Tamin verified Kit supply "+canonical.sha.slice(0,12),
        "--notes","Verified content-addressed mirror of public Kit SHA "+canonical.sha+
          " (archive SHA-256: "+canonical.archive.sha256+"). No executable build runs in mirror job.",
        "--latest"]);
      console.log("Published Open-Tamin-owned Kit mirror: "+tag+" sha256="+canonical.archive.sha256);
    }
  } finally { rmSync(dir,{recursive:true,force:true}); }
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])
  sync().catch(e=>{console.error(e.message);process.exitCode=1;});
