import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api, mensajeDeError } from '../lib/api'
import { qs } from '../lib/formato'

interface Props {
  permisos: Record<string, true>
  idDocente?: string | null
}

interface Maestro {
  id: string
  nombreCompleto: string
}

interface CursoSeccion {
  cursoId: string
  grado: string
  seccionId: string
  seccion: string
  etiqueta: string
}

interface Clase {
  asignaturaId: string
  asignatura: string
  codigo: string
  cursos: CursoSeccion[]
}

interface MesInfo {
  codigo: string
  nombre: string
}

interface OpcionesRespuesta {
  anos: string[]
  anoSeleccionado: string
  esAdmin: boolean
  maestro: Maestro
  maestros: Maestro[]
  clases: Clase[]
  meses: MesInfo[]
  puedeRegistrar: boolean
}

interface EstudianteFila {
  estudianteId: string
  enrollmentId: string
  numLista: number
  nombre: string
  matricula: string | null
  porcentaje: number | null | string
}

interface PlanillaRespuesta {
  ano: string
  maestro: Maestro
  asignatura: { id: string; nombre: string; codigo: string }
  curso: { id: string; grado: string }
  seccion: { id: string; seccion: string; etiqueta: string }
  mes: { codigo: string; nombre: string }
  estudiantes: EstudianteFila[]
  puedeRegistrar: boolean
}

