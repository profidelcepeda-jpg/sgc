import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api, mensajeDeError } from '../lib/api'
import { formatearNumero, qs } from '../lib/formato'
import type { CalculoCalificacion, GridCalificaciones, MatrizAsistenciaIntegrada, OpcionCalificacion } from '../tipos'

const COMPETENCIAS = [
  { codigo: 'C1', abrev: 'CC' },
  { codigo: 'C2', abrev: 'CRP' },
  { codigo: 'C3', abrev: 'CEC' },
  { codigo: 'C4', abrev: 'CT' },
] as const

const ETAPAS = [
  { campo: 'CEC', etiqueta: 'C.E.C.', periodo: 'COMPLETIVA' },
  { campo: 'CEEX', etiqueta: 'C.E.EX', periodo: 'EXTRAORDINARIA' },
  { campo: 'CESP', etiqueta: 'C.E.', periodo: 'ESPECIAL' },
] as const

type Vista = 'periodos' | 'resultados' | 'asistencia'
type Filtro = 'todos' | 'rp' | 'incompletos'
type Edits = Record<string, Record<string, number | null>>
type ErroresFila = Array<{ estudiante: string; errores: Array<{ campo: string; mensaje: string }> }>

interface Props {
  permisos: Record<string, true>
}

function tieneCampo<T extends object>(obj: T, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function promedio(meses: string[], valores: Record<string, number | null>): number | null {
  const registros = meses.map(m => valores[m]).filter((v): v is number => v !== null && v !== undefined)
  return registros.length ? registros.reduce((total, v) => total + v, 0) / registros.length : null
}

function promedioValores(valores: Array<number | null>): number | null {
  const registros = valores.filter((v): v is number => v !== null)
  return registros.length ? registros.reduce((total, v) => total + v, 0) / registros.length : null
}

function tienePendiente(calculo: CalculoCalificacion): boolean {
  return calculo.periodos.some(p => p.pendientesRP > 0)
}

function estaIncompleto(calculo: CalculoCalificacion): boolean {
  return Boolean(calculo.estado?.includes('INCOMPLETO') || calculo.estado?.includes('PENDIENTE'))
}

export function Calificaciones({ permisos }: Props) {
  const [opciones, setOpciones] = useState<OpcionCalificacion[]>([])
  const [ano, setAno] = useState('')
  const [seccion, setSeccion] = useState('')
  const [asignatura, setAsignatura] = useState('')
  const [periodo, setPeriodo] = useState(1)
  const [vista, setVista] = useState<Vista>('periodos')
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [orden, setOrden] = useState<'lista' | 'nombre'>('lista')

  const [grid, setGrid] = useState<GridCalificaciones | null>(null)
  const [matriz, setMatriz] = useState<MatrizAsistenciaIntegrada | null>(null)
  const [edits, setEdits] = useState<Edits>({})
  const [editsAsistencia, setEditsAsistencia] = useState<Edits>({})
  const [cargandoOpciones, setCargandoOpciones] = useState(true)
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [errores, setErrores] = useState<ErroresFila>([])

  const puedeVerAsistencia = permisos['asistencia.ver'] === true
  const puedeRegistrarAsistencia = permisos['asistencia.registrar'] === true
  const puedeAdministrarNotas = permisos['calificaciones.administrar'] === true
  const seleccion = useMemo(
    () => opciones.find(o => o.ano === ano && o.seccion === seccion),
    [opciones, ano, seccion],
  )
  const anos = useMemo(() => Array.from(new Set(opciones.map(o => o.ano))).sort().reverse(), [opciones])
  const opcionesSeccion = useMemo(() => opciones.filter(o => o.ano === ano), [opciones, ano])
  const hayCambios = Object.keys(edits).length > 0 || Object.keys(editsAsistencia).length > 0
  const cargandoAsistencia = vista === 'asistencia' && Boolean(grid) && puedeVerAsistencia && !matriz && !mensaje

  useEffect(() => {
    let activo = true
    api<{ opciones: OpcionCalificacion[] }>('/api/grades/options')
      .then(r => {
        if (!activo) return
        setOpciones(r.opciones)
        if (r.opciones.length) setAno(r.opciones[0].ano)
      })
      .catch(e => {
        if (activo) setMensaje(mensajeDeError(e))
      })
      .finally(() => {
        if (activo) setCargandoOpciones(false)
      })
    return () => {
      activo = false
    }
  }, [])

  function confirmarDescarte(): boolean {
    return !hayCambios || window.confirm('Hay cambios sin guardar. ¿Desea descartarlos?')
  }

  function limpiarSeleccion(): void {
    setGrid(null)
    setMatriz(null)
    setEdits({})
    setEditsAsistencia({})
    setErrores([])
    setMensaje('')
  }

  async function consultar(e?: FormEvent): Promise<void> {
    e?.preventDefault()
    if (!seleccion || !asignatura) return
    if (!confirmarDescarte()) return
    setCargando(true)
    setMensaje('')
    setErrores([])
    try {
      const data = await api<GridCalificaciones>(`/api/grades/grid?${qs({
        ano: seleccion.ano,
        seccion: seleccion.seccion,
        asignatura,
      })}`)
      setGrid(data)
      setMatriz(null)
      setEdits({})
      setEditsAsistencia({})
    } catch (e) {
      setMensaje(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }

  const refrescarMatriz = useCallback(async function (): Promise<void> {
    if (!grid || !puedeVerAsistencia) return
    const data = await api<MatrizAsistenciaIntegrada>(`/api/attendance/matrix?${qs({
      ano: grid.ano,
      seccionId: grid.seccion,
      asignaturaId: grid.asignatura,
    })}`)
    setMatriz(data)
    setEditsAsistencia({})
  }, [grid, puedeVerAsistencia])

  useEffect(() => {
    if (vista !== 'asistencia' || !grid || !puedeVerAsistencia) return
    let activo = true
    api<MatrizAsistenciaIntegrada>(`/api/attendance/matrix?${qs({
      ano: grid.ano,
      seccionId: grid.seccion,
      asignaturaId: grid.asignatura,
    })}`)
      .then(data => {
        if (!activo) return
        setMatriz(data)
        setEditsAsistencia({})
      })
      .catch(e => {
        if (activo) setMensaje(mensajeDeError(e))
      })
    return () => {
      activo = false
    }
  }, [vista, grid, puedeVerAsistencia])

  const estudiantes = useMemo(() => {
    if (!grid) return []
    const nombre = busqueda.trim().toLocaleLowerCase('es')
    return grid.estudiantes
      .filter(e => !nombre || e.nombre.toLocaleLowerCase('es').includes(nombre))
      .filter(e => {
        if (filtro === 'rp') return tienePendiente(e.calculo)
        if (filtro === 'incompletos') return estaIncompleto(e.calculo)
        return true
      })
      .sort((a, b) => orden === 'lista'
        ? a.numLista - b.numLista
        : a.nombre.localeCompare(b.nombre, 'es'))
  }, [grid, busqueda, filtro, orden])

  function notaActual(idEstudiante: string, campo: string, valor: number | null): number | null {
    const cambios = edits[idEstudiante]
    return cambios && tieneCampo(cambios, campo) ? cambios[campo] : valor
  }

  function cambiarNota(idEstudiante: string, campo: string, valor: string): void {
    const nota = valor === '' ? null : Number(valor)
    const original = grid?.estudiantes.find(e => e.id === idEstudiante)?.notas[campo] ?? null
    setEdits(prev => {
      const row = { ...prev[idEstudiante] }
      if (nota === original) delete row[campo]
      else row[campo] = nota
      const next = { ...prev }
      if (Object.keys(row).length) next[idEstudiante] = row
      else delete next[idEstudiante]
      return next
    })
    setErrores(prev => prev.filter(f => f.estudiante !== idEstudiante))
    setMensaje('')
  }

  function cambiarAsistencia(idEstudiante: string, mes: string, valor: string): void {
    const porcentaje = valor === '' ? null : Number(valor)
    const original = matriz?.estudiantes.find(e => e.estudianteId === idEstudiante)?.meses[mes] ?? null
    setEditsAsistencia(prev => {
      const row = { ...prev[idEstudiante] }
      if (porcentaje === original) delete row[mes]
      else row[mes] = porcentaje
      const next = { ...prev }
      if (Object.keys(row).length) next[idEstudiante] = row
      else delete next[idEstudiante]
      return next
    })
    setMensaje('')
  }

  function puedeEditarNota(original: number | null): boolean {
    return Boolean(grid?.puedeEditar && (
      puedeAdministrarNotas || (original === null
        ? permisos['calificaciones.registrar'] === true
        : permisos['calificaciones.editar'] === true)
    ))
  }

  const guardarCalificaciones = useCallback(async function (): Promise<void> {
    if (!grid || !Object.keys(edits).length || cargando) return
    setCargando(true)
    setMensaje('')
    try {
      const res = await api<{ resultados: ErroresFila }>('/api/grades/batch', {
        method: 'POST',
        body: {
          ano: grid.ano,
          seccion: grid.seccion,
          asignatura: grid.asignatura,
          filas: Object.entries(edits).map(([idEstudiante, cambios]) => ({ idEstudiante, cambios })),
        },
      })
      setErrores(res.resultados)
      const fallidas = new Set(res.resultados.map(f => f.estudiante))
      setEdits(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => fallidas.has(id))))
      setMensaje(res.resultados.length ? 'Hay filas con errores; revise el detalle.' : 'Calificaciones guardadas.')
      const actualizada = await api<GridCalificaciones>(`/api/grades/grid?${qs({
        ano: grid.ano,
        seccion: grid.seccion,
        asignatura: grid.asignatura,
      })}`)
      setGrid(actualizada)
    } catch (e) {
      setMensaje(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }, [grid, edits, cargando])

  const guardarAsistencia = useCallback(async function (): Promise<void> {
    if (!matriz || !puedeRegistrarAsistencia || !Object.keys(editsAsistencia).length || cargando) return
    for (const [id, cambios] of Object.entries(editsAsistencia)) {
      for (const [mes, valor] of Object.entries(cambios)) {
        if (valor !== null && (!Number.isInteger(valor) || valor < 0 || valor > 100)) {
          const nombre = matriz.estudiantes.find(e => e.estudianteId === id)?.nombre || 'El estudiante'
          setMensaje(`${nombre}: la asistencia de ${mes} debe ser un porcentaje entero entre 0 y 100.`)
          return
        }
      }
    }

    setCargando(true)
    setMensaje('')
    try {
      const res = await api<{ guardados: number }>('/api/attendance/matrix', {
        method: 'POST',
        body: {
          ano: matriz.ano,
          asignaturaId: matriz.asignatura.id,
          seccionId: matriz.seccion.id,
          filas: Object.entries(editsAsistencia).map(([estudianteId, cambios]) => ({ estudianteId, cambios })),
        },
      })
      setMensaje(`Asistencia guardada (${res.guardados} celda(s) actualizada(s)).`)
      await refrescarMatriz()
    } catch (e) {
      setMensaje(mensajeDeError(e))
    } finally {
      setCargando(false)
    }
  }, [matriz, puedeRegistrarAsistencia, editsAsistencia, cargando, refrescarMatriz])

  const guardarCambios = useCallback(async function (): Promise<void> {
    if (Object.keys(edits).length) await guardarCalificaciones()
    if (Object.keys(editsAsistencia).length) await guardarAsistencia()
  }, [edits, editsAsistencia, guardarCalificaciones, guardarAsistencia])

  useEffect(() => {
    function atajoGuardar(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void guardarCambios()
      }
    }
    window.addEventListener('keydown', atajoGuardar)
    return () => window.removeEventListener('keydown', atajoGuardar)
  }, [guardarCambios])

  function cambiarAno(valor: string): void {
    if (!confirmarDescarte()) return
    setAno(valor)
    setSeccion('')
    setAsignatura('')
    limpiarSeleccion()
  }

  function cambiarSeccion(valor: string): void {
    if (!confirmarDescarte()) return
    setSeccion(valor)
    setAsignatura('')
    limpiarSeleccion()
  }

  function cambiarAsignatura(valor: string): void {
    if (!confirmarDescarte()) return
    setAsignatura(valor)
    limpiarSeleccion()
  }

  const mesesPorPeriodo = useMemo(() => {
    if (!matriz) return []
    return matriz.periodos.map(p => ({
      codigo: p.codigo,
      meses: matriz.meses.filter(m => p.meses.includes(m.codigo)),
    }))
  }, [matriz])

  const asistenciaPorEstudiante = useMemo(() => {
    if (!matriz) return new Map<string, MatrizAsistenciaIntegrada['estudiantes'][number]>()
    return new Map(matriz.estudiantes.map(e => [e.estudianteId, e]))
  }, [matriz])

  const puedeGuardar = Boolean(grid?.puedeEditar && Object.keys(edits).length > 0)
    || Boolean(matriz?.puedeRegistrar && puedeRegistrarAsistencia && Object.keys(editsAsistencia).length > 0)

  return (
    <section className="calificaciones">
      <form className="tarjeta calificaciones-filtros" onSubmit={e => void consultar(e)}>
        <div className="calificaciones-titulo">
          <h2>Calificaciones</h2>
          <p className="texto-secundario">Registro académico y seguimiento mensual en un mismo espacio.</p>
        </div>
        <label>
          Año escolar
          <select value={ano} onChange={e => cambiarAno(e.target.value)} disabled={cargandoOpciones}>
            <option value="">Seleccione…</option>
            {anos.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label>
          Curso
          <select value={seccion} onChange={e => cambiarSeccion(e.target.value)} disabled={!ano}>
            <option value="">Seleccione…</option>
            {opcionesSeccion.map(o => <option key={o.seccion} value={o.seccion}>{o.seccionTexto}</option>)}
          </select>
        </label>
        <label>
          Asignatura
          <select value={asignatura} onChange={e => cambiarAsignatura(e.target.value)} disabled={!seleccion}>
            <option value="">Seleccione…</option>
            {seleccion?.asignaturas.map(a => <option key={a.id} value={a.id}>{a.texto}</option>)}
          </select>
        </label>
        <button className="boton secundario" type="submit" disabled={!seleccion || !asignatura || cargando}>
          Consultar
        </button>
        <label>
          Buscar estudiante
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre…" />
        </label>
        <label>
          Filtro
          <select value={filtro} onChange={e => setFiltro(e.target.value as Filtro)}>
            <option value="todos">Todos</option>
            <option value="rp">Con RP pendiente</option>
            <option value="incompletos">Incompletos o pendientes</option>
          </select>
        </label>
        <label>
          Orden
          <select value={orden} onChange={e => setOrden(e.target.value as 'lista' | 'nombre')}>
            <option value="lista">Número de lista</option>
            <option value="nombre">Nombre (A-Z)</option>
          </select>
        </label>
        <button className="boton primario" type="button" onClick={() => void guardarCambios()} disabled={!puedeGuardar || cargando}>
          {cargando ? 'Guardando…' : 'Guardar (Ctrl+S)'}
        </button>
      </form>

      <nav className="calificaciones-vistas" aria-label="Vistas de calificaciones">
        <button type="button" className={vista === 'periodos' ? 'activa' : ''} aria-pressed={vista === 'periodos'} onClick={() => { setMensaje(''); setVista('periodos') }}>Períodos</button>
        <button type="button" className={vista === 'resultados' ? 'activa' : ''} aria-pressed={vista === 'resultados'} onClick={() => { setMensaje(''); setVista('resultados') }}>Resultados y evaluaciones finales</button>
        <button type="button" className={vista === 'asistencia' ? 'activa' : ''} aria-pressed={vista === 'asistencia'} onClick={() => { setMensaje(''); setVista('asistencia') }} disabled={!puedeVerAsistencia}>Asistencia</button>
      </nav>

      {vista === 'periodos' && (
        <div className="calificaciones-periodos" role="tablist" aria-label="Período de calificaciones">
          {[1, 2, 3, 4].map(p => (
            <button key={p} type="button" role="tab" aria-selected={periodo === p} className={periodo === p ? 'activa' : ''} onClick={() => setPeriodo(p)}>
              P{p}
            </button>
          ))}
        </div>
      )}

      {mensaje && <p className="mensaje-calificaciones" role="status">{mensaje}</p>}
      {errores.map(f => <p className="error-calificaciones" key={f.estudiante}>{f.estudiante}: {f.errores.map(e => `${e.campo} ${e.mensaje}`).join(' · ')}</p>)}

      {!grid ? (
        <div className="tarjeta"><p className="texto-secundario">Seleccione el año, curso y asignatura, y pulse Consultar.</p></div>
      ) : (
        <>
          <p className="texto-secundario">{grid.asignaturaTexto} · {grid.seccionTexto} · {estudiantes.length} estudiante(s)</p>

          {vista === 'periodos' && (
            <div className="tabla-calificaciones-wrap">
              <table className="tabla-calificaciones">
                <thead>
                  <tr>
                    <th rowSpan={2}>No.</th><th rowSpan={2}>Estudiante</th>
                    {COMPETENCIAS.map(c => <th key={c.codigo} colSpan={2}>{c.abrev}</th>)}
                    <th rowSpan={2}>Prom. P{periodo}</th><th rowSpan={2}>Estado</th>
                  </tr>
                  <tr>{COMPETENCIAS.map(c => <Fragment key={c.codigo}><th>P{periodo}</th><th>RP{periodo}</th></Fragment>)}</tr>
                </thead>
                <tbody>
                  {estudiantes.map(est => {
                    const per = grid.periodos[periodo - 1]
                    const estado = est.calculo.periodos[periodo - 1]?.estado || 'SIN NOTAS'
                    return <tr key={est.id}>
                      <td>{est.numLista}</td><th scope="row">{est.nombre}</th>
                      {COMPETENCIAS.map(c => {
                        const campoP = `P${periodo}${c.codigo}`
                        const campoR = `R${periodo}${c.codigo}`
                        const notaP = est.notas[campoP] ?? null
                        const notaR = est.notas[campoR] ?? null
                        const cerrado = per?.estado === 'CERRADO' && permisos['calificaciones.cerrar'] !== true
                        return <Fragment key={c.codigo}>
                          <td className="calificaciones-celda-nota">
                            <input aria-label={`${est.nombre} ${campoP}`} type="number" min="0" max="100" step="1" value={notaActual(est.id, campoP, notaP) ?? ''} disabled={!puedeEditarNota(notaP) || cerrado} onChange={e => cambiarNota(est.id, campoP, e.target.value)} />
                          </td>
                          <td className="calificaciones-celda-nota calificaciones-recuperacion">
                            <input aria-label={`${est.nombre} ${campoR}`} type="number" min="0" max="100" step="1" value={notaActual(est.id, campoR, notaR) ?? ''} disabled={!puedeEditarNota(notaR) || cerrado} onChange={e => cambiarNota(est.id, campoR, e.target.value)} />
                          </td>
                        </Fragment>
                      })}
                      <td>{formatearNumero(est.calculo.periodos[periodo - 1]?.promedio, 1)}</td>
                      <td><span className={`calificaciones-estado ${estado === 'COMPLETADO' ? 'completado' : estado === 'SIN NOTAS' ? 'sin-notas' : 'pendiente'}`}>{estado}</span></td>
                    </tr>
                  })}
                  {!estudiantes.length && <tr><td colSpan={12} className="calificaciones-vacio">No hay estudiantes que coincidan con el filtro.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {vista === 'resultados' && (
            <div className="tabla-calificaciones-wrap">
              <table className="tabla-calificaciones">
                <thead>
                  <tr><th rowSpan={2}>No.</th><th rowSpan={2}>Estudiante</th><th colSpan={4}>Promedio grupo de competencias (PC)</th><th rowSpan={2}>C.F.</th><th colSpan={2}>Completiva</th><th colSpan={2}>Extraordinaria</th><th rowSpan={2}>Especial</th><th rowSpan={2}>A</th><th rowSpan={2}>R</th><th rowSpan={2}>Estado</th></tr>
                  <tr><th>PC1</th><th>PC2</th><th>PC3</th><th>PC4</th><th>C.E.C.</th><th>C.C.F.</th><th>C.E.EX</th><th>C.EX.F.</th></tr>
                </thead>
                <tbody>
                  {estudiantes.map(est => {
                    const calc = est.calculo
                    const stateForStage = (stage: string) => grid.etapas?.[stage]?.estado
                    return <tr key={est.id}>
                      <td>{est.numLista}</td><th scope="row">{est.nombre}</th>
                      {[0, 1, 2, 3].map(i => <td key={i}>{formatearNumero(calc.pcMostrar[i], 1)}</td>)}
                      <td>{formatearNumero(calc.cf, 0)}</td>
                      {ETAPAS.map(et => {
                        const current = est.notas[et.campo] ?? null
                        const computed = et.campo === 'CEC' ? calc.comp.ccf : et.campo === 'CEEX' ? calc.ext.cexf : null
                        const habilitada = et.campo === 'CEC' ? calc.comp.habilitada : et.campo === 'CEEX' ? calc.ext.habilitada : calc.esp.habilitada
                        const valor = notaActual(est.id, et.campo, current)
                        const cerrado = stateForStage(et.periodo) === 'CERRADO' && permisos['calificaciones.cerrar'] !== true
                        return <td key={et.campo}>
                          <input aria-label={`${est.nombre} ${et.etiqueta}`} type="number" min="0" max="100" step="1" value={valor ?? ''} disabled={!puedeEditarNota(current) || !habilitada || cerrado} onChange={e => cambiarNota(est.id, et.campo, e.target.value)} />
                          {et.campo !== 'CESP' && <small className="calificaciones-derivado">{formatearNumero(computed, 0)}</small>}
                        </td>
                      })}
                      <td>{formatearNumero(calc.A, 0)}</td><td>{formatearNumero(calc.R, 0)}</td>
                      <td><span className={`calificaciones-estado ${calc.estado === 'LOGRADO' ? 'completado' : estaIncompleto(calc) ? 'pendiente' : 'sin-notas'}`}>{calc.estado || 'Pendiente'}</span></td>
                    </tr>
                  })}
                  {!estudiantes.length && <tr><td colSpan={15} className="calificaciones-vacio">No hay estudiantes que coincidan con el filtro.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {vista === 'asistencia' && (
            !puedeVerAsistencia ? <p className="aviso error">No tiene permiso para consultar asistencia.</p>
              : cargandoAsistencia ? <p role="status">Cargando asistencia mensual…</p>
                : !matriz ? <p className="aviso error">No se pudo cargar la matriz de asistencia.</p>
                  : (
                    <div className="tabla-calificaciones-wrap">
                      <table className="tabla-calificaciones tabla-asistencia-integrada">
                        <thead>
                          <tr>
                            <th rowSpan={2}>No.</th><th rowSpan={2}>Estudiante</th>
                            {mesesPorPeriodo.map(p => <th key={p.codigo} colSpan={p.meses.length + 1}>{p.codigo}</th>)}
                            <th rowSpan={2}>Promedio anual</th>
                          </tr>
                          <tr>
                            {mesesPorPeriodo.flatMap(p => [
                              ...p.meses.map(m => <th key={`${p.codigo}-${m.codigo}`}>{m.nombre.slice(0, 3)}</th>),
                              <th className="calificaciones-resumen-mes" key={`${p.codigo}-prom`}>{p.codigo} %</th>,
                            ])}
                          </tr>
                        </thead>
                        <tbody>
                          {estudiantes.map(est => {
                            const fila = asistenciaPorEstudiante.get(est.id)
                            if (!fila) return null
                            const meses = { ...fila.meses, ...editsAsistencia[est.id] }
                            const promedios = mesesPorPeriodo.map(p => promedio(p.meses.map(m => m.codigo), meses))
                            return <tr key={est.id}>
                              <td>{est.numLista}</td><th scope="row">{est.nombre}</th>
                              {mesesPorPeriodo.flatMap((p, index) => [
                                ...p.meses.map(m => {
                                  const valor = tieneCampo(editsAsistencia[est.id] || {}, m.codigo)
                                    ? editsAsistencia[est.id][m.codigo]
                                    : fila.meses[m.codigo] ?? null
                                  return <td className="calificaciones-celda-asistencia" key={`${p.codigo}-${m.codigo}`}>
                                    <input aria-label={`${est.nombre} ${m.nombre}`} type="number" min="0" max="100" step="1" value={valor ?? ''} disabled={!puedeRegistrarAsistencia || !matriz.puedeRegistrar || cargando} onChange={e => cambiarAsistencia(est.id, m.codigo, e.target.value)} />
                                  </td>
                                }),
                                <td className="calificaciones-resumen-mes" key={`${p.codigo}-prom`}>{formatearNumero(promedios[index], 1)}</td>,
                              ])}
                              <td>{formatearNumero(promedioValores(promedios), 1)}</td>
                            </tr>
                          })}
                          {!estudiantes.length && <tr><td colSpan={3 + mesesPorPeriodo.reduce((n, p) => n + p.meses.length + 1, 0)} className="calificaciones-vacio">No hay estudiantes que coincidan con el filtro.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )
          )}
        </>
      )}
    </section>
  )
}
