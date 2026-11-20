'use strict';

// Esta interfaz solo presenta el estado. Las reglas de préstamos y reservas
// se validan en el servidor; recargar la página no borra los cambios.
const main = document.querySelector('#contenido');
const nav = document.querySelector('#nav');
const notices = document.querySelector('#notices');
const dialog = document.querySelector('#confirm');
let state, screen = 'catalogo', selectedBook, busy = false;
let filters = {q: '', author: '', category: ''};
const staff = () => state?.actor?.role === 'bibliotecario';
const getBook = id => state.books.find(b => b.id === id);
const getCopy = id => state.copies.find(c => c.id === id);
const getUser = id => state.users.find(u => u.id === id);
const currentLoan = l => !l.returnedAt;
const activeReservation = r => ['waiting', 'held'].includes(r.status);
const reservationLabels = {waiting:'En espera',held:'Lista para recoger',expired:'Vencida',cancelled:'Cancelada',fulfilled:'Entregada'};
const statusClasses = {waiting:'warn',held:'',expired:'bad',cancelled:'neutral',fulfilled:'neutral'};
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const formValue = (form, name) => String(new FormData(form).get(name) ?? '');
const dateFormat = new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
function date(value) {
  if (!value) return '—';
  const parsed = new Date(value.slice(0,10) + 'T00:00:00Z');
  return Number.isNaN(+parsed) ? '—' : dateFormat.format(parsed);
}
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key,value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const value of children.flat(Infinity)) if (value !== null && value !== undefined && value !== false) node.append(value);
  return node;
}
const button = (label, fn, kind = '') => el('button',{type:'button',class:'button ' + kind,onclick:fn},label);
const badge = (label, kind = '') => el('span',{class:'badge ' + kind},label);
const empty = msg => el('div',{class:'empty'},msg);
function tell(message, error = false) {
  notices.replaceChildren(el('div',{class:'notice'+(error?' error':''),role:error?'alert':null,tabindex:'-1'},message));
  if (error) notices.firstElementChild.focus();
}
async function api(path, method='GET', body) {
  const response = await fetch('/api/' + path,{method,headers:body === undefined?{}:{'Content-Type':'application/json'},body:body === undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'No se pudo completar la operación.');
  return data;
}
async function refresh() {
  state = await api('state');
  render();
}
function navigate(destination, bookId) {
  screen = destination;
  selectedBook = bookId;
  notices.replaceChildren();
  render();
  main.focus({preventScroll:true});
  window.scrollTo(0,0);
}
async function mutate(path, body, success, after, onError) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('button:not(:disabled)')];
  controls.forEach(b => { b.disabled = true; });
  try {
    const updated = await api(path,'POST',body);
    state = Array.isArray(updated?.books) ? updated : await api('state');
    if (after) after();
    notices.replaceChildren();
    render();
    if (success) tell(success);
    if(screen==='prestamo-resultado'){main.querySelector('h1')?.focus();window.scrollTo(0,0);}
  } catch (error) {
    if(onError?.(error)){
      notices.replaceChildren();
      render();
      main.querySelector('h1')?.focus();
      window.scrollTo(0,0);
    } else tell(error.message || 'No se pudo completar la operación.',true);
  } finally {
    busy = false;
    controls.forEach(b => { b.disabled = false; });
  }
}
function confirmAction(message, run) {
  dialog.returnValue = '';
  document.querySelector('#confirm-text').textContent = message;
  dialog.addEventListener('close',() => { if (dialog.returnValue === 'yes') run(); },{once:true});
  dialog.showModal();
}
function title(kicker,heading,desc,compact=false) {
  return el('section',{class:'hero'+(compact?' compact':'')},el('p',{class:'kicker'},kicker),el('h1',{},heading),desc && el('p',{class:'lead'},desc));
}
function field(id,label,control) {
  return el('div',{class:'field'},el('label',{for:id},label),control);
}
function select(id,pairs,selected='',first=null) {
  const node=el('select',{id,name:id});
  if(first !== null) node.append(el('option',{value:''},first));
  for(const [value,label] of pairs) node.append(el('option',{value},label));
  node.value=selected;
  return node;
}
function table(labels,rows,caption) {
  return el('div',{class:'table-scroll',tabindex:'0',role:'region','aria-label':caption},
    el('table',{},el('thead',{},el('tr',{},labels.map(v=>el('th',{scope:'col'},v)))),
    el('tbody',{},rows.map(row=>el('tr',{},row.map(v=>el('td',{},v)))))));
}
function panel(heading,...parts) {
  return el('section',{class:'panel'},el('h2',{},heading),parts);
}
function cover(book) {
  const number=String(state.books.indexOf(book)+1).padStart(2,'0');
  const titleLines={diseno:['Diseñar para','las personas'],ciudad:['La ciudad','que habitamos'],datos:['Introducción','a los datos'],sociedad:['Pensamiento','y sociedad']};
  return el('div',{class:'cover','data-book':book.id,'aria-hidden':'true'},
    el('small',{},'CAMPUS EDICIONES'),el('strong',{},(titleLines[book.id]??[book.title]).map(line=>el('span',{},line))),
    el('small',{},number+' / '+book.category.toUpperCase()));
}

