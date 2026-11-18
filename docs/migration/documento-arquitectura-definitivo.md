# Documento técnico de arquitectura definitiva del SGA

> Migración de Google Apps Script → React + TypeScript + Node.js + PostgreSQL
> Basado en el código real del legacy (Fase 1 de auditoría completada). Fecha: 2026-11-17.

Este documento consolida las cuatro auditorías del sistema original. Cada tema tiene un
documento detallado independiente; aquí se presenta la síntesis, las decisiones y el plan.

## Documentos de referencia (auditoría completa)

| Documento | Contenido |
|---|---|
| [`docs/database/modelo-datos-legacy.md`](../database/modelo-datos-legacy.md) | Las 23 hojas con columnas exactas, relaciones/FK, sistema de IDs, CONFIG_DEFECTO, roles y 41 permisos, bloqueos/caché/auditoría, mapeo propuesto a PostgreSQL |
| [`docs/modules/motor-calificaciones.md`](../modules/motor-calificaciones.md) | Motor académico: 35 campos del registro, fórmulas transcritas literalmente, reglas de períodos/recuperaciones/etapas, 24 casos de prueba como golden tests |
| [`docs/architecture/api-y-seguridad-legacy.md`](../architecture/api-y-seguridad-legacy.md) | Las 39 rutas de la API, autenticación (SHA-256×400 + pepper), sesiones, permisos con alcance, motor CRUD declarativo, inventario de vistas del SPA, tabla de traducción a REST |
| [`docs/architecture/modulos-funcionales-legacy.md`](../architecture/modulos-funcionales-legacy.md) | Reglas de negocio de cada módulo (estudiantes, cursos, asignaturas, asignaciones, tutorías, observaciones, reportes) y estructura del boletín |

## 1. Resumen del sistema original

El SGA es una SPA servida por Google Apps Script sobre Google Sheets:

- **Persistencia**: 23 hojas de cálculo con acceso por nombre de encabezado, IDs con
  prefijo (`EST-000001`), bloqueo global (mutex único de 25 s) para toda escritura,
  caché en memoria y auditoría bufferizada.
- **API**: un solo despachador (`apiEjecutar`) con 39 acciones en formato
  `modulo.accion`; devuelve `{ok, data|error, codigo}`. La superficie pública real son
  3 funciones (`doGet`, `apiLogin`, `apiEjecutar`).
- **Autenticación**: PIN de 4 dígitos, hash SHA-256 iterado ×400 con sal + pepper,
  sesiones con token de 64 hex guardado solo hasheado, expiración 480 min, revocación
  global por usuario.
- **Permisos**: 4 roles base, 41 permisos del catálogo, fórmula
  `rol ∪ extras − denegados`, ADMIN cortocircuito, más una capa de **alcance**
  (docente ve solo sus asignaciones/tutorías).
- **Frontend**: SPA con vistas generadas dinámicamente por `crudMeta_` (8 CRUDs
  genéricos), grid de notas, dashboards, reportes PDF y boletín dúplex.

## 2. El corazón: el motor de calificaciones

Reglas verificadas en el código (no en el enunciado):

1. **Registro por período**: la hoja guarda una fila por estudiante + asignatura +
   período (`C1..C4`, `R1..R4`, `NOTA_ETAPA`); el "registro" de 35 campos se arma al leer.
2. **Nota efectiva**: `P` si `P ≥ mínima`; si `P < mínima` y hay recuperación, `max(P, RP)`
   — la recuperación nunca baja la nota y la validación la rechaza si es menor.
3. **Un período deficiente sin recuperación bloquea todo**: la competencia queda `null`
   y no hay promedio parcial (no se muestra promedio con faltantes).
4. **Promedios**: C.F. = promedio de las 4 competencias (cada una ¼). Los PC y `CF_REAL`
   **conservan decimales**; lo mostrado se **trunca** (`68.75 → 68.7`, con epsilon `1e-9`);
   la calificación de etapa se **redondea al entero** half-up (`floor(x + 0.5)`).
