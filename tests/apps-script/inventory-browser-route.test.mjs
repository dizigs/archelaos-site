import test from 'node:test';
import assert from 'node:assert/strict';
import { appsScriptExtension, isAppsScriptRequest } from '../../automation/apps-script/interface.mjs';
import { ScriptFault } from '../../automation/apps-script/security.mjs';
import { fixture as sqliteFixture, projectId, projectTitle } from './fixtures.mjs';
import { SQLiteSafetyStore } from '../../automation/apps-script/safety/store.mjs';
import { AppsScriptInventoryService, AuditLogger } from '../../automation/apps-script/safety/index.mjs';


const origin='https://archelaos-automation-bridge.dimitriszgalanis.workers.dev';
const session='__Host-archelaos-script-session=synthetic';
const grant={principal:{verified:true,emailVerified:true,email:'admin@example.invalid'},
  accessToken:'SYNTHETIC_INTERNAL_TOKEN',grantedScopes:['https://www.googleapis.com/auth/script.projects']};

function fixture(){
  const calls={oauth:0,read:0,writer:0};
  const route=appsScriptExtension({
    oauth:{access:async cookies=>{
      calls.oauth++;
      if(cookies!==session)throw new ScriptFault('ADMIN_SESSION_REQUIRED',401);
      return grant;
    }},
    readInventory:async authenticated=>{
      calls.read++;
      assert.strictEqual(authenticated,grant);
      return {status:'ADMIN_SOURCE_INVENTORY_VERIFIED',readOnly:true,
        sourceReadVerified:true,metadataSavedPrivately:true,fileCount:5,
        installableTriggersComplete:false,
        externalWriterExclusionVerified:false,liveWritesEnabled:false};
    }
  });
  return{route,calls};
}
test('browser Admin session can read sanitized source inventory, no source/secret/IDs',async()=>{
  const {route,calls}=fixture();
  const r=await route(new Request(origin+'/api/apps-script/inventory',{headers:{cookie:session}}));
  assert.equal(r.status,200);
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  const data=await r.json();
  assert.equal(data.status,'ADMIN_SOURCE_INVENTORY_VERIFIED');
  assert.equal(data.fileCount,5);
  assert.equal(data.installableTriggersComplete,false);
  assert.equal(data.externalWriterExclusionVerified,false);
  assert.equal(data.liveWritesEnabled,false);
  const serialized=JSON.stringify(data);
  for(const forbidden of ['SYNTHETIC_INTERNAL_TOKEN','admin@example.invalid'])
    assert.equal(serialized.includes(forbidden),false);
  for(const forbidden of ['scriptId','projectId','sourceHash','files',
    'backups','triggerNames','adminEmail','oauthToken'])
    assert.equal(Object.hasOwn(data,forbidden),false);
  assert.equal(calls.oauth,1);assert.equal(calls.read,1);assert.equal(calls.writer,0);
});
test('missing or incorrect session fails before private inventory read',async()=>{
  const {route,calls}=fixture();
  for(const cookie of ['', 'session=wrong']){
    const r=await route(new Request(origin+'/api/apps-script/inventory',{
      headers:cookie?{cookie}:{}
    }));
    assert.equal(r.status,401);
    assert.deepEqual(await r.json(),{code:'ADMIN_SESSION_REQUIRED'});
  }
  assert.equal(calls.oauth,2);
  assert.equal(calls.read,0);
  assert.equal(calls.writer,0);
});
test('POST, HEAD and arbitrary query strings cannot select private project or mutate',async()=>{
  const {route,calls}=fixture();
  const requests=[
    new Request(origin+'/api/apps-script/inventory?scriptId=foreign',{headers:{cookie:session}}),
    new Request(origin+'/api/apps-script/inventory?utm_source=external',{headers:{cookie:session}}),
    new Request(origin+'/api/apps-script/inventory',{method:'POST',headers:{cookie:session}}),
    new Request(origin+'/api/apps-script/inventory',{method:'HEAD',headers:{cookie:session}})
  ];
  for(const req of requests){
    const r=await route(req);
    assert.equal(r.status,404);
    if(req.method!=='HEAD')assert.deepEqual(await r.json(),{code:'SCRIPT_ROUTE_NOT_FOUND'});
  }
  assert.equal(calls.oauth,0);assert.equal(calls.read,0);assert.equal(calls.writer,0);
});
test('missing handler or OAuth is always fail-closed, never delegated to editor',async()=>{
  const routeA=appsScriptExtension({oauth:{access:async()=>grant}});
  const routeB=appsScriptExtension({readInventory:async()=>({unsafe:true})});
  for(const route of [routeA,routeB]){
    const r=await route(new Request(origin+'/api/apps-script/inventory',{headers:{cookie:session}}));
    assert.equal(r.status,503);
    assert.deepEqual(await r.json(),{code:'PRIVATE_INVENTORY_UNCONFIGURED'});
  }
});
test('new route remains strictly project-scoped; legacy endpoints not intercepted',async()=>{
  const {route}=fixture();
  assert.equal(isAppsScriptRequest(new Request(origin+'/api/apps-script/inventory')),true);
  assert.equal(await route(new Request(origin+'/health')),null);
  assert.equal(await route(new Request(origin+'/oauth/callback?state=legacy')),null);
  const write=await route(new Request(origin+'/api/apps-script/changes',{
    method:'POST',headers:{cookie:session,'content-type':'application/json'},body:'{}'
  }));
  assert.equal(write.status,503);
  assert.deepEqual(await write.json(),{code:'EXECUTOR_INTERFACE_UNCONFIGURED'});
});

