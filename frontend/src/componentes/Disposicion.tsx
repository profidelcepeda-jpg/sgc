import { useState } from 'react'
import type { ReactNode } from 'react'
import type { CtxSesion } from '../tipos'
import { ETIQUETA_ROL, GRUPOS, grupoPorId, modulosDelGrupo, moduloPorId } from '../modulos'
import { Icono } from './Icono'
import { LogoInstitucional } from './LogoInstitucional'

interface Props {
  ctx: CtxSesion
  modulo: string | null
  onModulo: (id: string | null) => void
  onSalir: () => void
  children: ReactNode
}

/**
 * Estructura general: barra lateral agrupada por áreas académicas, cabecera
 * uniforme con ubicación del módulo y menú desplegable adaptable a móviles.
 */
export function Disposicion({ ctx, modulo, onModulo, onSalir, children }: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [gruposCerrados, setGruposCerrados] = useState<Record<string, boolean>>({})

  const activo = moduloPorId(modulo)
  const grupoActivo = grupoPorId(activo?.grupo)
  const grupos = GRUPOS.map(function (g) {
    return Object.assign({}, g, { modulos: modulosDelGrupo(g.id, ctx.set) })
  }).filter(function (g) { return g.modulos.length > 0 })

  const iniciales = ctx.nombre.split(' ').filter(Boolean).slice(0, 2)
    .map(function (p) { return p.charAt(0).toUpperCase() }).join('')

  function ir(id: string | null): void {
    setMenuAbierto(false)
    onModulo(id)
  }

  function alternarGrupo(id: string): void {
    setGruposCerrados(function (previo) {
      const siguiente = Object.assign({}, previo)
      siguiente[id] = !siguiente[id]
      return siguiente
    })
  }

  return (
    <div className={'disposicion' + (menuAbierto ? ' menu-abierto' : '')}>
      {menuAbierto ? (
        <button
          type="button"
          className="disposicion-fondo"
          aria-label="Cerrar el menú"
          onClick={function () { setMenuAbierto(false) }}
        />
      ) : null}

      <aside className={'barra-lateral' + (menuAbierto ? ' abierta' : '')}>
        <div className="barra-marca">
          <button type="button" className="marca" onClick={function () { ir(null) }}>
            <LogoInstitucional className="marca-logo" />
            <span className="marca-texto">
              {ctx.config?.nombreSistema || 'Gestión académica'}
              <small>Año {ctx.config?.anoEscolar || '—'}</small>
            </span>
          </button>
          <button
            type="button"
            className="boton-cerrar-menu"
            aria-label="Cerrar el menú"
            onClick={function () { setMenuAbierto(false) }}
          >
            <Icono nombre="cerrar" />
          </button>
        </div>

        <nav className="menu" aria-label="Navegación principal">
          <section className="menu-grupo menu-grupo-panel">
            <div className="menu-grupo-cabecera menu-grupo-estatica">
              <Icono nombre="panel" clase="menu-grupo-icono" />
              <span>Panel principal</span>
            </div>
            <div className="menu-grupo-items">
              <button
                type="button"
                className={'menu-item' + (modulo === null ? ' activo' : '')}
                aria-current={modulo === null ? 'page' : undefined}
                onClick={function () { ir(null) }}
              >
                <span className="menu-sigla"><Icono nombre="panel" /></span>
                <span className="menu-item-texto">Panel</span>
                {modulo === null ? <span className="menu-activo-punto" aria-hidden="true" /> : null}
              </button>
            </div>
          </section>

          {grupos.map(function (g) {
            const cerrado = gruposCerrados[g.id] === true
            return (
              <section className="menu-grupo" key={g.id}>
                <button
                  type="button"
                  className="menu-grupo-cabecera"
                  aria-expanded={!cerrado}
                  onClick={function () { alternarGrupo(g.id) }}
                >
                  <Icono nombre={g.icono} clase="menu-grupo-icono" />
                  <span>{g.et}</span>
                  {cerrado && g.id === activo?.grupo
                    ? <span className="menu-grupo-punto" aria-hidden="true" />
                    : null}
                  <Icono nombre="chevron" clase={'menu-chevron' + (cerrado ? ' cerrado' : '')} />
                </button>
                {!cerrado ? (
                  <div className="menu-grupo-items">
                    {g.modulos.map(function (m) {
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={'menu-item' + (modulo === m.id ? ' activo' : '')}
                          aria-current={modulo === m.id ? 'page' : undefined}
                          title={m.desc}
                          onClick={function () { ir(m.id) }}
                        >
                          <span className="menu-sigla"><Icono nombre={m.icono} /></span>
                          <span className="menu-item-texto">{m.et}</span>
                          {modulo === m.id ? <span className="menu-activo-punto" aria-hidden="true" /> : null}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </section>
            )
          })}
        </nav>

        <div className="barra-usuario">
          <span className="avatar" aria-hidden="true">{iniciales || 'US'}</span>
          <div className="barra-usuario-datos">
            <strong>{ctx.nombre || ctx.usuario}</strong>
            <small>{ETIQUETA_ROL[ctx.rol] || ctx.rol}</small>
          </div>
          <button type="button" className="boton-icono salir" title="Cerrar sesión" onClick={onSalir}>
            Salir
          </button>
        </div>
      </aside>

      <div className="contenido">
        <header className="cabecera">
          <div className="cabecera-izquierda">
            <button
              type="button"
              className="boton-menu"
              aria-label="Abrir el menú"
              aria-expanded={menuAbierto}
              onClick={function () { setMenuAbierto(true) }}
            >
              <Icono nombre="menu" />
            </button>
            <div>
              <span className="cabecera-etiqueta">
                {grupoActivo ? (
                  <>
                    {grupoActivo.et}
                    <span className="miga-sep" aria-hidden="true">/</span>
                    {activo?.et}
                  </>
                ) : 'Panel principal'}
              </span>
              <h1>{activo?.et || 'Panel general'}</h1>
            </div>
          </div>
          <div className="cabecera-usuario">
            <span>Sesión de <strong>{ctx.usuario}</strong></span>
          </div>
        </header>
        <main className="principal">{children}</main>
      </div>
    </div>
  )
}