5. **Cadena de etapas** (solo si C.F. < 70): Completiva `50% CF + 50% CEC` →
   Extraordinaria `30% CF + 70% CEEX` → Especial `CESP` al 100%. Una etapa pendiente
   detiene la cadena; una aprobada la cierra (las notas posteriores se ignoran y su
   escritura se rechaza). Fallo total → `NO LOGRADO` con la última nota entera fallida.
6. **Situaciones**: anual `REPITENTE` (≥1 área no lograda) / `PROMOVIDO` (todas) /
   `PENDIENTE`; portada: 0 pendientes → PROMOVIDO, 1–2 → PROMOVIDO_PENDIENTE,
   ≥3 → APLAZADO.
7. **Terminología real**: no existen "CC/CRP/CT" en el código; son `C1..C4`
   (competencias), `R` (recuperación, "RP" en UI) y `CEC/CEEX/CESP` (etapas).
   La migración no debe introducir campos fantasma.

**Regla fundamental conservada**: ninguna migración altera una calificación ya
calculada. Los 24 casos de `Tests.js` (transcritos en el doc del motor) serán los
golden tests de Vitest; la prueba final es un snapshot con datos reales comparando
legacy vs. nuevo motor.

## 3. Decisiones de diseño confirmadas por la auditoría

| Decisión | Confirmación con el código real |
|---|---|
| Monolito modular (Express) | El legacy ya es un despachador único de módulos; se conserva el patrón |
| Motor CRUD declarativo | `crudMeta_` genera UI desde definiciones; se replica con Zod + metadatos servidos por la API |
| Permisos en servidor, no en UI | El legacy ya lo hace (`exigirPermiso_` interno + capa de alcance); se centraliza en middleware |
| Asistencia rediseñada | Hoja de columnas-por-mes → tabla de filas-por-evento en PostgreSQL |
| Sesiones: cookie httpOnly | Reemplaza token en `sessionStorage`; hashing del token se conserva |
| Hash: argon2id/bcrypt | Reemplaza SHA-256×400; rehash transparente al login (hashes v1/v2 se verifican y se actualizan) |
| Pepper y `REV_<usuario>` → seguretos del servidor | `PEPPER` y `DB_ID` en PropertiesService pasan a variables de entorno; revocación a `users.sessions_revoked_at` |
| Auditoría fiable | El buffer del legacy puede perder registros silenciosamente; en PostgreSQL la escritura es transaccional |

## 4. Modelo de datos objetivo (Fase 2)

Mapeo principal (detalle completo en el doc de base de datos):

| Hoja legacy | Tabla PostgreSQL | Notas |
|---|---|---|
| USUARIOS, CREDENCIALES, SESIONES | `users`, `user_credentials`, `sessions` | `sessions.token_hash` único; revocación por usuario |
| ROLES, PERMISOS, ROL_PERMISOS | `roles`, `permissions`, `role_permissions` | ADMIN cortocircuito se mantiene |
| ESTUDIANTES, INSCRIPCIONES | `students`, `enrollments` | ID permanente + inscripción por año; `RETIRADO` nunca borra |
| CURSOS, SECCIONES | `school_years`, `courses`, `sections` | Unicidad `(año, grado, letra)` |
| PERIODOS | `periods` | `REGULAR` (máx 4) vs `ETAPA` (una por tipo); `MESES` CSV |
| ASIGNATURAS, COMPETENCIAS | `subjects`, `competences` | `GRADOS='*'` = todos; específica reemplaza a general por código |
| DOCENTES, ASIGNACIONES, TUTORIAS | `teachers`, `teaching_assignments`, `tutoring_assignments` | Base de la seguridad académica: sin asignación activa no se ve nada |
| CALIFICACIONES | `grade_records` | Fila por estudiante+asignatura+período; `CHECK 0–100` en BD |
| RESULTADOS | `result_summaries` | Derivada; se recalcula (incremental o en bloque) |
| ASISTENCIA | `attendance` | Rediseño: fila por evento/mes, no columnas |
| OBSERVACIONES, HISTORIAL, ERRORES, CONFIG | `observations`, `audit_log`, `error_log`, `config` | Auditoría transaccional con diff |
| Propiedades (`DB_ID`, `PEPPER`, `REV_*`) | Variables de entorno + `users.sessions_revoked_at` | Nunca en la BD pública |

