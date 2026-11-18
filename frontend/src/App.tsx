import { useCallback, useEffect, useState } from 'react'
import { api } from './lib/api'
import type { Bootstrap, CtxSesion } from './tipos'
import { Login } from './componentes/Login'
import { CambiarClave } from './componentes/CambiarClave'
import { Disposicion } from './componentes/Disposicion'
import { Panel } from './componentes/Panel'
import { ModuloCrud } from './componentes/ModuloCrud'

export default function App() {
  const [ctx, setCtx] = useState<CtxSesion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [modulo, setModulo] = useState<string | null>(null)

  const cargar = useCallback(async function (): Promise<void> {
    try {
      const r = await api<Bootstrap>('/api/auth/bootstrap')
      setCtx(Object.assign({}, r.usuario, { permisos: r.permisos, set: r.set }))
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
      setCtx(Object.assign({}, r.usuario, { permisos: r.permisos, set: r.set }))
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
      {modulo
        ? <ModuloCrud key={modulo} modulo={modulo} />
        : <Panel ctx={ctx} onIr={setModulo} />}
    </Disposicion>
  )
}