function loginView() {
  const readers=state.users.filter(u=>u.role==='lector');
  const librarian=state.users.find(u=>u.role==='bibliotecario');
  const chooser = select('userId',readers.map(u=>[u.id,u.name+' · '+u.id+'@campus.edu']),readers[0]?.id??'','Selecciona un perfil');
  chooser.required=true;
  function enter(userId){ mutate('login',{userId},null,()=>{screen=staff()?'gestion':'catalogo';filters={q:'',author:'',category:''};}); }
  const form=el('form',{class:'login-form',onsubmit:e=>{e.preventDefault();enter(formValue(e.currentTarget,'userId'));}},
    el('h2',{},'Bienvenido de nuevo'),el('p',{class:'muted'},'Accede con tu correo universitario.'),badge('Acceso de demostración'),
    field('userId','Correo universitario de prueba',chooser),
    field('demo-pass','Contraseña de muestra',el('input',{id:'demo-pass',type:'password',value:'campus-demo',readonly:true,tabindex:'-1'})),
    el('button',{type:'submit',class:'button'},'Iniciar sesión'),
    librarian && button('Entrar como bibliotecario',()=>enter(librarian.id),'ghost'),
    button('Probar credenciales incorrectas',()=>tell('El perfil no es válido. Selecciona uno de los perfiles de prueba.',true),'link'),
    el('p',{class:'hint'},'Usamos perfiles ficticios. No ingreses credenciales reales: el acceso a esta demostración no requiere una contraseña.'));
  const spine=(name,number)=>el('div',{},el('strong',{},name),el('small',{},'CAMPUS',el('br'),'EDICIONES / '+number));
  return el('div',{class:'split'},
    el('section',{class:'splash'},el('h1',{},'TU PRÓXIMA IDEA',el('br'),'EMPIEZA AQUÍ.'),el('p',{},'Explora, reserva y sigue aprendiendo.',el('br'),'La biblioteca de tu universidad, contigo.'),
      el('div',{class:'spines','aria-hidden':'true'},spine('FORMAS DE MIRAR','01'),spine('CIENCIA ABIERTA','02'),spine('EL ARTE DE PENSAR','03')),
      el('p',{class:'splash-footer'},'Conocimiento que se comparte.')),form);
}

