import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer from 1 to 65535.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.csv':'text/csv; charset=utf-8','.md':'text/plain; charset=utf-8','.pdf':'application/pdf'};
const server=http.createServer(async(req,res)=>{
  try {
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end('Read-only server');return;}
    const url=new URL(req.url,'http://localhost'),decoded=decodeURIComponent(url.pathname);
    if(decoded.includes('\0')||decoded.split('/').some(part=>part.startsWith('.')&&part!=='.'))throw new Error('Blocked path');
    const file=path.resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
    if(!file.startsWith(root+path.sep)||!types[path.extname(file)])throw new Error('Blocked path');
    const real=await fs.realpath(file);if(!real.startsWith(root+path.sep))throw new Error('Blocked symlink');
    const data=await fs.readFile(real);
    res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404,{'Content-Type':'text/plain','X-Content-Type-Options':'nosniff'});res.end('Not found');}
});
server.listen(port,host,()=>console.log(`OpenBumpPlan: http://${host}:${port}\nRead-only local server. No uploads, analytics, or external dependencies.`));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
