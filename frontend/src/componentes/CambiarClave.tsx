import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, mensajeDeError } from '../lib/api'
import type { CtxSesion } from '../tipos'
import { LogoInstitucional } from './LogoInstitucional'

interface Props {
  ctx: CtxSesion
  onCambiada: () => Promise<void>
  onSalir: () => Promise<void>
}

/**
 * Cambio obligatorio del PIN temporal. Mientras debeCambiar sea true, el
 * backend bloquea cualquier otra operación (CAMBIAR_CLAVE, HTTP 403).
 */
export function CambiarClave({ ctx, onCambiada, onSalir }: Props) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function guardar(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError('')
    if (nueva !== repetir) {
      setError('El PIN nuevo y su confirmación no coinciden.')
      return
    }
    setEnviando(true)
    try {
      await api('/api/auth/cambiar-clave', {
        method: 'POST',
        body: { actual: actual.trim(), nueva: nueva.trim() },
      })
      await onCambiada()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="acceso-fondo">
      <div className="acceso-tarjeta acceso-tarjeta-angosta">
        <section className="acceso-marca">
          <LogoInstitucional className="logo-acceso" />
          <h1>Cambie su PIN temporal</h1>
          <p>
            Hola, {ctx.nombre}. Su acceso se creó con un PIN temporal y el sistema
            no permite continuar hasta que lo cambie.
          </p>
          <ul className="acceso-lista">
            <li>Use exactamente 4 dígitos</li>
            <li>Evite 0000, 1111, 1234, 4321 y 0123</li>
            <li>No lo comparta con otras personas</li>
          </ul>
        </section>

        <form className="acceso-formulario" onSubmit={guardar}>
          <h2>Nuevo PIN</h2>
          <div className="campo">
            <label htmlFor="clave-actual">PIN actual</label>
            <input
              id="clave-actual"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={actual}
              autoFocus
              autoComplete="current-password"
              onChange={(e) => setActual(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="clave-nueva">PIN nuevo</label>
            <input
              id="clave-nueva"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={nueva}
              autoComplete="new-password"
              onChange={(e) => setNueva(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="clave-repetir">Repita el PIN nuevo</label>
            <input
              id="clave-repetir"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={repetir}
              autoComplete="new-password"
              onChange={(e) => setRepetir(e.target.value)}
            />
          </div>

          {error ? <p className="mensaje-error" role="alert">{error}</p> : null}

          <button type="submit" className="boton primario ancho" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Cambiar PIN y continuar'}
          </button>
          <button type="button" className="boton texto" onClick={() => void onSalir()}>
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  )
}
