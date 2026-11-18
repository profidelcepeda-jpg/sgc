import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../lib/api'
import type { AccionMeta, Listado, Meta } from '../tipos'
import { Formulario } from './Formulario'
import { Modal } from './Modal'

interface Props {
  modulo: string
}

interface Aviso {
  tipo: 'ok' | 'info' | 'error'
  texto: string
}

interface Resultado {
  titulo: string
  nota?: string
  campos: Array<{ et: string; valor: string }>
}

interface RespuestaGuardar {
  ok: boolean
  id: string
  claveTemporal?: string | null
}

interface RespuestaRestablecer {
  ok: boolean
  usuario: string
  claveTemporal: string
}

interface RespuestaAcceso {
  ok: boolean
  usuario: string
  pin: string
  nuevo: boolean
}

interface FilaAcceso {
  docente: string
  usuario: string
  pin: string
}

interface RespuestaMasiva {
  ok: boolean
  creados: FilaAcceso[]
  total: number
}

interface RespuestaDuplicar {
  ok: boolean
  creados: number
}

const TAM = 15

function esEstado(s: string): boolean {
  return /^(ACTIVO|INACTIVO|ACTIVA|INACTIVA|ABIERTO|CERRADO)$/.test(s)
}

function valorCelda(v: unknown) {
  if (v === null || v === undefined || v === '') return <span className="celda-vacia">—</span>
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  const s = String(v)
  if (esEstado(s)) {
    const apagado = /^(INACTIVO|INACTIVA|CERRADO)$/.test(s)
    return <span className={'etiqueta ' + (apagado ? 'etiqueta-apagada' : 'etiqueta-activa')}>{s}</span>
  }
  // Fechas ISO de la API → formato local legible.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('es-DO', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    }
  }
  return s
}

function siguienteEstado(estados: string[], actual: string): string {
  const i = estados.indexOf(actual)
  return i >= 0 ? estados[(i + 1) % estados.length] : estados[0]
}

function etiquetaEstado(estados: string[], actual: string): string {
  const s = siguienteEstado(estados, actual)
  const mapa: Record<string, string> = {
    ACTIVO: 'Activar', INACTIVO: 'Desactivar', ACTIVA: 'Activar', INACTIVA: 'Desactivar',
    ABIERTO: 'Cerrar', CERRADO: 'Reabrir',
  }
  return mapa[s] || s
}

