import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, statSync} from 'node:fs';
import {resolve, dirname, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {semilla,vista,prestar,devolver,reservar,cancelar,avanzar,Regla} from './domain.mjs';

const raiz=dirname(fileURLToPath(import.meta.url));
const publico=resolve(raiz,'public');
const tipo={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ico':'image/x-icon'};
const fechaBogota=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota'}).format(new Date());
const diasEntre=(a,b)=>Math.floor((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
function guardar(archivo,valor){
  if(!archivo)return;
  mkdirSync(dirname(archivo),{recursive:true});
  const temporal=archivo+'.'+randomUUID()+'.tmp';
  writeFileSync(temporal,JSON.stringify(valor,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  renameSync(temporal,archivo);
}
async function cuerpo(req){
  let size=0; const trozos=[];
  for await (const b of req){size+=b.length;if(size>16384)throw new Regla('Solicitud demasiado grande.',413);trozos.push(b);}
  if(!size)return {};
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??''))throw new Regla('Se requiere JSON.',415);
  let x;
  try{x=JSON.parse(Buffer.concat(trozos).toString('utf8'));}catch{throw new Regla('JSON no válido.',400);}
  if(!x||Array.isArray(x)||typeof x!=='object')throw new Regla('Datos de solicitud no válidos.',400);
  return x;
}
function exigir(actor,rol){
  if(!actor)throw new Regla('Selecciona un perfil de demostración.',401);
  if(rol&&actor.role!==rol)throw new Regla('Este perfil no puede realizar esa operación.',403);
}

function crearControlador({archivo=resolve(raiz,'datos','estado.json'),clock=fechaBogota,almacenamiento=null}={}){
  let s;
  if(!almacenamiento&&archivo&&existsSync(archivo)){
    s=JSON.parse(readFileSync(archivo,'utf8'));
    if(s.version!==1||!Array.isArray(s.copies)||!Array.isArray(s.reservations))throw Error('El archivo de datos no corresponde a Biblioteca Campus.');
  }else{
    s={...semilla(),lastRealDay:clock()};
    if(!almacenamiento)guardar(archivo,s);
  }
  const sesiones=new Map();
  // Clonar, validar y guardar en una sola sección sincronizada; no hay pausa entre validar y confirmar.
  const nuevaSemilla=()=>({...semilla(),lastRealDay:clock()});
  async function mutar(operacion){
    if(almacenamiento){
      s=await almacenamiento.transaction(nuevaSemilla,d=>{operacion(d);return d;});
      return;
    }
    const siguiente=structuredClone(s);
    operacion(siguiente);
    guardar(archivo,siguiente);
    s=siguiente;
  }
  async function actualizarReloj(){
    const hoy=clock();
    if(!almacenamiento&&diasEntre(hoy,s.lastRealDay??hoy)<=0)return;
    await mutar(d=>{
      const delta=diasEntre(hoy,d.lastRealDay??hoy);
      if(delta<=0)return;
      for(let resto=delta;resto>0;resto-=365)avanzar(d,Math.min(resto,365));
      d.lastRealDay=hoy;
    });
  }
  return async function consultar(req,accion,data={},id=null){
    await actualizarReloj();
    const token=(req.headers.cookie??'').match(/(?:^|;\s*)campus=([a-f0-9-]+)(?:;|$)/)?.[1];
    const actor=s.users.find(u=>u.id===sesiones.get(token));
    if(!data||Array.isArray(data)||typeof data!=='object')throw new Regla('Datos de solicitud no válidos.',400);
    if(id!==null&&!/^[a-z0-9-]+$/i.test(id))throw new Regla('Identificador no válido.',400);
    if(accion==='state')return {body:vista(s,actor)};
    if(accion==='login'){
      const perfil=s.users.find(u=>u.id===data.userId);
      if(!perfil)throw new Regla('Perfil de demostración no encontrado.',404);
      if(token)sesiones.delete(token);
      const nuevo=randomUUID();
      sesiones.set(nuevo,perfil.id);
      return {body:vista(s,perfil),cookie:'campus='+nuevo+'; Path=/; HttpOnly; SameSite=Strict'};
    }
    if(accion==='logout'){
      if(token)sesiones.delete(token);
      return {body:vista(s,null),cookie:'campus=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'};
    }
    // Cada acción comprueba en el servidor el perfil necesario antes de cambiar datos.
    if(accion==='lend'){
      exigir(actor,'bibliotecario');
      await mutar(d=>prestar(d,data));
    }else if(accion==='return'){
      exigir(actor,'bibliotecario');
      await mutar(d=>devolver(d,id));
    }else if(accion==='reserve'){
      exigir(actor,'lector');
      await mutar(d=>reservar(d,actor.id,data.bookId));
    }else if(accion==='cancel'){
      exigir(actor);
      await mutar(d=>cancelar(d,actor,id));
    }else if(accion==='advance'){
      exigir(actor,'bibliotecario');
      await mutar(d=>avanzar(d,data.days));
    }else{
      throw new Regla('Ruta no encontrada.',404);
    }
    return {body:vista(s,s.users.find(u=>u.id===actor.id))};
  };
}

// Tabla de rutas usada por Express y por el servidor HTTP sin dependencias.
const rutas=[
  ['GET','/api/state','state'],
  ['POST','/api/login','login'],
  ['POST','/api/logout','logout'],
  ['POST','/api/loans','lend'],
  ['POST','/api/loans/:id/return','return'],
  ['POST','/api/reservations','reserve'],
  ['POST','/api/reservations/:id/cancel','cancel'],
  ['POST','/api/demo/advance','advance']
];
const rutasNativas=rutas.map(([metodo,ruta,accion])=>[metodo,new RegExp('^'+ruta.replace(':id','([a-zA-Z0-9-]+)')+'$'),accion]);
function validarOrigen(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  const host=req.headers.host??'';
  if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host))throw new Regla('Usa la dirección local de la aplicación.',403);
  if(req.headers.origin&&req.headers.origin!=='http://'+host)throw new Regla('Origen no permitido.',403);
  return host;
}
function resolverError(e){
  if(e instanceof Regla)return [e.status,e.message];
  if(e?.type==='entity.too.large')return [413,'Solicitud demasiado grande.'];
  if(e?.type==='entity.parse.failed')return [400,'JSON no válido.'];
  if(e?.status===415)return [415,'Formato o codificación no compatible.'];
  if(e instanceof URIError)return [400,'Ruta no válida.'];
  console.error(e);
  return [500,'No se pudo procesar la solicitud. Revisa la consola local.'];
}
export function crearServidor(opciones){
  const consultar=crearControlador(opciones);
  return createServer(async(req,res)=>{
    const json=(status,data,cookie)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(data));};
    try{
      const host=validarOrigen(req,res);
      const ruta=new URL(req.url,'http://'+host).pathname;
      if(ruta.startsWith('/api/')){
        for(const [metodo,patron,accion] of rutasNativas){
          if(req.method!==metodo)continue;
          const m=ruta.match(patron);
          if(!m)continue;
          const data=metodo==='POST'?await cuerpo(req):{};
          const result=await consultar(req,accion,data,m[1]??null);
          return json(200,result.body,result.cookie);
        }
        return json(404,{error:'Ruta no encontrada.'});
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return json(405,{error:'Método no permitido.'});
      const relativa=ruta==='/'?'index.html':decodeURIComponent(ruta.slice(1));
      const destino=resolve(publico,relativa),mime=tipo[extname(destino)];
      if(!destino.startsWith(publico+sep)||!mime||!existsSync(destino)||!statSync(destino).isFile())return json(404,{error:'Archivo no encontrado.'});
      const bytes=readFileSync(destino);
      res.writeHead(200,{'Content-Type':mime,'Content-Length':bytes.length,'Cache-Control':'no-cache'});
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch(e){
      const [estado,error]=resolverError(e);
      return json(estado,{error});
    }
  });
}

// Modo formal: Express procesa JSON, enruta peticiones, sirve la interfaz y normaliza errores.
export async function crearServidorExpress(opciones){
  const {default:express}=await import('express');
  const consultar=crearControlador(opciones);
  const app=express();
  app.disable('x-powered-by');
  app.set('case sensitive routing',true);
  app.set('strict routing',true);
  app.use((req,res,next)=>{
    try{validarOrigen(req,res);next();}catch(e){next(e);}
  });
  const parserJson=express.json({limit:16384});
  function formatoJson(req,res,next){
    const tieneCuerpo=Number(req.headers['content-length']??0)>0||Boolean(req.headers['transfer-encoding']);
    if(tieneCuerpo&&!req.is('application/json'))return next(new Regla('Se requiere JSON.',415));
    return parserJson(req,res,next);
  }
  for(const [metodo,ruta,accion] of rutas){
    const responder=async(req,res)=>{
      const result=await consultar(req,accion,req.body??{},req.params.id??null);
      if(result.cookie)res.setHeader('Set-Cookie',result.cookie);
      return res.set('Cache-Control','no-store').json(result.body);
    };
    if(metodo==='POST')app.post(ruta,formatoJson,responder);
    else app.get(ruta,responder);
  }
  app.use('/api',(req,res)=>res.status(404).set('Cache-Control','no-store').json({error:'Ruta no encontrada.'}));
  app.use(express.static(publico,{dotfiles:'ignore',index:'index.html',redirect:false}));
  app.use((req,res)=>res.status(404).json({error:'Archivo no encontrado.'}));
  app.use((e,req,res,next)=>{
    if(res.headersSent)return next(e);
    const [estado,error]=resolverError(e);
    return res.status(estado).set('Cache-Control','no-store').json({error});
  });
  return createServer(app);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT??3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('El puerto debe ser un entero entre 1 y 65535.');
  const modo=process.env.BIBLIOTECA_STORAGE??'json';
  if(!['json','mysql'].includes(modo))throw Error('BIBLIOTECA_STORAGE debe ser json o mysql.');
  let almacenamiento=null;
  if(modo==='mysql'){
    const {abrirMySQL}=await import('./database/mysql.mjs');
    almacenamiento=await abrirMySQL();
  }
  const transporte=process.env.BIBLIOTECA_HTTP??(modo==='mysql'?'express':'node');
  if(!['node','express'].includes(transporte))throw Error('BIBLIOTECA_HTTP debe ser node o express.');
  const server=transporte==='express'?await crearServidorExpress({almacenamiento}):crearServidor({almacenamiento});
  if(almacenamiento)server.once('close',()=>almacenamiento.close());
  server.listen(port,'127.0.0.1',()=>console.log('Biblioteca Campus · http://127.0.0.1:'+port+' · '+transporte+' / '+modo));
}
