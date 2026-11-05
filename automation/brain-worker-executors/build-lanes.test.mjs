import test from "node:test";
import assert from "node:assert/strict";
import { planBuild, canRunTogether } from "./build-lanes.mjs";
const base = {lane:"B",commitSha:"a".repeat(40),paths:["automation/demo/test.mjs"],
 brainApproval:true,reservedEuros:0,monthlyRemainingEuros:10,
 modelRegistry:{gemma:{verified:true,modelId:"verified-model-placeholder"}}};
test("Gemma lane requires verified model",()=>assert.equal(planBuild(base).provider,"gemma"));
test("Gemma lane refuses unverified model",()=>assert.throws(()=>planBuild({...base,modelRegistry:{}})));
test("requires Brain approval",()=>assert.throws(()=>planBuild({...base,brainApproval:false})));
test("requires bounded spend",()=>assert.throws(()=>planBuild({...base,reservedEuros:11})));
test("rejects path traversal",()=>assert.throws(()=>planBuild({...base,paths:["automation/../private"]})));
test("does not allow production or merge",()=>{const p=planBuild(base);assert.equal(p.mergeAllowed,false);assert.equal(p.productionAllowed,false);});
test("different lanes and files can run together",()=>{const b=planBuild(base);const a={...b,lane:"A",paths:["rebuild/other.mjs"]};assert.equal(canRunTogether(a,b),true);assert.equal(canRunTogether({...a,paths:b.paths},b),false);});