function bookCopies(id) { return state.copies.filter(copy=>copy.bookId===id); }
function catalogView() {
  const authors=[...new Set(state.books.map(b=>b.author))].sort((a,b)=>a.localeCompare(b,'es'));
  const categories=[...new Set(state.books.map(b=>b.category))].sort((a,b)=>a.localeCompare(b,'es'));
  const search=el('input',{id:'q',name:'q',type:'search',placeholder:'Título, autor o ISBN',value:filters.q});
  const filtering=Boolean(filters.q||filters.author||filters.category);
  const filtersForm=el('form',{class:'catalog-filters',onsubmit:e=>{
    e.preventDefault(); const f=e.currentTarget;
    filters={q:formValue(f,'q'),author:formValue(f,'author'),category:formValue(f,'category')};
    if(!filters.q&&!filters.author&&!filters.category) filters.all=true;
    render();document.querySelector('#search-results')?.focus();
  }},
    field('q','Buscar en el catálogo',search),
    el('button',{type:'submit',class:'button search-button'},'Buscar'),
    field('author','Autor',select('author',authors.map(a=>[a,a]),filters.author,'Todos los autores')),
    field('category','Categoría',select('category',categories.map(c=>[c,c]),filters.category,'Todas')));
  const matches = state.books.filter(book=>normalize([book.title,book.author,book.isbn].join(' ')).includes(normalize(filters.q)) && (!filters.author||book.author===filters.author) && (!filters.category||book.category===filters.category));
  const visible = filtering||filters.all ? matches : matches.slice(0,4);
  const card = book => {
    const copies=bookCopies(book.id), count=copies.filter(c=>c.status==='available').length;
    return el('article',{class:'book-card'},el('button',{type:'button',class:'book-button','aria-label':'Ver detalle de '+book.title,onclick:()=>navigate('detalle',book.id)},
      cover(book),el('div',{class:'book-body'},el('h3',{},book.title),
      el('p',{class:'muted'},[book.author,book.year].filter(Boolean).join(' · ')),
      badge(count?'Disponible · '+count+' de '+copies.length:'Sin ejemplares',count?'':'warn'),
      el('span',{class:'mobile-book-link'},'Ver libro →'))));
  };
  const heading=filtering?'Resultados de búsqueda':filters.all?'Todos los títulos':'Selección para ti';
  const countText=visible.length+' '+(visible.length===1?'título encontrado':filtering||filters.all?'títulos encontrados':'títulos destacados');
  return [el('section',{class:'hero catalog-hero'},el('div',{},el('p',{class:'kicker'},'Descubre tu biblioteca'),el('h1',{},'Un mundo por descubrir.'),el('p',{class:'lead'},'Encuentra ese libro que hará avanzar tus ideas.')),badge(state.books.length+' títulos a tu alcance')),
    filtersForm,
    el('div',{class:'catalog-results'},el('h2',{id:'search-results',tabindex:'-1'},heading),el('p',{class:'muted'},countText)),
    (filtering||filters.all)&&el('div',{class:'filter-reset'},button('Limpiar filtros',()=>{filters={q:'',author:'',category:''};render();document.querySelector('#q')?.focus();},'link')),
    visible.length ? el('div',{class:'book-grid'},visible.map(card)) : empty('No se encontraron títulos con esos criterios. Prueba con otro nombre o limpia los filtros.'),
    el('aside',{class:'rule-band'},el('strong',{},'Tu biblioteca, sin complicaciones'),el('span',{},'Hasta 7 préstamos a la vez · 8 días por préstamo · 2 días para recoger una reserva'))];
}

