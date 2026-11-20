import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {crearServidorExpress} from '../server.mjs';

test('Express: catálogo, enrutamiento, JSON, roles, préstamos y reservas',async()=>{
 const server=await crearServidorExpress({archivo:null,clock:()=> '2026-11-20'});
 try{
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  const get=(path,cookie)=>fetch(base+path,{headers:cookie?{Cookie:cookie}:{}});
  const post=(path,data,cookie)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
  const state=await get('/api/state');
  assert.equal(state.status,200);
  assert.equal((await state.json()).actor,null);
  assert.equal((await get('/api/no-existe')).status,404);
  assert.equal((await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
  const staff=await post('/api/login',{userId:'bibliotecario'});
  const cookie=staff.headers.get('set-cookie').split(';')[0];
  const lend=await post('/api/loans',{userId:'hugo',copyId:'EJ-001'},cookie);
  assert.equal(lend.status,200);
  assert.equal((await post('/api/loans',{userId:'hugo',copyId:'EJ-002'},cookie)).status,409);
  const ret=await post('/api/loans/l-cola/return',{},cookie);
  assert.equal(ret.status,200);
  assert.equal((await ret.json()).reservations.find(r=>r.id==='r-ana').status,'held');
  const cancel=await post('/api/reservations/r-ana/cancel',{},cookie);
  assert.equal((await cancel.json()).reservations.find(r=>r.id==='r-hugo').status,'held');
  const reader=await post('/api/login',{userId:'lucia'});
  assert.equal((await post('/api/demo/advance',{days:2},reader.headers.get('set-cookie').split(';')[0])).status,403);
 }finally{if(server.listening)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
