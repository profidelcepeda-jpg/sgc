import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../lib/api'
import { LogoInstitucional } from './LogoInstitucional'
import type { CampoConfiguracion, ConfiguracionSistema } from '../tipos'

type Pestana = 'general' | 'ano' | 'periodos' | 'academica' | 'calificaciones' | 'observaciones' | 'reportes' | 'seguridad'
const PESTANAS: Array<{ id: Pestana; nombre: string }> = [
  { id: 'general', nombre: 'General' }, { id: 'ano', nombre: 'Año escolar' }, { id: 'periodos', nombre: 'Períodos' },
  { id: 'academica', nombre: 'Académica' }, { id: 'calificaciones', nombre: 'Calificaciones' }, { id: 'observaciones', nombre: 'Observaciones' },
  { id: 'reportes', nombre: 'Reportes' }, { id: 'seguridad', nombre: 'Seguridad' },
]

export function Configuracion({ onModulo }: { onModulo: (id: string | null) => void }) {
  const [data, setData] = useState<ConfiguracionSistema | null>(null)
  const [pestana, setPestana] = useState<Pestana>('general')
  const [valores, setValores] = useState<Record<string, string>>({})
  const [ano, setAno] = useState('')
  const [inicio, setInicio] = useState('')
  const [cierre, setCierre] = useState('')
  const [tipos, setTipos] = useState<Array<{ codigo: string; nombre: string; activo: boolean }>>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  async function cargar() {
    setCargando(true); setError('')
    try {
      const r = await api<ConfiguracionSistema>('/api/configuration')
      setData(r); setTipos(r.tiposObservacion)
      const all = [...r.general, ...r.seguridad, ...r.academica, ...r.reportes.opciones]
      setValores(Object.fromEntries(all.map(x => [x.clave, x.valor])))
      const actual = r.anos.find(x => x.id === r.general.find(c => c.clave === 'ANO_ESCOLAR')?.valor) || r.anos[0]
      if (actual) { setAno(actual.id); setInicio(actual.inicio); setCierre(actual.cierre) }
    } catch (e) { setError(mensajeDeError(e)) } finally { setCargando(false) }
  }
  useEffect(() => {
    let mounted = true
    api<ConfiguracionSistema>('/api/configuration').then(r => {
      if (!mounted) return
      setData(r); setTipos(r.tiposObservacion)
      const all = [...r.general, ...r.seguridad, ...r.academica, ...r.reportes.opciones]
      setValores(Object.fromEntries(all.map(x => [x.clave, x.valor])))
      const actual = r.anos.find(x => x.id === r.general.find(c => c.clave === 'ANO_ESCOLAR')?.valor) || r.anos[0]
      if (actual) { setAno(actual.id); setInicio(actual.inicio); setCierre(actual.cierre) }
    }).catch(e => { if (mounted) setError(mensajeDeError(e)) }).finally(() => { if (mounted) setCargando(false) })
    return () => { mounted = false }
  }, [])

  function editar(clave: string, valor: string) { setValores(v => ({ ...v, [clave]: valor })); setAviso('') }
  async function guardarGrupo(grupo: string, campos: CampoConfiguracion[]) {
    setCargando(true); setError(''); setAviso('')
    try {
      const cambios = Object.fromEntries(campos.filter(c => c.editable).map(c => [c.clave, valores[c.clave] ?? c.valor]))
      const r = await api<{ cambios: number }>(`/api/configuration/${grupo}`, { method: 'PATCH', body: { cambios } })
      setAviso(`${r.cambios} parámetro(s) actualizado(s).`); await cargar()
    } catch (e) { setError(mensajeDeError(e)) } finally { setCargando(false) }
  }
  async function guardarFechas() {
    if (!ano) return
    setCargando(true); setError(''); setAviso('')
    try { const r = await api<{ cambios: number }>(`/api/configuration/school-years/${encodeURIComponent(ano)}/dates`, { method: 'PATCH', body: { inicio, cierre } }); setAviso(`${r.cambios} fecha(s) de año escolar guardada(s).`); await cargar() }
    catch (e) { setError(mensajeDeError(e)) } finally { setCargando(false) }
  }
  async function guardarTipos() {
    setCargando(true); setError(''); setAviso('')
    try { await api('/api/configuration/observation-types', { method: 'PUT', body: { tipos } }); setAviso('Tipos de observación actualizados. Los registros históricos se conservan.'); await cargar() }
    catch (e) { setError(mensajeDeError(e)) } finally { setCargando(false) }
  }
  function agregarTipo() { setTipos(xs => [...xs, { codigo: '', nombre: '', activo: true }]) }

  function campos(fields: CampoConfiguracion[], grupo: string) {
    return <><div className="configuracion-campos">{fields.map(c => <label key={c.clave}>{c.nombre}{c.clave === 'ANO_ESCOLAR' && data?.anos.length ? <select value={valores[c.clave] || ''} onChange={e => editar(c.clave, e.target.value)}>{data.anos.map(y => <option key={y.id} value={y.id}>{y.id}</option>)}</select> : c.clave === 'FORMATO_PAPEL' || c.clave === 'ORIENTACION_IMPRESION' ? <select value={valores[c.clave] || c.valor} onChange={e => editar(c.clave, e.target.value)}>{(c.clave === 'FORMATO_PAPEL' ? ['A4','LETTER','LEGAL'] : ['LANDSCAPE','PORTRAIT']).map(x=><option key={x} value={x}>{x}</option>)}</select> : <input value={valores[c.clave] ?? c.valor} readOnly={!c.editable} type={c.clave.includes('MIN') || c.clave.includes('INTENTOS') || c.clave === 'FILAS_POR_PAGINA' ? 'number' : 'text'} onChange={e => editar(c.clave, e.target.value)} />}</label>)}</div><button className="boton primario" disabled={cargando} onClick={() => void guardarGrupo(grupo, fields)}>Guardar cambios</button></>
  }
  const porAno = data?.periodos.filter(p => p.ano === ano) || []

  return <section className="configuracion">
    <div className="tarjeta configuracion-intro"><div><h2>Configuración del SGA</h2><p>Administre parámetros del centro y consulte las reglas que utilizan los módulos académicos.</p></div><span>Versión {data?.version || '—'}</span></div>
    {error && <p className="error-calificaciones" role="alert">{error}</p>}{aviso && <p className="mensaje-calificaciones" role="status">{aviso}</p>}
    <div className="configuracion-layout">
      <nav className="tarjeta configuracion-nav" aria-label="Categorías de configuración">{PESTANAS.map(x => <button key={x.id} className={pestana === x.id ? 'activo' : ''} onClick={() => setPestana(x.id)}>{x.nombre}</button>)}</nav>
      <article className="tarjeta configuracion-panel" aria-busy={cargando}>
        {pestana === 'general' && <><h3>General</h3><p>El año activo debe existir y tener configurados los cuatro períodos regulares.</p><div className="configuracion-logo-centro"><LogoInstitucional className="configuracion-logo" src={data?.reportes.centro.LOGO_CENTRO}/><div><strong>Identidad institucional</strong><p>Este logo se utiliza en el sistema y en el encabezado de los boletines.</p></div></div>{data && campos(data.general, 'general')}</>}
        {pestana === 'ano' && <><h3>Año escolar</h3><p>Las fechas se guardan como parámetros asociados al año. Los cursos y períodos permanecen en sus catálogos actuales.</p><div className="configuracion-campos"><label>Año escolar<select value={ano} onChange={e => { const y = data?.anos.find(x => x.id === e.target.value); setAno(e.target.value); setInicio(y?.inicio || ''); setCierre(y?.cierre || '') }}>{data?.anos.map(y => <option key={y.id} value={y.id}>{y.id}</option>)}</select></label><label>Fecha de inicio<input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></label><label>Fecha de cierre<input type="date" value={cierre} onChange={e => setCierre(e.target.value)} /></label></div><button className="boton primario" disabled={cargando || !ano} onClick={() => void guardarFechas()}>Guardar fechas</button></>}
        {pestana === 'periodos' && <><h3>Períodos</h3><p>La administración y el cierre de períodos reutilizan el módulo existente, con sus permisos actuales.</p><button className="boton primario" onClick={() => onModulo('periodos')}>Administrar períodos</button><div className="tabla-calificaciones-wrap"><table className="tabla-configuracion"><thead><tr><th>Período</th><th>Año</th><th>Tipo</th><th>Meses</th><th>Estado</th></tr></thead><tbody>{porAno.map(p => <tr key={p.id}><td>{p.codigo} · {p.nombre}</td><td>{p.ano}</td><td>{p.etapa || p.tipo}</td><td>{p.meses.join(', ') || '—'}</td><td>{p.estado}</td></tr>)}{porAno.length === 0 && <tr><td colSpan={5}>No hay períodos cargados para este año.</td></tr>}</tbody></table></div></>}
        {pestana === 'academica' && <><h3>Configuración académica</h3><p>Los catálogos no se duplican aquí; use los mantenimientos del área Gestión académica del menú lateral.</p>{data && campos(data.academica, 'academica')}</>}
        {pestana === 'calificaciones' && <><h3>Parámetros de calificaciones</h3><p>Solo lectura. Estos valores los consume el servicio actual del motor. Su edición queda deshabilitada para proteger las reglas y resultados académicos vigentes.</p><div className="configuracion-campos">{data?.calificaciones.map(c => <label key={c.clave}>{c.nombre}<input readOnly value={c.valor} /></label>)}</div><p>Las reglas por asignatura —mínimo, recuperación y etapas— siguen administrándose en el catálogo de asignaturas.</p><button className="boton secundario" onClick={() => onModulo('asignaturas')}>Consultar asignaturas</button></>}
        {pestana === 'observaciones' && <><h3>Tipos de observación</h3><p>Desactivar un tipo impide su uso en nuevas observaciones; no elimina ni modifica las ya registradas.</p><div className="tabla-calificaciones-wrap"><table className="tabla-configuracion"><thead><tr><th>Código</th><th>Nombre visible</th><th>Activo</th></tr></thead><tbody>{tipos.map((t,i)=><tr key={`${t.codigo}-${i}`}><td><input aria-label="Código del tipo" value={t.codigo} onChange={e=>setTipos(xs=>xs.map((x,j)=>j===i?{...x,codigo:e.target.value}:x))} /></td><td><input aria-label="Nombre del tipo" value={t.nombre} onChange={e=>setTipos(xs=>xs.map((x,j)=>j===i?{...x,nombre:e.target.value}:x))} /></td><td><input aria-label="Tipo activo" type="checkbox" checked={t.activo} onChange={e=>setTipos(xs=>xs.map((x,j)=>j===i?{...x,activo:e.target.checked}:x))} /></td></tr>)}</tbody></table></div><div className="configuracion-acciones"><button className="boton secundario" onClick={agregarTipo}>Agregar tipo</button><button className="boton primario" disabled={cargando} onClick={() => void guardarTipos()}>Guardar tipos</button></div></>}
        {pestana === 'reportes' && <><h3>Reportes e impresión</h3><p>Los encabezados toman los datos del centro definidos en General. Los boletines y reportes conservan el formato actual.</p>{data && campos(data.reportes.opciones, 'reportes')}<div className="configuracion-centro">{Object.entries(data?.reportes.centro || {}).map(([k,v])=><span key={k}><b>{k.replaceAll('_',' ')}</b>: {v || '—'}</span>)}</div><button className="boton secundario" onClick={() => onModulo('reportes')}>Abrir reportes</button></>}
        {pestana === 'seguridad' && <><h3>Seguridad</h3><p>Estos parámetros afectan inicios de sesión futuros. Nunca se muestran PIN, contraseñas, hashes o tokens.</p>{data && campos(data.seguridad, 'seguridad')}</>}
      </article>
    </div>
  </section>
}
