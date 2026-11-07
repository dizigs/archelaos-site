import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, GEMMA_MODEL, preparePublicClassification, decodeGemmaClassification, classifyWithCentralGemma } from '../src/classifier.mjs';
const input={eventId:'11111111-1111-4111-8111-111111111111',sourceHash:'a'.repeat(64),revisionHash:'b'.repeat(64),text:'Ο ΓΑΣ Αρχέλαος Κατερίνης αγωνίστηκε στο χάντμπολ και νίκησε την Καστοριά στο πρωτάθλημα.'};
test('disabled by default',()=>{assert.equal(DEFAULT_STATE,'OFF');assert.equal(GEMMA_MODEL,'@cf/google/gemma-4-26b-a4b-it');});
test('source must be grounded and minimal',()=>{assert.equal(preparePublicClassification(input).text,input.text);assert.throws(()=>preparePublicClassification({...input,extra:true}));});
test('no ports means no inference',async()=>{const r=await classifyWithCentralGemma(input,{});assert.equal(r.modelCalls,0);});
test('ungrounded model response is rejected',()=>{assert.throws(()=>decodeGemmaClassification({club:'GAS',sport:'handball',confidence:1,evidence:'Fictional report'},input));});