test('real SQLite read-only inventory sync stores metadata, not source or Google tokens',async t=>{
  const f=sqliteFixture(t);
  let reads=0;
  const safety=new SQLiteSafetyStore(f.storage);
  const inventory=new AppsScriptInventoryService({
    projectId,projectTitle,provider:{
      metadata:async()=>f.provider.metadata(),
      content:async()=>{reads++;return f.provider.content();}
    },store:safety,auditLogger:new AuditLogger({store:safety})
  });
  const route=appsScriptExtension({
    oauth:{access:async cookie=>{
      if(cookie!==session)throw new ScriptFault('ADMIN_SESSION_REQUIRED',401);
      return grant;
    }},
    readInventory:async g=>{
      assert.strictEqual(g,grant);
      const result=await inventory.sync();
      return {status:'ADMIN_SOURCE_INVENTORY_VERIFIED',readOnly:true,
        sourceReadVerified:true,metadataSavedPrivately:true,
        fileCount:result.fileCount,installableTriggersComplete:false,
        externalWriterExclusionVerified:false,liveWritesEnabled:false};
    }
  });
  const response=await route(new Request(origin+'/api/apps-script/inventory',{headers:{cookie:session}}));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.fileCount,f.state.files.length);
  assert.equal(reads,1);
  assert.equal(f.state.updates,0);
  assert.equal(data.installableTriggersComplete,false);
  assert.equal(data.externalWriterExclusionVerified,false);
  assert.equal(data.liveWritesEnabled,false);
  // This is the actual SQLite backing store used in PR #124 synthetic tests.
  const row=f.db.prepare('SELECT script_id,title,source_hash,file_count,trigger_visibility,entrypoints_json FROM apps_script_inventory').get();
  assert.equal(row.script_id,projectId);
  assert.equal(row.title,projectTitle);
  assert.match(row.source_hash,/^[a-f0-9]{64}$/);
  assert.equal(row.file_count,data.fileCount);
  assert.equal(row.trigger_visibility,'NOT_VERIFIED');
  const audit=f.db.prepare('SELECT event_type,details_json FROM apps_script_audit_log').get();
  assert.equal(audit.event_type,'INVENTORY_SYNC');
  const dumped=JSON.stringify({row,audit,data});
  assert.doesNotMatch(dumped,/PRIVATE_SYNTHETIC_SOURCE|SYNTHETIC_INTERNAL_TOKEN|function syncMuseumContributions/);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM script_operations').get().n,0);
});
