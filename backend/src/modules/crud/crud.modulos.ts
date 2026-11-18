/*********************************************************************
 * crud.modulos.ts — Definiciones declarativas de los módulos CRUD
 * Transcripción de defUsuarios_ / defDocentes_ / defAsignaturas_ /
 * defCompetencias_ / defAsignaciones_ / defTutorias_ / defPeriodos_ /
 * defCursos_ (Users.js, Assignments.js, Subjects.js, Courses.js, Tutoring.js).
 * Cada definición declara: campos con validación, únicos, ganchos y las
 * conversiones hoja ↔ Prisma. El motor (crud.service.ts) valida SIEMPRE.
 *********************************************************************/

import { prisma } from '../../lib/db';
import { Prisma } from '@prisma/client';
import { ErrorApp, exigir } from '../../lib/errors';
import { siguienteIdTx_ } from '../../lib/ids';
import { Ctx, revocarSesiones_ } from '../auth/auth.service';
import {
  claveTemporal_, hashBcrypt_, limpiar_, VERSION_BCRYPT, validarPoliticaClave_,
} from '../auth/auth.util';
import {
  Campo, combinarPrevio_, crudValidar_, esSi_, norm_, num_, ObjHoja, paginar_, ParamsLista,
} from './crud.defs';
import { configClaves, opcionesRef_, OpcionRef } from './crud.refs';
import { alcanceGlobal, exigirPermiso, seccionesAlcanzables } from './autorizacion';

/* ---------------- Tipos ---------------- */

export interface Accion { id: string; et: string; permiso: string; global?: boolean; }

export interface Definicion {
  modulo: string; titulo: string; singular: string;
  idKey: string;          // clave de hoja del id (ID_USUARIO…)
  etiqueta: string;       // campo que identifica el registro en la auditoría
  conAno?: boolean;       // filtra por ANO_ESCOLAR
  estados?: string[];
  permisos: { ver: string; crear: string; editar: string; estado?: string };
  columnas: Array<[string, string]>;
  campos: Campo[];
  buscar: string[];
  filtros?: Array<{ k: string; et: string; ref?: string; opciones?: string[] }>;
  unico?: string[][]; msgUnico?: string;
  ayuda?: string;
  acciones?: Accion[];
  /** Delegado Prisma (nombre de propiedad de prisma) y prefijo de IDs legado. */
  modelo: string; prefijoId: string;
  /** Conversión fila Prisma → objeto de hoja (con SI/NO y CSV en texto). */
  dePrisma: (r: Record<string, unknown>) => ObjHoja;
  /** Conversión objeto hoja validado → data de create/update de Prisma. */
  aPrisma: (o: ObjHoja, nuevo: boolean) => Record<string, unknown>;
  /** Ganchos del legado (crudGuardar_ / crudEstado_). */
  antes?: (o: ObjHoja, ctx: Ctx, nuevo: boolean, previo: ObjHoja | null) => Promise<void> | void;
  despues?: (ctx: Ctx, id: string, o: ObjHoja, nuevo: boolean) => Promise<Record<string, unknown> | null>;
  despuesEstado?: (ctx: Ctx, id: string, estado: string, previo: ObjHoja) => Promise<void> | void;
  decorar?: (items: ObjHoja[], ctx: Ctx) => Promise<ObjHoja[]>;
  listar?: (ctx: Ctx, p: ParamsLista) => Promise<{ items: ObjHoja[]; total: number; pag: number; paginas: number }>;
  guardar?: (ctx: Ctx, p: { id?: string; datos?: ObjHoja }) => Promise<Record<string, unknown>>;
  estado?: (ctx: Ctx, id: string, estado: string) => Promise<unknown>;
}

/* ---------------- Helpers de conversión hoja ↔ Prisma ---------------- */

function t(v: unknown): string | null { const s = limpiar_(v); return s === '' ? null : s; } // texto opcional → null
function nv(o: ObjHoja, k: string): number | null { const n = num_(o[k]); return n === null ? null : Math.floor(n); }
function csv(v: unknown): string[] { return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }

const MESES_SGA = ['ago', 'sep', 'oct', 'nov', 'dic', 'ene', 'feb', 'mar', 'abr', 'may', 'jun']; // Config.js SGA.MESES
const PERIODOS_REGULARES = 4; // Config.js SGA.PERIODOS_REGULARES

function nombreDocente_(d: { titulo: string | null; nombreCompleto: string }): string {
  return ((d.titulo ? d.titulo + ' ' : '') + d.nombreCompleto).replace(/\s+/g, ' ').trim();
}

/* ---------------- Registro de módulos ---------------- */

function definiciones(): Record<string, Definicion> {
  return {
    usuarios: defUsuarios(), docentes: defDocentes(), asignaturas: defAsignaturas(),
    competencias: defCompetencias(), asignaciones: defAsignaciones(), tutorias: defTutorias(),
    periodos: defPeriodos(), cursos: defCursos(),
  };
}

export function def_(modulo: string): Definicion {
  const d = definiciones()[modulo];
  exigir(d, 'Módulo no válido.');
  return d;
}

/* ================= Usuarios (guardar/estado propios del legado) ================= */

function defUsuarios(): Definicion {
  return {
    modulo: 'usuarios', titulo: 'Usuarios', singular: 'Usuario', idKey: 'ID_USUARIO', etiqueta: 'USUARIO',
    modelo: 'user', prefijoId: 'USR',
    permisos: { ver: 'usuarios.ver', crear: 'usuarios.crear', editar: 'usuarios.editar', estado: 'usuarios.eliminar' },
    columnas: [['USUARIO', 'Usuario'], ['NOMBRE_COMPLETO', 'Nombre'], ['CORREO', 'Correo'], ['ROL_TXT', 'Rol'],
      ['DOCENTE_TXT', 'Docente vinculado'], ['ESTADO', 'Estado'], ['ULTIMO_ACCESO', 'Último acceso']],
    campos: [
      { k: 'NOMBRE', et: 'Nombre', tipo: 'texto', req: true, max: 80 },
      { k: 'APELLIDOS', et: 'Apellidos', tipo: 'texto', max: 80 },
      { k: 'CORREO', et: 'Correo (opcional)', tipo: 'correo' },
      { k: 'USUARIO', et: 'Usuario (para iniciar sesión)', tipo: 'patron', patron: '^[a-z0-9._-]{3,30}$', minusculas: true, req: true, soloCrear: true, msg: 'El usuario debe tener de 3 a 30 caracteres: letras minúsculas, números, punto, guion.' },
      { k: 'PIN', et: 'PIN de 4 dígitos (déjelo vacío para que el sistema genere uno; si lo escribe, se cambia el PIN actual)', tipo: 'patron', patron: '^\\d{4}$', msg: 'El PIN debe tener exactamente 4 dígitos.' },
      { k: 'ROL', et: 'Rol', tipo: 'ref', ref: 'roles', req: true },
      { k: 'ID_DOCENTE', et: 'Docente vinculado (para el rol Docente)', tipo: 'ref', ref: 'docentes' },
      { k: 'PERMISOS_EXTRA', et: 'Permisos extra (separados por coma)', tipo: 'csv', max: 400 },
      { k: 'PERMISOS_DENEGADOS', et: 'Permisos denegados (separados por coma)', tipo: 'csv', max: 400 },
    ],
    buscar: ['USUARIO', 'NOMBRE_COMPLETO', 'CORREO'],
    filtros: [{ k: 'ROL', et: 'Rol', ref: 'roles' }, { k: 'ESTADO', et: 'Estado', opciones: ['ACTIVO', 'INACTIVO'] }],
    acciones: [{ id: 'restablecer', et: 'Restablecer acceso', permiso: 'usuarios.editar' }],
    ayuda: 'Cada usuario entra con su nombre de usuario y un PIN de 4 dígitos. Al crear un usuario o restablecer su acceso, el PIN se muestra UNA sola vez: anótelo y entréguelo.',
    dePrisma: function (r) {
      const u = r as unknown as {
        id: string; usuario: string; nombre: string; apellidos: string; correo: string | null;
        rolId: string; teacherId: string | null; permisosExtra: string[]; permisosDenegados: string[];
        estado: string; ultimoAcceso: Date | null; creado: Date | null; modificado: Date | null;
      };
      return {
        ID_USUARIO: u.id, USUARIO: u.usuario, NOMBRE: u.nombre, APELLIDOS: u.apellidos || '',
        CORREO: u.correo || '', ROL: u.rolId, ID_DOCENTE: u.teacherId || '',
        PERMISOS_EXTRA: (u.permisosExtra || []).join(','), PERMISOS_DENEGADOS: (u.permisosDenegados || []).join(','),
        ESTADO: u.estado, ULTIMO_ACCESO: u.ultimoAcceso ? u.ultimoAcceso.toISOString() : '',
        FECHA_CREACION: u.creado ? u.creado.toISOString() : '', FECHA_MODIFICACION: u.modificado ? u.modificado.toISOString() : '',
      };
    },
    aPrisma: function (o) {
      return {
        nombre: String(o.NOMBRE || ''), apellidos: String(o.APELLIDOS || ''), correo: t(o.CORREO),
        rolId: String(o.ROL || ''), teacherId: o.ID_DOCENTE ? String(o.ID_DOCENTE) : null,
        permisosExtra: csv(o.PERMISOS_EXTRA), permisosDenegados: csv(o.PERMISOS_DENEGADOS),
        modificado: new Date(),
      };
    },
    guardar: guardarUsuario_,
    estado: estadoUsuario_,
    decorar: async function (items) {
      const roles = await prisma.role.findMany();
      const docs = await prisma.teacher.findMany();
      const mapR: Record<string, string> = {}, mapD: Record<string, string> = {};
      roles.forEach(function (r) { mapR[r.id] = r.nombre; });
      docs.forEach(function (d) { mapD[d.id] = nombreDocente_(d); });
      return items.map(function (u) {
        u.NOMBRE_COMPLETO = limpiar_(String(u.NOMBRE || '') + ' ' + String(u.APELLIDOS || ''));
        u.ROL_TXT = mapR[String(u.ROL)] || u.ROL;
        u.DOCENTE_TXT = mapD[String(u.ID_DOCENTE)] || '';
        return u;
      });
    },
  };
}

