import {randomUUID} from 'node:crypto';

export const maxPrestamos=7, diasPrestamo=8, diasRecogida=2;
export function masDias(fecha,dias) {
  return new Date(Date.parse(fecha+'T00:00:00Z')+dias*86400000).toISOString().slice(0,10);
}
export class Regla extends Error {
  constructor(message,status=409){super(message);this.status=status;}
}
// La fecha vencida no libera el cupo: solo se libera al registrar una devolución.
const activo = p=>p.returnedAt===null;
const abierta = r=>['waiting','held'].includes(r.status);
const cola = (s,bookId)=>s.reservations.filter(r=>r.bookId===bookId&&r.status==='waiting');
const prestamo = (s,copyId)=>s.loans.find(p=>p.copyId===copyId&&activo(p));
const retencion = (s,copyId)=>s.reservations.find(r=>r.copyId===copyId&&r.status==='held');
function buscar(items,id,mensaje){
  const x=items.find(x=>x.id===id);
  if(!x)throw new Regla(mensaje,404);
  return x;
}
export function semilla(today='2026-11-20'){
 const users=[['lucia','Lucía Navarro'],['ana','Ana Beltrán'],['mateo','Mateo Salazar'],['hugo','Hugo Vera'],['bibliotecario','Valeria Ortiz']].map(([id,name])=>({id,name,role:id==='bibliotecario'?'bibliotecario':'lector'}));
 const books=[
 ['diseno','Diseñar para las personas','Elena Martín','Diseño','#eed654','Convierte las necesidades de las personas en decisiones de diseño.'],
 ['ciudad','La ciudad que habitamos','Mateo Ríos','Arquitectura','#dd5844','Una mirada a los espacios urbanos que construimos y compartimos.'],
 ['datos','Introducción a los datos','Sara Vidal','Tecnología','#4c8c7c','Fundamentos para organizar, analizar y comunicar datos.'],
 ['sociedad','Pensamiento y sociedad','Alba Torres','Humanidades','#9b8eca','Ideas para entender comunidades e instituciones.'],
 ['ecologias','Ecologías del futuro','Daniel Reyes','Medio ambiente','#47a06b','Escenarios para pensar la sostenibilidad.'],
 ['territorio','Lecturas del territorio','Isabel Ramos','Ciencias sociales','#997452','Historias, paisajes y comunidades.'],
 ['ciencia','Ciencia abierta','Gabriel Luna','Tecnología','#597fb3','Principios para compartir el conocimiento científico.'],
 ['colecciones','Colecciones vivas','Sofía Díaz','Diseño','#bf6f8d','Conservar colecciones accesibles a una comunidad.'],
 ].map(([id,title,author,category,color,description],i)=>({id,title,author,category,color,description,year:[2024,2023,2025,2022,2024,2022,2025,2023][i],isbn:['978-84-000-1024-3','978-84-000-2042-6',null,null,null,null,null,null][i]}));
 const ids=['diseno','diseno','ciudad','datos','datos','sociedad','sociedad','ecologias','territorio','ciencia','colecciones'];
 const eid=n=>'EJ-'+String(n).padStart(3,'0');
 const copies=ids.map((bookId,i)=>({id:eid(i+1),bookId}));
 const loan=(id,userId,n,d)=>({id,userId,copyId:eid(n),startedAt:masDias(today,d),dueAt:masDias(today,d+diasPrestamo),returnedAt:null});
 const reserv=(userId,d)=>({id:'r-'+userId,userId,bookId:'ciudad',copyId:null,status:'waiting',expiresAt:null,createdAt:masDias(today,d)});
 return {version:1,today,users,books,copies,loans:[loan('l-cola','mateo',3,-1),...[4,6,8,9,10,11].map((n,i)=>loan('l-hugo-'+(i+1),'hugo',n,i===0?-9:-2))],reservations:[reserv('ana',-2),reserv('hugo',-1)]};
}

// Las reservas conservan su orden de inserción, incluso si se crean el mismo día.
export function actualizarReservas(s){
 for(const r of s.reservations)if(r.status==='held'&&r.expiresAt<=s.today)r.status='expired';
 for(const c of s.copies){
   if(prestamo(s,c.id)||retencion(s,c.id))continue;
   const primera=cola(s,c.bookId)[0];
   if(primera)Object.assign(primera,{status:'held',copyId:c.id,expiresAt:masDias(s.today,diasRecogida)});
 }
}
// Recibir un ejemplar reservado convierte el apartado en préstamo sin duplicar disponibilidad.
export function prestar(s,{userId,copyId}){
 if(buscar(s.users,userId,'Lector no encontrado.').role!=='lector')throw new Regla('Selecciona un lector.',400);
 buscar(s.copies,copyId,'Ejemplar no encontrado.');
 if(s.loans.filter(p=>p.userId===userId&&activo(p)).length>=maxPrestamos)throw new Regla('No puedes registrar el octavo préstamo: máximo 7 préstamos activos.');
 if(prestamo(s,copyId))throw new Regla('El ejemplar ya está prestado.');
 const r=retencion(s,copyId);
 if(r && r.userId!==userId)throw new Regla('El ejemplar está reservado para otra persona.');
 s.loans.push({id:randomUUID(),userId,copyId,startedAt:s.today,dueAt:masDias(s.today,diasPrestamo),returnedAt:null});
 if(r)r.status='fulfilled';
}
export function devolver(s,id){
 const p=buscar(s.loans,id,'Préstamo no encontrado.');
 if(!activo(p))throw new Regla('El préstamo ya se devolvió.');
 p.returnedAt=s.today;
 actualizarReservas(s);
}
export function reservar(s,userId,bookId){
 buscar(s.books,bookId,'Libro no encontrado.');
 if(s.reservations.some(r=>r.userId===userId&&r.bookId===bookId&&abierta(r)))throw new Regla('Ya tienes una reserva activa para este título.');
 s.reservations.push({id:randomUUID(),userId,bookId,copyId:null,status:'waiting',expiresAt:null,createdAt:s.today});
 actualizarReservas(s);
}
export function cancelar(s,actor,id){
 const r=buscar(s.reservations,id,'Reserva no encontrada.');
 if(actor.role!=='bibliotecario'&&actor.id!==r.userId)throw new Regla('No puedes cancelar esta reserva.',403);
 if(!abierta(r))throw new Regla('La reserva ya no está activa.');
 r.status='cancelled';
 actualizarReservas(s);
}
export function avanzar(s,dias){
 if(!Number.isInteger(dias)||dias<1||dias>365)throw new Regla('Indica entre 1 y 365 días enteros.',400);
 // Verificar día a día mantiene los plazos de toda la cola si el salto supera dos días.
 for(let i=0;i<dias;i++){s.today=masDias(s.today,1);actualizarReservas(s);}
}
// Se proyecta disponibilidad a partir de préstamos y reservas, sin duplicar el estado en los ejemplares.
export function vista(s,actor){
 const staff=actor?.role==='bibliotecario';
 return {today:s.today,actor:actor??null,users:s.users,books:s.books,
 copies:s.copies.map(c=>{
   const r=retencion(s,c.id);
   return {...c,status:r?'held':prestamo(s,c.id)?'loaned':'available',heldFor:r&&(staff||r.userId===actor?.id)?r.userId:null};
 }),
 loans:s.loans.filter(p=>staff||p.userId===actor?.id),
 reservations:s.reservations.filter(r=>staff||r.userId===actor?.id).map(r=>({...r,position:r.status==='waiting'?cola(s,r.bookId).findIndex(x=>x.id===r.id)+1:null})),
 };
}
