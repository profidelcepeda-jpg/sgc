# Política de permisos y alcance académico

El CRUD académico separa dos cosas que no deben confundirse:

1. **Permiso funcional**: qué acción puede intentar el usuario (`ver`, `crear`,
   `editar`, `estado`, `administrar`).
2. **Alcance**: sobre qué registros puede ejercerla. Siempre se resuelve en el
   servidor desde PostgreSQL; ningún ID enviado por el cliente concede acceso.

Implementación: `backend/src/modules/crud/autorizacion.ts`. Se aplica a los
módulos `cursos`, `asignaciones`, `tutorias` y `periodos`.

## Matriz permiso → alcance

| Permiso | Módulos con alcance global |
|---|---|
| rol `ADMINISTRADOR` | todos |
| `cursos.ver_todos` | cursos, asignaciones, tutorías y períodos |
| `cursos.crear` / `cursos.editar` | cursos |
| `asignaciones.crear` / `asignaciones.editar` | asignaciones |
| `tutorias.crear` / `tutorias.editar` | tutorías |
| `periodos.administrar` | períodos |

Sin ninguno de esos permisos, el alcance se limita a las secciones y años donde
el usuario tiene una relación académica **activa**: asignación lectiva `ACTIVO`
o tutoría `ACTIVA`, siempre con sección y curso activos.

## Reglas que no se deben romper

- Los permisos `*.ver` **no** otorgan alcance global.
- Crear o editar exige ver el universo sobre el que se opera; por eso los
  permisos de escritura del módulo implican alcance global. Es una decisión de
  diseño, no un efecto accidental.
- Una tutoría concede **lectura** del curso, nunca escritura académica. La
  escritura de notas exige asignación lectiva activa (`docenteAsignadoActivo`).
- Si el registro está fuera de alcance se responde `NO_ENCONTRADO`, no
  `PERMISO`: no se revela si el ID existe.
- El alcance de una edición se revalida con los datos de destino, no solo con
  los datos previos.

## Estado real de los roles

En la base actual:

| Rol | Permisos académicos relevantes |
|---|---|
| `ADMINISTRADOR` | todos por rol |
| `COORDINADOR` | `cursos.ver`, `cursos.ver_todos`, `asignaciones.ver`, `periodos.ver`, `tutorias.ver` |
| `CONSULTA` | `cursos.ver`, `cursos.ver_todos`, `periodos.ver`, `tutorias.ver` |
| `DOCENTE` | `cursos.ver`, `periodos.ver`, `tutorias.ver` |

Ningún rol distinto de `ADMINISTRADOR` tiene hoy `*.crear`, `*.editar` ni
`periodos.administrar` sobre módulos académicos. La regla de alcance global por
escritura es, por tanto, latente: si en el futuro se concede uno de esos
permisos a un rol nuevo, ese rol verá todo el módulo por diseño.

## Pruebas

`backend/src/modules/crud/autorizacion.test.ts` fija esta política: alcance
global por rol y por permiso, restricción a relaciones activas, denegación de
edición cruzada por ID y separación lectura/escritura de tutorías.