function detailView() {
  const book=getBook(selectedBook);
  if (!book) return [title('Catálogo','Libro no encontrado.'),button('Volver al catálogo',()=>navigate('catalogo'),'ghost')];
  const copies=bookCopies(book.id), available=copies.filter(c=>c.status==='available').length;
  const existing=state.reservations.find(r=>r.bookId===book.id&&r.userId===state.actor.id&&activeReservation(r));
  const label=available?'Reservar':'Unirme a la lista de espera';
  const description=available?'Al reservar, tendrás 2 días para recoger en el mostrador.':'La cola sigue el orden de llegada. Te avisaremos cuando sea tu turno.';
  return [el('div',{class:'back'},button('← Volver al catálogo',()=>navigate('catalogo'),'link')),
    el('section',{class:'detail'},cover(book),el('div',{},el('p',{class:'kicker'},book.category),el('h1',{},book.title),
      el('p',{class:'muted detail-byline'},[book.author,book.year].filter(Boolean).join(' · ')),
      badge(available?'Disponible':'Sin ejemplares',available?'':'warn'),
      el('h2',{class:'stock'},'Sobre este libro'),el('p',{},book.description || 'No hay descripción disponible.'),
      book.isbn&&el('p',{class:'hint detail-isbn'},'ISBN '+book.isbn),
      el('div',{class:'detail-stock'},el('h2',{},available+' de '+copies.length+' ejemplares disponibles'),el('p',{class:'muted'},description),
      !staff() && el('div',{class:'actions'},existing ? button('Ver mi reserva',()=>navigate('cuenta')) :
        button(label,()=>confirmAction((available?'¿Reservar «':'¿Entrar en la cola de «') + book.title+'»?',()=>mutate('reservations',{bookId:book.id},'Solicitud registrada. Revisa el estado en Mis reservas.',()=>{screen='cuenta';}))),
        el('span',{class:'hint'},available?'Préstamo de hasta 8 días · Máximo 7 activos por lector.':'2 días para recoger cuando se libere un ejemplar.')))))];
}

function loanTitle(loan) {
  return getBook(getCopy(loan.copyId)?.bookId)?.title ?? 'Título no disponible';
}
function loanStatus(loan) {
  if (loan.returnedAt) return badge('Devuelto','neutral');
  if (loan.dueAt < state.today) return badge('Vencido','bad');
  return badge('Activo');
}
function reservationStatus(r) {
  return badge(reservationLabels[r.status]??r.status,statusClasses[r.status]??'neutral');
}
function cancelButton(r) {
  return activeReservation(r) ? button('Cancelar',()=>confirmAction('¿Cancelar esta reserva de «'+(getBook(r.bookId)?.title??'libro')+'»? Si había un ejemplar apartado, pasará a la siguiente persona que espera.',()=>mutate('reservations/'+encodeURIComponent(r.id)+'/cancel',{},'Reserva cancelada. La lista de espera se actualizó.')),'ghost') : '—';
}
function accountView() {
  const own=state.actor.id, loans=state.loans.filter(l=>l.userId===own), reservations=state.reservations.filter(r=>r.userId===own);
  const count=loans.filter(currentLoan).length;
  return [el('section',{class:'hero account-hero'},el('h1',{},'Hola, '+state.actor.name.split(' ')[0]+'.'),
      el('p',{class:'account-count'},count+' de 7 préstamos activos · Hasta 8 días por préstamo')),
    el('section',{class:'account-loans'},el('h2',{},'Mis préstamos'),
      loans.length ? table(['Título','Ejemplar','Fecha de préstamo','Devolución','Estado'],loans.map(l=>[loanTitle(l),l.copyId,date(l.startedAt),date(l.dueAt),loanStatus(l)]),'Mis préstamos') : empty('Aún no tienes préstamos.')),
    panel('Mis reservas',reservations.length ? table(['Libro','Estado','Posición en espera','Recoger hasta','Acción'],reservations.map(r=>[getBook(r.bookId)?.title??'—',reservationStatus(r),r.status==='waiting' ? r.position ?? '—':'—',r.status==='held'?date(r.expiresAt):'—',cancelButton(r)]),'Mis reservas') :
      el('div',{class:'account-empty'},el('h3',{},'Aún no tienes reservas'),el('p',{class:'muted'},'Explora el catálogo y elige tu próxima lectura.'),button('Explorar catálogo',()=>navigate('catalogo'),'ghost')))];
}

