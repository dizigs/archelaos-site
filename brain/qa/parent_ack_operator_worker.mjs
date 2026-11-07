// One-shot operator-only private ACK acceptance against the deployed parent
// BrainCoordinator and HealerMemory. No repair, merge, deployments, AI or public route.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{40}$/;
const RUN = /^[1-9][0-9]{0,19}$/;
let attempted = false;
const closed = () => new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
const out = value => Response.json(value,{headers:{'cache-control':'no-store'}});
async function fetchBrain(stub, receiptId, mode) {
  const response=await stub.fetch('https://brain.internal/internal/selfheal-dispatch',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(mode ? {receiptId,mode:'readback'}:{receiptId})
  });
  const body=await response.json();
  if(response.status!==200) return {status:'BLOCKED',code:'BRAIN_DISPATCH_HTTP_'+response.status};
  return body;
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname!=='/__canonical_ack_one' || url.search || request.method!=='POST') return closed();
    if(!env.QA_OPERATOR_CAPABILITY || env.QA_OPERATOR_CAPABILITY.length<48 ||
       request.headers.get('x-operator-capability')!==env.QA_OPERATOR_CAPABILITY) return closed();
    if(!RUN.test(env.QA_CI_RUN_ID||'')||!SHA.test(env.QA_CI_SHA||'')||
       env.QA_EXPECTED_PARENT_SHA!=='89b7c3bf92b3148cd480133e72c747e8235ddfa2'||
       !env.BRAIN_RECOVERY || !env.BRAIN) return out({status:'BLOCKED',stage:'CONFIG'});
    let body;
    try {body=await request.json()} catch{return out({status:'BLOCKED',stage:'INPUT'})}
    if(!body || Object.getPrototypeOf(body)!==Object.prototype ||
       (body.op!=='run'&&body.op!=='readback') || (body.op==='readback'&&!UUID.test(body.receiptId||'')) ||
       (body.op==='run'&&Object.keys(body).length!==1) ||
       (body.op==='readback'&&Object.keys(body).length!==2)) return out({status:'BLOCKED',stage:'INPUT'});
    const stub=env.BRAIN.get(env.BRAIN.idFromName('central-v1'));
    if(body.op==='readback') {
      const result=await fetchBrain(stub,body.receiptId,true);
      if(result.status==='ACKNOWLEDGED'&&result.acknowledgedOnly===true&&result.recoveryExecuted===false&&
         result.safeToRetry===false)
        return out({status:'ACKNOWLEDGED',readback:true,recoveryExecuted:false,aiCalls:0});
      return out({status:'BLOCKED',stage:'INDEPENDENT_READBACK',code:result.code||'UNVERIFIED'});
    }
    if(attempted) return out({status:'BLOCKED',stage:'ONE_ATTEMPT_ONLY'});
    attempted=true;
    const finding={schemaVersion:1,source:'github_actions',repository:'dizigs/archelaos-site',
      code:'CI_FAILURE',resource:'/ci',commit:env.QA_CI_SHA,
      observedAt:new Date().toISOString(),evidenceId:'actions:'+env.QA_CI_RUN_ID};
    let proof;
    try {proof=await env.BRAIN_RECOVERY.verifySelfHealReceipt(finding);}
    catch{return out({status:'BLOCKED',stage:'PROVENANCE_RPC_EXCEPTION'});}
    if(proof?.verified!==true||!UUID.test(proof.receiptId||''))
      return out({status:'BLOCKED',stage:'PROVENANCE',code:proof?.code||'PROOF_DENIED'});
    const response=await fetchBrain(stub,proof.receiptId,false);
    if(response.status!=='ACKNOWLEDGED'||response.acknowledgedOnly!==true||
       response.recoveryExecuted!==false||response.safeToRetry!==false||
       response.needsIndependentReadback!==false||response.aiCalls!==0)
       return out({status:'BLOCKED',stage:'FIRST_ACK',code:response.code||'ACK_UNVERIFIED',receiptId:proof.receiptId});
    return out({status:'ACKNOWLEDGED',stage:'FIRST_ACK_AND_INTERNAL_READBACK',receiptId:proof.receiptId,
      providerVerified:true,recoveryExecuted:false,aiCalls:0});
  }
};