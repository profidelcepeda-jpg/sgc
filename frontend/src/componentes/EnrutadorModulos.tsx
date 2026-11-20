/*********************************************************************
 * EnrutadorModulos.tsx — Selección de la pantalla según el módulo activo
 * Centraliza la carga diferida y evita que App.tsx acumule condicionales.
 *********************************************************************/

import { lazy, Suspense } from 'react'
import type { CtxSesion } from '../tipos'
import { Panel } from './Panel'

const ModuloCrud = lazy(function () { return import('./ModuloCrud').then(function (m) { return { default: m.ModuloCrud } }) })
const Calificaciones = lazy(function () { return import('./Calificaciones').then(function (m) { return { default: m.Calificaciones } }) })
const Reportes = lazy(function () { return import('./Reportes').then(function (m) { return { default: m.Reportes } }) })
const Observaciones = lazy(function () { return import('./Observaciones').then(function (m) { return { default: m.Observaciones } }) })
const Configuracion = lazy(function () { return import('./Configuracion').then(function (m) { return { default: m.Configuracion } }) })
const Consulta = lazy(function () { return import('./Consulta').then(function (m) { return { default: m.Consulta } }) })
const Estudiantes = lazy(function () { return import('./Estudiantes').then(function (m) { return { default: m.Estudiantes } }) })
const RolesPermisos = lazy(function () { return import('./RolesPermisos').then(function (m) { return { default: m.RolesPermisos } }) })
const Asistencia = lazy(function () { return import('./Asistencia').then(function (m) { return { default: m.Asistencia } }) })

interface Props {
  modulo: string | null
  ctx: CtxSesion
  onModulo: (id: string | null) => void
  estudianteInicial: { id: string; ano: string } | null
  onAbrirConsulta: (id: string, ano: string) => void
}

function pantalla({ modulo, ctx, onModulo, estudianteInicial, onAbrirConsulta }: Props) {
  switch (modulo) {
    case null:
      return <Panel ctx={ctx} onIr={onModulo} />
    case 'estudiantes':
      return <Estudiantes key={modulo} permisos={ctx.set} onAbrirConsulta={onAbrirConsulta} />
    case 'consulta':
      return <Consulta key={modulo} permisos={ctx.set} estudianteInicial={estudianteInicial} />
    case 'calificaciones':
      return <Calificaciones key={modulo} permisos={ctx.set} />
    case 'asistencia':
      return <Asistencia key={modulo} permisos={ctx.set} idDocente={ctx.idDocente} />
    case 'reportes':
      return <Reportes key={modulo} />
    case 'observaciones':
      return <Observaciones key={modulo} />
    case 'configuracion':
      return <Configuracion key={modulo} onModulo={onModulo} />
    case 'roles':
      return <RolesPermisos key={modulo} permisos={ctx.set} />
    default:
      return <ModuloCrud key={modulo} modulo={modulo} />
  }
}

export function EnrutadorModulos(props: Props) {
  return (
    <Suspense fallback={<div className="tarjeta" role="status">Cargando módulo…</div>}>
      {pantalla(props)}
    </Suspense>
  )
}
