import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Campo, Meta } from '../tipos'
import { mensajeDeError } from '../lib/api'

interface Props {
  meta: Meta
  item: Record<string, unknown> | null
  onGuardar: (id: string | undefined, datos: Record<string, unknown>) => Promise<void>
  onCerrar: () => void
}

function textoDe(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

function valorInicial(c: Campo, item: Record<string, unknown> | null, meta: Meta): string {
  if (item) return textoDe(item[c.k])
  if (c.k === 'ANO_ESCOLAR' && meta.conAno) return meta.anoActual || ''
  if (c.defecto !== undefined) return textoDe(c.defecto)
  return c.tipo === 'si_no' ? 'SI' : ''
}

/** Formulario genérico: se construye con los campos que declara el backend. */
export function Formulario({ meta, item, onGuardar, onCerrar }: Props) {
  const [valores, setValores] = useState<Record<string, string>>(function () {
    const v: Record<string, string> = {}
    meta.campos.forEach(function (c) { v[c.k] = valorInicial(c, item, meta) })
    return v
  })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const editando = !!item
  const camposForm = meta.campos.filter(function (c) {
    if (c.soloLectura) return false
    if (editando && c.soloCrear) return false
    return true
  })
  const datosCreacion = editando ? meta.campos.filter(function (c) { return c.soloCrear }) : []

  function cambiar(k: string, v: string): void {
    setValores(function (previo) { return Object.assign({}, previo, { [k]: v }) })
  }

  async function enviar(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const datos: Record<string, unknown> = {}
      camposForm.forEach(function (c) {
        const v = valores[c.k] ?? ''
        // En una edición, un PIN vacío significa "no cambiarlo".
        if (editando && c.k === 'PIN' && v === '') return
        datos[c.k] = v
      })
      await onGuardar(item ? textoDe(item[meta.idKey]) : undefined, datos)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  function control(c: Campo) {
    const v = valores[c.k] ?? ''
    if (c.tipo === 'si_no') {
      return (
        <select id={'campo-' + c.k} value={v} onChange={(e) => cambiar(c.k, e.target.value)}>
          <option value="SI">Sí</option>
          <option value="NO">No</option>
        </select>
      )
    }
    if (c.tipo === 'enum') {
      return (
        <select id={'campo-' + c.k} value={v} required={!!c.req} onChange={(e) => cambiar(c.k, e.target.value)}>
          <option value="">— Seleccione —</option>
          {(c.opciones || []).map(function (o) { return <option key={o} value={o}>{o}</option> })}
        </select>
      )
    }
    if (c.tipo === 'ref') {
      const opciones = meta.opciones[c.ref || ''] || []
      return (
        <select id={'campo-' + c.k} value={v} required={!!c.req} onChange={(e) => cambiar(c.k, e.target.value)}>
          <option value="">— Seleccione —</option>
          {opciones.map(function (o) { return <option key={o.id} value={o.id}>{o.texto}</option> })}
        </select>
      )
    }
    if (c.tipo === 'num') {
      return (
        <input
          id={'campo-' + c.k}
          type="number"
          value={v}
          min={c.min}
          max={c.max}
          required={!!c.req}
          onChange={(e) => cambiar(c.k, e.target.value)}
        />
      )
    }
    return (
      <input
        id={'campo-' + c.k}
        type={c.tipo === 'correo' ? 'email' : 'text'}
        value={v}
        required={!!c.req}
        maxLength={c.max}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => cambiar(c.k, e.target.value)}
      />
    )
  }

  return (
    <form onSubmit={enviar} className="formulario">
      {meta.ayuda ? <p className="ayuda">{meta.ayuda}</p> : null}

      {editando && datosCreacion.length ? (
        <div className="datos-creacion">
          <span className="datos-creacion-titulo">Definido al crear (no editable)</span>
          <div className="datos-creacion-lista">
            {datosCreacion.map(function (c) {
              const v = textoDe(item ? item[c.k] : '')
              return (
                <span key={c.k}>
                  <strong>{c.et}:</strong> {v || '—'}
                </span>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="rejilla-campos">
        {camposForm.map(function (c) {
          return (
            <div
              className={'campo' + (c.tipo === 'texto' && (c.max || 0) > 60 ? ' campo-ancho' : '')}
              key={c.k}
            >
              <label htmlFor={'campo-' + c.k}>
                {c.et}
                {c.req ? <span className="obligatorio" title="Obligatorio"> *</span> : null}
              </label>
              {control(c)}
            </div>
          )
        })}
      </div>

      {error ? <p className="mensaje-error" role="alert">{error}</p> : null}

      <div className="formulario-pie">
        <button type="button" className="boton secundario" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" className="boton primario" disabled={enviando}>
          {enviando ? 'Guardando…' : (editando ? 'Guardar cambios' : 'Crear ' + meta.singular.toLowerCase())}
        </button>
      </div>
    </form>
  )
}
