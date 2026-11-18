import type { ReactNode } from 'react'

interface Props {
  titulo: string
  subtitulo?: string
  ancho?: 'normal' | 'ancho'
  onCerrar: () => void
  children: ReactNode
  pie?: ReactNode
}

/** Ventana modal reutilizable (formularios, acciones y resultados). */
export function Modal({ titulo, subtitulo, ancho, onCerrar, children, pie }: Props) {
  return (
    <div className="modal-fondo" role="presentation" onMouseDown={onCerrar}>
      <div
        className={'modal' + (ancho === 'ancho' ? ' modal-ancho' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-cabecera">
          <div>
            <h2>{titulo}</h2>
            {subtitulo ? <p className="modal-subtitulo">{subtitulo}</p> : null}
          </div>
          <button type="button" className="boton-icono" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </header>
        <div className="modal-cuerpo">{children}</div>
        {pie ? <footer className="modal-pie">{pie}</footer> : null}
      </div>
    </div>
  )
}
