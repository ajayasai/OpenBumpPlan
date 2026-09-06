import { emptyProject, normalizeProject, transformPoint } from './model.js';
export function demoProject({crossed=true}={}) {
  const p=emptyProject('Dual-chiplet package / synthetic demonstrator');
  p.description='Public synthetic data: two dies, five physical stages, differential links, clocks, power/ground, and reserved sites. No customer design data.';
  p.dies=[{id:'CORE',name:'Compute chiplet',x:200,y:300,width:2300,height:2500,rotation:0,mirrorX:false,edgeKeepout:100,cornerKeepout:150},
    {id:'IO',name:'I/O chiplet',x:6200,y:300,width:2300,height:2500,rotation:90,mirrorX:false,edgeKeepout:100,cornerKeepout:150}];
  p.rules={...p.rules,maxLength:2600,minDomainSpacing:250,pairMaxDistance:650,pairMaxSkew:150,
    clockShieldRadius:750,clockGroundMin:2,groundRadius:1500,powerRadius:1700,requirePowerForSignals:true,minGroundRatio:0.2,
    terminalKind:'pcb',requireCompletePaths:true};
  const roles=['ground','clock','ground','power','signal','signal','ground','power','signal','signal','ground','power'];
  for(const die of p.dies)for(let i=0;i<12;i++) {
    const col=i%4,row=Math.floor(i/4),base={x:350+col*500,y:350+row*700},world=transformPoint(base,die),role=roles[i],domain=role==='ground'?'GND':die.id;
    const net=role==='ground'?'GND':role==='power'?`VDD_${die.id}`:i===4?`${die.id}_TX_P`:i===5?`${die.id}_TX_N`:`${die.id}_${role==='clock'?'CLK':`DATA${i-8}`}`;
    const kinds=['pad','bump','interposer','ball','pcb'];
    for(let stage=0;stage<kinds.length;stage++) {
      const id=`${die.id}:${kinds[stage]}:${i+1}`;
      const n={id,label:stage===0?net:`${die.id[0]}${i+1}`,kind:kinds[stage],dieId:stage<2?die.id:'',
        x:stage===0?base.x:stage===1?base.x+60:world.x+(stage-1)*160,
        y:stage===0?base.y:stage===1?base.y+60:world.y+(stage-1)*180,
        net:stage===0||role==='ground'?net:'',domain,role,pair:stage===0&&[4,5].includes(i)?`${die.id}_TX`:'',polarity:stage===0&&i===4?'+':stage===0&&i===5?'-':'',locked:false,required:stage===0||stage===4};
      p.ports.push(n);
      if(stage>0) p.connections.push({id:`${die.id}:s${stage}:${i+1}`,from:`${die.id}:${kinds[stage-1]}:${i+1}`,to:id,net:'',locked:false});
    }
    if(crossed&&i===9) {
      const a=p.connections.find(e=>e.id===`${die.id}:s3:9`),b=p.connections.find(e=>e.id===`${die.id}:s3:10`);
      [a.to,b.to]=[b.to,a.to];
    }
  }
  p.ports.push({id:'PKG:RESERVED',label:'RSVD',kind:'ball',x:7000,y:500,role:'reserved'}, {id:'PKG:NC',label:'NC',kind:'ball',x:7000,y:1000,role:'nc'});
  p.keepouts=[{id:'core-corner',dieId:'CORE',x:0,y:0,width:120,height:120,kinds:['pad','bump']}];
  p.regions=[{id:'package-power-grid',kind:'ball',x:0,y:0,width:7600,height:5000,domain:'',minGround:8,minPower:6}];
  return normalizeProject(p);
}

/** A deliberately small routing demonstration, not a fabrication-ready rule deck. */
export function routingDemoProject() {
  const p=emptyProject('Routing laboratory / synthetic crossing');
  p.description='Synthetic two-net crossing. Coverage requirements are disabled only to isolate geometric routing tests. Not a production constraint deck.';
  p.rules={...p.rules,maxLength:200,groundRadius:0,minGroundRatio:0,clockGroundMin:0,crossingWeight:150,maxCrossings:0};
  p.ports=[{id:'LEFT',kind:'pad',x:0,y:30,net:'DATA_A',domain:'V1',role:'signal',required:true},
    {id:'RIGHT',kind:'ball',x:60,y:30,net:'DATA_A',domain:'V1',role:'signal'},
    {id:'BOTTOM',kind:'pad',x:30,y:0,net:'DATA_B',domain:'V1',role:'signal',required:true},
    {id:'TOP',kind:'ball',x:30,y:60,net:'DATA_B',domain:'V1',role:'signal'}];
  p.connections=[{id:'horizontal',from:'LEFT',to:'RIGHT'},{id:'vertical',from:'BOTTOM',to:'TOP'}];
  return normalizeProject(p);
}

/** A pair-first greedy trap: the nearer adjacent targets are the only reachable
 * targets for a third signal. Moving the pair as a coupled unit restores feasibility. */
export function coupledDemoProject() {
  const p=emptyProject('Coupled assignment laboratory / pair bottleneck');
  p.description='Synthetic constructive counterexample to greedy pair-first assignment. No process constraints or customer data. The differential pair must use the farther adjacent pair so the third signal can reach a target.';
  p.rules={...p.rules,maxLength:120,pairMaxDistance:10,pairMaxSkew:0,groundRadius:0,minGroundRatio:0,clockGroundMin:0};
  p.ports=[{id:'TX_P',kind:'pad',x:0,y:0,net:'TX_P',domain:'V1',role:'signal',pair:'TX',polarity:'+',required:true},
    {id:'TX_N',kind:'pad',x:0,y:10,net:'TX_N',domain:'V1',role:'signal',pair:'TX',polarity:'-',required:true},
    {id:'RESTRICTED',kind:'pad',x:-100,y:0,net:'CONTROL',domain:'V1',role:'signal',required:true},
    ...[[0,0],[0,10],[100,0],[100,10]].map(([x,y],i)=>({id:`BALL_${i+1}`,label:`B${i+1}`,kind:'ball',x,y,role:'any'}))];
  return normalizeProject(p);
}