/** permisosValidos_ de Users.js: todos los permisos deben existir en el catálogo. */
async function permisosValidos_(txt: unknown): Promise<string[]> {
  const lista = csv(txt);
  const todos = (await prisma.permission.findMany({ select: { id: true } })).map(function (p) { return p.id; });
  lista.forEach(function (p) { exigir(todos.indexOf(p) >= 0, 'El permiso "' + p + '" no existe.'); });
  return lista;
}

async function adminsActivos_(): Promise<Array<{ id: string }>> {
  return prisma.user.findMany({ where: { rolId: 'ADMINISTRADOR', estado: 'ACTIVO' }, select: { id: true } });
}

async function guardarCredencial_(idUsuario: string, clave: string, debeCambiar: boolean, tx?: Prisma.TransactionClient): Promise<void> {
  // hash NUEVO = bcrypt (el legado guardaba SHA-256×400 con sal + pimienta)
  const db = tx || prisma;
  await db.credential.upsert({
    where: { userId: idUsuario },
    update: { hash: hashBcrypt_(clave), salt: '(bcrypt)', version: VERSION_BCRYPT, debeCambiar: debeCambiar,
              intentosFallidos: 0, bloqueadoHasta: null, fechaCambio: new Date() },
    create: { userId: idUsuario, hash: hashBcrypt_(clave), salt: '(bcrypt)', version: VERSION_BCRYPT,
              debeCambiar: debeCambiar, fechaCambio: new Date() },
  });
}

/** Lista de opciones para validar los campos tipo ref de una definición (según el año de la entrada). */
export async function opcionesParaCampos_(d: Definicion, entrada: ObjHoja): Promise<Record<string, OpcionRef[]>> {
  const refs = new Set<string>();
  d.campos.forEach(function (c) { if (c.tipo === 'ref') refs.add(c.ref as string); });
  const opciones: Record<string, OpcionRef[]> = {};
  const ano = String(entrada.ANO_ESCOLAR || '');
  for (const ref of refs) opciones[ref] = await opcionesRef_(ref, ano || undefined);
  return opciones;
}

/** guardarUsuario_ de Users.js (transcripción con Prisma; los PIN nuevos son bcrypt). */
async function guardarUsuario_(ctx: Ctx, p: { id?: string; datos?: ObjHoja }): Promise<Record<string, unknown>> {
  const d = defUsuarios();
  const nuevo = !p.id;
  const previoRow = nuevo ? null : await prisma.user.findUnique({ where: { id: String(p.id) } });
  exigir(nuevo || previoRow, 'El usuario no existe.');
  const previo = previoRow ? d.dePrisma(previoRow as unknown as Record<string, unknown>) : null;
  const opciones = await opcionesParaCampos_(d, p.datos || {});
  const validado = crudValidar_(d.campos, p.datos || {}, previo, opciones);
  // Edición parcial: conserva los campos no enviados (rolId, permisos, nombre…).
  const o = combinarPrevio_(previo, validado);
  const pinElegido = String(o.PIN || ''); delete o.PIN;
  if (pinElegido) validarPoliticaClave_(pinElegido);
  o.PERMISOS_EXTRA = (await permisosValidos_(o.PERMISOS_EXTRA)).join(',');
  o.PERMISOS_DENEGADOS = (await permisosValidos_(o.PERMISOS_DENEGADOS)).join(',');
  if (o.ROL === 'DOCENTE') exigir(o.ID_DOCENTE, 'Para el rol Docente vincule al docente (así se limita su acceso a sus cursos).');
  const todosU = await prisma.user.findMany({ select: { id: true, usuario: true, correo: true, rolId: true, estado: true } });
  if (o.CORREO) {
    exigir(!todosU.some(function (x) {
      return (!previoRow || x.id !== previoRow.id) && String(x.correo || '').toLowerCase() === String(o.CORREO).toLowerCase();
    }), 'Ya existe un usuario con ese correo.');
  }
  if (nuevo) {
    exigir(!todosU.some(function (x) { return String(x.usuario).toLowerCase() === String(o.USUARIO).toLowerCase(); }), 'Ya existe un usuario con ese nombre de usuario.');
  }
  if (previo && previo.ROL === 'ADMINISTRADOR' && o.ROL !== 'ADMINISTRADOR') {
    const admins = await adminsActivos_();
    exigir(admins.some(function (a) { return a.id !== previo.ID_USUARIO; }), 'No puede quitar el rol al único administrador activo.');
  }
  if (previo && previo.ID_USUARIO === ctx.id) exigir(o.ROL === previo.ROL, 'No puede cambiar su propio rol.');
  if (o.ROL === 'ADMINISTRADOR') exigirPermiso(ctx, 'roles.administrar');

  const ahora = new Date();
  // Usuario + credencial + auditoría en la MISMA transacción (antes quedaban a medias).
  const res = await prisma.$transaction(async function (tx) {
    let idRegistro: string;
    let clave: string | null = null;
    if (nuevo) {
      idRegistro = await siguienteIdTx_(tx, d.prefijoId);
      await tx.user.create({
        data: {
          id: idRegistro, nombre: String(o.NOMBRE || ''), apellidos: String(o.APELLIDOS || ''), correo: t(o.CORREO),
          usuario: String(o.USUARIO || ''), rolId: String(o.ROL || ''), teacherId: o.ID_DOCENTE ? String(o.ID_DOCENTE) : null,
          permisosExtra: csv(o.PERMISOS_EXTRA), permisosDenegados: csv(o.PERMISOS_DENEGADOS),
          estado: 'ACTIVO', creado: ahora, modificado: ahora,
        },
      });
      clave = pinElegido || claveTemporal_();
      await guardarCredencial_(idRegistro, clave, false, tx);
    } else {
      idRegistro = String(p.id);
      await tx.user.update({
        where: { id: idRegistro },
        data: {
          nombre: String(o.NOMBRE || ''), apellidos: String(o.APELLIDOS || ''), correo: t(o.CORREO),
          rolId: String(o.ROL || ''), teacherId: o.ID_DOCENTE ? String(o.ID_DOCENTE) : null,
          permisosExtra: csv(o.PERMISOS_EXTRA), permisosDenegados: csv(o.PERMISOS_DENEGADOS), modificado: ahora,
        },
      });
      if (pinElegido) await guardarCredencial_(idRegistro, pinElegido, false, tx);
    }
    await tx.auditLog.create({
      data: { fecha: ahora, usuario: ctx.usuario, accion: nuevo ? 'CREAR' : 'EDITAR', modulo: 'USUARIOS', idRegistro: idRegistro,
              descripcion: 'Usuario ' + String(o.USUARIO || idRegistro) +
                (previo && previo.ROL !== o.ROL ? ' (rol: ' + previo.ROL + ' → ' + o.ROL + ')' : '') },
    });
    return { id: idRegistro, clave: clave };
  });
  if (!nuevo) {
    if (pinElegido) await revocarSesiones_(res.id);
    else if (previo && (previo.ROL !== o.ROL || previo.PERMISOS_EXTRA !== o.PERMISOS_EXTRA || previo.PERMISOS_DENEGADOS !== o.PERMISOS_DENEGADOS)) {
      await revocarSesiones_(res.id);
    }
  }
  return { id: res.id, claveTemporal: res.clave };
}

