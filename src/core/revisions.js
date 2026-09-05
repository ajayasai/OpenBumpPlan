import { clone, stableStringify, fingerprint, assertProject, effectiveSignals, worldPoint } from './model.js';
import { analyze, regressionCheck } from './rules.js';
import { manhattan } from './geometry.js';
export function compareProjects(before,after) {
  assertProject(before); assertProject(after);
  const changes=[], aCtx=effectiveSignals(before), bCtx=effectiveSignals(after);
  for(const category of ['dies','ports','connections','keepouts','regions']) {
    const a=new Map(before[category].map(x=>[x.id,x])), b=new Map(after[category].map(x=>[x.id,x]));
    for(const id of [...new Set([...a.keys(),...b.keys()])].sort()) {
      if(!a.has(id)) changes.push({category,id,type:'added',after:b.get(id)});
      else if(!b.has(id)) changes.push({category,id,type:'removed',before:a.get(id)});
      else if(stableStringify(a.get(id))!==stableStringify(b.get(id))) {
        const fields=[...new Set([...Object.keys(a.get(id)),...Object.keys(b.get(id))])].filter(k=>stableStringify(a.get(id)[k])!==stableStringify(b.get(id)[k]));
        changes.push({category,id,type:'changed',fields,before:a.get(id),after:b.get(id)});
      }
    }
  }
  if(stableStringify(before.rules)!==stableStringify(after.rules)) changes.push({category:'rules',id:'rules',type:'changed',before:before.rules,after:after.rules});
  const propagated=[];
  for(const n of after.ports) if(aCtx.ports.has(n.id)) {
    const from=worldPoint(aCtx.ports.get(n.id),aCtx),to=worldPoint(n,bCtx);
    const signalBefore=aCtx.signals.get(n.id),signalAfter=bCtx.signals.get(n.id);
    if(manhattan(from,to)>1e-8 || stableStringify(signalBefore)!==stableStringify(signalAfter)) propagated.push({id:n.id,movement:manhattan(from,to),from,to,signalBefore,signalAfter});
  }
  const beforeAnalysis=analyze(before),afterAnalysis=analyze(after);
  return {beforeFingerprint:fingerprint(before),afterFingerprint:fingerprint(after),changes,propagated,
    summary:{added:changes.filter(c=>c.type==='added').length,removed:changes.filter(c=>c.type==='removed').length,changed:changes.filter(c=>c.type==='changed').length,
      errorsDelta:afterAnalysis.errors-beforeAnalysis.errors,lengthDelta:afterAnalysis.metrics.totalLength-beforeAnalysis.metrics.totalLength,
      crossingDelta:afterAnalysis.metrics.crossings-beforeAnalysis.metrics.crossings,scoreDelta:afterAnalysis.metrics.score-beforeAnalysis.metrics.score},
    beforeAnalysis,afterAnalysis,gate:regressionCheck(beforeAnalysis,afterAnalysis,{draft:false})};
}
export class ProjectStore {
  constructor(project) {assertProject(project);this.project=clone(project);this.undoStack=[];this.redoStack=[];this.analysis=analyze(project);}
  transact(action,mutate,{strict=true}={}) {
    const next=clone(this.project); mutate(next); assertProject(next); const analysis=analyze(next);
    if(strict) {const gate=regressionCheck(this.analysis,analysis);if(!gate.ok) throw new Error(`Change blocked: ${gate.reason}`);}
    next.revision=this.project.revision+1;
    next.audit=[...next.audit,{revision:next.revision,action,time:new Date().toISOString(),fingerprint:fingerprint(next)}].slice(-200);
    this.undoStack.push(clone(this.project));if(this.undoStack.length>50)this.undoStack.shift();this.redoStack=[];
    this.project=next;this.analysis=analysis;return next;
  }
  undo() {if(!this.undoStack.length)return false;this.redoStack.push(this.project);this.project=this.undoStack.pop();this.analysis=analyze(this.project);return true;}
  redo() {if(!this.redoStack.length)return false;this.undoStack.push(this.project);this.project=this.redoStack.pop();this.analysis=analyze(this.project);return true;}
}