export function Asistencia({ permisos, idDocente }: Props) {
  const puedeVer = permisos['asistencia.ver'] === true
  const puedeRegistrar = permisos['asistencia.registrar'] === true

  const [cargandoOpciones, setCargandoOpciones] = useState(true)
  const [cargandoLista, setCargandoLista] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [avisoOk, setAvisoOk] = useState('')

  const [anos, setAnos] = useState<string[]>([])
  const [ano, setAno] = useState('')
  const [esAdmin, setEsAdmin] = useState(false)
  const [maestro, setMaestro] = useState<Maestro | null>(null)
  const [maestros, setMaestros] = useState<Maestro[]>([])
  const [docenteSeleccionado, setDocenteSeleccionado] = useState(idDocente || '')

  const [clases, setClases] = useState<Clase[]>([])
  const [claseId, setClaseId] = useState('')
  const [seccionId, setSeccionId] = useState('')

  const [meses, setMeses] = useState<MesInfo[]>([])
  const [mes, setMes] = useState('ago')

  const [estudiantes, setEstudiantes] = useState<EstudianteFila[]>([])
  const [modificado, setModificado] = useState(false)

  // Cursos/secciones disponibles para la clase (asignatura) seleccionada
  const cursosDisponibles = useMemo(() => {
    const c = clases.find(item => item.asignaturaId === claseId)
    return c?.cursos || []
  }, [clases, claseId])

  // Cargar opciones iniciales (maestro, clases, cursos, meses)
  useEffect(() => {
    if (!puedeVer) return
    let activo = true

    async function cargarInicial() {
      setCargandoOpciones(true)
      setError('')
      try {
        const query: Record<string, string> = {}
        if (ano) query.ano = ano
        if (docenteSeleccionado) query.docenteId = docenteSeleccionado

        const data = await api<OpcionesRespuesta>(`/api/attendance/options?${qs(query)}`)
        if (!activo) return

        setAnos(data.anos)
        setAno(data.anoSeleccionado)
        setEsAdmin(data.esAdmin)
        setMaestro(data.maestro)
        setMaestros(data.maestros || [])
        setMeses(data.meses || [])
        setClases(data.clases || [])

        // Seleccionar primera clase y sección disponible si no hay seleccionadas
        if (data.clases.length > 0) {
          const primeraClase = data.clases[0]
          setClaseId(primeraClase.asignaturaId)
          if (primeraClase.cursos.length > 0) {
            setSeccionId(primeraClase.cursos[0].seccionId)
          } else {
            setSeccionId('')
          }
        } else {
          setClaseId('')
          setSeccionId('')
          setEstudiantes([])
        }
      } catch (err) {
        if (activo) setError(mensajeDeError(err))
      } finally {
        if (activo) setCargandoOpciones(false)
      }
    }

    void cargarInicial()
    return () => {
      activo = false
    }
  }, [puedeVer, ano, docenteSeleccionado])

  // Cuando cambia la clase, sincronizar la sección
  function alCambiarClase(nuevaClaseId: string) {
    setClaseId(nuevaClaseId)
    const encontrada = clases.find(c => c.asignaturaId === nuevaClaseId)
    if (encontrada && encontrada.cursos.length > 0) {
      setSeccionId(encontrada.cursos[0].seccionId)
    } else {
      setSeccionId('')
      setEstudiantes([])
    }
    setModificado(false)
    setAvisoOk('')
  }

  // Cargar lista de estudiantes y asistencias guardadas para la combinación seleccionada
  useEffect(() => {
    let activo = true

    if (!ano || !claseId || !seccionId || !mes) {
      return
    }

    async function cargarPlanilla() {
      setCargandoLista(true)
      setError('')
      setAvisoOk('')
      try {
        const query: Record<string, string> = {
          ano,
          asignaturaId: claseId,
          seccionId,
          mes,
        }
        if (maestro?.id) query.docenteId = maestro.id

        const data = await api<PlanillaRespuesta>(`/api/attendance/sheet?${qs(query)}`)
        if (!activo) return

        setEstudiantes(
          data.estudiantes.map(e => ({
            ...e,
            porcentaje: e.porcentaje !== null && e.porcentaje !== undefined ? e.porcentaje : '',
          }))
        )
        setModificado(false)
      } catch (err) {
        if (activo) setError(mensajeDeError(err))
      } finally {
        if (activo) setCargandoLista(false)
      }
    }

    void cargarPlanilla()
    return () => {
      activo = false
    }
  }, [ano, claseId, seccionId, mes, maestro?.id])

  // Modificar asistencia de un estudiante
  function cambiarPorcentaje(index: number, valor: string) {
    setEstudiantes(prev => {
      const copia = [...prev]
      copia[index] = { ...copia[index], porcentaje: valor }
      return copia
    })
    setModificado(true)
    setAvisoOk('')
  }

  // Utilidad: marcar todos 100%
  function marcarTodos(porcentaje: number) {
    setEstudiantes(prev => prev.map(e => ({ ...e, porcentaje: porcentaje })))
    setModificado(true)
    setAvisoOk('')
  }

  // Utilidad: limpiar asistencia
  function limpiarTodos() {
    setEstudiantes(prev => prev.map(e => ({ ...e, porcentaje: '' })))
    setModificado(true)
    setAvisoOk('')
  }

  // Guardar asistencia mensual
  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!ano || !claseId || !seccionId || !mes || !maestro) return

    // Validar que los valores sean números enteros entre 0 y 100
    for (const est of estudiantes) {
      if (est.porcentaje !== '' && est.porcentaje !== null && est.porcentaje !== undefined) {
        const n = Number(est.porcentaje)
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 100) {
          setError(`El valor para ${est.nombre} debe ser un número entero entre 0 y 100.`)
          return
        }
      }
    }

    setGuardando(true)
    setError('')
    setAvisoOk('')

    try {
      const registros = estudiantes.map(e => ({
        estudianteId: e.estudianteId,
        porcentaje: e.porcentaje === '' ? null : Number(e.porcentaje),
      }))

      const res = await api<{ ok: boolean; guardados: number }>('/api/attendance/sheet', {
        method: 'POST',
        body: {
          ano,
          docenteId: maestro.id,
          asignaturaId: claseId,
          seccionId,
          mes,
          registros,
        },
      })

      const mesNombre = meses.find(m => m.codigo === mes)?.nombre || mes
      setAvisoOk(`Asistencia de ${mesNombre} guardada exitosamente (${res.guardados} estudiantes registrados).`)
      setModificado(false)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setGuardando(false)
    }
  }

  if (!puedeVer) {
    return (
      <section className="tarjeta">
        <h2>Asistencia</h2>
        <p>No tiene permiso para consultar asistencia.</p>
      </section>
    )
  }

  const mesActualObj = meses.find(m => m.codigo === mes)
  const claseActualObj = clases.find(c => c.asignaturaId === claseId)
  const seccionActualObj = cursosDisponibles.find(s => s.seccionId === seccionId)

  return (
    <section className="asistencia">
      <header className="tarjeta asistencia-cabecera">
        <div>
          <h2>Módulo de Asistencia</h2>
          <p className="texto-secundario">
            Registro mensual de asistencia por maestro, clase y sección.
          </p>
        </div>
      </header>

      {/* Banner / Selector de Maestro */}
      <div className="tarjeta">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '13px', color: 'var(--tinta-suave)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              MAESTRO:
            </span>{' '}
            <strong style={{ fontSize: '16px', color: 'var(--tinta)' }}>
              {maestro ? maestro.nombreCompleto : 'Cargando maestro…'}
            </strong>
          </div>

          {esAdmin && maestros.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <span className="texto-secundario">Cambiar maestro (Administración):</span>
              <select
                value={docenteSeleccionado || maestro?.id || ''}
                onChange={e => setDocenteSeleccionado(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--borde)' }}
              >
                {maestros.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.nombreCompleto}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {/* Selectores principales: Clase -> Curso/Sección -> Mes */}
      <div className="tarjeta asistencia-filtros">
        {anos.length > 1 && (
          <label>
            Año escolar
            <select value={ano} onChange={e => setAno(e.target.value)}>
              {anos.map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}

        <label style={{ minWidth: '220px' }}>
          <strong>CLASE (Asignatura)</strong>
          <select
            value={claseId}
            onChange={e => alCambiarClase(e.target.value)}
            disabled={cargandoOpciones || clases.length === 0}
          >
            {clases.length === 0 ? (
              <option value="">(Sin clases asignadas)</option>
            ) : (
              clases.map(c => (
                <option key={c.asignaturaId} value={c.asignaturaId}>
                  {c.asignatura}
                </option>
              ))
            )}
          </select>
        </label>

        <label style={{ minWidth: '180px' }}>
          <strong>CURSO / SECCIÓN</strong>
          <select
            value={seccionId}
            onChange={e => {
              setSeccionId(e.target.value)
              setModificado(false)
              setAvisoOk('')
            }}
            disabled={cargandoOpciones || cursosDisponibles.length === 0}
          >
            {cursosDisponibles.length === 0 ? (
              <option value="">(Sin secciones)</option>
            ) : (
              cursosDisponibles.map(s => (
                <option key={s.seccionId} value={s.seccionId}>
                  {s.etiqueta}
                </option>
              ))
            )}
          </select>
        </label>

        <label style={{ minWidth: '160px' }}>
          <strong>MES</strong>
          <select
            value={mes}
            onChange={e => {
              setMes(e.target.value)
              setModificado(false)
              setAvisoOk('')
            }}
          >
            {meses.map(m => (
              <option key={m.codigo} value={m.codigo}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="aviso error" role="alert">{error}</div>}
      {avisoOk && <div className="aviso ok" role="status">{avisoOk}</div>}

      {/* Planilla de estudiantes */}
      {cargandoLista ? (
        <p role="status">Cargando lista de estudiantes…</p>
      ) : clases.length === 0 ? (
        <div className="tarjeta">
          <p className="texto-secundario">El maestro no tiene asignaturas ni cursos activos para el año escolar seleccionado.</p>
        </div>
      ) : (
        <form className="tarjeta asistencia-registro" onSubmit={e => void guardar(e)}>
          <header>
            <div>
              <h3>
                {claseActualObj?.asignatura || 'Clase'} · {seccionActualObj?.etiqueta || 'Sección'}
              </h3>
              <p className="texto-secundario">
                Mes: <strong>{mesActualObj?.nombre || mes}</strong> · {estudiantes.length} estudiante(s) en la sección
              </p>
            </div>

            {puedeRegistrar && estudiantes.length > 0 && (
              <div className="asistencia-acciones">
                <button type="button" className="boton secundario" onClick={() => marcarTodos(100)}>
                  Marcar todos 100%
                </button>
                <button type="button" className="boton secundario" onClick={limpiarTodos}>
                  Limpiar valores
                </button>
              </div>
            )}
          </header>

          <div className="tabla-contenedor">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>No.</th>
                  <th style={{ width: '130px' }}>Matrícula</th>
                  <th>Estudiante</th>
                  <th style={{ width: '160px', textAlign: 'center' }}>Asistencia (%)</th>
                </tr>
              </thead>
              <tbody>
                {estudiantes.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '24px' }}>
                      No hay estudiantes matriculados en esta sección.
                    </td>
                  </tr>
                ) : (
                  estudiantes.map((est, i) => (
                    <tr key={est.estudianteId}>
                      <td style={{ color: 'var(--tinta-suave)', fontFamily: 'var(--mono)' }}>
                        {est.numLista}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '13px' }}>
                        {est.matricula || '—'}
                      </td>
                      <td>
                        <strong>{est.nombre}</strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            placeholder="0-100"
                            disabled={!puedeRegistrar || guardando}
                            value={est.porcentaje === null ? '' : est.porcentaje}
                            onChange={e => cambiarPorcentaje(i, e.target.value)}
                            style={{
                              width: '80px',
                              textAlign: 'right',
                              padding: '6px 8px',
                              fontFamily: 'var(--mono)',
                              fontWeight: 600,
                              borderRadius: '6px',
                              border: '1px solid var(--borde)',
                            }}
                          />
                          <span style={{ fontSize: '13px', color: 'var(--tinta-suave)' }}>%</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {puedeRegistrar && estudiantes.length > 0 && (
            <div className="asistencia-acciones" style={{ marginTop: '12px' }}>
              <button
                type="submit"
                className="boton primario"
                disabled={guardando || (!modificado && estudiantes.every(e => e.porcentaje === ''))}
              >
                {guardando ? 'Guardando asistencia…' : 'Guardar asistencia'}
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  )
}