/** estadoUsuario_ de Users.js. */
async function estadoUsuario_(ctx: Ctx, id: string, estado: string): Promise<unknown> {
  exigir(['ACTIVO', 'INACTIVO'].indexOf(estado) >= 0, 'Estado no válido.');
  const u = await prisma.user.findUnique({ where: { id: id } });
  exigir(u, 'El usuario no existe.');
  if (estado === 'INACTIVO') {
    exigir(u.id !== ctx.id, 'No puede desactivar su propio usuario.');
    if (u.rolId === 'ADMINISTRADOR') {
      const admins = await adminsActivos_();
      exigir(admins.some(function (a) { return a.id !== u.id; }), 'No puede desactivar al único administrador activo.');
    }
  }
  await prisma.user.update({ where: { id: u.id }, data: { estado: estado, modificado: new Date() } });
  if (estado === 'INACTIVO') await revocarSesiones_(u.id);
  await prisma.auditLog.create({
    data: { fecha: new Date(), usuario: ctx.usuario, accion: 'ESTADO', modulo: 'USUARIOS', idRegistro: u.id,
            descripcion: 'Usuario ' + u.usuario + ': ' + u.estado + ' → ' + estado },
  });
  return true;
}

/** restablecerAcceso_ de Users.js: PIN nuevo (el indicado o generado; se muestra una sola vez) y sesiones cerradas. */
export async function restablecerAcceso_(ctx: Ctx, id: string, pin: unknown): Promise<Record<string, unknown>> {
  exigirPermiso(ctx, 'usuarios.editar');
  const u = await prisma.user.findUnique({ where: { id: id } });
  exigir(u, 'El usuario no existe.');
  const pinTxt = limpiar_(pin);
  if (pinTxt) validarPoliticaClave_(pinTxt);
  const clave = pinTxt || claveTemporal_();
  await guardarCredencial_(u.id, clave, false);
  await revocarSesiones_(u.id);
  await prisma.auditLog.create({
    data: { fecha: new Date(), usuario: ctx.usuario, accion: 'RESTABLECER_ACCESO', modulo: 'USUARIOS', idRegistro: u.id,
            descripcion: 'Acceso restablecido para ' + u.usuario },
  });
  return { claveTemporal: clave, usuario: u.usuario };
}

/* ================= Docentes ================= */

/** crearAccesoDocente_ de Assignments.js: crea el usuario (rol DOCENTE) + credencial. */
export async function crearAccesoDocente_(ctx: Ctx, doc: ObjHoja, usuario: string, pin: string): Promise<Record<string, unknown>> {
  const r = await guardarUsuario_(ctx, {
    datos: {
      NOMBRE: String(doc.NOMBRES || doc.NOMBRE_COMPLETO || ''), APELLIDOS: String(doc.APELLIDOS || ''),
      CORREO: String(doc.CORREO || ''), USUARIO: usuario, ROL: 'DOCENTE', ID_DOCENTE: String(doc.ID_DOCENTE), PIN: pin || '',
    },
  });
  return r;
}

function defDocentes(): Definicion {
  return {
    modulo: 'docentes', titulo: 'Docentes', singular: 'Docente', idKey: 'ID_DOCENTE', etiqueta: 'NOMBRE_COMPLETO',
    modelo: 'teacher', prefijoId: 'DOC',
    permisos: { ver: 'docentes.ver', crear: 'docentes.crear', editar: 'docentes.editar' },
    columnas: [['NOMBRE_COMPLETO', 'Nombre'], ['TITULO', 'Título'], ['USUARIO_TXT', 'Usuario'],
      ['ACCESO_TXT', 'Acceso'], ['CORREO', 'Correo'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'TITULO', et: 'Título (Lic., Licda., Prof.)', tipo: 'texto', max: 15 },
      { k: 'NOMBRES', et: 'Nombres', tipo: 'texto', req: true, max: 80 },
      { k: 'APELLIDOS', et: 'Apellidos', tipo: 'texto', max: 80 },
      { k: 'CORREO', et: 'Correo', tipo: 'correo' },
      { k: 'TELEFONO', et: 'Teléfono', tipo: 'texto', max: 25 },
      { k: 'USUARIO', et: 'Usuario para entrar al sistema (opcional: si lo escribe se crea su acceso)', tipo: 'patron', patron: '^[a-z0-9._-]{3,30}$', minusculas: true, soloCrear: true, msg: 'El usuario debe tener de 3 a 30 caracteres: letras minúsculas, números, punto, guion.' },
      { k: 'PIN', et: 'PIN de 4 dígitos (vacío = automático)', tipo: 'patron', patron: '^\\d{4}$', soloCrear: true, msg: 'El PIN debe tener exactamente 4 dígitos.' },
    ],
    buscar: ['NOMBRE_COMPLETO', 'CORREO', 'USUARIO_TXT'],
    filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ACTIVO', 'INACTIVO'] }],
    acciones: [
      { id: 'acceso', et: 'Acceso / PIN', permiso: 'usuarios.crear' },
      { id: 'accesos', et: 'Crear accesos a todos', permiso: 'usuarios.crear', global: true },
    ],
    ayuda: 'El docente entra con su usuario y un PIN de 4 dígitos. Con "Acceso / PIN" crea o restablece el acceso de un docente; "Crear accesos a todos" lo hace de una vez para quienes aún no tienen.',
    dePrisma: function (r) {
      const d = r as unknown as { id: string; titulo: string | null; nombres: string | null; apellidos: string | null;
        nombreCompleto: string; correo: string | null; telefono: string | null; estado: string };
      return { ID_DOCENTE: d.id, TITULO: d.titulo || '', NOMBRES: d.nombres || '', APELLIDOS: d.apellidos || '',
        NOMBRE_COMPLETO: d.nombreCompleto, CORREO: d.correo || '', TELEFONO: d.telefono || '', ESTADO: d.estado };
    },
    aPrisma: function (o) {
      return { titulo: t(o.TITULO), nombres: t(o.NOMBRES), apellidos: t(o.APELLIDOS),
        nombreCompleto: String(o.NOMBRE_COMPLETO || (limpiar_(String(o.NOMBRES || '') + ' ' + String(o.APELLIDOS || '')))),
        correo: t(o.CORREO), telefono: t(o.TELEFONO), modificado: new Date() };
    },
    antes: function (o, ctx, nuevo) {
      const x = Object.assign({}, o);
      o.NOMBRE_COMPLETO = limpiar_(String(x.NOMBRES || '') + ' ' + String(x.APELLIDOS || ''));
      if (nuevo && (o.USUARIO || o.PIN)) {
        exigir(o.USUARIO, 'Para crear el acceso escriba también el usuario.');
        exigirPermiso(ctx, 'usuarios.crear');
        if (o.PIN) validarPoliticaClave_(String(o.PIN));
      }
    },
    despues: async function (ctx, id, o, nuevo) {
      if (!nuevo || !o.USUARIO) return null;
      const doc = await prisma.teacher.findUnique({ where: { id: id } });
      exigir(doc, 'El docente no existe.');
      const r = await crearAccesoDocente_(ctx, { ID_DOCENTE: id, NOMBRES: doc.nombres, APELLIDOS: doc.apellidos,
        NOMBRE_COMPLETO: doc.nombreCompleto, CORREO: doc.correo || '' }, String(o.USUARIO), String(o.PIN || ''));
      return { claveTemporal: r.claveTemporal };
    },
    despuesEstado: async function (ctx, id, estado) {
      // desactivar un docente también desactiva su acceso y cierra sus sesiones
      if (estado !== 'INACTIVO') return;
      const u = await prisma.user.findUnique({ where: { teacherId: id } });
      if (u && u.estado === 'ACTIVO') await estadoUsuario_(ctx, u.id, 'INACTIVO');
    },
    decorar: async function (items) {
      const us = await prisma.user.findMany({ select: { teacherId: true, usuario: true, estado: true } });
      const map: Record<string, { usuario: string; estado: string }> = {};
      us.forEach(function (u) { if (u.teacherId) map[u.teacherId] = { usuario: u.usuario, estado: u.estado }; });
      return items.map(function (d) {
        const u = map[String(d.ID_DOCENTE)];
        d.USUARIO_TXT = u ? u.usuario : '';
        d.ACCESO_TXT = u ? (u.estado === 'ACTIVO' ? 'Activo' : 'Inactivo') : 'Sin acceso';
        return d;
      }).sort(function (a, b) { return String(a.NOMBRE_COMPLETO).localeCompare(String(b.NOMBRE_COMPLETO), 'es'); });
    },
  };
}

