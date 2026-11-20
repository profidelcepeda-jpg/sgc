import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../lib/api'
import type { CtxSesion, ResumenSistema, SaludDb } from '../tipos'
import { formatearNumero } from '../lib/formato'
import { gruposDisponibles } from '../modulos'
import { Icono } from './Icono'

interface Props {
  ctx: CtxSesion
  onIr: (modulo: string) => void
}

function numero(n: number | undefined): string {
  return formatearNumero(n, 0)
}

/** Panel de inicio: estado real de la base y accesos agrupados por área. */
export function Panel({ ctx, onIr }: Props) {
  const [salud, setSalud] = useState<SaludDb | null>(null)
  const [resumen, setResumen] = useState<ResumenSistema | null>(null)
  const [error, setError] = useState('')

  useEffect(function () {
    let vivo = true
    api<SaludDb>('/api/health/db').then(function (r) {
      if (vivo) setSalud(r)
    }, function (e) {
      if (vivo) setError(mensajeDeError(e))
    })
    api<ResumenSistema>('/api/health/summary').then(function (r) {
      if (vivo) setResumen(r)
    }, function () {
      // El indicador de conexión lo decide /api/health/db; si el resumen falla,
      // las tarjetas quedan vacías sin tapar el estado de la base.
    })
    return function () { vivo = false }
  }, [])

  const grupos = gruposDisponibles(ctx.set)

  return (
    <div className="panel">
      <section className="bienvenida">
        <div>
          <h2>Hola, {ctx.nombre || ctx.usuario}</h2>
          <p>Este es el estado del sistema migrado a PostgreSQL. Todo lo que ve aquí sale de la base real.</p>
        </div>
        <span className={'estado-servicio' + (error ? ' estado-error' : '')}>
          <span className="punto" />
          {error ? 'Sin conexión con la base' : (salud ? 'Base de datos conectada' : 'Comprobando…')}
        </span>
      </section>

      {error ? <p className="mensaje-error">{error}</p> : null}

      <section className="rejilla-estadisticas" aria-label="Datos del sistema">
        <article className="tarjeta-estadistica">
          <span className="estadistica-etiqueta">Estudiantes</span>
          <strong>{numero(resumen?.students)}</strong>
          <small>{resumen?.ano ? 'Año escolar ' + resumen.ano : 'Registrados en el año escolar'}</small>
        </article>
        <article className="tarjeta-estadistica">
          <span className="estadistica-etiqueta">Calificaciones</span>
          <strong>{numero(resumen?.gradeRecords)}</strong>
          <small>notas C1–C4 y recuperaciones</small>
        </article>
        <article className="tarjeta-estadistica">
          <span className="estadistica-etiqueta">Resultados</span>
          <strong>{numero(resumen?.resultSummaries)}</strong>
          <small>calculados por el motor</small>
        </article>
        <article className="tarjeta-estadistica">
          <span className="estadistica-etiqueta">Configuración</span>
          <strong>{numero(resumen?.config)}</strong>
          <small>parámetros del sistema</small>
        </article>
      </section>

      <section className="panel-modulos">
        <header className="seccion-cabecera">
          <div>
            <h3>Módulos disponibles</h3>
            <p>Funciones habilitadas para su rol, organizadas por área.</p>
          </div>
        </header>

        <div className="panel-grupos">
          {grupos.map(function (g) {
            return (
              <section className="panel-grupo" key={g.id}>
                <header className="panel-grupo-cabecera">
                  <Icono nombre={g.icono} clase="panel-grupo-icono" />
                  <h4>{g.et}</h4>
                  <span>{g.modulos.length} {g.modulos.length === 1 ? 'módulo' : 'módulos'}</span>
                </header>
                <div className="rejilla-modulos">
                  {g.modulos.map(function (m) {
                    return (
                      <button key={m.id} type="button" className="tarjeta-modulo" onClick={() => onIr(m.id)}>
                        <span className="modulo-sigla"><Icono nombre={m.icono} /></span>
                        <span className="modulo-texto">
                          <strong>{m.et}</strong>
                          <small>{m.desc}</small>
                        </span>
                        <span className="modulo-flecha" aria-hidden="true">→</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </section>

      <section className="nota-sistema">
        <h3>Motor de calificaciones</h3>
        <p>
          Las fórmulas son transcripción literal del sistema original: redondeo a 8 decimales,
          truncación con épsilon y redondeo half-up. Los 24 casos de prueba del motor se ejecutan
          en el backend antes de cada entrega.
        </p>
      </section>
    </div>
  )
}
