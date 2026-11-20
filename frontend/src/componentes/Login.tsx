import { useState } from 'react'
import type { FormEvent } from 'react'
import { api, mensajeDeError } from '../lib/api'
import type { Perfil } from '../tipos'
import { LogoInstitucional } from './LogoInstitucional'

interface Props {
  onEntrar: () => Promise<void>
}

interface RespuestaLogin {
  ok: boolean
  usuario: Perfil
}

/** Pantalla de acceso: usuario + PIN de 4 dígitos (cookie httpOnly). */
export function Login({ onEntrar }: Props) {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await api<RespuestaLogin>('/api/auth/login', {
        method: 'POST',
        body: { usuario: usuario.trim(), clave: clave.trim() },
      })
      await onEntrar()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="acceso-fondo">
      <div className="acceso-tarjeta">
        <section className="acceso-marca">
          <LogoInstitucional className="logo-acceso" />
          <h1>Sistema de Gestión Académica</h1>
          <p>
            Calificaciones, estudiantes, docentes y cursos en un solo lugar.
            Ingrese con el usuario y el PIN que le entregó la administración.
          </p>
          <ul className="acceso-lista">
            <li>Competencias C1 a C4, recuperación y etapas finales</li>
            <li>Asignación de docentes y tutorías por curso</li>
            <li>Auditoría de cada cambio</li>
          </ul>
        </section>

        <form className="acceso-formulario" onSubmit={entrar}>
          <h2>Iniciar sesión</h2>
          <p className="acceso-nota">Use su usuario (o correo) y su PIN de 4 dígitos.</p>

          <div className="campo">
            <label htmlFor="acceso-usuario">Usuario</label>
            <input
              id="acceso-usuario"
              type="text"
              value={usuario}
              autoFocus
              autoComplete="username"
              spellCheck={false}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="admin"
            />
          </div>

          <div className="campo">
            <label htmlFor="acceso-clave">PIN</label>
            <input
              id="acceso-clave"
              type="password"
              value={clave}
              autoComplete="current-password"
              inputMode="numeric"
              maxLength={4}
              onChange={(e) => setClave(e.target.value)}
              placeholder="••••"
            />
          </div>

          {error ? <p className="mensaje-error" role="alert">{error}</p> : null}

          <button type="submit" className="boton primario ancho" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="acceso-pie">
            ¿No tiene acceso? Solicite a la administración que restablezca su PIN.
          </p>
        </form>
      </div>
    </div>
  )
}