/* ================= Asignaturas ================= */

function defAsignaturas(): Definicion {
  return {
    modulo: 'asignaturas', titulo: 'Asignaturas', singular: 'Asignatura', idKey: 'ID_ASIGNATURA', etiqueta: 'NOMBRE',
    modelo: 'subject', prefijoId: 'ASI',
    permisos: { ver: 'asignaturas.ver', crear: 'asignaturas.crear', editar: 'asignaturas.editar' },
    columnas: [['ORDEN', 'Orden'], ['CODIGO', 'Código'], ['NOMBRE', 'Nombre'], ['AREA', 'Área'], ['GRADOS', 'Grados'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'CODIGO', et: 'Código (ej. MAT)', tipo: 'patron', patron: '^[A-Za-z0-9]{2,8}$', req: true, msg: 'El código debe tener 2 a 8 letras o números.' },
      { k: 'NOMBRE', et: 'Nombre', tipo: 'texto', req: true, max: 100 },
      { k: 'NOMBRE_REPORTE', et: 'Nombre en reportes', tipo: 'texto', max: 60 },
      { k: 'ABREV', et: 'Abreviatura', tipo: 'texto', max: 10 },
      { k: 'AREA', et: 'Área curricular', tipo: 'texto', max: 80 },
      { k: 'GRADOS', et: 'Grados (ej. 1ro,2do,3ro o *)', tipo: 'csv', req: true, max: 60 },
      { k: 'ORDEN', et: 'Orden en listas', tipo: 'num', min: 1, max: 99 },
      { k: 'ORDEN_BOLETIN', et: 'Orden en el boletín', tipo: 'num', min: 1, max: 99 },
      { k: 'USA_RECUPERACION', et: 'Usa recuperación', tipo: 'si_no', defecto: 'SI' },
      { k: 'USA_COMPLETIVA', et: 'Usa completiva', tipo: 'si_no', defecto: 'SI' },
      { k: 'USA_EXTRAORDINARIA', et: 'Usa extraordinaria', tipo: 'si_no', defecto: 'SI' },
      { k: 'USA_ESPECIAL', et: 'Usa evaluación especial', tipo: 'si_no', defecto: 'SI' },
      { k: 'NOTA_MINIMA', et: 'Nota mínima propia (opcional)', tipo: 'num', min: 1, max: 100 },
    ],
    buscar: ['CODIGO', 'NOMBRE', 'AREA'],
    filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ACTIVO', 'INACTIVO'] }],
    dePrisma: function (r) {
      const s = r as unknown as { id: string; codigo: string; nombre: string; nombreReporte: string | null;
        abrev: string | null; area: string; grados: string[]; orden: number; ordenBoletin: number;
        usaRecuperacion: boolean; usaCompletiva: boolean; usaExtraordinaria: boolean; usaEspecial: boolean;
        notaMinima: number | null; estado: string };
      return { ID_ASIGNATURA: s.id, CODIGO: s.codigo, NOMBRE: s.nombre, NOMBRE_REPORTE: s.nombreReporte || '',
        ABREV: s.abrev || '', AREA: s.area, GRADOS: (s.grados || []).join(','), ORDEN: s.orden, ORDEN_BOLETIN: s.ordenBoletin,
        USA_RECUPERACION: s.usaRecuperacion ? 'SI' : 'NO', USA_COMPLETIVA: s.usaCompletiva ? 'SI' : 'NO',
        USA_EXTRAORDINARIA: s.usaExtraordinaria ? 'SI' : 'NO', USA_ESPECIAL: s.usaEspecial ? 'SI' : 'NO',
        NOTA_MINIMA: s.notaMinima === null || s.notaMinima === undefined ? '' : s.notaMinima, ESTADO: s.estado };
    },
    aPrisma: function (o) {
      return {
        codigo: String(o.CODIGO || ''), nombre: String(o.NOMBRE || ''), nombreReporte: t(o.NOMBRE_REPORTE),
        abrev: t(o.ABREV), area: String(o.AREA || ''), grados: csv(o.GRADOS),
        orden: nv(o, 'ORDEN') ?? 99, ordenBoletin: nv(o, 'ORDEN_BOLETIN') ?? (nv(o, 'ORDEN') ?? 99),
        usaRecuperacion: esSi_(o.USA_RECUPERACION), usaCompletiva: esSi_(o.USA_COMPLETIVA),
        usaExtraordinaria: esSi_(o.USA_EXTRAORDINARIA), usaEspecial: esSi_(o.USA_ESPECIAL),
        notaMinima: nv(o, 'NOTA_MINIMA'), modificado: new Date(),
      };
    },
    antes: function (o, _ctx, _nuevo, previo) {
      const x = Object.assign({}, previo || {}, o);
      o.CODIGO = String(x.CODIGO).toUpperCase();
      if (!x.NOMBRE_REPORTE) o.NOMBRE_REPORTE = x.NOMBRE;
      if (!x.ABREV) o.ABREV = String(x.CODIGO).slice(0, 4);
      if (num_(x.ORDEN_BOLETIN) === null && num_(x.ORDEN) !== null) o.ORDEN_BOLETIN = x.ORDEN; // el boletín sigue el orden general si no se indica
    },
    unico: [['CODIGO']], msgUnico: 'Ya existe una asignatura con ese código.',
    decorar: async function (items) {
      return items.sort(function (a, b) { return (num_(a.ORDEN) || 99) - (num_(b.ORDEN) || 99); });
    },
  };
}

/* ================= Competencias ================= */

