/*********************************************************************
 * crud.validation.test.ts — Tests del motor CRUD (funciones puras, sin BD)
 * Comportamientos transcritos de Crud.js: crudValidar_, crudUnico_,
 * paginar_ y generadorId_.
 *********************************************************************/

import { describe, it, expect } from 'vitest';
import {
  crudValidar_, crudUnico_, paginar_, siguienteId_, combinarPrevio_, Campo, ObjHoja,
} from './crud.defs';
import { ErrorApp } from '../../lib/errors';

/** rech: la validación debe lanzar ErrorApp. */
function rech(fn: () => unknown): boolean {
  try { fn(); return false; } catch (e) { return e instanceof ErrorApp; }
}

const campos: Campo[] = [
  { k: 'CODIGO', et: 'Código', tipo: 'patron', patron: '^[A-Za-z0-9]{2,8}$', req: true, msg: 'código malo' },
  { k: 'NOMBRE', et: 'Nombre', tipo: 'texto', req: true, max: 100 },
  { k: 'AREA', et: 'Área', tipo: 'texto', max: 5 },
  { k: 'ORDEN', et: 'Orden', tipo: 'num', min: 1, max: 99 },
  { k: 'USO', et: 'Uso', tipo: 'si_no', defecto: 'SI' },
  { k: 'CORREO', et: 'Correo', tipo: 'correo' },
  { k: 'TIPO', et: 'Tipo', tipo: 'enum', opciones: ['REGULAR', 'ETAPA'] },
  { k: 'ROL', et: 'Rol', tipo: 'ref', ref: 'roles' },
  { k: 'MESES', et: 'Meses', tipo: 'csv', req: true },
  { k: 'USUARIO', et: 'Usuario', tipo: 'patron', patron: '^[a-z0-9._-]{3,30}$', minusculas: true, soloCrear: true },
];

const opciones = { roles: [{ id: 'DOCENTE' }, { id: 'COORDINADOR' }] };

describe('crudValidar_ (transcripción de Crud.js)', () => {
  it('campos requeridos y tipos básicos', () => {
    const o = crudValidar_(campos, { CODIGO: 'MAT', NOMBRE: 'Matemática', ORDEN: '5', MESES: 'ago, sep' }, null, opciones);
    expect(o.CODIGO).toBe('MAT');
    expect(o.NOMBRE).toBe('Matemática');
    expect(o.ORDEN).toBe(5);          // num → número
    expect(o.USO).toBe('SI');         // si_no con defecto SI
    expect(o.MESES).toBe('ago,sep');  // csv normalizado
  });

  it('req faltante rechaza con ErrorApp', () => {
    expect(rech(function () { return crudValidar_(campos, { NOMBRE: 'x', MESES: '' }, null, opciones); })).toBe(true);
  });

  it('num fuera de rango y no numérico rechazan', () => {
    expect(rech(function () { return crudValidar_(campos, { CODIGO: 'A1', NOMBRE: 'x', ORDEN: 150, MESES: 'ago' }, null, opciones); })).toBe(true);
    expect(rech(function () { return crudValidar_(campos, { CODIGO: 'A1', NOMBRE: 'x', ORDEN: 'abc', MESES: 'ago' }, null, opciones); })).toBe(true);
  });

  it('texto demasiado largo rechaza', () => {
    expect(rech(function () { return crudValidar_(campos, { CODIGO: 'A1', NOMBRE: 'x', AREA: 'demasiado largo', MESES: 'ago' }, null, opciones); })).toBe(true);
  });

  it('correo inválido rechaza y válido se normaliza en minúsculas', () => {
    expect(rech(function () { return crudValidar_(campos, { CODIGO: 'A1', NOMBRE: 'x', CORREO: 'a@b', MESES: 'ago' }, null, opciones); })).toBe(true);
    const o = crudValidar_(campos, { CODIGO: 'A1', NOMBRE: 'x', CORREO: 'A@B.co', MESES: 'ago' }, null, opciones);
    expect(o.CORREO).toBe('a@b.co');
  });

  it('enum y ref inválidos rechazan', () => {
    expect(rech(function () { return crudValidar_(campos, { CODIGO: 'A1', NOMBRE: 'x', TIPO: 'MENSUAL', MESES: 'ago' }, null, opciones); })).toBe(true);
    expect(rech(function () { return crudValidar_(campos, { CODIGO: 'A1', NOMBRE: 'x', ROL: 'JEFE', MESES: 'ago' }, null, opciones); })).toBe(true);
    const o = crudValidar_(campos, { CODIGO: 'A1', NOMBRE: 'x', ROL: 'DOCENTE', MESES: 'ago' }, null, opciones);
    expect(o.ROL).toBe('DOCENTE');
  });

  it('patron con mensaje propio y minusculas', () => {
    expect(rech(function () { return crudValidar_(campos, { CODIGO: '!', NOMBRE: 'x', MESES: 'ago' }, null, opciones); })).toBe(true);
    const o = crudValidar_(campos, { CODIGO: 'MAT', NOMBRE: 'x', USUARIO: 'MARIA.P', MESES: 'ago' }, null, opciones);
    expect(o.USUARIO).toBe('maria.p');
  });

  it('soloCrear no se modifica al editar (se conserva el previo)', () => {
    const previo: ObjHoja = { CODIGO: 'VIEJO', USUARIO: 'viejo' };
    const o = crudValidar_(campos, { CODIGO: 'NUEVO', USUARIO: 'otro', NOMBRE: 'x', MESES: 'ago' }, previo, opciones);
    expect(o.CODIGO).toBe('NUEVO');   // editable: se toma el nuevo
    expect(o.USUARIO).toBeUndefined(); // soloCrear: ignorado al editar
  });

  it('campos no enviados al editar se toman del previo (no se borran)', () => {
    const previo: ObjHoja = { NOMBRE: 'Anterior', ORDEN: 3 };
    const o = crudValidar_(campos, { CODIGO: 'A1', MESES: 'ago' }, previo, opciones);
    expect(o.NOMBRE).toBeUndefined(); // v === undefined y hay previo → se conserva
    expect(o.ORDEN).toBeUndefined();
  });

  it('sin previo, vacío opcional queda "" y req vacío rechaza', () => {
    const o = crudValidar_(campos, { CODIGO: 'A1', NOMBRE: 'x', MESES: 'ago' }, null, opciones);
    expect(o.CORREO).toBe('');
    expect(o.AREA).toBe('');
    expect(o.ORDEN).toBe('');
    expect(o.USO).toBe('SI');
  });
});

