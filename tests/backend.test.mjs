import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync, unlinkSync, rmdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {crearServidor} from '../server.mjs';
import {semilla,vista,prestar,devolver,reservar,cancelar,avanzar,masDias} from '../domain.mjs';

const personal={id:'bibliotecario',role:'bibliotecario'};
const r=(s,id)=>s.reservations.find(x=>x.id===id);
const activos=(s,id)=>s.loans.filter(x=>x.userId===id&&x.returnedAt===null);

test('Los préstamos vencidos cuentan; se admite el séptimo y se bloquea el octavo',()=>{
 const s=semilla();
 assert.equal(activos(s,'hugo').length,6);
 assert.ok(activos(s,'hugo').some(x=>x.dueAt<s.today));
 prestar(s,{userId:'hugo',copyId:'EJ-001'});
 const septimo=activos(s,'hugo').at(-1);
 assert.equal(septimo.dueAt,'2026-11-28');
 assert.equal(activos(s,'hugo').length,7);
 assert.throws(()=>prestar(s,{userId:'hugo',copyId:'EJ-002'}),/octavo/);
 devolver(s,septimo.id);
 prestar(s,{userId:'hugo',copyId:'EJ-002'});
 assert.equal(activos(s,'hugo').length,7);
});

test('Una devolución asigna el ejemplar a la primera persona; cancelar avanza la cola',()=>{
 const s=semilla();
 reservar(s,'lucia','ciudad');
 const lucia=s.reservations.at(-1);
 assert.equal(vista(s,{id:'lucia',role:'lector'}).reservations[0].position,3);
 devolver(s,'l-cola');
 assert.deepEqual([r(s,'r-ana').status,r(s,'r-ana').expiresAt],['held','2026-11-22']);
 assert.throws(()=>prestar(s,{userId:'mateo',copyId:'EJ-003'}),/otra persona/);
 assert.throws(()=>cancelar(s,{id:'lucia',role:'lector'},'r-ana'),/No puedes/);
 cancelar(s,personal,'r-ana');
 assert.equal(r(s,'r-hugo').status,'held');
 assert.equal(r(s,lucia.id).status,'waiting');
 assert.equal(vista(s,{id:'lucia',role:'lector'}).reservations[0].position,1);
});

test('El vencimiento se procesa al inicio de la fecha límite y da dos días al siguiente',()=>{
 const s=semilla();
 reservar(s,'lucia','ciudad');
 devolver(s,'l-cola');
 avanzar(s,1);
 assert.equal(r(s,'r-ana').status,'held');
 avanzar(s,1);
 assert.equal(r(s,'r-ana').status,'expired');
 assert.equal(r(s,'r-hugo').expiresAt,'2026-11-24');
 avanzar(s,2);
 const lucia=s.reservations.at(-1);
 assert.equal(lucia.status,'held');
 assert.equal(lucia.expiresAt,'2026-11-26');
 avanzar(s,2);
 assert.equal(vista(s,personal).copies.find(x=>x.id==='EJ-003').status,'available');
 assert.equal(masDias('2026-12-28',8),'2027-01-05');
});

test('Reserva inmediata única por título y recogida como préstamo',()=>{
 const s=semilla();
 reservar(s,'lucia','diseno');
 assert.equal(s.reservations.at(-1).status,'held');
 assert.throws(()=>reservar(s,'lucia','diseno'),/Ya tienes/);
 prestar(s,{userId:'lucia',copyId:'EJ-001'});
 assert.equal(s.reservations.at(-1).status,'fulfilled');
 assert.equal(vista(s,personal).copies[0].status,'loaned');
});

async function levantar(server){
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 return 'http://127.0.0.1:'+server.address().port;
}
async function cerrar(server){
 await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
}
async function pedir(base,ruta,data,cookie){
 const response=await fetch(base+ruta,data===undefined?
 {headers:cookie?{Cookie:cookie}:{}}:
 {method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
 const json=await response.json();
 return {status:response.status,json,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}

test('API: roles, dos solicitudes por el último cupo, expiración por fecha real y persistencia',async()=>{
 const dir=mkdtempSync(join(dirname(fileURLToPath(import.meta.url)),'temporal-'));
 const archivo=join(dir,'estado.json');
 let real='2026-11-20';
 let server=crearServidor({archivo,clock:()=>real});
 try{
  let base=await levantar(server);
  const inicial=await pedir(base,'/api/state');
  assert.equal(inicial.json.actor,null);
  assert.equal(inicial.json.loans.length,0);
  assert.equal((await pedir(base,'/api/loans',{userId:'hugo',copyId:'EJ-001'})).status,401);
  const lector=await pedir(base,'/api/login',{userId:'lucia'});
  assert.equal((await pedir(base,'/api/loans',{userId:'hugo',copyId:'EJ-001'},lector.cookie)).status,403);
  const {cookie}=await pedir(base,'/api/login',{userId:'bibliotecario'});
  const resultados=await Promise.all(['EJ-001','EJ-002'].map(copyId=>pedir(base,'/api/loans',{userId:'hugo',copyId},cookie)));
  assert.deepEqual(resultados.map(x=>x.status).sort(),[200,409]);
  await pedir(base,'/api/loans/l-cola/return',{},cookie);
  real='2026-11-22';
  let estado=(await pedir(base,'/api/state',undefined,cookie)).json;
  assert.equal(r(estado,'r-ana').status,'expired');
  assert.equal(r(estado,'r-hugo').status,'held');
  await cerrar(server);
  server=crearServidor({archivo,clock:()=>real});
  base=await levantar(server);
  const reconexion=await pedir(base,'/api/login',{userId:'bibliotecario'});
  estado=reconexion.json;
  assert.equal(activos(estado,'hugo').length,7);
  assert.equal(r(estado,'r-hugo').status,'held');
 }finally{
  if(server.listening)await cerrar(server);
  unlinkSync(archivo);
  rmdirSync(dir);
 }
});


test('API: un lector ve únicamente sus propios registros; la cola no revela identidades',async()=>{
 const server=crearServidor({archivo:null,clock:()=> '2026-11-20'});
 try{
  const base=await levantar(server);
  const inicial=await pedir(base,'/api/login',{userId:'lucia'});
  assert.equal(inicial.json.loans.length,0);
  assert.equal(inicial.json.reservations.length,0);
  const enCola=await pedir(base,'/api/reservations',{bookId:'ciudad'},inicial.cookie);
  assert.equal(enCola.status,200);
  assert.equal(enCola.json.reservations.length,1);
  assert.equal(enCola.json.reservations[0].position,3);
  const id=enCola.json.reservations[0].id;
  assert.equal((await pedir(base,'/api/reservations/r-ana/cancel',{},inicial.cookie)).status,403);
  const cancel=await pedir(base,'/api/reservations/'+id+'/cancel',{},inicial.cookie);
  assert.equal(cancel.json.reservations[0].status,'cancelled');
  assert.equal((await pedir(base,'/api/logout',{},inicial.cookie)).json.actor,null);
  assert.equal((await pedir(base,'/api/state',undefined,inicial.cookie)).json.actor,null);
 }finally{if(server.listening)await cerrar(server);}
});