function defCompetencias(): Definicion {
  return {
    modulo: 'competencias', titulo: 'Competencias', singular: 'Competencia', idKey: 'ID_COMPETENCIA', etiqueta: 'NOMBRE',
    modelo: 'competence', prefijoId: 'COM',
    permisos: { ver: 'asignaturas.ver', crear: 'asignaturas.crear', editar: 'asignaturas.editar' },
    columnas: [['ID_ASIGNATURA_TXT', 'Asignatura'], ['CODIGO', 'Código'], ['NOMBRE', 'Nombre'], ['ABREV', 'Abrev.'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'ID_ASIGNATURA', et: 'Asignatura (* = todas)', tipo: 'ref', ref: 'asignaturas*', req: true },
      { k: 'CODIGO', et: 'Código', tipo: 'enum', opciones: ['C1', 'C2', 'C3', 'C4'], req: true },
      { k: 'NOMBRE', et: 'Nombre', tipo: 'texto', req: true, max: 150 },
      { k: 'ABREV', et: 'Abreviatura (aparece en los reportes)', tipo: 'texto', req: true, max: 10 },
      { k: 'ORDEN', et: 'Orden', tipo: 'num', min: 1, max: 9 },
    ],
    buscar: ['NOMBRE', 'ABREV'],
    filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ACTIVO', 'INACTIVO'] }],
    dePrisma: function (r) {
      const c = r as unknown as { id: string; subjectId: string | null; codigo: string; nombre: string; abrev: string | null; orden: number; estado: string };
      return { ID_COMPETENCIA: c.id, ID_ASIGNATURA: c.subjectId || '*', CODIGO: c.codigo, NOMBRE: c.nombre,
        ABREV: c.abrev || '', ORDEN: c.orden, ESTADO: c.estado };
    },
    aPrisma: function (o) {
      return { subjectId: String(o.ID_ASIGNATURA) === '*' ? null : String(o.ID_ASIGNATURA),
        codigo: String(o.CODIGO || ''), nombre: String(o.NOMBRE || ''), abrev: t(o.ABREV),
        orden: nv(o, 'ORDEN') ?? Number(String(o.CODIGO || 'C1').slice(1)), modificado: new Date() };
    },
    antes: function (o) { if (!num_(o.ORDEN)) o.ORDEN = Number(String(o.CODIGO).slice(1)); },
    unico: [['ID_ASIGNATURA', 'CODIGO']], msgUnico: 'Ya existe esa competencia para la asignatura.',
    decorar: async function (items) {
      const as = await prisma.subject.findMany();
      const a: Record<string, string> = {};
      as.forEach(function (x) { a[x.id] = x.nombre; });
      return items.map(function (c) {
        c.ID_ASIGNATURA_TXT = String(c.ID_ASIGNATURA) === '*' ? 'Todas' : (a[String(c.ID_ASIGNATURA)] || '');
        return c;
      });
    },
  };
}

/* ================= Asignaciones ================= */

function defAsignaciones(): Definicion {
  return {
    modulo: 'asignaciones', titulo: 'Asignación de docentes', singular: 'Asignación', idKey: 'ID_ASIGNACION',
    etiqueta: 'ID_ASIGNATURA', conAno: true, modelo: 'teachingAssignment', prefijoId: 'ASG',
    permisos: { ver: 'asignaciones.ver', crear: 'asignaciones.crear', editar: 'asignaciones.editar' },
    columnas: [['ANO_ESCOLAR', 'Año'], ['CURSO_TXT', 'Curso'], ['ASIGNATURA_TXT', 'Asignatura'],
      ['DOCENTE_TXT', 'Docente'], ['PERIODO_TXT', 'Período'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'ANO_ESCOLAR', et: 'Año escolar (AAAA-AAAA)', tipo: 'patron', patron: '^\\d{4}-\\d{4}$', req: true, soloCrear: true },
      { k: 'ID_SECCION', et: 'Curso y sección', tipo: 'ref', ref: 'secciones', req: true, soloCrear: true },
      { k: 'ID_ASIGNATURA', et: 'Asignatura', tipo: 'ref', ref: 'asignaturas', req: true, soloCrear: true },
      { k: 'ID_DOCENTE', et: 'Docente', tipo: 'ref', ref: 'docentes', req: true },
      { k: 'ID_PERIODO', et: 'Período (Todo el año o uno regular)', tipo: 'ref', ref: 'periodos*', defecto: '*' },
    ],
    buscar: ['CURSO_TXT', 'ASIGNATURA_TXT', 'DOCENTE_TXT'],
    filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ACTIVO', 'INACTIVO'] }],
    ayuda: 'Define qué docente puede registrar calificaciones y asistencia en cada asignatura y curso. Sin asignación, un docente no ve ni modifica nada.',
    dePrisma: function (r) {
      const a = r as unknown as { id: string; schoolYearId: string; sectionId: string; subjectId: string;
        teacherId: string; periodId: string | null; estado: string };
      return { ID_ASIGNACION: a.id, ANO_ESCOLAR: a.schoolYearId, ID_SECCION: a.sectionId, ID_ASIGNATURA: a.subjectId,
        ID_DOCENTE: a.teacherId, ID_PERIODO: a.periodId || '*', ESTADO: a.estado };
    },
    aPrisma: function (o) {
      return { schoolYearId: String(o.ANO_ESCOLAR || ''), sectionId: String(o.ID_SECCION || ''),
        subjectId: String(o.ID_ASIGNATURA || ''), teacherId: String(o.ID_DOCENTE || ''),
        periodId: String(o.ID_PERIODO) === '*' || !o.ID_PERIODO ? null : String(o.ID_PERIODO),
        modificado: new Date() };
    },
    antes: async function (o, _ctx, nuevo) {
      const x = o;
      const sec = await prisma.section.findUnique({ where: { id: String(x.ID_SECCION) }, include: { course: true } });
      exigir(sec, 'El curso no existe.');
      exigir(String(sec.course.schoolYearId) === String(x.ANO_ESCOLAR), 'La sección no corresponde al año escolar indicado.');
      const asig = await prisma.subject.findUnique({ where: { id: String(x.ID_ASIGNATURA) } });
      exigir(asig, 'La asignatura no existe.');
      const doc = await prisma.teacher.findUnique({ where: { id: String(x.ID_DOCENTE) } });
      exigir(doc, 'El docente no existe.');
      exigir(!asig.grados.length || asig.grados.indexOf('*') >= 0 || asig.grados.indexOf(sec.course.grado) >= 0,
        'Esa asignatura no se imparte en ' + sec.course.grado + '.');
      o.ID_CURSO = sec.courseId; // derivado de la sección
      if (!x.ID_PERIODO) o.ID_PERIODO = '*';
      if (x.ID_PERIODO && x.ID_PERIODO !== '*') {
        const per = await prisma.period.findUnique({ where: { id: String(x.ID_PERIODO) } });
        exigir(per && String(per.schoolYearId) === String(x.ANO_ESCOLAR), 'El período no pertenece a ese año escolar.');
      }
      if (nuevo) o.ESTADO = 'ACTIVO';
    },
    unico: [['ANO_ESCOLAR', 'ID_SECCION', 'ID_ASIGNATURA', 'ID_DOCENTE', 'ID_PERIODO']],
    msgUnico: 'Ese docente ya está asignado a esa asignatura, curso y período.',
    decorar: async function (items) {
      const [docs, asg, secs, per] = await Promise.all([
        prisma.teacher.findMany(), prisma.subject.findMany(),
        prisma.section.findMany({ include: { course: true } }), prisma.period.findMany(),
      ]);
      const mD: Record<string, string> = {}, mA: Record<string, string> = {}, mS: Record<string, string> = {}, mP: Record<string, string> = {};
      docs.forEach(function (d) { mD[d.id] = nombreDocente_(d); });
      asg.forEach(function (a) { mA[a.id] = a.nombre; });
      secs.forEach(function (s) { mS[s.id] = s.course.grado + ' ' + s.seccion; });
      per.forEach(function (p) { mP[p.id] = p.codigo; });
      return items.map(function (x) {
        x.DOCENTE_TXT = mD[String(x.ID_DOCENTE)] || '';
        x.ASIGNATURA_TXT = mA[String(x.ID_ASIGNATURA)] || '';
        x.CURSO_TXT = mS[String(x.ID_SECCION)] || '';
        x.PERIODO_TXT = String(x.ID_PERIODO) === '*' || !x.ID_PERIODO ? 'Todo el año' : (mP[String(x.ID_PERIODO)] || '');
        return x;
      }).sort(function (a, b) {
        return String(a.CURSO_TXT).localeCompare(String(b.CURSO_TXT), 'es') || String(a.ASIGNATURA_TXT).localeCompare(String(b.ASIGNATURA_TXT), 'es');
      });
    },
  };
}

/* ================= Tutorías ================= */

