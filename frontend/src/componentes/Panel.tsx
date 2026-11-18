import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../lib/api'
import type { CtxSesion, SaludDb } from '../tipos'
import { MODULOS } from '../modulos'

interface Props {
  ctx: CtxSesion
  onIr: (modulo: string) => void
}

function numero(n: number | undefined): string {
  if (n === undefined || n === null) return '—'
  return n.toLocaleString('es-DO')
}

/** Panel de inicio: estado real de la base y accesos a los módulos permitidos. */
export function Panel({ ctx, onIr }: Props) {
  const [salud, setSalud] = useState<SaludDb | null>(null)
  const [error, setError] = useState('')

  useEffect(function () {
    let vivo = true
    api<SaludDb>('/api/health/db').then(function (r) {
      if (vivo) setSalud(r)
    }, function (e) {
      if (vivo) setError(mensajeDeError(e))
    })
    return function () { vivo = false }
  }, [])

  const disponibles = MODULOS.filter(function (m) { return ctx.set[m.permiso] === true })

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
          <strong>{numero(salud?.students)}</strong>
          <small>registrados en el año escolar</small>
        </article>
        <article className="tarjeta-estadistica">
          <span className="estadistica-etiqueta">Calificaciones</span>
          <strong>{numero(salud?.gradeRecords)}</strong>
          <small>notas C1–C4 y recuperaciones</small>
        </article>
        <article className="tarjeta-estadistica">
          <span className="estadistica-etiqueta">Resultados</span>
          <strong>{numero(salud?.resultSummaries)}</strong>
          <small>calculados por el motor</small>
        </article>
        <article className="tarjeta-estadistica">
          <span className="estadistica-etiqueta">Configuración</span>
          <strong>{numero(salud?.config)}</strong>
          <small>parámetros del sistema</small>
        </article>
      </section>

      <section className="panel-modulos">
        <header className="seccion-cabecera">
          <div>
            <h3>Módulos disponibles</h3>
            <p>Funciones habilitadas para su rol.</p>
          </div>
        </header>
        <div className="rejilla-modulos">
          {disponibles.map(function (m) {
            return (
              <button key={m.id} type="button" className="tarjeta-modulo" onClick={() => onIr(m.id)}>
                <span className="modulo-sigla">{m.sigla}</span>
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
