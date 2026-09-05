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