function defTutorias(): Definicion {
  return {
    modulo: 'tutorias', titulo: 'Tutorías', singular: 'Tutoría', idKey: 'ID_TUTORIA', etiqueta: 'ID_SECCION',
    conAno: true, estados: ['ACTIVA', 'INACTIVA'], modelo: 'tutoringAssignment', prefijoId: 'TUT',
    permisos: { ver: 'tutorias.ver', crear: 'tutorias.crear', editar: 'tutorias.editar' },
    columnas: [['ANO_ESCOLAR', 'Año'], ['CURSO_TXT', 'Curso'], ['DOCENTE_TXT', 'Docente tutor'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'ANO_ESCOLAR', et: 'Año escolar (AAAA-AAAA)', tipo: 'patron', patron: '^\\d{4}-\\d{4}$', req: true, soloCrear: true },
      { k: 'ID_SECCION', et: 'Curso y sección', tipo: 'ref', ref: 'secciones', req: true, soloCrear: true },
      { k: 'ID_DOCENTE', et: 'Docente tutor', tipo: 'ref', ref: 'docentes', req: true },
    ],
    buscar: ['CURSO_TXT', 'DOCENTE_TXT'],
    filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ACTIVA', 'INACTIVA'] }],
    ayuda: 'El tutor solo recibe información del curso. Para cambiar de tutor, edite la tutoría y elija otro docente.',
    dePrisma: function (r) {
      const a = r as unknown as { id: string; schoolYearId: string; sectionId: string; teacherId: string; estado: string };
      return { ID_TUTORIA: a.id, ANO_ESCOLAR: a.schoolYearId, ID_SECCION: a.sectionId, ID_DOCENTE: a.teacherId, ESTADO: a.estado };
    },
    aPrisma: function (o) {
      return { schoolYearId: String(o.ANO_ESCOLAR || ''), sectionId: String(o.ID_SECCION || ''),
        teacherId: String(o.ID_DOCENTE || ''), modificado: new Date() };
    },
    antes: async function (o, _ctx, nuevo) {
      const sec = await prisma.section.findUnique({ where: { id: String(o.ID_SECCION) }, include: { course: true } });
      exigir(sec, 'El curso no existe.');
      o.ID_CURSO = sec.courseId;
      if (nuevo) { o.ESTADO = 'ACTIVA'; }
      exigir(String(sec.course.schoolYearId) === String(o.ANO_ESCOLAR), 'La sección no corresponde al año escolar indicado.');
      if (nuevo) {
        const otra = await prisma.tutoringAssignment.findFirst({
          where: { schoolYearId: String(o.ANO_ESCOLAR), sectionId: String(o.ID_SECCION), estado: 'ACTIVA' },
        });
        exigir(!otra, 'Esa sección ya tiene un tutor activo. Edite la tutoría existente para cambiarlo.');
      }
    },
    decorar: async function (items) {
      const [docs, secs] = await Promise.all([prisma.teacher.findMany(), prisma.section.findMany({ include: { course: true } })]);
      const mD: Record<string, string> = {}, mS: Record<string, string> = {};
      docs.forEach(function (d) { mD[d.id] = nombreDocente_(d); });
      secs.forEach(function (s) { mS[s.id] = s.course.grado + ' ' + s.seccion; });
      return items.map(function (x) {
        x.DOCENTE_TXT = mD[String(x.ID_DOCENTE)] || ''; x.CURSO_TXT = mS[String(x.ID_SECCION)] || '';
        return x;
      });
    },
  };
}

/* ================= Períodos ================= */

function defPeriodos(): Definicion {
  return {
    modulo: 'periodos', titulo: 'Períodos académicos', singular: 'Período', idKey: 'ID_PERIODO', etiqueta: 'CODIGO',
    conAno: true, estados: ['ABIERTO', 'CERRADO'], modelo: 'period', prefijoId: 'PER',
    permisos: { ver: 'periodos.ver', crear: 'periodos.administrar', editar: 'periodos.administrar', estado: 'calificaciones.cerrar' },
    columnas: [['ANO_ESCOLAR', 'Año'], ['CODIGO', 'Código'], ['NOMBRE', 'Nombre'], ['TIPO', 'Tipo'],
      ['ETAPA', 'Etapa final'], ['ORDEN', 'Orden'], ['MESES', 'Meses (asistencia)'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'ANO_ESCOLAR', et: 'Año escolar (AAAA-AAAA)', tipo: 'patron', patron: '^\\d{4}-\\d{4}$', req: true, soloCrear: true, defecto: '' },
      { k: 'CODIGO', et: 'Código (ej. P1)', tipo: 'texto', req: true, max: 10 },
      { k: 'NOMBRE', et: 'Nombre', tipo: 'texto', req: true, max: 60 },
      { k: 'TIPO', et: 'Tipo', tipo: 'enum', opciones: ['REGULAR', 'ETAPA'], req: true },
      { k: 'ETAPA', et: 'Etapa final (solo si el tipo es ETAPA)', tipo: 'enum', opciones: ['COMPLETIVA', 'EXTRAORDINARIA', 'ESPECIAL'] },
      { k: 'ORDEN', et: 'Orden', tipo: 'num', req: true, min: 1, max: 99 },
      { k: 'MESES', et: 'Meses de asistencia (ago,sep,oct)', tipo: 'csv', max: 60 },
    ],
    buscar: ['CODIGO', 'NOMBRE'],
    filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ABIERTO', 'CERRADO'] }],
    acciones: [{ id: 'duplicar', et: 'Copiar períodos a otro año', permiso: 'periodos.administrar', global: true }],
    ayuda: 'Cierre un período para impedir cambios en sus calificaciones (solo quien tiene el permiso "cerrar" puede modificarlo después). Los 4 períodos REGULARES y las 3 etapas finales alimentan el cálculo de notas.',
    dePrisma: function (r) {
      const p = r as unknown as { id: string; schoolYearId: string; codigo: string; nombre: string; tipo: string;
        etapa: string | null; orden: number; meses: string[]; estado: string };
      return { ID_PERIODO: p.id, ANO_ESCOLAR: p.schoolYearId, CODIGO: p.codigo, NOMBRE: p.nombre, TIPO: p.tipo,
        ETAPA: p.etapa || '', ORDEN: p.orden, MESES: (p.meses || []).join(','), ESTADO: p.estado };
    },
    aPrisma: function (o) {
      return { schoolYearId: String(o.ANO_ESCOLAR || ''), codigo: String(o.CODIGO || ''), nombre: String(o.NOMBRE || ''),
        tipo: String(o.TIPO || ''), etapa: o.TIPO === 'ETAPA' && o.ETAPA ? String(o.ETAPA) : null,
        orden: nv(o, 'ORDEN') ?? 0, meses: csv(o.MESES), modificado: new Date() };
    },
    antes: async function (o, _ctx, _nuevo, previo) {
      const x = Object.assign({}, previo || {}, o);
      if (x.TIPO === 'ETAPA') exigir(x.ETAPA, 'Indique la etapa final (completiva, extraordinaria o especial).');
      else o.ETAPA = '';
      const meses = csv(x.MESES);
      meses.forEach(function (m) { exigir(MESES_SGA.indexOf(m) >= 0, 'Mes no válido: ' + m + '. Use: ' + MESES_SGA.join(', ') + '.'); });
      o.MESES = meses.join(',');
      const ano = String(x.ANO_ESCOLAR);
      const otros = await prisma.period.findMany({ where: { schoolYearId: ano, ...(previo ? { id: { not: previo.ID_PERIODO as string } } : {}) } });
      if (x.TIPO === 'REGULAR') {
        exigir(otros.filter(function (p) { return p.tipo === 'REGULAR'; }).length < PERIODOS_REGULARES,
          'Un año escolar tiene como máximo ' + PERIODOS_REGULARES + ' períodos regulares.');
      } else {
        exigir(!otros.some(function (p) { return p.etapa === x.ETAPA; }), 'Ya existe esa etapa final en el año escolar.');
      }
    },
    unico: [['ANO_ESCOLAR', 'CODIGO']], msgUnico: 'Ya existe un período con ese código en el año escolar.',
    decorar: async function (items) {
      return items.sort(function (a, b) {
        return String(b.ANO_ESCOLAR).localeCompare(String(a.ANO_ESCOLAR)) || num_(a.ORDEN)! - num_(b.ORDEN)!;
      });
    },
  };
}

