import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { api } from './lib/api'
import type { Bootstrap, CtxSesion } from './tipos'
import { Login } from './componentes/Login'
import { CambiarClave } from './componentes/CambiarClave'
import { Disposicion } from './componentes/Disposicion'

const Panel = lazy(() => import('./componentes/Panel').then(({ Panel }) => ({ default: Panel })))
const ModuloCrud = lazy(() => import('./componentes/ModuloCrud').then(({ ModuloCrud }) => ({ default: ModuloCrud })))
const Calificaciones = lazy(() => import('./componentes/Calificaciones').then(({ Calificaciones }) => ({ default: Calificaciones })))
const Reportes = lazy(() => import('./componentes/Reportes').then(({ Reportes }) => ({ default: Reportes })))
const Observaciones = lazy(() => import('./componentes/Observaciones').then(({ Observaciones }) => ({ default: Observaciones })))
const Configuracion = lazy(() => import('./componentes/Configuracion').then(({ Configuracion }) => ({ default: Configuracion })))
const Consulta = lazy(() => import('./componentes/Consulta').then(({ Consulta }) => ({ default: Consulta })))
const Estudiantes = lazy(() => import('./componentes/Estudiantes').then(({ Estudiantes }) => ({ default: Estudiantes })))
const RolesPermisos = lazy(() => import('./componentes/RolesPermisos').then(({ RolesPermisos }) => ({ default: RolesPermisos })))
const Asistencia = lazy(() => import('./componentes/Asistencia').then(({ Asistencia }) => ({ default: Asistencia })))

export default function App() {
  const [ctx, setCtx] = useState<CtxSesion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [modulo, setModulo] = useState<string | null>(null)
  const [estudianteInicial, setEstudianteInicial] = useState<{ id:string; ano:string } | null>(null)

  const cargar = useCallback(async function (): Promise<void> {
    try {
      const r = await api<Bootstrap>('/api/auth/bootstrap')
      setCtx(Object.assign({}, r.usuario, { permisos: r.permisos, set: r.set, config: r.config }))
    } catch {
      // Sin sesión (o sesión expirada): se muestra el acceso.
      setCtx(null)
    }
  }, [])

  useEffect(function () {
    let vivo = true
    // La primera carga se hace aquí para que el estado se actualice en los
    // callbacks asíncronos (no de forma síncrona dentro del efecto).
    api<Bootstrap>('/api/auth/bootstrap').then(function (r) {
      if (!vivo) return
      setCtx(Object.assign({}, r.usuario, { permisos: r.permisos, set: r.set, config: r.config }))
    }, function () {
      if (!vivo) return
      setCtx(null)
    }).finally(function () {
      if (vivo) setCargando(false)
    })
    return function () { vivo = false }
  }, [])

  async function salir(): Promise<void> {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      // La sesión pudo expirar; de todos modos se vuelve al acceso.
    }
    setCtx(null)
    setModulo(null)
  }

  if (cargando) {
    return (
      <div className="pantalla-carga">
        <span className="marca-logo">SGA</span>
        <p>Cargando el sistema…</p>
      </div>
    )
  }

  if (!ctx) return <Login onEntrar={cargar} />

  if (ctx.debeCambiar) {
    return <CambiarClave ctx={ctx} onCambiada={cargar} onSalir={salir} />
  }

  return (
    <Disposicion ctx={ctx} modulo={modulo} onModulo={setModulo} onSalir={() => void salir()}>
      <Suspense fallback={<div className="tarjeta" role="status">Cargando módulo…</div>}>
        {modulo
          ? modulo === 'estudiantes' ? <Estudiantes key={modulo} permisos={ctx.set} onAbrirConsulta={(id,ano)=>{setEstudianteInicial({id,ano});setModulo('consulta')}} /> : modulo === 'consulta' ? <Consulta key={modulo} permisos={ctx.set} estudianteInicial={estudianteInicial} /> : modulo === 'calificaciones' ? <Calificaciones key={modulo} /> : modulo === 'asistencia' ? <Asistencia key={modulo} permisos={ctx.set} idDocente={ctx.idDocente} /> : modulo === 'reportes' ? <Reportes key={modulo} /> : modulo === 'observaciones' ? <Observaciones key={modulo} /> : modulo === 'configuracion' ? <Configuracion key={modulo} onModulo={setModulo} /> : modulo === 'roles' ? <RolesPermisos key={modulo} permisos={ctx.set} /> : <ModuloCrud key={modulo} modulo={modulo} />
          : <Panel ctx={ctx} onIr={setModulo} />}
      </Suspense>
    </Disposicion>
  )
}
