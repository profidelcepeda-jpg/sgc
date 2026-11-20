/*********************************************************************
 * formato.ts — Utilidades de presentación compartidas
 * Evita repetir la construcción de query strings y el formato numérico
 * en cada módulo del frontend.
 *********************************************************************/

export type ValorConsulta = string | number | boolean | null | undefined

/** Construye un query string omitiendo valores vacíos. */
export function qs(valores: Record<string, ValorConsulta>): string {
  return new URLSearchParams(
    Object.entries(valores)
      .filter(function ([, v]) { return String(v ?? '') !== '' })
      .map(function ([k, v]) { return [k, String(v)] }),
  ).toString()
}

/** Formato numérico local; devuelve `vacio` cuando no hay valor. */
export function formatearNumero(valor: number | null | undefined, decimales = 2, vacio = '—'): string {
  if (valor === null || valor === undefined) return vacio
  return valor.toLocaleString('es-DO', { maximumFractionDigits: decimales })
}

/** Fecha local en formato AAAA-MM-DD (valor de <input type="date">). */
export function formatearFechaISO(fecha: Date): string {
  return fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0') + '-' + String(fecha.getDate()).padStart(2, '0')
}