describe('combinarPrevio_ (edición parcial sin pérdida de datos)', () => {
  it('los campos no enviados se conservan', () => {
    const previo: ObjHoja = { NOMBRE: 'Anterior', ORDEN: 3, USUARIO: 'viejo' };
    const validado = crudValidar_(campos, { CODIGO: 'A1', MESES: 'ago' }, previo, opciones);
    const o = combinarPrevio_(previo, validado);
    expect(o.NOMBRE).toBe('Anterior');
    expect(o.ORDEN).toBe(3);
    expect(o.USUARIO).toBe('viejo');   // soloCrear: se conserva el previo
  });

  it('un campo enviado vacío se borra (no se conserva)', () => {
    const previo: ObjHoja = { CORREO: 'a@b.co' };
    const validado = crudValidar_(campos, { CODIGO: 'A1', NOMBRE: 'x', CORREO: '', MESES: 'ago' }, previo, opciones);
    const o = combinarPrevio_(previo, validado);
    expect(o.CORREO).toBe('');
  });

  it('sin previo devuelve solo lo validado', () => {
    const o = combinarPrevio_(null, { CODIGO: 'A1' });
    expect(o.CODIGO).toBe('A1');
    expect(Object.keys(o).length).toBe(1);
  });
});

describe('crudUnico_ (transcripción de Crud.js)', () => {
  const items: ObjHoja[] = [
    { ID: 'X-1', CODIGO: 'MAT', ESTADO: 'ACTIVO' },
    { ID: 'X-2', CODIGO: 'HIS', ESTADO: 'INACTIVO' }, // inactivo: ignorable
    { ID: 'X-3', CODIGO: 'FIS', ESTADO: 'ACTIVO' },
  ];
  it('duplicado activo rechaza (norm_ quita acentos y mayúsculas)', () => {
    expect(rech(function () {
      return crudUnico_([['CODIGO']], { CODIGO: 'MÁT' }, null, items, 'ID', 'Ya existe.');
    })).toBe(true);
  });
  it('el propio registro no cuenta como duplicado', () => {
    const previo: ObjHoja = { ID: 'X-1', CODIGO: 'MAT' };
    crudUnico_([['CODIGO']], { CODIGO: 'MAT' }, previo, items, 'ID', 'Ya existe.'); // no debe lanzar
    expect(true).toBe(true);
  });
  it('inactivos no cuentan para la unicidad', () => {
    crudUnico_([['CODIGO']], { CODIGO: 'his' }, null, items, 'ID', 'Ya existe.');
    expect(true).toBe(true);
  });
  it('código libre pasa', () => {
    crudUnico_([['CODIGO']], { CODIGO: 'QUI' }, null, items, 'ID', 'Ya existe.');
    expect(true).toBe(true);
  });
});

describe('paginar_ (transcripción del legado)', () => {
  const items: ObjHoja[] = [
    { ID: '1', NOMBRE: 'Matemática', ESTADO: 'ACTIVO' },
    { ID: '2', NOMBRE: 'Lengua', ESTADO: 'INACTIVO' },
    { ID: '3', NOMBRE: 'Física', ESTADO: 'ACTIVO' },
  ];
  it('búsqueda por q en campos declarados', () => {
    const r = paginar_(items, { q: 'mat' }, ['NOMBRE']);
    expect(r.total).toBe(1);
    expect(r.items[0].ID).toBe('1');
  });
  it('filtro exacto por campo', () => {
    const r = paginar_(items, { filtro: { ESTADO: 'ACTIVO' } }, ['NOMBRE']);
    expect(r.total).toBe(2);
  });
  it('paginación con tamaños', () => {
    const r = paginar_(items, { pag: 2, tam: 2 }, ['NOMBRE']);
    expect(r.paginas).toBe(2);
    expect(r.items.length).toBe(1);
    expect(r.items[0].ID).toBe('3');
  });
  it('orden alfabético', () => {
    const r = paginar_(items, { orden: 'NOMBRE' }, ['NOMBRE']);
    expect(r.items[0].NOMBRE).toBe('Física');
  });
});

describe('siguienteId_ (generadorId_ del legado)', () => {
  it('siguiente al mayor existente, con ceros', () => {
    expect(siguienteId_(['ASI-000001', 'ASI-000007', 'ASI-000012'], 'ASI')).toBe('ASI-000013');
  });
  it('sin registros → 000001', () => {
    expect(siguienteId_([], 'USR')).toBe('USR-000001');
  });
  it('ignora ids de otro prefijo', () => {
    expect(siguienteId_(['PER-000009', 'ASI-000003'], 'ASI')).toBe('ASI-000004');
  });
});