/** Módulo de mantenimiento genérico: lista, busca, crea, edita y cambia estados. */
export function ModuloCrud({ modulo }: Props) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [errorMeta, setErrorMeta] = useState('')
  const [listado, setListado] = useState<Listado | null>(null)
  const [errorLista, setErrorLista] = useState('')
  const [aviso, setAviso] = useState<Aviso | null>(null)

  const [q, setQ] = useState('')
  const [qAplicada, setQAplicada] = useState('')
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  const [ano, setAno] = useState('')
  const [anoTexto, setAnoTexto] = useState('')
  const [pag, setPag] = useState(1)
  const [recarga, setRecarga] = useState(0)

  const [form, setForm] = useState<{ item: Record<string, unknown> | null } | null>(null)
  const [accion, setAccion] = useState<{ meta: AccionMeta; fila?: Record<string, unknown> } | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  // El componente se monta de nuevo por módulo (key en App), así que el estado
  // inicial ya es el correcto: aquí solo se carga la definición.
  useEffect(function () {
    let vivo = true
    api<Meta>('/api/crud/' + modulo + '/meta').then(function (r) {
      if (!vivo) return
      setMeta(r)
      setAno(r.anoActual || '')
      setAnoTexto(r.anoActual || '')
    }, function (e) {
      if (!vivo) return
      setErrorMeta(mensajeDeError(e))
    })
    return function () { vivo = false }
  }, [modulo])

  useEffect(function () {
    if (!meta) return
    let vivo = true

    const p = new URLSearchParams()
    p.set('pag', String(pag))
    p.set('tam', String(TAM))
    if (qAplicada) p.set('q', qAplicada)
    Object.keys(filtros).forEach(function (k) {
      if (filtros[k]) p.set('f_' + k, filtros[k])
    })
    if (meta.conAno && ano) p.set('f_ANO_ESCOLAR', ano)

    api<Listado>('/api/crud/' + modulo + '?' + p.toString()).then(function (r) {
      if (!vivo) return
      setListado(r)
      setErrorLista('')
    }, function (e) {
      if (vivo) setErrorLista(mensajeDeError(e))
    })
    return function () { vivo = false }
  }, [meta, modulo, pag, qAplicada, filtros, ano, recarga])

  async function guardar(id: string | undefined, datos: Record<string, unknown>): Promise<void> {
    if (!meta) return
    const r = await api<RespuestaGuardar>('/api/crud/' + modulo, {
      method: 'POST',
      body: { id: id, datos: datos },
    })
    setForm(null)
    setAviso({ tipo: 'ok', texto: id ? 'Cambios guardados correctamente.' : 'Registro creado correctamente.' })
    setRecarga(function (n) { return n + 1 })
    if (r.claveTemporal) {
      setResultado({
        titulo: id ? 'PIN actualizado' : 'Acceso generado',
        nota: 'Entregue este PIN a la persona indicada. No se volverá a mostrar.',
        campos: [
          { et: 'Usuario', valor: String(datos.USUARIO || '') || '—' },
          { et: 'PIN', valor: String(r.claveTemporal) },
        ],
      })
    }
  }

  async function cambiarEstado(fila: Record<string, unknown>): Promise<void> {
    if (!meta) return
    const actual = String(fila.ESTADO || '')
    const siguiente = siguienteEstado(meta.estados, actual)
    if (!window.confirm('¿Cambiar el estado de “' + actual + '” a “' + siguiente + '”?')) return
    try {
      await api('/api/crud/' + modulo + '/estado', {
        method: 'POST',
        body: { id: String(fila[meta.idKey]), estado: siguiente },
      })
      setAviso({ tipo: 'ok', texto: 'Estado actualizado a ' + siguiente + '.' })
      setRecarga(function (n) { return n + 1 })
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeDeError(e) })
    }
  }

  function aplicarAno(): void {
    setAno(anoTexto.trim())
    setPag(1)
  }

  if (errorMeta) {
    return (
      <div className="tarjeta">
        <h2>No se pudo abrir el módulo</h2>
        <p className="mensaje-error">{errorMeta}</p>
      </div>
    )
  }

  if (!meta) {
    return <div className="tarjeta cargando">Cargando módulo…</div>
  }

  const accionesFila = meta.acciones.filter(function (a) { return !a.global })
  const accionesGlobales = meta.acciones.filter(function (a) { return !!a.global })
  const hayAcciones = meta.puedeEditar || meta.puedeEstado || accionesFila.length > 0

  return (
    <div className="modulo">
      {meta.ayuda ? <p className="ayuda ayuda-modulo">{meta.ayuda}</p> : null}

      <div className="barra-herramientas">
        <form
          className="buscador"
          onSubmit={function (e) {
            e.preventDefault()
            setQAplicada(q.trim())
            setPag(1)
          }}
        >
          <input
            type="search"
            value={q}
            placeholder={'Buscar en ' + meta.titulo.toLowerCase() + '…'}
            aria-label="Buscar"
            onChange={function (e) { setQ(e.target.value) }}
          />
          <button type="submit" className="boton secundario">Buscar</button>
          {qAplicada ? (
            <button
              type="button"
              className="boton texto"
              onClick={function () { setQ(''); setQAplicada(''); setPag(1) }}
            >
              Limpiar
            </button>
          ) : null}
        </form>

        <div className="acciones-barra">
          {accionesGlobales.map(function (a) {
            return (
              <button key={a.id} type="button" className="boton secundario" onClick={function () { setAccion({ meta: a }) }}>
                {a.et}
              </button>
            )
          })}
          {meta.puedeCrear ? (
            <button type="button" className="boton primario" onClick={function () { setForm({ item: null }) }}>
              + Nuevo {meta.singular.toLowerCase()}
            </button>
          ) : null}
        </div>
      </div>

      <div className="filtros">
        {meta.conAno ? (
          <label className="filtro">
            <span>Año escolar</span>
            <span className="filtro-ano">
              <input
                type="text"
                value={anoTexto}
                placeholder="2026-2027"
                maxLength={9}
                onChange={function (e) { setAnoTexto(e.target.value) }}
                onBlur={aplicarAno}
                onKeyDown={function (e) { if (e.key === 'Enter') { e.preventDefault(); aplicarAno() } }}
              />
              <button type="button" className="boton texto" onClick={aplicarAno}>Ver</button>
            </span>
          </label>
        ) : null}

        {meta.filtros.map(function (f) {
          const opciones = f.ref
            ? (meta.opciones[f.ref] || []).map(function (o) { return { id: o.id, texto: o.texto } })
            : (f.opciones || []).map(function (o) { return { id: o, texto: o } })
          return (
            <label className="filtro" key={f.k}>
              <span>{f.et}</span>
              <select
                value={filtros[f.k] || ''}
                onChange={function (e) {
                  const v = e.target.value
                  setFiltros(function (previo) {
                    const n = Object.assign({}, previo)
                    if (v) n[f.k] = v
                    else delete n[f.k]
                    return n
                  })
                  setPag(1)
                }}
              >
                <option value="">Todos</option>
                {opciones.map(function (o) { return <option key={o.id} value={o.id}>{o.texto}</option> })}
              </select>
            </label>
          )
        })}
      </div>

      {aviso ? (
        <div className={'aviso aviso-' + aviso.tipo} role="status">
          <span>{aviso.texto}</span>
          <button type="button" className="boton-icono" onClick={function () { setAviso(null) }} aria-label="Cerrar aviso">×</button>
        </div>
      ) : null}
      {errorLista ? <p className="mensaje-error">{errorLista}</p> : null}

      <div className="tarjeta tabla-tarjeta">
        {!listado ? <p className="cargando">Cargando datos…</p> : null}
        {listado && listado.items.length === 0 ? (
          <div className="vacio-tabla">
            <strong>No hay registros que mostrar.</strong>
            <span>Ajuste la búsqueda o cree el primero con «Nuevo {meta.singular.toLowerCase()}».</span>
          </div>
        ) : null}
        {listado && listado.items.length > 0 ? (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  {meta.columnas.map(function (c) { return <th key={c[0]}>{c[1]}</th> })}
                  {hayAcciones ? <th className="columna-acciones">Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {listado.items.map(function (fila, i) {
                  return (
                    <tr key={String(fila[meta.idKey] || i)}>
                      {meta.columnas.map(function (c) {
                        return <td key={c[0]}>{valorCelda(fila[c[0]])}</td>
                      })}
                      {hayAcciones ? (
                        <td className="columna-acciones">
                          <div className="acciones-fila">
                            {meta.puedeEditar ? (
                              <button type="button" className="enlace" onClick={function () { setForm({ item: fila }) }}>
                                Editar
                              </button>
                            ) : null}
                            {meta.puedeEstado ? (
                              <button type="button" className="enlace" onClick={function () { void cambiarEstado(fila) }}>
                                {etiquetaEstado(meta.estados, String(fila.ESTADO || ''))}
                              </button>
                            ) : null}
                            {accionesFila.map(function (a) {
                              return (
                                <button key={a.id} type="button" className="enlace"
                                  onClick={function () { setAccion({ meta: a, fila: fila }) }}>
                                  {a.et}
                                </button>
                              )
                            })}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {listado ? (
        <div className="paginacion">
          <span>
            {listado.total} registro{listado.total === 1 ? '' : 's'} · página {listado.pag} de {listado.paginas}
          </span>
          <div>
            <button type="button" className="boton secundario" disabled={listado.pag <= 1}
              onClick={function () { setPag(function (n) { return Math.max(1, n - 1) }) }}>
              ← Anterior
            </button>
            <button type="button" className="boton secundario" disabled={listado.pag >= listado.paginas}
              onClick={function () { setPag(function (n) { return n + 1 }) }}>
              Siguiente →
            </button>
          </div>
        </div>
      ) : null}

      {form ? (
        <Modal
          titulo={(form.item ? 'Editar ' : 'Nuevo ') + meta.singular.toLowerCase()}
          subtitulo={form.item ? String(form.item[meta.idKey] || '') : 'Complete los datos. El servidor valida todo antes de guardar.'}
          ancho="ancho"
          onCerrar={function () { setForm(null) }}
        >
          <Formulario
            meta={meta}
            item={form.item}
            onGuardar={guardar}
            onCerrar={function () { setForm(null) }}
          />
        </Modal>
      ) : null}

      {accion ? (
        <DialogoAccion
          key={accion.meta.id + ':' + (accion.fila ? String(accion.fila[meta.idKey]) : 'global')}
          meta={meta}
          accion={accion.meta}
          fila={accion.fila}
          onCerrar={function () { setAccion(null) }}
          onResultado={function (r) { setAccion(null); setResultado(r); setRecarga(function (n) { return n + 1 }) }}
          onAviso={function (a) { setAccion(null); setAviso(a); setRecarga(function (n) { return n + 1 }) }}
        />
      ) : null}

      {resultado ? <DialogoResultado resultado={resultado} onCerrar={function () { setResultado(null) }} /> : null}
    </div>
  )
}

/* ================= Acciones (restablecer / acceso / masivo / duplicar) ================= */

interface PropsAccion {
  meta: Meta
  accion: AccionMeta
  fila?: Record<string, unknown>
  onCerrar: () => void
  onResultado: (r: Resultado) => void
  onAviso: (a: Aviso) => void
}

function DialogoAccion({ meta, accion, fila, onCerrar, onResultado, onAviso }: PropsAccion) {
  const [pin, setPin] = useState('')
  const [usuario, setUsuario] = useState('')
  const [origen, setOrigen] = useState(meta.anoActual || '')
  const [destino, setDestino] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const idRegistro = fila ? String(fila[meta.idKey] || '') : ''
  const referencia = fila
    ? String(fila.NOMBRE_COMPLETO || fila.USUARIO || fila.GRADO || idRegistro)
    : ''

  async function ejecutar(): Promise<void> {
    setError('')
    setEnviando(true)
    try {
      if (accion.id === 'restablecer') {
        const r = await api<RespuestaRestablecer>('/api/crud/usuarios/' + idRegistro + '/restablecer', {
          method: 'POST', body: { pin: pin.trim() },
        })
        onResultado({
          titulo: 'Acceso restablecido',
          nota: 'Entregue este PIN al usuario. Sus sesiones anteriores quedaron cerradas.',
          campos: [
            { et: 'Usuario', valor: r.usuario },
            { et: 'PIN nuevo', valor: r.claveTemporal },
          ],
        })
      } else if (accion.id === 'acceso') {
        const r = await api<RespuestaAcceso>('/api/crud/docentes/' + idRegistro + '/acceso', {
          method: 'POST', body: { usuario: usuario.trim(), pin: pin.trim() },
        })
        onResultado({
          titulo: r.nuevo ? 'Acceso creado' : 'PIN restablecido',
          nota: 'Entregue estas credenciales al docente. El PIN no se vuelve a mostrar.',
          campos: [
            { et: 'Docente', valor: referencia },
            { et: 'Usuario', valor: r.usuario },
            { et: 'PIN', valor: r.pin },
          ],
        })
      } else if (accion.id === 'accesos') {
        const r = await api<RespuestaMasiva>('/api/crud/docentes/accesos-masivos', { method: 'POST' })
        if (!r.total) {
          onAviso({ tipo: 'info', texto: 'Todos los docentes activos ya tienen acceso.' })
        } else {
          onResultado({
            titulo: r.total + ' acceso' + (r.total === 1 ? '' : 's') + ' creado' + (r.total === 1 ? '' : 's'),
            nota: 'Anote los PIN ahora: no se pueden recuperar del hash.',
            campos: r.creados.map(function (x) {
              return { et: x.docente, valor: x.usuario + ' · PIN ' + x.pin }
            }),
          })
        }
      } else if (accion.id === 'duplicar') {
        const r = await api<RespuestaDuplicar>('/api/crud/periodos/duplicar', {
          method: 'POST', body: { origen: origen.trim(), destino: destino.trim() },
        })
        onAviso({ tipo: 'ok', texto: 'Se copiaron ' + r.creados + ' período(s) a ' + destino.trim() + '.' })
      } else {
        throw new Error('Acción no disponible.')
      }
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const titulos: Record<string, string> = {
    restablecer: 'Restablecer acceso',
    acceso: 'Acceso del docente',
    accesos: 'Crear accesos a todos',
    duplicar: 'Copiar períodos a otro año',
  }
  const titulo = titulos[accion.id] || accion.et

  return (
    <Modal
      titulo={titulo}
      subtitulo={referencia || undefined}
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="boton secundario" onClick={onCerrar} disabled={enviando}>Cancelar</button>
          <button type="button" className="boton primario" onClick={() => void ejecutar()} disabled={enviando}>
            {enviando ? 'Procesando…' : titulo}
          </button>
        </>
      }
    >
      {accion.id === 'restablecer' ? (
        <>
          <p className="ayuda">
            Se creará un PIN nuevo y se cerrarán las sesiones abiertas del usuario. Si deja el
            campo vacío, el sistema genera un PIN aleatorio.
          </p>
          <div className="campo">
            <label htmlFor="accion-pin">PIN nuevo (opcional)</label>
            <input id="accion-pin" type="text" inputMode="numeric" maxLength={4} value={pin}
              placeholder="4 dígitos" onChange={function (e) { setPin(e.target.value) }} />
          </div>
        </>
      ) : null}

      {accion.id === 'acceso' ? (
        <>
          <p className="ayuda">
            Si el docente ya tiene usuario, se le asigna un PIN nuevo. Si no lo tiene, se crea
            su acceso con el rol Docente.
          </p>
          <div className="campo">
            <label htmlFor="accion-usuario">Usuario (opcional al crear)</label>
            <input id="accion-usuario" type="text" value={usuario} autoComplete="off"
              placeholder="se sugiere automáticamente"
              onChange={function (e) { setUsuario(e.target.value) }} />
          </div>
          <div className="campo">
            <label htmlFor="accion-pin2">PIN (vacío = automático)</label>
            <input id="accion-pin2" type="text" inputMode="numeric" maxLength={4} value={pin}
              placeholder="4 dígitos" onChange={function (e) { setPin(e.target.value) }} />
          </div>
        </>
      ) : null}

      {accion.id === 'accesos' ? (
        <p className="ayuda">
          Se creará un acceso con PIN temporal para cada docente activo que todavía no tenga
          usuario. Los PIN se muestran una sola vez al terminar.
        </p>
      ) : null}

      {accion.id === 'duplicar' ? (
        <>
          <p className="ayuda">
            Copia los períodos de un año a otro que no tenga ninguno. El año de destino debe
            existir y tener el formato AAAA-AAAA.
          </p>
          <div className="rejilla-campos">
            <div className="campo">
              <label htmlFor="accion-origen">Año de origen</label>
              <input id="accion-origen" type="text" value={origen} placeholder="2026-2027"
                onChange={function (e) { setOrigen(e.target.value) }} />
            </div>
            <div className="campo">
              <label htmlFor="accion-destino">Año de destino</label>
              <input id="accion-destino" type="text" value={destino} placeholder="2027-2028"
                onChange={function (e) { setDestino(e.target.value) }} />
            </div>
          </div>
        </>
      ) : null}

      {error ? <p className="mensaje-error" role="alert">{error}</p> : null}
    </Modal>
  )
}

function DialogoResultado({ resultado, onCerrar }: { resultado: Resultado; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const texto = resultado.campos.map(function (c) { return c.et + ': ' + c.valor }).join('\n')

  async function copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <Modal
      titulo={resultado.titulo}
      subtitulo="Guarde esta información antes de cerrar."
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="boton secundario" onClick={() => void copiar()}>
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
          <button type="button" className="boton primario" onClick={onCerrar}>Listo</button>
        </>
      }
    >
      {resultado.nota ? <p className="aviso aviso-info">{resultado.nota}</p> : null}
      <dl className="lista-resultado">
        {resultado.campos.map(function (c, i) {
          return (
            <div key={c.et + i}>
              <dt>{c.et}</dt>
              <dd>{c.valor}</dd>
            </div>
          )
        })}
      </dl>
    </Modal>
  )
}
