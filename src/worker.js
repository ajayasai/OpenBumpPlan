import { optimizeStage } from './core/optimizer.js';
import { optimizeExact } from './core/solver.js';
import { optimizeScalable } from './core/scalable.js';
import { optimizeCoupledScalable } from './core/coupled-search.js';
import { routePhysical } from './core/physical-routing.js';
import { routeStage, routeNegotiated } from './core/routing.js';
self.onmessage = event => {
  try {
    const {project,from,to,options,jobType='heuristic'}=event.data;
    const fn=jobType==='heuristic'?optimizeStage:jobType==='exact'?optimizeExact:jobType==='route'?routeStage:jobType==='negotiated'?routeNegotiated:jobType==='physical'?routePhysical:jobType==='scalable'?optimizeScalable:jobType==='coupled'?optimizeCoupledScalable:null;
    if(!fn)throw new Error('Unknown engineering worker operation.');
    self.postMessage({ok:true,result:fn(project,from,to,options)});
  } catch(error) {self.postMessage({ok:false,error:error.message});}
};
