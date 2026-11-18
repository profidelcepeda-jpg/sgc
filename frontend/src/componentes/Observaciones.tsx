import { useEffect, useMemo, useState } from 'react'
import { api, mensajeDeError } from '../lib/api'
import type { ListadoObservaciones, OpcionObservaciones, OpcionSeccionObservaciones, ObservacionItem } from '../tipos'

interface Draft { id?:string; idEstudiante:string; tipo:string; fecha:string; idAsignatura:string; asignaturaActual:string; idPeriodo:string; periodoActual:string; texto:string }
interface Filtros { ano:string; seccion:string; estudiante:string; tipo:string; q:string; incluirAnuladas:boolean; pag:number }
const hoy=()=>new Date().toISOString().slice(0,10)
const ETIQUETAS:Record<string,string>={ACADEMICA:'Académica',CONDUCTA:'Conducta',ASISTENCIA:'Asistencia',FAMILIA:'Familia',OTRA:'Otra'}

export function Observaciones(){
 const [secciones,setSecciones]=useState<OpcionSeccionObservaciones[]>([]),[ano,setAno]=useState(''),[seccion,setSeccion]=useState(''),[opciones,setOpciones]=useState<OpcionObservaciones|null>(null)
 const [listado,setListado]=useState<ListadoObservaciones|null>(null),[draft,setDraft]=useState<Draft|null>(null),[filtros,setFiltros]=useState<Filtros>({ano:'',seccion:'',estudiante:'',tipo:'',q:'',incluirAnuladas:false,pag:1})
 const [cargando,setCargando]=useState(false),[error,setError]=useState(''),[aviso,setAviso]=useState('')
 const anos=useMemo(()=>Array.from(new Set(secciones.map(s=>s.ano))).sort().reverse(),[secciones]);
 const seccionesAno=useMemo(()=>secciones.filter(s=>s.ano===ano),[secciones,ano]);
 useEffect(()=>{api<{opciones:OpcionSeccionObservaciones[]}>('/api/observations/sections').then(r=>setSecciones(r.opciones)).catch(e=>setError(mensajeDeError(e)))},[])

 async function cargarListado(f:Filtros){
  if(!f.ano||!f.seccion){setListado(null);return}
  setCargando(true);setError('')
  try{const params=new URLSearchParams({ano:f.ano,seccion:f.seccion,pag:String(f.pag),tam:'25'});if(f.estudiante)params.set('estudiante',f.estudiante);if(f.tipo)params.set('tipo',f.tipo);if(f.q)params.set('q',f.q);if(f.incluirAnuladas)params.set('incluirAnuladas','1');setListado(await api<ListadoObservaciones>(`/api/observations?${params.toString()}`))}
  catch(e){setError(mensajeDeError(e))}finally{setCargando(false)}
 }
 async function seleccionarSeccion(year:string,id:string){
  setAno(year);setSeccion(id);setDraft(null);setAviso('');setError('');setFiltros(f=>({...f,ano:year,seccion:id,estudiante:'',pag:1}));setListado(null);setOpciones(null)
  if(!year||!id)return
  setCargando(true)
  try{const [op]=await Promise.all([api<OpcionObservaciones>(`/api/observations/options?ano=${encodeURIComponent(year)}&seccion=${encodeURIComponent(id)}`),cargarListado({ano:year,seccion:id,estudiante:'',tipo:filtros.tipo,q:filtros.q,incluirAnuladas:filtros.incluirAnuladas,pag:1})]);setOpciones(op)}
  catch(e){setError(mensajeDeError(e))}finally{setCargando(false)}
 }
 function cambioFiltro<K extends keyof Filtros>(key:K,value:Filtros[K]){setFiltros(f=>({...f,[key]:value,pag:1}))}
 function nueva(){if(!opciones||!opciones.tipos.length)return;const selected=filtros.estudiante||opciones.estudiantes.find(e=>e.activo)?.id||'';setDraft({idEstudiante:selected,tipo:opciones.tipos[0].codigo,fecha:hoy(),idAsignatura:'',asignaturaActual:'',idPeriodo:'',periodoActual:'',texto:''});setError('');setAviso('')}
 function editar(item:ObservacionItem){setDraft({id:item.id,idEstudiante:item.idEstudiante,tipo:item.tipo,fecha:item.fecha,idAsignatura:item.idAsignatura||'',asignaturaActual:item.asignatura,idPeriodo:item.idPeriodo||'',periodoActual:item.periodo,texto:item.texto});setError('');setAviso('')}
 function cambiarDraft<K extends keyof Draft>(key:K,value:Draft[K]){setDraft(d=>d?{...d,[key]:value}:d)}
 async function guardar(){
  if(!draft||!ano||!seccion)return;setCargando(true);setError('');setAviso('')
  const body={ano,seccion,idEstudiante:draft.idEstudiante,tipo:draft.tipo,fecha:draft.fecha,idAsignatura:draft.idAsignatura,idPeriodo:draft.idPeriodo,texto:draft.texto}
  try{if(draft.id)await api(`/api/observations/${encodeURIComponent(draft.id)}`,{method:'PATCH',body});else await api('/api/observations',{method:'POST',body});setDraft(null);setAviso('Observación guardada.');await cargarListado(filtros)}
  catch(e){setError(mensajeDeError(e))}finally{setCargando(false)}
 }
 async function estado(item:ObservacionItem,next:'ACTIVA'|'ANULADA'){
  const action=next==='ANULADA'?'anular':'restaurar';if(!window.confirm(`¿Desea ${action} esta observación?`))return;setCargando(true);setError('')
  try{if(next==='ANULADA')await api(`/api/observations/${encodeURIComponent(item.id)}`,{method:'DELETE'});else await api(`/api/observations/${encodeURIComponent(item.id)}/status`,{method:'PATCH',body:{estado:next}});setAviso(next==='ANULADA'?'Observación anulada.':'Observación restaurada.');await cargarListado(filtros)}catch(e){setError(mensajeDeError(e))}finally{setCargando(false)}
 }

 return <section className="observaciones">
  <div className="tarjeta observaciones-filtros no-print"><div><h2>Observaciones</h2><p className="texto-secundario">Registro e historial académico por estudiante y sección.</p></div>
   <label>Año escolar<select value={ano} onChange={e=>{setAno(e.target.value);setSeccion('');setOpciones(null);setListado(null);setDraft(null);setFiltros(f=>({...f,ano:e.target.value,seccion:'',estudiante:'',pag:1}))}}><option value="">Seleccione…</option>{anos.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
   <label>Curso / sección<select value={seccion} disabled={!ano} onChange={e=>void seleccionarSeccion(ano,e.target.value)}><option value="">Seleccione…</option>{seccionesAno.map(s=><option key={s.seccion} value={s.seccion}>{s.etiqueta.replace(`${s.ano} · `,'')}</option>)}</select></label>
   {opciones?.puedeRegistrar&&<button className="boton primario" onClick={nueva} disabled={!seccion||cargando}>Nueva observación</button>}
  </div>
  {error&&<p className="error-calificaciones" role="alert">{error}</p>}{aviso&&<p className="mensaje-calificaciones" role="status">{aviso}</p>}
  {opciones&&<>
   <div className="tarjeta observaciones-filtros no-print">
    <label>Estudiante<select value={filtros.estudiante} onChange={e=>cambioFiltro('estudiante',e.target.value)}><option value="">Todos</option>{opciones.estudiantes.map(e=><option key={e.id} value={e.id}>{e.num}. {e.nombre}{e.activo?'':' (retirado)'}</option>)}</select></label>
    <label>Tipo<select value={filtros.tipo} onChange={e=>cambioFiltro('tipo',e.target.value)}><option value="">Todos</option>{opciones.tipos.map(t=><option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}</select></label>
    <label>Buscar<input type="search" value={filtros.q} onChange={e=>cambioFiltro('q',e.target.value)} placeholder="Texto, estudiante…" /></label>
    <label className="observaciones-check"><span>Ver anuladas</span><input type="checkbox" checked={filtros.incluirAnuladas} onChange={e=>cambioFiltro('incluirAnuladas',e.target.checked)} /></label>
    <button className="boton secundario" onClick={()=>void cargarListado(filtros)} disabled={cargando}>Buscar</button>
   </div>
   {draft&&<form className="tarjeta observaciones-formulario no-print" onSubmit={e=>{e.preventDefault();void guardar()}}>
    <h3>{draft.id?'Editar observación':'Nueva observación'}</h3>
    <div className="observaciones-campos">
     <label>Estudiante<select required value={draft.idEstudiante} disabled={!!draft.id} onChange={e=>cambiarDraft('idEstudiante',e.target.value)}><option value="">Seleccione…</option>{opciones.estudiantes.filter(s=>s.activo||s.id===draft.idEstudiante).map(s=><option key={s.id} value={s.id}>{s.num}. {s.nombre}{s.activo?'':' (retirado)'}</option>)}</select></label>
     <label>Tipo<select required value={draft.tipo} onChange={e=>cambiarDraft('tipo',e.target.value)}>{draft.tipo&&!opciones.tipos.some(t=>t.codigo===draft.tipo)&&<option value={draft.tipo}>{ETIQUETAS[draft.tipo]||draft.tipo} (inactivo)</option>}{opciones.tipos.map(t=><option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}</select></label>
     <label>Fecha<input required type="date" value={draft.fecha} onChange={e=>cambiarDraft('fecha',e.target.value)} /></label>
     <label>Asignatura (opcional)<select value={draft.idAsignatura} onChange={e=>cambiarDraft('idAsignatura',e.target.value)}><option value="">Sin asignatura</option>{draft.idAsignatura&&!opciones.asignaturas.some(a=>a.id===draft.idAsignatura)&&<option value={draft.idAsignatura}>{draft.asignaturaActual}</option>}{opciones.asignaturas.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
     <label>Período (opcional)<select value={draft.idPeriodo} onChange={e=>cambiarDraft('idPeriodo',e.target.value)}><option value="">Sin período</option>{draft.idPeriodo&&!opciones.periodos.some(p=>p.id===draft.idPeriodo)&&<option value={draft.idPeriodo}>{draft.periodoActual}</option>}{opciones.periodos.map(p=><option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}</select></label>
    </div>
    <label>Observación<textarea required minLength={3} maxLength={600} rows={4} value={draft.texto} onChange={e=>cambiarDraft('texto',e.target.value)} /></label>
    <div className="observaciones-acciones"><button type="button" className="boton secundario" onClick={()=>setDraft(null)}>Cancelar</button><button className="boton primario" disabled={cargando}>{cargando?'Guardando…':'Guardar'}</button></div>
   </form>}
   <div className="tabla-calificaciones-wrap"><table className="tabla-observaciones"><thead><tr><th>Fecha</th><th>Estudiante</th><th>Tipo</th><th>Asignatura / período</th><th>Docente</th><th>Observación</th><th className="no-print">Acciones</th></tr></thead><tbody>
    {listado?.items.map(item=><tr key={item.id} className={item.estado==='ANULADA'?'observacion-anulada':''}><td>{item.fecha}</td><td>{item.estudiante}</td><td>{ETIQUETAS[item.tipo]||item.tipo}</td><td>{item.asignatura||'—'}{item.periodo?` · ${item.periodo}`:''}</td><td>{item.docente}</td><td className="observacion-texto">{item.texto}{item.estado==='ANULADA'?' (anulada)':''}</td><td className="no-print">{item.puedeEditar&&(item.estado==='ACTIVA'?<><button className="boton texto" onClick={()=>editar(item)}>Editar</button><button className="boton texto peligro" onClick={()=>void estado(item,'ANULADA')}>Anular</button></>:<button className="boton texto" onClick={()=>void estado(item,'ACTIVA')}>Restaurar</button>)}</td></tr>)}
    {listado&&listado.items.length===0&&<tr><td colSpan={7}>No hay observaciones con estos filtros.</td></tr>}
   </tbody></table></div>
   {listado&&<div className="observaciones-paginacion no-print"><span>{listado.total} observación(es) · Página {listado.pag} de {Math.max(1,listado.paginas)}</span><div><button className="boton secundario" disabled={listado.pag<=1||cargando} onClick={()=>{const f={...filtros,pag:listado.pag-1};setFiltros(f);void cargarListado(f)}}>Anterior</button><button className="boton secundario" disabled={listado.pag>=listado.paginas||cargando} onClick={()=>{const f={...filtros,pag:listado.pag+1};setFiltros(f);void cargarListado(f)}}>Siguiente</button></div></div>}
  </>}
 </section>
}
