// Manual operator-only local QA runner. NEVER deploy this module.
// Designed for "wrangler dev" bound to 127.0.0.1 with a single remote
// SERVICE binding to BrainHmacAcceptancePort. No recovery/repair permission.
function denied(){return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}})}
function unknown(code){return Response.json({status:'UNKNOWN',actionsExecuted:0,...(/^QA_DIAG_[A-Z_]{3,35}$/.test(code||'')?{code}:{})},{headers:{'cache-control':'no-store'}})}
async function equalCapability(expected,got){
  if(typeof expected!=='string'||expected.length<48||expected.length>256||
     typeof got!=='string'||got.length!==expected.length||got.length>256)return false;
  const encoder=new TextEncoder();
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(expected)),
    crypto.subtle.digest('SHA-256',encoder.encode(got))]);
  const x=new Uint8Array(a),y=new Uint8Array(b);
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
  return diff===0;
}

const proofFields=['status','sourceSha','sessionId','challengeDigest','actionsExecuted'];
function validProofShape(value){
  // Native workerd RPC scalar replies can carry one nonenumerable Symbol.dispose.
  // Validate exact own DATA fields and no unexpected capabilities or symbols.
  if(!value||Object.getPrototypeOf(value)!==Object.prototype)return false;
  const names=Object.getOwnPropertyNames(value);
  if(names.length!==proofFields.length||!proofFields.every(k=>names.includes(k)))return false;
  if(names.some(k=>{
    const d=Object.getOwnPropertyDescriptor(value,k);
    return !d||!Object.hasOwn(d,'value')||d.get||d.set;
  }))return false;
  const symbols=Object.getOwnPropertySymbols(value);
  if(!symbols.length)return true;
  const d=Object.getOwnPropertyDescriptor(value,Symbol.dispose);
  return symbols.length===1&&symbols[0]===Symbol.dispose&&!!d&&!d.enumerable&&
    typeof d.value==='function'&&!d.get&&!d.set;
}

export default {
  async fetch(request,env){
    try {
      const url=new URL(request.url);
      if(request.method!=='POST'||url.pathname!=='/__local_private_hmac_qa'||
         url.search||url.hostname!=='127.0.0.1'||url.port!=='8799')return denied();
      if(!await equalCapability(env.OPERATOR_CAPABILITY,request.headers.get('x-operator-capability')))return denied();
      if(!env.BRAIN_QA||typeof env.BRAIN_QA.runChallenge!=='function')return unknown();
      const result=await env.BRAIN_QA.runChallenge();
      if(result?.status==='UNKNOWN')return unknown(result.code);
      if(result?.status!=='KEY_POSSESSION_CONFIRMED'||result.actionsExecuted!==0||
        typeof result.sourceSha!=='string'||!/^[a-f0-9]{40}$/.test(result.sourceSha)||
        typeof result.sessionId!=='string'||!/^[a-f0-9-]{36}$/.test(result.sessionId)||
        typeof result.challengeDigest!=='string'||!/^[a-f0-9]{64}$/.test(result.challengeDigest)||
        !validProofShape(result))return unknown();
      return Response.json({status:'KEY_POSSESSION_CONFIRMED',sourceSha:result.sourceSha,
        sessionId:result.sessionId,challengeDigest:result.challengeDigest,actionsExecuted:0},
        {headers:{'cache-control':'no-store'}});
    }catch{return unknown()}
  }
};