function stat(label,value,help,kind='') {
  return el('div',{class:'stat '+kind},el('span',{},label),el('strong',{},String(value)),el('small',{},help));
}
let staffTitle='ciudad', managementTab='libros', reportTab='vencidos', feedback=null;
const daysUntil=(value)=>Math.round((Date.parse(value+'T00:00:00Z')-Date.parse(state.today+'T00:00:00Z'))/86400000);
const liveLoans=()=>state.loans.filter(currentLoan);
const overdueLoans=()=>liveLoans().filter(l=>l.dueAt<state.today);
const staffTabs=[['gestion','▦','Resumen'],['inventario','▤','Gestión'],['prestamos','↔','Préstamos'],['reservas','◷','Reservas'],['reportes','▥','Reportes']];
const scopedBook=(bookId)=>state.books.find(b=>b.id===bookId) ?? state.books[0];
function managementView() {
  const loans=liveLoans(), holds=state.reservations.filter(activeReservation);
  const availability=state.copies.filter(c=>c.status==='available').length;
  const overdue=overdueLoans(), todayReturns=state.loans.filter(l=>l.returnedAt===state.today);
  const ready=holds.filter(r=>r.status==='held');
  const rows=[
    ['Alta',el('strong',{},'Gestionar vencidos'),overdue.length+' préstamos','Hoy',button('Ver reporte →',()=>{reportTab='vencidos';navigate('reportes');},'link')],
    ['Media',el('strong',{},'Reservas para recoger'),ready.length+' solicitudes','Hoy',button('Ver reservas →',()=>navigate('reservas'),'link')],
    ['Normal',el('strong',{},'Devoluciones recientes'),todayReturns.length+' ejemplares','Hoy',button('Ver préstamos →',()=>navigate('prestamos'),'link')]];
  return [title('Vista general','La biblioteca, de un vistazo.','Actividad de hoy y tareas que necesitan tu atención.',true),
    el('div',{class:'stats'},stat('Ejemplares disponibles',availability,'De '+state.copies.length+' ejemplares'),stat('Préstamos activos',loans.length,'Préstamos de hasta 8 días'),stat('Préstamos vencidos',overdue.length,'Requieren seguimiento','stat-red'),stat('Reservas pendientes',holds.length,ready.length+' listas para recoger')),
    el('section',{class:'staff-table dashboard-tasks'},el('h2',{},'Tareas de hoy'),table(['Prioridad','Tarea','Cantidad','Actualización','Acción'],rows,'Tareas de hoy')),
    el('div',{class:'actions staff-actions'},button('Registrar préstamo',()=>navigate('prestamos')),button('Gestionar catálogo',()=>navigate('inventario'),'ghost'))];
}
function loansView() {
  const loans=liveLoans();
  const loanForm=el('form',{onsubmit:e=>{
    e.preventDefault();const userId=formValue(e.currentTarget,'reader'),copyId=formValue(e.currentTarget,'copy');
    if(userId&&copyId) confirmAction('¿Registrar el préstamo de '+copyId+' para '+getUser(userId).name+'?',()=>mutate('loans',{userId,copyId},null,
      ()=>{feedback={kind:'loan',person:getUser(userId).name,copyId,loan:state.loans.find(l=>l.copyId===copyId&&!l.returnedAt)};screen='prestamo-resultado';},
      (error)=>{if(!error.message.includes('octavo'))return false;feedback={kind:'limit',person:getUser(userId).name};screen='prestamo-resultado';return true;}));
  }});
  const readers=state.users.filter(u=>u.role==='lector');
  const reader=select('reader',readers.map(u=>[u.id,u.name]),'','Selecciona un lector');reader.required=true;
  const copy=select('copy',[],'','Selecciona primero el lector');copy.required=true;copy.disabled=true;
  reader.addEventListener('change',()=>{
    const eligible=state.copies.filter(c=>c.status==='available'||(c.status==='held'&&reader.value&&c.heldFor===reader.value));
    copy.replaceChildren(el('option',{value:''},eligible.length?'Selecciona un ejemplar':'No hay ejemplares disponibles'),
      ...eligible.map(c=>el('option',{value:c.id},c.id+' · '+(getBook(c.bookId)?.title??'Libro')+(c.status==='held'?' (reserva propia)':''))));
    copy.disabled=!reader.value||!eligible.length;
    document.querySelector('#reader-count').textContent=reader.value?loans.filter(l=>l.userId===reader.value).length+' de 7 préstamos activos.':'Selecciona un lector para ver sus préstamos activos.';
  });
  loanForm.append(el('div',{class:'form-row'},field('reader','Lector',reader),field('copy','Ejemplar',copy)),
    el('p',{id:'reader-count',class:'hint'},'Selecciona un lector para ver sus préstamos activos.'),
    el('button',{class:'button',type:'submit'},'Registrar préstamo'));
  const loanRows=[...loans,...state.loans.filter(l=>!currentLoan(l))].map(l=>[getUser(l.userId)?.name??'—',loanTitle(l),l.copyId,date(l.dueAt),loanStatus(l),
    currentLoan(l)?button('Registrar devolución',()=>confirmAction('¿Confirmar la devolución de «'+loanTitle(l)+'»? Si hay personas en espera, el ejemplar pasa a la primera.',
      ()=>mutate('loans/'+encodeURIComponent(l.id)+'/return',{},null,()=>{feedback={kind:'return',loan:l};screen='prestamo-resultado';staffTitle=getCopy(l.copyId)?.bookId??staffTitle;})),'ghost'):'—']);
  return [title('Circulación','Préstamos y devoluciones','Registra préstamos, controla plazos y devuelve ejemplares.',true),
    panel('Registrar préstamo',el('p',{class:'muted'},'Máximo 7 préstamos activos por lector. Fecha de devolución: 8 días.'),loanForm),
    el('section',{class:'staff-table',id:'lista-prestamos'},el('h2',{},'Préstamos y devoluciones'),loanRows.length ? table(['Lector','Título','Ejemplar','Devolución','Estado','Acción'],loanRows,'Préstamos y devoluciones') : empty('No hay préstamos registrados.'))];
}
function outcomeView() {
  if(!feedback) return loansView();
  const {kind,person,loan,copyId}=feedback;
  const problem=kind==='limit';
  const heading=problem?'No puedes registrar el octavo':kind==='return'?'Devolución confirmada':'Préstamo registrado';
  const details=problem ? [person+' ya tiene 7 préstamos activos.',el('br'),'El máximo es 7 por lector. Devuelve un ejemplar antes de registrar otro préstamo.'] :
    kind==='return' ? ['Se registró la devolución de «'+loanTitle(loan)+'». Revisa la lista de reservas para ver si se ofreció a la primera persona en espera.'] :
    [person+' tiene ahora '+liveLoans().filter(l=>l.userId===loan?.userId).length+' de 7 préstamos activos.',el('br'),'Ejemplar '+copyId+' · Entregar el '+date(loan?.dueAt)+'.'];
  return [el('p',{class:'kicker outcome-kicker'},'Circulación / Simulación'),
    el('section',{class:'outcome '+(problem?'outcome-error':'')},badge(problem?'Límite alcanzado':kind==='return'?'Devolución registrada':'Préstamo confirmado',problem?'bad':''),
      el('h1',{tabindex:'-1'},heading),el('p',{class:'lead'},details),
      el('div',{class:'outcome-actions'},button(problem?'Consultar devoluciones':kind==='return'?'Ver cola actualizada':'Ver préstamos activos',()=>{
        navigate(kind==='return'?'reservas':'prestamos');
        if(problem)document.querySelector('#lista-prestamos')?.scrollIntoView();
      },problem?'danger':''),button(problem?'Volver sin cambios':'Volver a préstamos',()=>navigate('prestamos'),'ghost')))];
}
function staffReservationsView() {
  const book=scopedBook(staffTitle);
  if(!book) return empty('No hay títulos en el catálogo.');
  const rows=state.reservations.filter(r=>r.bookId===book.id);
  const held=rows.find(r=>r.status==='held');
  const copies=bookCopies(book.id);
  const free=copies.filter(c=>c.status==='available').length;
  const selector=select('title-filter',state.books.map(b=>[b.id,b.title]),book.id);
  selector.addEventListener('change',()=>{staffTitle=selector.value;render();document.querySelector('#title-filter')?.focus();});
  const recent=[...rows].sort((a,b)=>({held:0,waiting:1,expired:2,cancelled:2,fulfilled:2}[a.status]??3)-({held:0,waiting:1,expired:2,cancelled:2,fulfilled:2}[b.status]??3));
  return [title('Reservas','Cada turno cuenta.','Cola por orden de llegada · El plazo de recogida es de 2 días.',true),
    el('div',{class:'queue-filter'},field('title-filter','Título',selector),badge((held?held.copyId+' asignado · ':'')+free+' '+(free===1?'libre':'libres'),held?'warn':'')),
    el('section',{class:'staff-table queue-table'},
      recent.length ? table(['Orden / lector','Nombre','Solicitud','Estado','Fecha límite','Acción'],recent.map(r=>[
        r.status==='held'?'Turno actual':r.status==='waiting'?String(r.position??'—').padStart(2,'0'):'—',el('strong',{},getUser(r.userId)?.name??'—'),date(r.createdAt),
        reservationLabels[r.status]??r.status,el('span',{class:'queue-date'},r.status==='held'?date(r.expiresAt):'Sin asignar'),cancelButton(r)]),'Reservas por título') : empty('No hay reservas para este título.')),
    held&&el('aside',{class:'rule-band queue-band'},el('h3',{},held.copyId+' está reservado para '+(getUser(held.userId)?.name??'la primera persona')+'.'),
      el('p',{},'Plazo de recogida hasta el '+date(held.expiresAt)+'. El ejemplar no está disponible para préstamo general.')),
    el('div',{class:'actions staff-actions'},
      held&&button('Cancelar reserva de '+(getUser(held.userId)?.name.split(' ')[0]??'lector'),()=>confirmAction('¿Cancelar la reserva ofrecida? El ejemplar pasará al siguiente turno si hay cola.',
        ()=>mutate('reservations/'+encodeURIComponent(held.id)+'/cancel',{},'Reserva cancelada. La lista de espera se actualizó.')),'ghost'),
      button('Simular vencimiento · +2 días',()=>confirmAction('¿Adelantar la fecha de demostración 2 días? Se actualizarán las reservas cuyo plazo haya vencido.',()=>mutate('demo/advance',{days:2},'Fecha adelantada. Revisa los plazos y el nuevo turno.')),'ghost'))];
}
function inventoryView() {
  const tabs=[['libros','Libros'],['ejemplares','Ejemplares'],['usuarios','Usuarios']];
  const navTabs=el('div',{class:'actions tabs','aria-label':'Secciones de gestión'},tabs.map(([key,label])=>el('button',{type:'button',class:'nav-button','aria-pressed':String(managementTab===key),onclick:()=>{managementTab=key;render();}},label)));
  const copyLabel={available:['Disponible',''],held:['Reservado','warn'],loaned:['Prestado','neutral']};
  let headings,rows;
  if(managementTab==='ejemplares'){headings=['Código de ejemplar','Título','Estado'];rows=state.copies.map(c=>[c.id,getBook(c.bookId)?.title??'—',badge(...(copyLabel[c.status]??['No disponible','neutral']))]);}
  else if(managementTab==='usuarios'){headings=['Nombre','Identificador','Perfil','Préstamos activos'];rows=state.users.map(u=>[u.name,u.id,u.role==='lector'?'Lector':'Bibliotecario',liveLoans().filter(l=>l.userId===u.id).length]);}
  else {headings=['Título','Autor','Categoría','ISBN','Ejemplares disponibles'];rows=state.books.map(b=>[el('strong',{},b.title),b.author,b.category,b.isbn??'—',bookCopies(b.id).filter(c=>c.status==='available').length]);}
  return [title('Gestión','Gestión del catálogo','Consulta libros, ejemplares y usuarios de la demostración.',true),navTabs,
    el('section',{class:'staff-table'},table(headings,rows,'Inventario de '+managementTab))];
}
function reportsView() {
  const loans=liveLoans(), overdue=overdueLoans(), returned=state.loans.filter(l=>Boolean(l.returnedAt));
  const rows=(reportTab==='vencidos'?overdue:reportTab==='activos'?loans:returned).map(l=>[getUser(l.userId)?.name??'—',loanTitle(l),l.copyId,date(l.startedAt),date(l.dueAt),date(l.returnedAt),loanStatus(l)]);
  const filters=[['vencidos','Préstamos vencidos'],['activos','Préstamos activos'],['devueltos','Devoluciones']];
  const navTabs=el('div',{class:'actions tabs','aria-label':'Tipos de reporte'},filters.map(([key,label])=>el('button',{type:'button',class:'nav-button','aria-pressed':String(reportTab===key),onclick:()=>{reportTab=key;render();}},label)));
  return [title('Reportes','Actividad de la biblioteca','Indicadores calculados a partir de los registros de demostración.',true),
    el('div',{class:'stats'},stat('Préstamos activos',loans.length,'Incluye los vencidos'),stat('Préstamos vencidos',overdue.length,'Aún sin devolución','stat-red'),stat('Devoluciones',returned.length,'Total registrado')),
    navTabs,rows.length ? el('section',{class:'staff-table'},table(['Lector','Título','Ejemplar','Inicio','Vence','Devuelto','Estado'],rows,'Reporte de '+reportTab)) : empty('No se encontraron registros para este reporte.')];
}
function render() {
  nav.replaceChildren();
  const sidebar=document.querySelector('#sidebar');
  sidebar?.replaceChildren();
  document.body.dataset.screen=!state.actor?'acceso':staff()?'interno':screen;
  document.querySelector('#clock').textContent='Datos ficticios · Simulación al '+date(state.today);
  document.querySelector('#footer-copy').textContent=staff()?'Biblioteca Campus · Gestión interna':'© 2026 Biblioteca Campus';
  document.querySelector('#mobile-label').textContent=staff()?'Gestión interna':'Biblioteca';
  if (!state.actor) { main.replaceChildren(loginView()); return; }
  const logout=()=>mutate('logout',{},null,()=>{screen='catalogo';filters={q:'',author:'',category:''};});
  if(staff()){
    nav.append(el('span',{class:'staff-space'},'Espacio bibliotecario'),el('span',{class:'staff-date'},date(state.today)),button('Salir',logout,'ghost'));
    const current=screen==='prestamo-resultado'?'prestamos':screen;
    sidebar?.append(el('nav',{'aria-label':'Secciones bibliotecario'},staffTabs.map(([key,icon,label])=>el('button',{type:'button',class:'nav-button','aria-current':key===current?'page':null,onclick:()=>navigate(key)},el('span',{'aria-hidden':'true'},icon),label))),
      el('div',{class:'staff-session'},el('span',{},'Sesión de ejemplo'),el('strong',{},state.actor.name),el('small',{},'Bibliotecario')));
  }else{
    for(const [view,label] of [['catalogo','Catálogo'],['cuenta','Mi cuenta']])nav.append(el('button',{type:'button',class:'nav-button','aria-current':(screen===view||(screen==='detalle'&&view==='catalogo'))?'page':null,onclick:()=>navigate(view)},label));
    nav.append(el('div',{class:'reader-session'},el('strong',{},state.actor.name),el('small',{},'Estudiante')),button('Salir',logout,'ghost'));
  }
  const views=staff()?{gestion:managementView,inventario:inventoryView,prestamos:loansView,'prestamo-resultado':outcomeView,reservas:staffReservationsView,reportes:reportsView,catalogo:catalogView,detalle:detailView}:{catalogo:catalogView,cuenta:accountView,detalle:detailView};
  const content=(views[screen]??(staff()?managementView:catalogView))();
  main.replaceChildren(...(Array.isArray(content)?content:[content]));
}

refresh().then(()=>{if(staff()) navigate('gestion');}).catch(()=>main.replaceChildren(
  title('Biblioteca Campus','No se pudo conectar.','Verifica que el servidor local esté ejecutándose y vuelve a intentar.'),
  button('Reintentar',()=>window.location.reload())));
