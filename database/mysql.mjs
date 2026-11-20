// Este módulo solo se carga cuando BIBLIOTECA_STORAGE=mysql.
const consultas=[
  ['users','SELECT id,nombre AS name,rol AS role FROM usuario ORDER BY orden'],
  ['books','SELECT id,titulo AS title,autor AS author,categoria AS category,descripcion AS description,color,anio AS year,isbn FROM libro ORDER BY orden'],
  ['copies','SELECT id,libro_id AS bookId FROM ejemplar ORDER BY orden'],
  ['loans','SELECT id,usuario_id AS userId,ejemplar_id AS copyId,inicio AS startedAt,vence AS dueAt,devolucion AS returnedAt FROM prestamo ORDER BY orden'],
  ['reservations','SELECT id,usuario_id AS userId,libro_id AS bookId,ejemplar_id AS copyId,estado AS status,vence AS expiresAt,creacion AS createdAt FROM reserva ORDER BY orden']
];
export async function abrirMySQL(env=process.env){
  const user=env.BIBLIOTECA_MYSQL_USER;
  if(!user)throw Error('Define BIBLIOTECA_MYSQL_USER antes de iniciar.');
  const mysql=await import('mysql2/promise');
  const pool=mysql.createPool({
    host:'127.0.0.1',port:Number(env.BIBLIOTECA_MYSQL_PORT??3306),
    user,password:env.BIBLIOTECA_MYSQL_PASSWORD??'',
    database:'biblioteca_campus',dateStrings:true,connectionLimit:4,
    charset:'utf8mb4'
  });
  try { await pool.query('SELECT id FROM control WHERE id=1'); }
  catch (e) { await pool.end(); throw e; }

  async function persistir(db,s,inicial){
    if(inicial){
      for(const [i,u] of s.users.entries())await db.execute('INSERT INTO usuario VALUES (?,?,?,?)',[u.id,u.name,u.role,i]);
      for(const [i,b] of s.books.entries())await db.execute('INSERT INTO libro VALUES (?,?,?,?,?,?,?,?,?)',[b.id,b.title,b.author,b.category,b.description,b.color,b.year,b.isbn,i]);
      for(const [i,c] of s.copies.entries())await db.execute('INSERT INTO ejemplar VALUES (?,?,?)',[c.id,c.bookId,i]);
    }
    for(const [i,p] of s.loans.entries())await db.execute(
      'INSERT INTO prestamo VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE devolucion=?',
      [p.id,p.userId,p.copyId,p.startedAt,p.dueAt,p.returnedAt,i,p.returnedAt]);
    for(const [i,r] of s.reservations.entries())await db.execute(
      'INSERT INTO reserva VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE ejemplar_id=?,estado=?,vence=?',
      [r.id,r.userId,r.bookId,r.copyId,r.status,r.expiresAt,r.createdAt,i,r.copyId,r.status,r.expiresAt]);
    await db.execute('UPDATE control SET fecha_demo=?,ultima_fecha_real=? WHERE id=1',[s.today,s.lastRealDay]);
  }
  return {
    async close(){ await pool.end(); },
    async transaction(semilla,operacion){
      const db=await pool.getConnection();
      try{
        await db.beginTransaction();
        // Una fila de control serializa las operaciones de circulación, también entre procesos.
        const [[control]]=await db.query('SELECT fecha_demo,ultima_fecha_real FROM control WHERE id=1 FOR UPDATE');
        if(!control)throw Error('Ejecuta database/schema.sql para preparar MySQL.');
        const inicial=control.fecha_demo===null;
        let estado;
        if(inicial)estado=semilla();
        else{
          estado={version:1,today:control.fecha_demo,lastRealDay:control.ultima_fecha_real};
          for(const [prop,sql] of consultas)estado[prop]=(await db.query(sql))[0];
        }
        const antes=JSON.stringify(estado);
        const resultado=operacion(estado);
        if(inicial||antes!==JSON.stringify(estado))await persistir(db,estado,inicial);
        await db.commit();
        return resultado;
      }catch(e){await db.rollback();throw e;}
      finally{db.release();}
    }
  };
}
