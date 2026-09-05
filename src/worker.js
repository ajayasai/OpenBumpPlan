import { optimizeStage } from './core/optimizer.js';
self.onmessage = event => {
  try { const {project,from,to,options}=event.data; self.postMessage({ok:true,result:optimizeStage(project,from,to,options)}); }
  catch(error) { self.postMessage({ok:false,error:error.message}); }
};
