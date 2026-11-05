import {pathToFileURL} from 'node:url';
import {E2EValidationError,ValidationErrorCodes} from './harness.mjs';
/** No live transport exists in this review-only package. */
export function verifyLiveRunnerGate(env=process.env,argv=process.argv){
  if(argv.includes('--live')||env.ARCHELAOS_E2E_MODE==='LIVE'||
     env.ARCHELAOS_LIVE_GAS_WRITE_APPROVED==='TRUE_WITH_4EYES_APPROVAL')
    throw new E2EValidationError(ValidationErrorCodes.LIVE_WRITE_DISABLED_BY_DEFAULT);
  return {allowed:false,mode:'SYNTHETIC_DRY_RUN_ONLY',liveGoogleWrites:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(verifyLiveRunnerGate()));}
  catch(e){console.error(JSON.stringify({code:e.code||'BLOCKED_FAIL_CLOSED'}));process.exitCode=1;}
}
