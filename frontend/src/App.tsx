import { useCallback, useEffect, useState } from 'react'
import { api } from './lib/api'
import type { Bootstrap, CtxSesion } from './tipos'
import { Login } from './componentes/Login'
import { CambiarClave } from './componentes/CambiarClave'
import { Disposicion } from './componentes/Disposicion'
import { EnrutadorModulos } from './componentes/EnrutadorModulos'
import { LogoInstitucional } from './componentes/LogoInstitucional'
import { MODULO_POR_ID } from './modulos'

/** Lee el módulo activo de la URL (#/calificaciones) para permitir enlaces directos. */
function moduloDelHash(): string | null {
  if (typeof window === 'undefined') return null
  const valor = window.location.hash.replace(/^#\/?/, '').trim()
  return valor && valor !== 'panel' ? valor : null
}

function escribirHash(id: string | null): void {
  const destino = id ? '#/' + id : '#/'
  if (window.location.hash !== destino) window.location.hash = destino
}

export default function App() {
  const [ctx, setCtx] = useState<CtxSesion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [modulo, setModulo] = useState<string | null>(moduloDelHash)
  const [estudianteInicial, setEstudianteInicial] = useState<{ id: string; ano: string } | null>(null)

  const cargar = useCallback(async function (): Promise<void> {
    const r = await api<Bootstrap>('/api/auth/bootstrap')
    setCtx(Object.assign({}, r.usuario, { permisos: r.permisos, set: r.set, config: r.config }))
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

  // Navegación por hash: atrás/adelante y enlaces directos funcionan sin router.
  useEffect(function () {
    function alCambiarHash(): void { setModulo(moduloDelHash()) }
    window.addEventListener('hashchange', alCambiarHash)
    return function () { window.removeEventListener('hashchange', alCambiarHash) }
  }, [])

  // Un hash manipulado a mano no debe abrir un módulo sin permiso. El módulo
  // visible se deriva en el render y el hash inválido se limpia como efecto
  // externo (sin provocar renders en cascada).
  useEffect(function () {
    if (!ctx || modulo === null) return
    const definicion = MODULO_POR_ID[modulo]
    if (!definicion || ctx.set[definicion.permiso] !== true) escribirHash(null)
  }, [ctx, modulo])

  const moduloVisible = (function (): string | null {
    if (!ctx || modulo === null) return modulo
    const definicion = MODULO_POR_ID[modulo]
    return definicion && ctx.set[definicion.permiso] === true ? modulo : null
  })()

  function irA(id: string | null): void {
    setModulo(id)
    escribirHash(id)
  }

  async function salir(): Promise<void> {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      // La sesión pudo expirar; de todos modos se vuelve al acceso.
    }
    setCtx(null)
    setEstudianteInicial(null)
    irA(null)
  }

  if (cargando) {
    return (
      <div className="pantalla-carga">
        <LogoInstitucional className="marca-logo" />
        <p>Cargando el sistema…</p>
      </div>
    )
  }

  if (!ctx) return <Login onEntrar={cargar} />

  if (ctx.debeCambiar) {
    return <CambiarClave ctx={ctx} onCambiada={cargar} onSalir={salir} />
  }

  return (
    <Disposicion ctx={ctx} modulo={moduloVisible} onModulo={irA} onSalir={() => void salir()}>
      <EnrutadorModulos
        modulo={moduloVisible}
        ctx={ctx}
        onModulo={irA}
        estudianteInicial={estudianteInicial}
        onAbrirConsulta={function (id, ano) {
          setEstudianteInicial({ id: id, ano: ano })
          irA('consulta')
        }}
      />
    </Disposicion>
  )
}