`CLAVE_GRUPO` (`ANO|ID_SECCION|ID_ASIGNATURA`) desaparece como string: se reemplaza por
índice único `(year, section_id, subject_id)` en `grade_records` y `result_summaries`.

## 5. API objetivo (síntesis de la traducción)

El despachador `modulo.accion` se traduce a REST (tabla completa en el doc de API):

| Acción legacy | Endpoint propuesto |
|---|---|
| `apiLogin` / `sesion.bootstrap` / `sesion.cerrar` / `sesion.cambiarClave` | `POST /api/auth/login`, `GET /api/auth/bootstrap`, `POST /api/auth/logout`, `POST /api/auth/change-password` |
| `crud.listar/guardar/estado/meta/opciones` | `GET/POST /api/{modulo}`, `GET /api/{modulo}/:id`, `GET /api/{modulo}/meta`, `GET /api/opciones/:ref` |
| `notas.*`, `asistencia.*` | `GET/POST /api/courses/:id/grades`, `GET/POST /api/courses/:id/attendance` |
| `reportes.*`, `dashboard` | `GET /api/courses/:id/dashboard`, `GET /api/students/:id/consult`, `/history` |
| `estudiantes.*`, `docentes.*`, `config.*` | Subrecursos correspondientes con permisos equivalentes |

Mitigaciones de los riesgos detectados (10 priorizados en el doc de API):

- **Permisos dispersos**: solo 3 rutas declaran permiso; en el nuevo backend cada
  endpoint declara su permiso y la capa de alcance se aplica por middleware.
- **`crud.opciones` sin verificación de permisos** (fuga menor): se corrige.
- **Hooks con reglas de negocio** (`antes/despues`): se trasladan a servicios de
  dominio, no a triggers genéricos.
- **Semántica del guardado por lote**: `guardarNotas_` valida todo antes de escribir
  nada; el nuevo endpoint será transaccional con la misma semántica "todo o nada".

## 6. Plan de migración (ajustado tras la auditoría)

1. **Fase 1 — Auditoría** ✅ **COMPLETADA** (este documento y sus 4 anexos).
2. **Fase 2 — Base de datos**: schema.prisma a partir del mapeo del §4; migraciones
   iniciales; script de importación desde Google Sheets (exportar CSV → cargar).
3. **Fase 3 — Backend**: Express + Prisma + Zod; auth (argon2id + cookies httpOnly);
   middleware de permisos y alcance; motor CRUD declarativo; **motor de calificaciones
   con los 24 golden tests en verde** antes de tocar la UI.
4. **Fase 4 — Frontend**: el andamio Vite ya existe en `SGA/frontend`; construir los
   módulos sobre los metadatos de la API (patrón `crudMeta_`).
5. **Fase 5 — Boletines y reportes**: reproducir el boletín dúplex (Vista_Previa_Boletin)
   y los reportes PDF/Excel.
6. **Fase 6 — Pruebas y transición**: snapshot de datos reales, comparación legacy vs
   nuevo motor, permisos, pruebas con usuarios.

El sistema Apps Script queda intacto y en producción como referencia hasta la Fase 6.

## 7. Próximo paso inmediato

**Fase 2 (en curso)**: `SGA/database/prisma/schema.prisma` ya está creado y validado,
basado en el análisis del Excel real (`docs/database/analisis-datos-reales.md`), con el
seed de datos reales generado (`SGA/database/seeds/sga-seed.json`). Pendiente:
instalar PostgreSQL, ejecutar las migraciones y cargar el seed; luego la Fase 3
(backend) con el motor de calificaciones y sus golden tests.
