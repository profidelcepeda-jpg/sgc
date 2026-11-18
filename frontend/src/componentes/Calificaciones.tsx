import { useEffect, useMemo, useState } from 'react'
import { api, mensajeDeError } from '../lib/api'
import type { GridCalificaciones, OpcionCalificacion } from '../tipos'

const CAMPOS = [...Array.from({ length: 4 }, (_, p) => [...Array.from({ length: 4 }, (_, c) => `P${p + 1}C${c + 1}`), ...Array.from({ length: 4 }, (_, c) => `R${p + 1}C${c + 1}`)]).flat(), 'CEC', 'CEEX', 'CESP']
const ETIQUETAS: Record<string, string> = { CEC: 'Completiva', CEEX: 'Extraordinaria', CESP: 'Especial' }
type Edits = Record<string, Record<string, number | null>>

export function Calificaciones() {
  const [opciones, setOpciones] = useState<OpcionCalificacion[]>([])
  const [grupo, setGrupo] = useState('')
  const [asignatura, setAsignatura] = useState('')
  const [grid, setGrid] = useState<GridCalificaciones | null>(null)
  const [edits, setEdits] = useState<Edits>({})
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [errores, setErrores] = useState<Array<{ estudiante: string; errores: Array<{ campo: string; mensaje: string }> }>>([])
  const seleccion = useMemo(() => opciones.find(o => o.ano + '|' + o.seccion === grupo), [opciones, grupo])

  useEffect(() => { api<{ opciones: OpcionCalificacion[] }>('/api/grades/options').then(r => setOpciones(r.opciones)).catch(e => setMensaje(mensajeDeError(e))) }, [])
  async function cargar() {
    if (!seleccion || !asignatura) return
    setCargando(true); setMensaje(''); setErrores([])
    try { const data = await api<GridCalificaciones>(`/api/grades/grid?ano=${encodeURIComponent(seleccion.ano)}&seccion=${encodeURIComponent(seleccion.seccion)}&asignatura=${encodeURIComponent(asignatura)}`); setGrid(data); setEdits({}) }
    catch (e) { setGrid(null); setMensaje(mensajeDeError(e)) } finally { setCargando(false) }
  }
  function editar(estudiante: string, campo: string, value: string) {
    const n = value === '' ? null : Number(value)
    setEdits(prev => ({ ...prev, [estudiante]: { ...prev[estudiante], [campo]: n } }))
  }
  async function guardar() {
    if (!grid || !Object.keys(edits).length) return
    setCargando(true); setMensaje('')
    try {
      const r = await api<{ resultados: typeof errores }>('/api/grades/batch', { method: 'POST', body: { ano: grid.ano, seccion: grid.seccion, asignatura: grid.asignatura, filas: Object.entries(edits).map(([idEstudiante, cambios]) => ({ idEstudiante, cambios })) } })
      setErrores(r.resultados); setMensaje(r.resultados.length ? 'Hay filas con errores; revise el detalle.' : 'Calificaciones guardadas.')
      await cargar()
    } catch (e) { setMensaje(mensajeDeError(e)) } finally { setCargando(false) }
  }
  return <section className="calificaciones">
    <div className="tarjeta calificaciones-filtros">
      <div><h2>Registro de calificaciones</h2><p className="texto-secundario">Los resultados y promedios se calculan en el servidor.</p></div>
      <label>Año y sección<select value={grupo} onChange={e => { setGrupo(e.target.value); setAsignatura(''); setGrid(null) }}><option value="">Seleccione…</option>{opciones.map(o => <option key={o.ano+'|'+o.seccion} value={o.ano+'|'+o.seccion}>{o.ano} · {o.seccionTexto}</option>)}</select></label>
      <label>Asignatura<select value={asignatura} onChange={e => { setAsignatura(e.target.value); setGrid(null) }} disabled={!seleccion}><option value="">Seleccione…</option>{seleccion?.asignaturas.map(a => <option key={a.id} value={a.id}>{a.texto}</option>)}</select></label>
      <button className="boton secundario" onClick={() => void cargar()} disabled={!seleccion || !asignatura || cargando}>Consultar</button>
      {grid?.puedeEditar && <button className="boton primario" onClick={() => void guardar()} disabled={!Object.keys(edits).length || cargando}>Guardar cambios</button>}
    </div>
    {mensaje && <p className="mensaje-calificaciones" role="status">{mensaje}</p>}
    {errores.map(f => <p className="error-calificaciones" key={f.estudiante}>{f.estudiante}: {f.errores.map(e => `${e.campo} ${e.mensaje}`).join(' · ')}</p>)}
    {grid && <div className="tabla-calificaciones-wrap"><table className="tabla-calificaciones"><thead><tr><th>#</th><th>Estudiante</th>{CAMPOS.map(c => <th key={c}>{ETIQUETAS[c] || c}</th>)}<th>CF</th><th>Estado</th></tr></thead><tbody>{grid.estudiantes.map(e => { const calc=e.calculo as {cf?:number|null;estado?:string|null;pcMostrar?:Array<number|null>}; return <tr key={e.id}><td>{e.numLista}</td><th>{e.nombre}</th>{CAMPOS.map(c => { const stage=({CEC:'COMPLETIVA',CEEX:'EXTRAORDINARIA',CESP:'ESPECIAL'} as Record<string,string>)[c]; const per=/^[PR](\d)/.exec(c); const period=per ? grid.periodos[Number(per[1])-1] : null; const closed=period?.estado==='CERRADO' || (!!stage && grid.etapas?.[stage]?.estado==='CERRADO'); const value=Object.prototype.hasOwnProperty.call(edits[e.id] || {}, c) ? edits[e.id][c] : e.notas[c]; return <td key={c}><input aria-label={`${e.nombre} ${c}`} type="number" min="0" max="100" step="1" value={value ?? ''} disabled={!grid.puedeEditar || closed} onChange={ev=>editar(e.id,c,ev.target.value)} /></td> })}<td>{calc.cf ?? '—'}</td><td>{calc.estado || 'Pendiente'}</td></tr> })}</tbody></table></div>}
  </section>
}
