import type { ReactNode } from 'react'
import type { CtxSesion } from '../tipos'
import { ETIQUETA_ROL, MODULOS } from '../modulos'

interface Props {
  ctx: CtxSesion
  modulo: string | null
  onModulo: (id: string | null) => void
  onSalir: () => void
  children: ReactNode
}

/** Estructura general: barra lateral de módulos + cabecera de usuario. */
export function Disposicion({ ctx, modulo, onModulo, onSalir, children }: Props) {
  const disponibles = MODULOS.filter(function (m) { return ctx.set[m.permiso] === true })
  const iniciales = ctx.nombre.split(' ').filter(Boolean).slice(0, 2)
    .map(function (p) { return p.charAt(0).toUpperCase() }).join('')

  return (
    <div className="disposicion">
      <aside className="barra-lateral">
        <button type="button" className="marca" onClick={() => onModulo(null)}>
          <span className="marca-logo">SGA</span>
          <span className="marca-texto">
            {ctx.config?.nombreSistema || 'Gestión académica'}
            <small>Año {ctx.config?.anoEscolar || '—'}</small>
          </span>
        </button>

        <nav className="menu" aria-label="Módulos">
          <button
            type="button"
            className={'menu-item' + (modulo === null ? ' activo' : '')}
            onClick={() => onModulo(null)}
          >
            <span className="menu-sigla menu-sigla-panel">▦</span>
            Panel
          </button>
          <span className="menu-titulo">Módulos</span>
          {disponibles.map(function (m) {
            return (
              <button
                key={m.id}
                type="button"
                className={'menu-item' + (modulo === m.id ? ' activo' : '')}
                onClick={() => onModulo(m.id)}
                title={m.desc}
              >
                <span className="menu-sigla">{m.sigla}</span>
                {m.et}
              </button>
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
          <div>
            <span className="cabecera-etiqueta">{ctx.config?.nombreSistema || 'Sistema de Gestión Académica'}</span>
            <h1>{modulo ? (MODULOS.find(function (m) { return m.id === modulo })?.et || modulo) : 'Panel general'}</h1>
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
