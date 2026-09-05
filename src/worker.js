import { optimizeStage } from './core/optimizer.js';
import { solveExactStage } from './core/exact.js';
import { routeStage } from './core/routing.js';
self.onmessage = event => {
  try {
    const {task='heuristic',project,from,to,options}=event.data;
    const fn={heuristic:optimizeStage,exact:solveExactStage,routing:routeStage}[task];
    if(!fn)throw new Error('Unknown worker task.');
    self.postMessage({ok:true,result:fn(project,from,to,options)});
  } catch(error) { self.postMessage({ok:false,error:error.message}); }
};