/* ================= Cursos y secciones (listar/guardar/estado propios) ================= */

function defCursos(): Definicion {
  return {
    modulo: 'cursos', titulo: 'Cursos y secciones', singular: 'Curso/sección', idKey: 'ID_SECCION', etiqueta: 'GRADO',
    conAno: true, modelo: 'section', prefijoId: 'SEC',
    permisos: { ver: 'cursos.ver', crear: 'cursos.crear', editar: 'cursos.editar' },
    columnas: [['ANO_ESCOLAR', 'Año'], ['GRADO', 'Grado'], ['SECCION', 'Sección'], ['TUTOR_TXT', 'Docente tutor'],
      ['ESTUDIANTES', 'Estudiantes'], ['ESTADO', 'Estado']],
    campos: [
      { k: 'ANO_ESCOLAR', et: 'Año escolar (AAAA-AAAA)', tipo: 'patron', patron: '^\\d{4}-\\d{4}$', req: true, soloCrear: true },
      { k: 'GRADO', et: 'Grado', tipo: 'ref', ref: 'grados', req: true, soloCrear: true },
      { k: 'SECCION', et: 'Sección (ej. A)', tipo: 'patron', patron: '^[A-Z0-9]{1,3}$', req: true },
      { k: 'ID_DOCENTE_TUTOR', et: 'Docente tutor (opcional)', tipo: 'ref', ref: 'docentes' },
    ],
    buscar: ['GRADO', 'SECCION', 'TUTOR_TXT'],
    filtros: [{ k: 'ESTADO', et: 'Estado', opciones: ['ACTIVO', 'INACTIVO'] }],
    ayuda: 'Un curso es el grado dentro de un año escolar; la sección es la letra. Las calificaciones y estudiantes se relacionan con la sección.',
    // listar/guardar/estado son propios (defCursos_ del legado): estas conversiones no se usan
    dePrisma: function (r) { return r as ObjHoja; },
    aPrisma: function (o) { return { modificado: new Date() }; },
    listar: async function (ctx, p) {
      const cfg = await configClaves([]);
      const ano = String(p.filtro?.ANO_ESCOLAR || cfg.ANO_ESCOLAR);
      const ids = alcanceGlobal(ctx, 'cursos') ? null : await seccionesAlcanzables(ctx, ano);
      const permitidas = await prisma.section.findMany({
        where: { estado: 'ACTIVO', course: { schoolYearId: ano, estado: 'ACTIVO' }, ...(ids ? { id: { in: ids } } : {}) },
        include: { course: true },
      });
      const cuenta: Record<string, number> = {};
      const ins = await prisma.enrollment.findMany({ where: { estado: { not: 'RETIRADO' } }, select: { sectionId: true } });
      ins.forEach(function (i) { cuenta[i.sectionId] = (cuenta[i.sectionId] || 0) + 1; });
      const tutor: Record<string, string> = {};
      const tutorId: Record<string, string> = {};
      const tuts = await prisma.tutoringAssignment.findMany({ where: { schoolYearId: ano, estado: 'ACTIVA' }, include: { teacher: true } });
      tuts.forEach(function (t) { tutor[t.sectionId] = nombreDocente_(t.teacher); tutorId[t.sectionId] = t.teacherId; });
      const items = permitidas.map(function (s) {
        return { ID_SECCION: s.id, ID_CURSO: s.courseId, ANO_ESCOLAR: s.course.schoolYearId, GRADO: s.course.grado,
          SECCION: s.seccion, ID_DOCENTE_TUTOR: tutorId[s.id] || '', TUTOR_TXT: tutor[s.id] || '',
          ESTUDIANTES: cuenta[s.id] || 0, ESTADO: s.estado };
      });
      return paginar_(items, p, ['GRADO', 'SECCION', 'TUTOR_TXT']);
    },
    guardar: async function (ctx, p) {
      const d = defCursos();
      const nuevo = !p.id;
      const e = p.datos || {};
      let sec: { id: string; courseId: string; seccion: string; estado: string;
                 course: { schoolYearId: string; grado: string } } | null = null;
      if (!nuevo) {
        sec = await prisma.section.findUnique({ where: { id: String(p.id) }, include: { course: true } });
        exigir(sec, 'La sección no existe.');
      }
      // Al editar, el año y el grado viven en la sección: se pasan como previo para
      // que la validación no los exija (son soloCrear) y para conservar la sección.
      const previo: ObjHoja | null = sec ? {
        ID_SECCION: sec.id, ANO_ESCOLAR: sec.course.schoolYearId, GRADO: sec.course.grado,
        SECCION: sec.seccion, ID_DOCENTE_TUTOR: '', ESTADO: sec.estado,
      } : null;
      const contexto = Object.assign({}, e, { ANO_ESCOLAR: nuevo ? e.ANO_ESCOLAR : previo!.ANO_ESCOLAR });
      const opciones = await opcionesParaCampos_(d, contexto);
      const validado = crudValidar_(d.campos, e, previo, opciones);
      const o = combinarPrevio_(previo, validado);
      const cfg = await configClaves([]);
      const ano = String(nuevo ? o.ANO_ESCOLAR : sec!.course.schoolYearId);
      const grado = String(nuevo ? o.GRADO : sec!.course.grado);
      const seccion = String(o.SECCION);
      const duplicada = await prisma.section.findFirst({
        where: { seccion: seccion, course: { schoolYearId: ano, grado: grado }, ...(sec ? { id: { not: sec.id } } : {}) },
      });
      exigir(!duplicada, 'Ya existe la sección ' + grado + ' ' + seccion + ' en ' + ano + '.');

      // Solo se toca la tutoría si el campo vino explícitamente; '' quita al tutor.
      const tutorEnviado = Object.prototype.hasOwnProperty.call(e, 'ID_DOCENTE_TUTOR') && e.ID_DOCENTE_TUTOR !== undefined;
      const tutorId = tutorEnviado ? String(e.ID_DOCENTE_TUTOR ?? '') : null;

      const idSeccion = await prisma.$transaction(async function (tx) {
        let idSec: string;
        let courseId: string;
        const ahora = new Date();
        if (nuevo) {
          // el curso (grado del año) se crea si no existe
          let curso = await tx.course.findUnique({ where: { schoolYearId_grado: { schoolYearId: ano, grado: grado } } });
          if (!curso) {
            const idCurso = await siguienteIdTx_(tx, 'CUR');
            curso = await tx.course.create({
              data: { id: idCurso, schoolYearId: ano, nivel: cfg.NIVEL, grado: grado,
                estado: 'ACTIVO', creado: ahora, modificado: ahora },
            });
          }
          courseId = curso.id;
          idSec = await siguienteIdTx_(tx, d.prefijoId);
          await tx.section.create({
            data: { id: idSec, courseId: courseId, seccion: seccion, estado: 'ACTIVO', creado: ahora, modificado: ahora },
          });
        } else {
          idSec = sec!.id;
          courseId = sec!.courseId;
          await tx.section.update({ where: { id: idSec }, data: { seccion: seccion, modificado: ahora } });
        }
        // asignarTutor_: reemplaza la tutoría ACTIVA de la sección (o la cierra si se quitó)
        if (tutorEnviado) {
          const activa = await tx.tutoringAssignment.findFirst({ where: { schoolYearId: ano, sectionId: idSec, estado: 'ACTIVA' } });
          if (!tutorId) {
            if (activa) await tx.tutoringAssignment.update({ where: { id: activa.id }, data: { estado: 'INACTIVA', modificado: ahora } });
          } else if (!activa || activa.teacherId !== tutorId) {
            if (activa) await tx.tutoringAssignment.update({ where: { id: activa.id }, data: { estado: 'INACTIVA', modificado: ahora } });
            const idTut = await siguienteIdTx_(tx, 'TUT');
            await tx.tutoringAssignment.create({
              data: { id: idTut, schoolYearId: ano, teacherId: tutorId, courseId: courseId, sectionId: idSec,
                estado: 'ACTIVA', creado: ahora, modificado: ahora },
            });
          }
        }
        await tx.auditLog.create({
          data: { fecha: ahora, usuario: ctx.usuario, accion: nuevo ? 'CREAR' : 'EDITAR', modulo: 'SECCIONES', idRegistro: idSec,
                  descripcion: 'Curso ' + grado + ' ' + seccion + ' (' + ano + ')' },
        });
        return idSec;
      });
      return { id: idSeccion };
    },
    estado: async function (ctx, id, estado) {
      exigir(['ACTIVO', 'INACTIVO'].indexOf(estado) >= 0, 'Estado no válido.');
      const sec = await prisma.section.findUnique({ where: { id: id } });
      exigir(sec, 'La sección no existe.');
      await prisma.$transaction(async function (tx) {
        await tx.section.update({ where: { id: id }, data: { estado: estado, modificado: new Date() } });
        await tx.auditLog.create({
          data: { fecha: new Date(), usuario: ctx.usuario, accion: 'ESTADO', modulo: 'SECCIONES', idRegistro: id, descripcion: 'Sección ' + estado },
        });
      });
      return true;
    },
    decorar: async function (items) { return items; },
  };
}

