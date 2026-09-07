/** Successive shortest augmenting paths with integer reduced costs. The solver
 * does NOT certify itself: assignment-certificate.js independently checks the
 * residual inequalities, complete primal matching, and graph content digest. */
class Heap {
  constructor(){this.a=[];}
  push(item){const a=this.a;let i=a.length;a.push(item);while(i){const p=(i-1)>>>1;if(a[p][0]<=item[0])break;a[i]=a[p];i=p;}a[i]=item;}
  pop(){const a=this.a,top=a[0],last=a.pop();if(a.length){let i=0;while(2*i+1<a.length){let j=2*i+1;if(j+1<a.length&&a[j+1][0]<a[j][0])j++;if(a[j][0]>=last[0])break;a[i]=a[j];i=j;}a[i]=last;}return top;}
}
export function minCostMatching(rows, targetCount, options={}) {
  const n=rows.length,m=targetCount,N=n+m+2,S=n+m,T=S+1;
  const maxAugmentations=options.maxAugmentations??n,timeLimitMs=options.timeLimitMs??15000;
  if(!Number.isInteger(m)||m<0||!Number.isInteger(maxAugmentations)||maxAugmentations<0||maxAugmentations>10000||!Number.isFinite(timeLimitMs)||timeLimitMs<1||timeLimitMs>60000)throw new Error('Invalid min-cost search limits.');
  const graph=Array.from({length:N},()=>[]),arcRefs=[];
  function arc(u,v,cost){const a={to:v,cost,cap:1,rev:graph[v].length},b={to:u,cost:-cost,cap:0,rev:graph[u].length};graph[u].push(a);graph[v].push(b);return a;}
  for(let i=0;i<n;i++){
    arc(S,i,0);const seen=new Set();arcRefs[i]=[];
    for(const e of rows[i]){
      if(!Number.isInteger(e.j)||e.j<0||e.j>=m||seen.has(e.j)||!Number.isSafeInteger(e.cost)||e.cost<0||e.cost>Math.floor(Number.MAX_SAFE_INTEGER/(32*N)))throw new Error('Invalid integer-cost candidate graph.');
      seen.add(e.j);arcRefs[i].push([e.j,arc(i,n+e.j,e.cost)]);
    }
  }
  for(let j=0;j<m;j++)arc(n+j,T,0);
  const p=new Array(N).fill(0),started=performance.now();let flow=0,relaxations=0,stopReason=null;
  const matches=()=>arcRefs.map(row=>row.find(([,a])=>a.cap===0)?.[0]??-1);
  while(flow<n){
    if(flow>=maxAugmentations){stopReason='augmentation-limit';break;}
    if(performance.now()-started>=timeLimitMs){stopReason='time-limit';break;}
    const dist=new Float64Array(N).fill(Infinity),prevNode=new Int32Array(N).fill(-1),prevArc=new Int32Array(N).fill(-1),heap=new Heap();
    dist[S]=0;heap.push([0,S]);let lastCheck=0;
    while(heap.a.length){
      const [d,u]=heap.pop();if(d!==dist[u])continue;
      if(u===T)break;
      if(relaxations-lastCheck>=16384){lastCheck=relaxations;if(performance.now()-started>=timeLimitMs){stopReason='time-limit';break;}}
      for(let k=0;k<graph[u].length;k++){
        const a=graph[u][k];if(!a.cap)continue;relaxations++;
        const reduced=a.cost+p[u]-p[a.to];if(!Number.isSafeInteger(reduced)||reduced<0)throw new Error('Internal reduced-cost invariant failed.');
        const nd=d+reduced;if(!Number.isSafeInteger(nd))throw new Error('Integer path cost overflow.');
        if(nd<dist[a.to]){dist[a.to]=nd;prevNode[a.to]=u;prevArc[a.to]=k;heap.push([nd,a.to]);}
      }
    }
    if(stopReason)break;
    if(!Number.isFinite(dist[T])){
      // Residual reachability proves a Hall-deficient source set. Recheck it
      // against the ORIGINAL graph, not this residual data, in the verifier.
      const sourceIndices=[],targetIndices=[];
      for(let i=0;i<n;i++)if(Number.isFinite(dist[i]))sourceIndices.push(i);
      for(let j=0;j<m;j++)if(Number.isFinite(dist[n+j]))targetIndices.push(j);
      return {status:'infeasible',assignment:matches(),hall:{sourceIndices,targetIndices},flow,relaxations,elapsedMs:performance.now()-started};
    }
    // Clipped distances also update vertices not finalized before the sink.
    // This preserves nonnegative costs on every residual edge, globally.
    for(let v=0;v<N;v++){p[v]+=Math.min(dist[v],dist[T]);if(!Number.isSafeInteger(p[v]))throw new Error('Integer potential overflow.');}
    for(let v=T;v!==S;v=prevNode[v]){const u=prevNode[v],a=graph[u][prevArc[v]];a.cap=0;graph[v][a.rev].cap=1;}
    flow++;
  }
  const assignment=matches();
  if(stopReason)return {status:'unknown',assignment,flow,relaxations,stopReason,elapsedMs:performance.now()-started};
  const objectiveTicks=assignment.reduce((sum,j,i)=>sum+rows[i].find(e=>e.j===j).cost,0);
  return {status:'optimal',assignment,potentials:p,objectiveTicks,flow,relaxations,elapsedMs:performance.now()-started};
}
