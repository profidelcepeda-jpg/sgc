/*********************************************************************
 * crud.service.ts — Motor genérico de mantenimiento (listar / guardar / estado)
 * Transcripción de crudMeta_ / crudListar_ / crudGuardar_ / crudEstado_
 * (Crud.js) a Prisma. Cada módulo solo DECLARA su definición (crud.modulos.ts);
 * el motor valida SIEMPRE en el servidor y escribe la auditoría transaccional.
 *********************************************************************/

import { prisma } from '../../lib/db';
import { Prisma } from '@prisma/client';
import { ErrorApp, exigir } from '../../lib/errors';
import { siguienteIdTx_ } from '../../lib/ids';
import { Ctx } from '../auth/auth.service';
import {
  combinarPrevio_, crudCambios_, crudUnico_, crudValidar_, ObjHoja, paginar_, ParamsLista,
} from './crud.defs';
import { OpcionRef, opcionesRef_, configClaves } from './crud.refs';
import { def_, Definicion, opcionesParaCampos_ } from './crud.modulos';
import { esModuloAcademico, filtrarAlcanceListado, exigirAlcancePorId, exigirAlcanceRegistro, exigirPermiso as exigirPermisoCentral } from './autorizacion';

interface Delegado {
  findMany: (a?: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
  findUnique: (a: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  create: (a: Record<string, unknown>) => Promise<Record<string, unknown>>;
  update: (a: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

type Base = Prisma.TransactionClient | typeof prisma;

function delegadoEn(base: Base, d: Definicion): Delegado {
  const dep = (base as unknown as Record<string, Delegado | undefined>)[d.modelo];
  exigir(dep, 'Delegado no válido: ' + d.modelo);
  return dep;
}

function delegado(d: Definicion): Delegado { return delegadoEn(prisma, d); }

/** exigirPermiso_ del legado. */
export function exigirPermiso_(ctx: Ctx, permiso: string): void {
  exigirPermisoCentral(ctx, permiso);
}

function recursoDeHoja_(o: ObjHoja | null): { ano?: string; seccion?: string; docente?: string; asignatura?: string; periodo?: string; estado?: string } {
  if (!o) return {};
  const periodo = String(o.ID_PERIODO || '');
  return {
    ano: String(o.ANO_ESCOLAR || ''), seccion: String(o.ID_SECCION || ''),
    docente: String(o.ID_DOCENTE || ''), asignatura: String(o.ID_ASIGNATURA || ''),
    periodo: periodo && periodo !== '*' ? periodo : undefined, estado: String(o.ESTADO || ''),
  };
}

/* ---------------- META (definición para la interfaz) ---------------- */

export async function crudMeta(ctx: Ctx, modulo: string) {
  const d = def_(modulo);
  exigirPermiso_(ctx, d.permisos.ver);
  const cfg = await configClaves([]);
  const opciones: Record<string, OpcionRef[]> = {};
  const refs = new Set<string>();
  d.campos.forEach(function (c) { if (c.tipo === 'ref') refs.add(c.ref as string); });
  (d.filtros || []).forEach(function (f) { if (f.ref) refs.add(f.ref); });
  for (const ref of refs) opciones[ref] = await opcionesRef_(ref, cfg.ANO_ESCOLAR, ctx);
  return {
    modulo: modulo, idKey: d.idKey, titulo: d.titulo, singular: d.singular,
    columnas: d.columnas, campos: d.campos, filtros: d.filtros || [], conAno: !!d.conAno,
    anoActual: cfg.ANO_ESCOLAR,
    estados: d.estados || ['ACTIVO', 'INACTIVO'],
    acciones: (d.acciones || []).filter(function (a) { return ctx.set[a.permiso] === true; }),
    puedeCrear: ctx.set[d.permisos.crear] === true,
    puedeEditar: ctx.set[d.permisos.editar] === true,
    puedeEstado: ctx.set[(d.permisos.estado || d.permisos.editar)] === true,
    ayuda: d.ayuda || '', opciones: opciones,
  };
}

/* ---------------- LISTAR ---------------- */

export async function crudListar(ctx: Ctx, modulo: string, p: ParamsLista) {
  const d = def_(modulo);
  exigirPermiso_(ctx, d.permisos.ver);
  const cfg = await configClaves([]);
  const tam = p.tam || Number(cfg.FILAS_POR_PAGINA) || 20;
  if (d.listar) return d.listar(ctx, Object.assign({}, p, { tam: tam }));
  const deleg = delegado(d);
  const where: Record<string, unknown> = {};
  const ano = d.conAno ? String(p.filtro?.ANO_ESCOLAR || cfg.ANO_ESCOLAR) : undefined;
  if (ano) where.schoolYearId = ano;
  if (esModuloAcademico(modulo)) Object.assign(where, await filtrarAlcanceListado(ctx, modulo, ano));
  let items = (await deleg.findMany({ where: where })).map(function (r) { return d.dePrisma(r); });
  if (d.decorar) items = await d.decorar(items, ctx);
  return paginar_(items, Object.assign({}, p, { tam: tam }), d.buscar);
}

/* ---------------- GUARDAR ---------------- */

export async function crudGuardar(ctx: Ctx, modulo: string, p: { id?: string; datos?: ObjHoja }): Promise<Record<string, unknown>> {
  const d = def_(modulo);
  p = p || {};
  const nuevo = !p.id;
  exigirPermiso_(ctx, nuevo ? d.permisos.crear : d.permisos.editar);
  if (d.guardar) {
    if (!nuevo && esModuloAcademico(modulo)) await exigirAlcancePorId(ctx, modulo, 'editar', String(p.id));
    return d.guardar(ctx, p);
  }

  const previoRow = nuevo ? null : await delegado(d).findUnique({ where: { id: String(p.id) } });
  exigir(nuevo || previoRow, 'El registro no existe.');
  const previo = previoRow ? d.dePrisma(previoRow) : null;
  if (previo && esModuloAcademico(modulo)) {
    await exigirAlcanceRegistro(ctx, modulo, 'editar', recursoDeHoja_(previo));
  }
  const validado = crudValidar_(d.campos, p.datos || {}, previo, await opcionesParaCampos_(d, p.datos || {}));
  // Edición parcial: los campos no enviados se conservan (antes se escribían como '').
  // Además deja disponibles los campos soloCrear (año, sección, asignatura) a los ganchos.
  const o = combinarPrevio_(previo, validado);
  if (d.antes) await d.antes(o, ctx, nuevo, previo);
  if (esModuloAcademico(modulo)) {
    await exigirAlcanceRegistro(ctx, modulo, nuevo ? 'crear' : 'editar', recursoDeHoja_(o));
  }
  if (d.unico && d.unico.length) {
    const where: Record<string, unknown> = {};
    if (d.conAno) where.schoolYearId = String(o.ANO_ESCOLAR || (previo && previo.ANO_ESCOLAR) || '');
    const items = (await delegado(d).findMany({ where: where })).map(function (r) { return d.dePrisma(r); });
    crudUnico_(d.unico, o, previo, items, d.idKey, d.msgUnico);
  }

  const ahora = new Date();
  // Registro + auditoría + secuencia de ID en la MISMA transacción.
  const id = await prisma.$transaction(async function (tx) {
    const deleg = delegadoEn(tx, d);
    let idRegistro: string;
    if (nuevo) {
      idRegistro = await siguienteIdTx_(tx, d.prefijoId);
      const data = d.aPrisma(o, true);
      data.id = idRegistro; data.creado = ahora; data.modificado = ahora;
      if (o.ESTADO) data.estado = String(o.ESTADO);
      await deleg.create({ data: data });
    } else {
      idRegistro = String(p.id);
      const data = d.aPrisma(o, false);
      if (o.ESTADO && !('estado' in data) && d.estados && (d.estados as string[]).indexOf(String(o.ESTADO)) >= 0) {
        data.estado = String(o.ESTADO); // los estados propios de cada módulo (ACTIVA…) viajan con el registro
      }
      await deleg.update({ where: { id: idRegistro }, data: data });
    }
    await tx.auditLog.create({
      data: {
        fecha: ahora, usuario: ctx.usuario, accion: nuevo ? 'CREAR' : 'EDITAR', modulo: d.modulo.toUpperCase(),
        idRegistro: idRegistro, descripcion: d.singular + ': ' + String(o[d.etiqueta] || idRegistro),
        valorAnterior: nuevo ? undefined : (crudCambios_(previo, o) as unknown as object),
      },
    });
    return idRegistro;
  });
  const extra = d.despues ? await d.despues(ctx, id, o, nuevo) : null;
  return Object.assign({ id: id }, extra || {});
}

/* ---------------- ESTADO (activar / desactivar / cerrar) ---------------- */

export async function crudEstado(ctx: Ctx, modulo: string, id: string, estado: string): Promise<unknown> {
  const d = def_(modulo);
  exigirPermiso_(ctx, d.permisos.estado || d.permisos.editar);
  if (d.estado) {
    if (esModuloAcademico(modulo)) await exigirAlcancePorId(ctx, modulo, 'estado', id);
    return d.estado(ctx, id, estado);
  }
  const deleg = delegado(d);
  const previoRow = await deleg.findUnique({ where: { id: id } });
  exigir(previoRow, 'El registro no existe.');
  const est = d.estados || ['ACTIVO', 'INACTIVO'];
  exigir(est.indexOf(estado) >= 0, 'Estado no válido.');
  const previo = d.dePrisma(previoRow);
  if (esModuloAcademico(modulo)) {
    await exigirAlcanceRegistro(ctx, modulo, 'estado', recursoDeHoja_(previo));
  }
  await prisma.$transaction(async function (tx) {
    const deleg = delegadoEn(tx, d);
    await deleg.update({ where: { id: id }, data: { estado: estado, modificado: new Date() } });
    await tx.auditLog.create({
      data: { fecha: new Date(), usuario: ctx.usuario, accion: 'ESTADO', modulo: d.modulo.toUpperCase(), idRegistro: id,
              descripcion: d.singular + ': ' + String(previo.ESTADO) + ' → ' + estado },
    });
  });
  if (d.despuesEstado) await d.despuesEstado(ctx, id, estado, previo);
  return true;
}
