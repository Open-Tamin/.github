import { test } from "node:test";
import assert from "node:assert/strict";
import { mirrorDocument, validateSource, OWNER_REPO } from "./sync-kit.mjs";
const H = "b74ff7668ed279d785868cedf20e24367e1fef00";
const D = "ecae78e6f7b0c9cef790972857dac3819678f651526e660cdbba02c0dba5bffc";
function source() {
 return {v:1,repository:"https://github.com/Iran-Open-Finance/kit",ref:"main",sha:H,
  archive:{key:"kit-"+H+".tar.gz",
  url:"https://pub-0606a30e9cbf48169d4823ebeaec8395.r2.dev/kit-"+H+".tar.gz",
  sha256:D,bytes:31818463}};
}
test("mirror is solely served by Open-Tamin but preserves upstream SHA and digest",()=>{
 const sourceDoc=source();
 const mirror=mirrorDocument(sourceDoc);
 assert.equal(mirror.sha,H);
 assert.equal(mirror.archive.sha256,D);
 assert.equal(mirror.archive.bytes,sourceDoc.archive.bytes);
 assert.ok(mirror.archive.url.startsWith("https://github.com/"+OWNER_REPO+"/releases/download/kit-"+H+"/"));
 assert.equal(sourceDoc.archive.url,"https://pub-0606a30e9cbf48169d4823ebeaec8395.r2.dev/kit-"+H+".tar.gz");
});
test("refuses redirected, unsigned or unbounded supply chains",()=>{
 const redirected=source();redirected.archive.url="https://example.org/unverified.tgz";
 assert.throws(()=>validateSource(redirected));
 const branch=source();branch.ref="unreviewed";
 assert.throws(()=>validateSource(branch));
 const overflow=source();overflow.archive.bytes=200000000;
 assert.throws(()=>validateSource(overflow));
 const poison=source();poison.repository="https://github.com/bad/kit";
 assert.throws(()=>validateSource(poison));
});
