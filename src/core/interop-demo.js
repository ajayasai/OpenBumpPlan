import { emptyProject, normalizeProject } from './model.js';
import { objectDigest } from './terminal-interop.js';

/** Synthetic demonstration, not a reviewed industrial design. The intent file
 * is deliberately separate; real contracts must come from independent intent. */
export function interoperabilityDemo() {
  const p=emptyProject('Chiplet interface · reference design');
  Object.assign(p.rules,{groundRadius:0,powerRadius:0,minGroundRatio:0,clockGroundMin:0,maxLength:10000,maxCrossings:100});
  const nets=['DATA_P','DATA_N','REF_CLK','CTRL','VDD','GND'];
  for(let i=0;i<nets.length;i++) {
    const x=(i%3)*800,y=Math.floor(i/3)*900,net=nets[i],role=i===4?'power':i===5?'ground':i===2?'clock':'signal';
    p.ports.push({id:'die:'+i,label:'PAD'+i,kind:'pad',x,y,net,domain:i===5?'':'V1',role,required:true});
    p.ports.push({id:'ball:'+i,label:['A1','A2','A3','B1','B2','B3'][i],kind:'ball',x:x+2200,y,role:'any',domain:i===5?'':'V1'});
    p.connections.push({id:'map:'+i,from:'die:'+i,to:'ball:'+i,net:''});
  }
  p.ports.push({id:'ball:spare',label:'C1',kind:'ball',x:2200,y:1800,role:'nc'});
  const project=normalizeProject(p);
  const contract={schema:'openbumpplan.connectivity-contract/v1',name:'Synthetic interface intent (demonstration only)',coverage:'all',nets:nets.map((name,i)=>({name,ports:['die:'+i,'ball:'+i]})),unassigned:['ball:spare']};
  return {project,contract};
}
export function swappedInterfaceDemo() {
  const {project,contract}=interoperabilityDemo();
  [project.connections[0].to,project.connections[1].to]=[project.connections[1].to,project.connections[0].to];
  const patch={schema:'openbumpplan.mapping-eco/v1',baseProjectSHA256:objectDigest(project),contractSHA256:objectDigest(contract),edits:[0,1].map(i=>({id:'map:'+i,expected:{from:'die:'+i,to:project.connections[i].to,net:''},to:'ball:'+i}))};
  return {project,contract,patch};
}
