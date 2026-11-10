// LOCAL trusted operator utility. Never imported by the application server.
// Does not dispatch network traffic, recreate allowances or alter failed records.
import {createSubmissionAllowance,reviewedBuildHash} from './submission-allowance.mjs';
import {provisionControlledOwner,grantControlledAction} from './controlled-dispatch.mjs';
const [mode,arg,...extra]=process.argv.slice(2);
try{
 if(mode==='--build-hash'&&arg===undefined)console.log(reviewedBuildHash());
 else if(mode==='--provision-controlled-owner'&&typeof arg==='string'&&!extra.length){
  const options=JSON.parse(arg);if(Object.keys(options).join(',')!=='reviewedBuildSHA256'||options.reviewedBuildSHA256!==reviewedBuildHash())throw Error('review-mismatch');
  console.log(JSON.stringify(provisionControlledOwner(options)));
 }else if(mode==='--grant-controlled-action'&&typeof arg==='string'&&!extra.length){
  // Only a minimal validated packet; CLI output contains no cookie or question.
  const options=JSON.parse(arg);if(Object.keys(options).sort().join(',')!=='expiresAt,initiatingAction,packet,parentAuthorisation,requestID')throw Error('invalid-control-options');console.log(JSON.stringify(grantControlledAction(options)));
 }else if(mode==='--execute-reviewed-controlled-recovery'&&typeof arg==='string'&&!extra.length){
  const state=createSubmissionAllowance().reviewedControlledRecovery(JSON.parse(arg));
  console.log(JSON.stringify({operation:'reviewed-controlled-zero-credit-continuation',state}));
 }else if(mode==='--execute-reviewed-completion-recovery'&&typeof arg==='string'&&!extra.length){
  const state=createSubmissionAllowance().reviewedCompletionRecovery(JSON.parse(arg));
  console.log(JSON.stringify({operation:'reviewed-completion-zero-credit-continuation',state}));
 }else if(mode==='--execute-reviewed-recovery'&&typeof arg==='string'&&!extra.length){
  const state=createSubmissionAllowance().reviewedRecovery(JSON.parse(arg));
  console.log(JSON.stringify({operation:'reviewed-zero-credit-continuation',state}));
 }else throw Error('explicit-reviewed-operator-command-required');
}catch{console.error('Recovery refused or durability uncertain. Keep stopped; inspect owned evidence/lock/pending files. Do not hand-edit, delete locks, reset or retry automatically.');process.exitCode=1;}