/* ================= Acciones de docentes (docentes.acceso / accesosMasivo) ================= */

/** usuarioSugerido_ de Assignments.js: "karina", "karinaf", "karinaf2"… */
function usuarioSugerido_(doc: { nombres?: string | null; apellidos?: string | null; nombreCompleto?: string | null },
  ocupados: Record<string, true>): string {
  const limpio = function (t: unknown): string { return norm_(t).replace(/ /g, ''); };
  let base = limpio(doc.nombres || String(doc.nombreCompleto || '').split(' ')[0]).slice(0, 16);
  if (base.length < 3) base = (base + 'doc').slice(0, 6);
  const ini = limpio(doc.apellidos || '').charAt(0);
  const cand: string[] = [base, base + ini];
  for (let i = 2; i < 60; i++) cand.push(base + ini + i);
  return cand.filter(function (c) { return c.length >= 3 && !ocupados[c]; })[0] || (base + Date.now());
}

async function usuariosOcupados_(): Promise<Record<string, true>> {
  const us = await prisma.user.findMany({ select: { usuario: true } });
  const o: Record<string, true> = {};
  us.forEach(function (u) { o[String(u.usuario).toLowerCase()] = true; });
  return o;
}

/**
 * docenteAcceso_ de Assignments.js: crea el acceso de un docente o, si ya lo
 * tiene, le asigna un PIN nuevo y lo reactiva. Devuelve el PIN una sola vez.
 */
export async function docenteAcceso_(ctx: Ctx, p: { id?: unknown; usuario?: unknown; pin?: unknown }): Promise<Record<string, unknown>> {
  const doc = await prisma.teacher.findUnique({ where: { id: String(p.id || '') } });
  exigir(doc, 'El docente no existe.');
  const u = await prisma.user.findUnique({ where: { teacherId: doc.id } });
  const pin = limpiar_(p.pin);
  if (pin) validarPoliticaClave_(pin);
  if (u) {
    exigirPermiso(ctx, 'usuarios.editar');
    const nuevoPin = pin || claveTemporal_();
    await prisma.$transaction(async function (tx) {
      await guardarCredencial_(u.id, nuevoPin, false, tx);
      if (u.estado !== 'ACTIVO') await tx.user.update({ where: { id: u.id }, data: { estado: 'ACTIVO', modificado: new Date() } });
      await tx.auditLog.create({
        data: { fecha: new Date(), usuario: ctx.usuario, accion: 'RESTABLECER_ACCESO', modulo: 'USUARIOS', idRegistro: u.id,
                descripcion: 'PIN restablecido para ' + u.usuario },
      });
    });
    await revocarSesiones_(u.id);
    return { usuario: u.usuario, pin: nuevoPin, nuevo: false };
  }
  exigirPermiso(ctx, 'usuarios.crear');
  const usuario = limpiar_(p.usuario).toLowerCase() || usuarioSugerido_(doc, await usuariosOcupados_());
  const r = await crearAccesoDocente_(ctx, {
    ID_DOCENTE: doc.id, NOMBRES: doc.nombres, APELLIDOS: doc.apellidos,
    NOMBRE_COMPLETO: doc.nombreCompleto, CORREO: doc.correo || '',
  }, usuario, pin);
  return { usuario: usuario, pin: r.claveTemporal, nuevo: true };
}

/** docentesAccesosMasivo_ de Assignments.js: acceso para todos los docentes activos sin usuario. */
export async function docentesAccesosMasivos_(ctx: Ctx): Promise<{ creados: Array<Record<string, unknown>>; total: number }> {
  exigirPermiso(ctx, 'usuarios.crear');
  const [docs, conUsuario, ocupados] = await Promise.all([
    prisma.teacher.findMany({ where: { estado: { not: 'INACTIVO' } }, orderBy: { nombreCompleto: 'asc' } }),
    prisma.user.findMany({ where: { teacherId: { not: null } }, select: { teacherId: true } }),
    usuariosOcupados_(),
  ]);
  const con = new Set<string>();
  conUsuario.forEach(function (u) { if (u.teacherId) con.add(u.teacherId); });
  const salida: Array<Record<string, unknown>> = [];
  for (const d of docs) {
    if (con.has(d.id)) continue;
    const usuario = usuarioSugerido_(d, ocupados);
    ocupados[usuario] = true;
    const r = await crearAccesoDocente_(ctx, {
      ID_DOCENTE: d.id, NOMBRES: d.nombres, APELLIDOS: d.apellidos,
      NOMBRE_COMPLETO: d.nombreCompleto, CORREO: d.correo || '',
    }, usuario, '');
    salida.push({ docente: nombreDocente_(d), usuario: usuario, pin: r.claveTemporal });
  }
  // Se devuelve un objeto (no un arreglo): la capa HTTP añade {ok:true}.
  return { creados: salida, total: salida.length };
}

/* ================= Períodos (periodos.duplicar) ================= */

/** duplicarPeriodos_ de Courses.js: copia los períodos a un año sin períodos. */
export async function duplicarPeriodos_(ctx: Ctx, p: { origen?: unknown; destino?: unknown }): Promise<Record<string, unknown>> {
  exigirPermiso(ctx, 'periodos.administrar');
  const origen = String(limpiar_(p.origen));
  const destino = String(limpiar_(p.destino));
  exigir(origen, 'Escriba el año de origen.');
  exigir(destino, 'Escriba el año de destino.');
  exigir(/^\d{4}-\d{4}$/.test(destino), 'El año de destino debe tener el formato AAAA-AAAA.');
  const src = await prisma.period.findMany({ where: { schoolYearId: origen }, orderBy: { orden: 'asc' } });
  exigir(src.length, 'El año de origen no tiene períodos.');
  const anioDestino = await prisma.schoolYear.findUnique({ where: { id: destino } });
  exigir(anioDestino, 'El año de destino no existe. Créelo antes de copiar los períodos.');
  exigir(!(await prisma.period.count({ where: { schoolYearId: destino } })), 'El año de destino ya tiene períodos.');
  const creados = await prisma.$transaction(async function (tx) {
    const ahora = new Date();
    for (const x of src) {
      const id = await siguienteIdTx_(tx, 'PER');
      await tx.period.create({
        data: { id: id, schoolYearId: destino, codigo: x.codigo, nombre: x.nombre, tipo: x.tipo, etapa: x.etapa,
                orden: x.orden, meses: x.meses, estado: 'ABIERTO', creado: ahora, modificado: ahora },
      });
    }
    await tx.auditLog.create({
      data: { fecha: ahora, usuario: ctx.usuario, accion: 'CREAR', modulo: 'PERIODOS', idRegistro: destino,
              descripcion: 'Períodos copiados de ' + origen + ' a ' + destino },
    });
    return src.length;
  });
  return { creados: creados };
}
