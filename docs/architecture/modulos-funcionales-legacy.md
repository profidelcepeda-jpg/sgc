# Módulos funcionales del sistema legacy (Google Apps Script)

> Documento de auditoría para la migración a React + Node + PostgreSQL.
> Fuente: `SGA/legacy/` — `Students.js`, `Courses.js`, `Subjects.js`, `Assignments.js`, `Tutoring.js`, `Observations.js`, `Reports.js` y `Vista_Previa_Boletin.html` (raíz del proyecto).
> Fecha: 2026-11-17.

## Contexto general del modelo legacy

- El backend es una hoja de cálculo (Google Sheets) con "tablas" lógicas (`HOJA.*`), accesos por `ID` prefijado (`EST-…`, `PER-…`, etc.), bloqueo de concurrencia (`conBloqueo_`), caché en memoria (`_mem`, `invalidar_`) y un historial de auditoría (`historial_`) que se vacía al final de cada operación (`vaciarHistorial_`).
- Entidades clave: `ESTUDIANTES`, `INSCRIPCIONES`, `CURSOS`, `SECCIONES`, `PERIODOS`, `ASIGNATURAS`, `COMPETENCIAS`, `DOCENTES`, `ASIGNACIONES`, `TUTORIAS`, `OBSERVACIONES`, `CALIFICACIONES`, `ASISTENCIA`, `RESULTADOS`, `HISTORIAL`, `USUARIOS`, `CONFIG`.
- Constantes globales (Config.js): `PERIODOS_REGULARES = 4` (P1..P4), `COMPETENCIAS = 4` (C1..C4), `MESES = ['ago','sep','oct','nov','dic','ene','feb','mar','abr','may','jun']`.
- Toda decisión de permisos se toma **en el servidor** (`exigirPermiso_`, `tiene_`); el cliente solo refleja lo que el backend permite.

---

## 1. ESTUDIANTES

**Archivo:** `Students.js`. El estudiante tiene un **ID permanente** (`EST-000001`); el curso, la sección y el año viven en la tabla `INSCRIPCIONES`, de modo que el mismo estudiante pasa de año sin duplicarse y conserva su historial.

### 1.1 Funciones principales

| Función | Qué hace |
|---|---|
| `estudiantesDeSeccion_(ano, idSeccion, incluirRetirados)` | Une `INSCRIPCIONES` + `ESTUDIANTES` para una sección/año. Activo = inscripción ≠ `RETIRADO` **y** estudiante ≠ `INACTIVO`. Devuelve `{ idEstudiante, num, nombre, nombres, apellidos, matricula, activo, sexo }`, ordenado por `NUM_LISTA` (los sin número al final, por nombre). |
| `crearEstudiantes_(ctx, ano, sec, items)` | Creación en lote bajo `conBloqueo_`. Divide el nombre completo con `partirNombre_` (`"Apellidos, Nombres"` por la coma; si no hay coma deja apellidos vacíos). Genera `ID_ESTUDIANTE` secuencial, estado `ACTIVO`, y una inscripción por estudiante con `NUM_LISTA` autoincremental (parte del `num` máximo actual de la sección). Registra en el historial y devuelve los IDs creados. |
| `nombreEstudiante_(v)` | Normaliza el nombre: recorta comillas/espacios y **elimina numeración inicial de listas pegadas** (`"01- Juan"` → `"Juan"`). |
| `listarEstudiantes_(ctx, p)` | Permiso `estudiantes.ver`; valida sección con `exigirSeccion_` (año + acceso). Devuelve todos (incluye retirados). |
| `guardarEstudiante_(ctx, p)` | Crear (`estudiantes.crear`) o editar (`estudiantes.editar`). Validaciones: nombre 3–120 caracteres, matrícula ≤ 30, sexo ∈ {M, F}. En edición exige que el estudiante pertenezca a la sección indicada (regla de permiso `PERMISO`). Ver reglas de unicidad abajo. |
| `estadoEstudiante_(ctx, p)` | Retira/reactiva la **inscripción** (`ACTIVO` ↔ `RETIRADO`) para un año. **Nunca se borra**: se conserva el historial. Valida que exista inscripción en ese año y que el usuario tenga acceso a la sección. |
| `importarEstudiantes_(ctx, p)` | Importa una lista pegada (un nombre por línea), filtro 3–120 caracteres, **máximo 300 nombres por vez**. Omite los que ya existen en la sección (comparación con `norm_`); devuelve `{ creados, omitidos }`. |
| `sincronizarRegistro_(ctx, p)` | Permiso `configuracion.administrar`. Abre el libro externo `REGISTRO_SPREADSHEET_ID`, hoja **`registro`**, lee nombres desde la **fila 17** (columnas B y C: apellidos + nombres, concatenados). No elimina ni modifica nada: importa (vía `importarEstudiantes_`) y devuelve `{ nuevos, yaExistian, noEstanEnRegistro }` — esta última lista son los estudiantes activos de la sección que **no aparecen** en el registro externo. |
| `buscarEstudiantes_(ctx, q, ano)` | Búsqueda por nombre (contiene, normalizada) o matrícula exacta (case-insensitive). **Limitada a las secciones que el usuario puede ver** (`seccionesPermitidas_`). Máximo 40 resultados. Devuelve nombre, matrícula, grado, sección y estado de inscripción. |
| `asignarEstudiante_(ctx, p)` | Inscribe un estudiante existente en una sección (ej. pasar de año). Si ya está inscrito en ese año y **no tiene notas**, cambia su inscripción (curso, sección y `NUM_LISTA` = máximo + 1) **sin borrar ni crear el registro de estudiante**. Si ya tiene calificaciones en su sección actual (`CLAVE_GRUPO = ano|seccionAntigua|` prefijo sobre `CALIFICACIONES`), **bloquea el cambio** con el error: *"El estudiante ya tiene calificaciones en su curso actual; no se puede cambiar de sección sin perder la relación con sus notas."* |

### 1.2 Reglas de unicidad de nombres (en `guardarEstudiante_`)

1. **Duplicado en la misma sección**: si ya existe un estudiante con el mismo nombre normalizado (`norm_`) en esa sección → error `DUPLICADO` ("Ya existe un estudiante con ese nombre en este curso.") — no se permite confirmación.
2. **Duplicado en otro curso**: si el nombre existe en cualquier otra parte del sistema (`ESTUDIANTES`) → error `DUPLICADO` **a menos que** `p.confirmarDuplicado === true` ("Verifique antes de crearlo"). Es un aviso superable a propósito.

### 1.3 Numeración de estudiantes (`num` / `NUM_LISTA`)

- `NUM_LISTA` vive en la **inscripción** (por año), no en el estudiante.
- Se autoasigna en creación/importación como `máximo(num actual de la sección) + 1`, secuencial dentro del lote.
- Al reasignar de sección también se recalcúa al máximo de la nueva sección + 1.
- El orden de listado es `num` ascendente, con los sin número (`num = 0`) al final ordenados por nombre.

### 1.4 Reglas de negocio a conservar

- ID de estudiante permanente y separado de la inscripción (historial multi-año).
- Borrado nunca físico: se marca `RETIRADO`/`INACTIVO`.
- Importación idempotente (omite existentes por nombre normalizado).
- Cambio de sección impedido si hay notas ligadas a la clave `año|sección`.
- Duplicado intra-sección prohibido; duplicado global requiere confirmación explícita.

---

## 2. CURSOS

**Archivo:** `Courses.js`. Modelo: `CURSO = nivel + grado dentro de un año escolar` (ej. `2026-2027 · Secundaria · 3ro`); `SECCIÓN = letra dentro del curso` (ej. `A`). **Estudiantes y notas se relacionan con la SECCIÓN.**

### 2.1 `seccionesIndice_()`

Arma (una vez por ejecución, cacheada en `_mem.__sec`) un índice plano que **combina `CURSOS` + `SECCIONES`**: para cada sección toma su curso y produce `{ idSeccion, idCurso, grado, seccion, ano, nivel, estado }`. El estado es `INACTIVO` si el curso **o** la sección lo están. Orden: por `ordenGrado_` (posición del grado dentro de la lista `GRADOS` de configuración; desconocidos al final) y luego por letra de sección. De esta función derivan `seccionesDeAno_`, `seccionPorId_` (lanza error si no existe) y `etiquetaSeccion_` (`grado + ' ' + seccion`).

### 2.2 `periodosAno_(ano)`

Filtra `PERIODOS` por año y devuelve `{ regulares, etapas, porId, lista }`:

- **Regulares**: `TIPO = 'REGULAR'`, ordenados por `ORDEN` ascendente (P1..P4; máximo `SGA.PERIODOS_REGULARES = 4`). Estructuran las columnas de notas (C1..C4 / R1..R4).
- **Etapas finales**: `TIPO = 'ETAPA'`, indexadas por su campo `ETAPA` ∈ {`COMPLETIVA`, `EXTRAORDINARIA`, `ESPECIAL`} — una sola por etapa y año.

Estados de período: `ABIERTO` / `CERRADO`. Cerrar un período congela sus notas; solo quien tenga el permiso "cerrar" (`calificaciones.cerrar`) puede modificarlas después.

### 2.3 `defPeriodos_` / `defCursos_`

Son definiciones del motor CRUD genérico (`defXxx_` describe hoja, permisos, columnas, campos, validaciones, acciones):

- **Períodos**: campos `ANO_ESCOLAR` (patrón `AAAA-AAAA`, solo al crear), `CODIGO` (ej. P1, máx 10), `NOMBRE`, `TIPO` (REGULAR/ETAPA), `ETAPA` (solo si ETAPA), `ORDEN` (1–99), `MESES` (meses de asistencia, máx 60). Unicidad: `(ANO_ESCOLAR, CODIGO)`. Acción global: *duplicar períodos a otro año*. Permisos: `periodos.ver/administrar`, estado con `calificaciones.cerrar`.
- **Cursos** (opera sobre `SECCIONES`, `idKey = ID_SECCION`): campos `ANO_ESCOLAR` (solo crear), `GRADO` (ref a grados, solo crear), `SECCION` (patrón `^[A-Z0-9]{1,3}$`), `ID_DOCENTE_TUTOR` (opcional). Su `listar` filtra por año + **secciones permitidas del usuario**, cuenta estudiantes no retirados por sección y muestra el tutor (`tutorDe_`). Su `estado` cambia ACTIVO/INACTIVO de la sección e invalida el índice.

### 2.4 `guardarCurso_` (reglas de validación)

- **Unicidad de sección**: no puede repetirse `(año, grado, sección)`; error "Ya existe la sección X Y en AAAA-AAAA."
- Si el curso (año+grado) no existe, lo crea (nivel tomado de `NIVEL` de configuración); si existe, reutiliza su `ID_CURSO`.
- Año y grado no se editan después de crear (`soloCrear`): solo la letra de sección y el tutor.
- Si se envía `ID_DOCENTE_TUTOR`, invoca `asignarTutor_`.
- Todo bajo `conBloqueo_`, con historial e invalidación de caches (`__sec`).

### 2.5 `duplicarPeriodos_` (inicio de año nuevo)

- Permiso `periodos.administrar`. Copia **todos** los períodos del año origen al destino con IDs nuevos.
- Validaciones: destino con formato `AAAA-AAAA`; origen debe tener períodos; **el destino no debe tener ninguno** (no se pisa).
- Los períodos copiados nacen `ABIERTO`.

### 2.6 Reglas de negocio a conservar

- Máximo 4 períodos regulares por año; máximo una etapa final por tipo (`COMPLETIVA`/`EXTRAORDINARIA`/`ESPECIAL`) y año.
- `MESES` solo acepta los meses de `SGA.MESES` (validados y re-serializados limpios).
- `TIPO = ETAPA` exige `ETAPA`; `TIPO = REGULAR` limpia el campo.
- Unicidad de `(año, código)` de período y de `(año, grado, sección)`.

---

## 3. ASIGNATURAS

**Archivo:** `Subjects.js`. Catálogo de asignaturas y competencias.

### 3.1 `asignaturasDeGrado_(grado)`

Filtra asignaturas **activas** cuyo campo `GRADOS` (lista separada por comas) incluya el grado, **o cuyo `GRADOS` sea `' * '` (asterisco = todos los grados)**. Ordenadas por `ORDEN` (sin orden → 99). Es la base de qué se imparte en cada curso; `asignaturaPorId_` lanza error si no existe.

### 3.2 `competenciasDe_(idAsig)`

- Lee todas las competencias **activas** de `COMPETENCIAS`, agrupadas **por `CODIGO`** (C1..C4, `SGA.COMPETENCIAS = 4`):
  - Competencias con `ID_ASIGNATURA = '*'` son **generales** (aplican a todas): se toman solo si no hay una específica del mismo código para la asignatura.
  - Competencias con `ID_ASIGNATURA = idAsig` son **específicas y reemplazan** a la general del mismo código.
- Devuelve **siempre exactamente 4** (`C1..C4`), con fallback de nombre (`"Competencia N"`) y abreviatura (`"CN"`) si no hay definición.
- Unicidad CRUD: `(ID_ASIGNATURA, CODIGO)`. `ORDEN` por defecto = número del código.

### 3.3 `cfgAsignatura_(cfg, a)` — parámetros por asignatura que alteran el motor de cálculo

Combina la configuración global (`cfg`) con overrides por asignatura. Campos:

| Parámetro | Origen | Efecto en el motor |
|---|---|---|
| `min` | `NOTA_MINIMA` de la asignatura (numérico; si no, la global) | Umbral de aprobación/riesgo de esa asignatura. |
| `max` | `cfg.NOTA_MAXIMA` global | Tope de escala. |
| `entera` | `cfg.NOTA_ENTERA` | Notas enteras vs. decimales. |
| `dec` | `cfg.DECIMALES_COMPETENCIA` | Decimales al promediar competencias. |
| `usaRec` | flag `USA_RECUPERACION` (SI/NO) × global `ACTIVAR_RECUPERACION` | Activa recuperaciones (R1..R4 / RP) para esta asignatura. |
| `usaComp` | `USA_COMPLETIVA` × `ACTIVAR_COMPLETIVA` | Activa la **evaluación completiva** (con pesos `PCT_COMPLETIVA_CF` / `PCT_COMPLETIVA_CEC`). |
| `usaExtra` | `USA_EXTRAORDINARIA` × `ACTIVAR_EXTRAORDINARIA` | Activa la **extraordinaria** (pesos `PCT_EXTRA_CF` / `PCT_EXTRA_CE`). |
| `usaEsp` | `USA_ESPECIAL` × `ACTIVAR_ESPECIAL` | Activa la **evaluación especial**. |

Lógica del flag `flag(campo, global)`: si la asignatura no define el campo (vacío) → usa el valor global; si lo define, se activa **solo si es "SI" y además el global está activado** (el apagado global manda; el por-asignatura solo puede limitar, no activar lo desactivado globalmente). Los pesos de completiva/extraordinaria son **solo globales** (no por asignatura).

### 3.4 CRUD y otros datos de asignatura

- Campos: `CODIGO` (patrón 2–8 alfanumérico, único, se guarda en mayúsculas), `NOMBRE`, `NOMBRE_REPORTE` (default = NOMBRE; para impresos), `ABREV` (default = 4 primeras letras del código; aparece en boletines), `AREA`, `GRADOS` (validado contra los grados configurados; admite `*`), `ORDEN`, `ORDEN_BOLETIN` (default = ORDEN), flags SI/NO por defecto **`SI`**, `NOTA_MINIMA` opcional (1–100).
- Las asignaturas con `CODIGO = 'OPT'` (case-insensitive) se marcan **optativas** al armar los reportes (`esOptativa`).

---

## 4. ASIGNACIONES (docentes)

**Archivo:** `Assignments.js`. Asignación `DOCENTE + ASIGNATURA + CURSO/SECCIÓN + PERÍODO` — *"Aquí se decide el ALCANCE de cada docente: es la base de la seguridad de las calificaciones."* **Sin asignación, un docente no ve ni modifica nada.**

### 4.1 `defDocentes_` / `defAsignaciones_`

- **Docentes**: `TITULO`, `NOMBRES`, `APELLIDOS` (→ `NOMBRE_COMPLETO` generado), `CORREO`, `TELEFONO`, y campos de acceso `USUARIO` (patrón `^[a-z0-9._-]{3,30}$`, solo crear) y `PIN` (4 dígitos, solo crear). Columnas decoradas muestran usuario y estado de acceso. Al desactivar un docente se **desactiva también su usuario y se revocan sus sesiones** (`despuesEstado`).
- **Asignaciones**: `ANO_ESCOLAR` (solo crear), `ID_SECCION` (solo crear), `ID_ASIGNATURA` (solo crear), `ID_DOCENTE` (editable), `ID_PERIODO` (`'*'` = todo el año, o un período regular; default `'*'`). Validaciones en `antes`: la sección debe pertenecer al año indicado; la asignatura debe impartirse en el grado de la sección (`asignaturasDeGrado_`); el período debe pertenecer al año. Unicidad: `(ANO, SECCIÓN, ASIGNATURA, DOCENTE, PERÍODO)`. Todas las asignaciones se crean `ACTIVO`.

### 4.2 `crearAccesoDocente_` — usuarios/PIN automáticos

- Crea el usuario de acceso con `ROL: 'DOCENTE'`, vinculado por `ID_DOCENTE`, vía `guardarUsuarioNL_` (sin bloqueo: llamar dentro de `conBloqueo_`).
- `usuarioSugerido_` propone un nombre de usuario libre: base = primer nombre normalizado (≤ 16 chars; si queda < 3 se rellena con "doc"), candidatos `[nombre]`, `[nombre+inicialApellido]`, `[nombre+inicial+2..59]` hasta uno libre; último recurso `base + timestamp`.
- `docenteAcceso_` (acción "Acceso / PIN"): si ya tiene usuario → **restablece PIN** (el indicado con `validarPoliticaClave_`, o temporal `claveTemporal_()`), revoca sesiones y limpia el cache de bloqueo por intentos fallidos; si estaba inactivo lo reactiva. Si no tiene → crea el acceso (usuario dado o sugerido) y devuelve el PIN temporal **que se muestra una sola vez**.
- `docentesAccesosMasivo_` (acción "Crear accesos a todos", permiso `usuarios.crear`): crea acceso a **todos los docentes activos que aún no lo tienen**, devolviendo `{ docente, usuario, pin }`.
- En `defDocentes_`, si al crear se envía `USUARIO`, se exige también PIN o se genera, se valida unicidad de usuario y tras insertar se crea el acceso (`despues`).

### 4.3 `asignarDocente_` — panel de asignación

- Asigna (o **quita** con `idDocente = ''`) un docente a **UNA asignatura de un curso**, para **todo el año** (`ID_PERIODO = '*'`).
- Modelo de "un solo docente por asignatura": **reemplaza** lo anterior. Con `p.todasSecciones = true` aplica la misma asignatura a **todas las secciones activas del mismo grado** de una vez.
- Mecánica: reutiliza una asignación inactiva existente (paso a `ACTIVO` con el nuevo docente y período `'*'`) y **las demás quedan `INACTIVO`**; si no hay ninguna que reutilizar, inserta una nueva. Historial con valores anterior/nuevo.
- `panelAsignaciones_` arma los datos de la pantalla: docentes activos, asignaciones con textos decorados (incluye flag `valida` = docente no inactivo), asignaturas por grado y qué puede hacer el usuario (`puedeCrear`/`puedeEditar`).

### 4.4 `copiarAsignaciones_` — copia entre años

- Permiso `asignaciones.crear`. Copia asignaciones activas del año origen al destino.
- Empareja secciones por **`grado + '|' + letra`** (no por ID). Mapea el período por `CODIGO` (si no se encuentra, `'*'`).
- **No pisa las que ya existan** en el destino (cuenta `omitidas`); las secciones del destino que no existan en el origen cuentan como `sinCurso`. Devuelve `{ copiadas, omitidas, sinCurso }`.

### 4.5 Modelo de permisos académicos: `puedeTrabajar_` / `seccionesPermitidas_` / `asignaturasVisibles_`

- `asignacionesActivas_(ano)`: cache por año de asignaciones con `ESTADO ≠ 'INACTIVO'`. Base de todo el modelo.
- `misAsignaciones_(ctx, ano, idSeccion, idAsig)`: asignaciones del docente vinculado al usuario (`ctx.idDocente`) para esa combinación; si el usuario no es docente → vacío.
- `puedeTrabajar_(ctx, ano, idSeccion, idAsig, idPeriodo)`:
  - `calificaciones.administrar` → **siempre true** (coordinador/admin).
  - Si no: alguna asignación propia donde `ID_PERIODO = '*'` (todo el año) **o** coincida con el período puntual. (Si no se indica período, cualquier asignación propia sirve.)
- `seccionesPermitidas_(ctx, ano)`: secciones **activas** visibles:
  - Con `cursos.ver_todos` → todas.
  - Sin docente vinculado → ninguna.
  - Docente: unión de las secciones donde tiene asignaciones activas **y** las secciones donde es **tutor activo** (tabla `TUTORIAS`).
  - `exigirSeccion_` usa esto como guarda central: año correcto + sección permitida, o error `PERMISO`.
- `asignaturasVisibles_(ctx, ano, sec)`: todas las del grado para quien tiene `calificaciones.administrar` o `cursos.ver_todos`; para el docente, **solo las que tiene asignadas** en esa sección.

**Resumen de roles:**

| Rol | Ve | Edita |
|---|---|---|
| **Docente** | Solo sus secciones (donde enseña o es tutor); en cada sección solo sus asignaturas. | Notas/asistencia solo en sus asignaciones y períodos cubiertos. |
| **Tutor** | Además, todas las secciones de las que es tutor (para información del curso); todas las observaciones del curso. | No edita notas de asignaturas ajenas: sigue siendo responsable solo de las suyas. |
| **Admin / `cursos.ver_todos` / `calificaciones.administrar`** | Todos los cursos y asignaturas. | Todo (incl. períodos cerrados con permiso `calificaciones.cerrar`). |

---

## 5. TUTORÍAS

**Archivo:** `Tutoring.js`. El tutor **recibe información del curso**; cada docente sigue siendo responsable solo de sus asignaturas.

- `tutorDe_(ano, idSeccion)`: primera tutoría con `ESTADO = 'ACTIVA'` para esa sección/año → devuelve el docente (`DOCENTES`) o `null`. La marca de sección también muestra `TUTOR_TXT`.
- `asignarTutor_(ctx, ano, sec, idDocente)`: si ya hay tutoría activa con el mismo docente, no hace nada; si hay activa con otro, **edita esa fila** (cambia el docente, no crea una segunda); si no hay, crea una `ACTIVA`. Bajo bloqueo, con historial. (Se invoca desde `guardarCurso_` al fijar `ID_DOCENTE_TUTOR`.)
- `defTutorias_`: CRUD con estados `ACTIVA`/`INACTIVA`, campos año (solo crear), sección (solo crear), docente (editable). Validación clave: **una sola tutoría activa por sección y año** — "Esa sección ya tiene un tutor activo. Edite la tutoría existente para cambiarlo." Cambio de tutor = editar la existente (o desactivarla), nunca crear otra.

---

## 6. OBSERVACIONES

**Archivo:** `Observations.js`. Observaciones de estudiantes (académicas, de conducta, asistencia, familia…). Nunca se borran: se **ANULAN**.

### 6.1 Reglas de acceso (todas en servidor)

- `TIPOS_OBSERVACION = ['ACADEMICA', 'CONDUCTA', 'ASISTENCIA', 'FAMILIA', 'OTRA']`.
- Solo se ven/registran en cursos con acceso (`exigirSeccion_`: enseña, es tutor o ve todo).
- `esTutorDe_`: ¿el docente vinculado al usuario es tutor activo de la sección?
- `veTodasObs_`: `cursos.ver_todos` **o** `observaciones.administrar` **o** ser tutor de la sección.
- `esAutorObs_`: autor = `ID_DOCENTE` del registro, o `CREADO_POR` si el registro no tiene docente (registrado por admin).
- `puedeEditarObs_`: `observaciones.administrar`, **o** (`observaciones.editar` **y** ser el autor).

### 6.2 `listarObservaciones_`

- Permiso `observaciones.ver`. Lee las observaciones de la sección por año.
- **Filtros**: sin acceso total solo ve **las suyas** (autor); opcional `idEstudiante`, `tipo`, `incluirAnuladas` (por defecto **excluye** `ANULADA`); texto libre `q` sobre estudiante/texto/docente/asignatura; paginación (default 25). Orden: fecha + fecha de creación descendente.
- Devuelve además, para la pantalla: lista de estudiantes de la sección, períodos del año, **asignaturas visibles del usuario en esa sección**, tipos disponibles y `puedeRegistrar` (`observaciones.registrar`). Cada ítem trae `puedeEditar` calculado por servidor.

### 6.3 `guardarObservacion_`

- Crear requiere `observaciones.registrar`; editar, `observaciones.editar` (+ autoría).
- Validaciones: texto obligatorio **3–600** caracteres; `tipo` de la lista; fecha opcional (default hoy) con formato `AAAA-MM-DD` real; si se indica `idAsignatura` debe impartirse en el grado; si se indica `idPeriodo` debe pertenecer al año.
- **Crear**: el estudiante debe estar inscrito y **activo** en la sección (los retirados no aceptan nuevas observaciones). Guarda `ID_DOCENTE` del usuario si es docente, `CREADO_POR`, estado `ACTIVA`.
- **Editar**: la observación debe existir en esa sección/año, no estar `ANULADA` ("La observación está anulada."), y ser editable por el usuario (autoría o permiso). Se actualizan asignatura, período, tipo, fecha y texto.

### 6.4 `estadoObservacion_`

- Cambia estado a `ANULADA` o `ACTIVA` (`observaciones.editar`); valida estado permitido, existencia, acceso a la sección y `puedeEditarObs_` (autor o administrador). Anular **no elimina**: queda en el historial de auditoría con valor anterior/nuevo.

---

## 7. REPORTES

**Archivo:** `Reports.js`. Datos para reportes impresos, dashboard, consulta individual, historial de auditoría y arranque de la app.

### 7.1 `cargarCurso_(ano, sec)` — la estructura central

Arma **todo lo necesario para imprimir reportes de una sección** (sin chequear permisos; los validan las funciones envolventes):

```
{
  ano, idSeccion, grado, seccion,
  tutor: "nombre del tutor o ''",
  centro: { centro, regional, distrito, codigo, direccion, provincia,
            municipio, tanda, nivel, director },        // encabezado de impresos
  min: nota mínima global,
  asignaturas: [{ id, nombre, nombreReporte, abrev, orden, ordenBoletin,
                  docente: "Doc1 / Doc2", competencias: [C1..C4],
                  esOptativa: CODIGO === 'OPT' }],
  estudiantes: [{
    idEstudiante, num, nombre, nombres, apellidos,
    registros: { [idAsignatura]: { notas, calc } },      // notas = notasPorEstudiante_
                                                          // calc = calcularRegistro(n, cfgAsignatura)
    situacion: determinarSituacionFinal(sits, nAsigs),   // PROMOVIDO | REPITENTE | PENDIENTE
    situacionPortada: determinarSituacionPortada(...),   // para el reverso del boletín
    asistencia: resumenAsistencia_(...)                  // resumen de ASISTENCIA
  }]
}
```

- Las calificaciones se leen por **`CLAVE_GRUPO`** con prefijo `ano|idSeccion|` y se agrupan por asignatura; cada estudiante/asignatura obtiene `{ notas, calc }` — el `calc` (del motor, `Engine.js`) incluye promedios por período, recuperación/completiva/extraordinaria/especial, estado y `situación`.
- La `situacion` final del estudiante se determina combinando las situaciones de **todas** sus asignaturas (`determinarSituacionFinal`); solo se incluyen estudiantes **activos** (`incluirRetirados = false`).

### 7.2 `datosCurso_(ctx, p)`

Envoltorio con permiso `reportes.ver` + `exigirSeccion_`. Es lo que consume la pantalla de reportes/boletines.

### 7.3 `dashboard_(ctx, p)` — métricas de un curso

Permiso `reportes.ver`; calcula sobre `cargarCurso_` para un período puntual (`p.periodo`, default 1):

- `promedioGeneral` (promedio de los promedios por estudiante con datos), `porcentajeAprobando` (promedio ≥ `min` / con datos).
- `enRiesgo`: estudiantes con **asignaturas por debajo de la nota mínima** en el período, listadas por nombre; ordenados por cantidad de asignaturas en riesgo (desc).
- `mejor`: top 5 estudiantes por promedio.
- `porAsignatura`: promedio del curso por cada período P1..P4 para cada asignatura.
- `distribucion`: conteo de estudiantes por franja de promedio `<70`, `70–79`, `80–89`, `≥90`.
- `situacion`: conteo `PROMOVIDO / REPITENTE / PENDIENTE`.
- `estudiantesPendientes` (algún registro/período `INCOMPLETO` o `SIN NOTAS`), `estudiantesEnRecuperacion` (`pendientesRP > 0` o `RECUPERACIÓN PENDIENTE`), y contadores por etapa: `estudiantesCompletiva` / `Extraordinaria` / `Especial` (algun asignatura en ese estado).

### 7.4 `consultaEstudiante_(ctx, p)`

Permisos `estudiantes.ver` + `calificaciones.ver`. Localiza la inscripción del estudiante en el año (error si no está inscrito), valida acceso a su sección y devuelve `{ datos(personales), curso(completo), estudiante(fila individual de cargarCurso_) }` — la ficha individual con todas sus notas, situación y asistencia.

### 7.5 `historialAcademico_` y `listarHistorial_`

- `historialAcademico_(ctx, p)`: recorre **todas las inscripciones** del estudiante (todos los años) y, cuando el usuario tiene acceso y hay períodos, devuelve `{ ano, curso, situacion }` por año (o `'RETIRADO'`), ordenado del año más reciente al más viejo. Los años sin acceso o sin períodos **se omiten silenciosamente**.
- `listarHistorial_(ctx, p)`: auditoría (permiso `historial.ver`). Lee las **últimas 4000 filas** de la hoja `HISTORIAL` (FECHA, USUARIO, ACCION, MODULO, ID_REGISTRO, DESCRIPCION, VALOR_ANTERIOR, VALOR_NUEVO), más recientes primero, con búsqueda y filtros por `MODULO`/`ACCION` y paginación (default 50). Expone la lista de módulos (todos los de `ESQUEMA` + `AUTENTICACION`).

### 7.6 `bootstrap_(ctx)` — datos iniciales de sesión

Devuelve: `usuario` (perfil público), `permisos` del ctx, nombre y versión de la app, y:

- `config`: `ano` escolar, `min`, `max`, `entera`, `decimales`, `filas` por página.
- `anos`: años escolares disponibles (el configurado + los que tienen cursos), descendente.
- `grados`: lista desde `cfg.GRADOS`.
- `cursos`: `cursosListarLigero_` (o vacío si `ctx.debeCambiar` — el usuario debe cambiar su PIN antes).

### 7.7 Otras funciones de reportes

- `cursosListarLigero_(ctx, p)`: lista ligera de secciones permitidas con tutor y flag `ensena` (¿el docente enseña ahí?). Sin `cursos.ver_todos`, se ordena **poniendo primero los cursos que enseña** (el docente abre directamente en su curso).
- `asignaturasCurso_(ctx, p)`: permiso `calificaciones.ver`; asignaturas **visibles** del usuario en la sección, con `docentesDe_` (nombres unidos por " / ") y `puedeEditar` (permiso `calificaciones.registrar|editar` **y** `puedeTrabajar_`).
- `anosDisponibles_`: años con cursos + el año configurado, orden descendente.

### 7.8 `configObtener_` / `configGuardar_`

- Ambas exigen `configuracion.administrar`.
- `configObtener_`: lista `{ clave, valor, descripcion }` de la tabla `CONFIG` (filas con clave no vacía).
- `configGuardar_`: bajo bloqueo, actualiza solo las claves enviadas cuyo valor cambie. Validaciones puntuales: claves de `CLAVES_NUM` deben ser numéricas; `NOTA_MINIMA` entre 1 y 100; `ANO_ESCOLAR` formato `AAAA-AAAA`. Historial por parámetro con valor anterior/nuevo. Si hubo cambios, **`reconstruirResultados_()`**: un cambio de regla de cálculo debe reflejarse de inmediato en la tabla `RESULTADOS`, y se limpia el cache de configuración.

---

## 8. BOLETINES (`Vista_Previa_Boletin.html`)

> Ubicado en la **raíz** del proyecto (`PROYECTO_GSC/Vista_Previa_Boletin.html`); no existe en `SGA/legacy/`. Es una maqueta HTML de la **nueva estructura de impresión** del boletín de calificaciones (formato carta **horizontal**, dúplex: 2 páginas por estudiante "con portada", o 1 página "sin portada"). Grado dinámico 1.º a 6.º con temas de color por grado (`1ro/2do/3ro` = PRIMER CICLO, `4to/5to/6to` = SEGUNDO CICLO).

### 8.1 Hoja 1 (frontal) — dos mitades en una misma carta horizontal

**Mitad izquierda (contraportada / reverso de la firma):**
- Banda superior: **"Firma del padre, madre o tutor"**.
- Bloque **"Períodos de Reportes de Calificaciones"**: 4 renglones con los meses de cada período (`Ago–Sept–Oct`, `Nov–Dic–Ene`, `Feb–Mar`, `Abr–May–Jun`) con línea para firmar cada uno.
- Banda **"Situación del estudiante"** con tabla de 3 casillas: **Promovido/a · Promovido con asignatura pendiente · Aplazado** (se marca la que corresponde — corresponde a `situacionPortada`).
- **"Observaciones:"** con 5 líneas.
- Dos firmas al pie: **Maestro/a encargado/a del curso** (el tutor) y **Director/a del Centro**.

**Mitad derecha (portada):**
- Logotipo del centro y leyenda oficial: *"Viceministerio de Servicios Técnicos y Pedagógicos — Dirección General de Educación Secundaria"*.
- Título **"Boletín de Calificaciones"** e **insignia del grado**: número grande (1–6 con sufijo superíndice `er/do/to`), caja "Grado", y debajo **ciclo** (PRIMER/SEGUNDO CICLO) + nivel (`NIVEL SECUNDARIO`/`PRIMARIO`).
- Formulario con campos etiquetados en cinta de color: **Año escolar · Sección · Número de orden · Nombres · Apellidos · Nombre del Centro Educativo · Código del centro · Dirección del centro · Distrito educativo (código + nombre, separados por "DE") · Dirección Regional de Educación (código + nombre)**.

### 8.2 Hoja 2 — calificaciones de rendimiento

En la maqueta aparece como **placeholder**: *"Se conserva íntegramente el diseño, tablas, competencias, períodos, resultados finales y demás información actuales"* — es decir, la hoja de calificaciones histórica **no cambia**: tablas por asignatura con las **competencias C1..C4**, las columnas de **períodos P1..P4**, los renglones de **recuperación (R1..R4/RP)**, la **completiva**, la **extraordinaria** y/o **especial**, y la **situación final**. Los datos que la llenan vienen exactamente de `cargarCurso_` (sección 7.1): `asignaturas` (ordenadas por `ordenBoletin`, con `nombreReporte` y `abrev`), `registros[].notas` y `registros[].calc` por estudiante/asignatura, `situacion`, `situacionPortada`, `asistencia` y el encabezado `centro`.

### 8.3 Implicaciones para el nuevo sistema

- El boletín debe renderizarse en **2 páginas por estudiante** (dúplex: la hoja 1 es contraportada+portada en una sola carta horizontal) con opción "sin portada" (1 página).
- El "número de orden" es el `num` (NUM_LISTA); el grado se normaliza dinámicamente (`1ro`…`6to`) para elegir tema/ciclo.
- La situación para la portada (`Promovido / Promovido con pendiente / Aplazado`) ya existe en el legacy como `situacionPortada` y hay que reproducirla.
- Los meses de los períodos impresos (`Ago–Sept–Oct`, etc.) deben derivarse de la configuración de períodos (`MESES`), no quedar fijos.

---

## 9. Mapeo a la nueva arquitectura (React + Node + PostgreSQL)

### 9.1 Entidades de BD sugeridas

| Módulo | Tablas (PostgreSQL) |
|---|---|
| Estudiantes | `estudiantes` (id PK, nombres, apellidos, nombre_completo, matricula, sexo, fecha_nacimiento, estado), `inscripciones` (id, anio_escolar, id_estudiante FK, id_curso FK, id_seccion FK, num_lista, estado: ACTIVO/RETIRADO, timestamps) |
| Cursos | `cursos` (id, anio_escolar, nivel, grado, estado), `secciones` (id, id_curso FK, letra, estado), `periodos` (id, anio_escolar, codigo, nombre, tipo: REGULAR/ETAPA, etapa, orden, meses text[], estado: ABIERTO/CERRADO) |
| Asignaturas | `asignaturas` (codigo UNIQUE, nombre, nombre_reporte, abrev, area, grados text[] o tabla puente, orden, orden_boletin, nota_minima, flags usa_* boolean), `competencias` (id, id_asignatura FK NULL = general/'*', codigo C1..C4, nombre, abrev, orden) — UNIQUE(id_asignatura, codigo) |
| Asignaciones | `docentes` (datos personales, estado), `usuarios` (rol, id_docente FK, pin_hash, estado), `asignaciones` (id, anio, id_seccion, id_asignatura, id_docente, id_periodo NULL = todo el año, estado) — UNIQUE(anio, seccion, asignatura, docente, periodo) |
| Tutorías | `tutorias` (id, anio, id_seccion, id_docente, estado: ACTIVA/INACTIVA) + restricción parcial `UNIQUE(anio, id_seccion) WHERE estado='ACTIVA'` |
| Observaciones | `observaciones` (id, anio, id_estudiante, id_curso, id_seccion, id_docente, id_asignatura NULL, id_periodo NULL, tipo ENUM, fecha, texto ≤600, estado ACTIVA/ANULADA, creado_por) |
| Calificaciones/Reportes | `calificaciones` (clave de grupo derivable de anio+seccion+asignatura), `asistencia`, `resultados` (cache materializado del motor de cálculo), `historial` (auditoría: fecha, usuario, accion, modulo, id_registro, descripcion, valor_anterior, valor_nuevo), `config` (clave, valor, descripcion) |
| Sesión | Tabla de sesiones/revocación de tokens (el legacy revoca sesiones al restablecer PIN) |

### 9.2 Endpoints REST sugeridos

**Estudiantes**
- `GET /api/secciones/{id}/estudiantes?incluirRetirados=` — listar
- `POST /api/estudiantes` (body: sección + datos) — crear individual
- `PUT /api/estudiantes/{id}` — editar
- `PATCH /api/inscripciones/{id}/estado` — retirar/reactivar
- `POST /api/secciones/{id}/estudiantes/importar` (texto) — importar lote
- `POST /api/secciones/{id}/estudiantes/sincronizar-registro` — hoja externa "registro"
- `GET /api/estudiantes/buscar?q=&anio=` — búsqueda acotada a secciones visibles
- `POST /api/secciones/{id}/estudiantes/asignar` — inscribir/cambiar de sección

**Cursos y períodos**
- `GET /api/anios/{anio}/secciones` — índice (equivalente `seccionesIndice_` filtrado)
- `POST /api/secciones` · `PUT /api/secciones/{id}` · `PATCH /api/secciones/{id}/estado`
- `GET /api/anios/{anio}/periodos`
- `POST /api/periodos` · `PUT /api/periodos/{id}` · `PATCH /api/periodos/{id}/estado`
- `POST /api/periodos/duplicar` {origen, destino}

**Asignaturas y competencias**
- `GET /api/grados/{grado}/asignaturas`
- `CRUD /api/asignaturas`, `CRUD /api/competencias`
- `GET /api/asignaturas/{id}/competencias` (resolución general/específica C1..C4)
- `GET /api/asignaturas/{id}/cfg` (o embebida en el contexto de cálculo)

**Docentes y asignaciones**
- `CRUD /api/docentes`
- `POST /api/docentes/{id}/acceso` (crear/restablecer PIN) · `POST /api/docentes/accesos-masivo`
- `GET /api/asignaciones?anio=` (panel) · `POST /api/asignaciones` · `PUT /api/asignaciones/{id}`
- `POST /api/asignaciones/asignar-docente` (con `todasSecciones`) · `POST /api/asignaciones/copiar` {anioOrigen, anioDestino}

**Tutorías**
- `CRUD /api/tutorias` (+ `GET /api/anios/{anio}/secciones/{id}/tutor`)

**Observaciones**
- `GET /api/secciones/{id}/observaciones?estudiante=&tipo=&incluirAnuladas=&q=`
- `POST /api/secciones/{id}/observaciones` · `PUT /api/observaciones/{id}` · `PATCH /api/observaciones/{id}/estado` (ANULADA/ACTIVA)

**Reportes / sesión**
- `GET /api/secciones/{id}/curso-completo` (`datosCurso_`)
- `GET /api/secciones/{id}/dashboard?periodo=`
- `GET /api/estudiantes/{id}/consulta?anio=` · `GET /api/estudiantes/{id}/historial`
- `GET /api/historial?modulo=&accion=&q=` (auditoría)
- `GET /api/bootstrap` (perfil, permisos, config, años, grados, cursos ligeros)
- `GET /api/secciones/{id}/asignaturas` (visibles + puedeEditar)
- `GET /api/config` · `PUT /api/config` (requiere reconstruir `resultados` si cambian reglas)
- `GET /api/secciones/{id}/boletin?estudiante=` (datos ya listos para el render del boletín; idealmente PDF en servidor o render cliente sobre `cargarCurso`)

### 9.3 Reglas de negocio que NO deben perderse

**Estudiantes**
1. ID de estudiante permanente; el curso/año viven en la inscripción (multi-año sin duplicar).
2. Nunca borrar: solo `RETIRADO`/`INACTIVO`; el listado por defecto de reportes excluye retirados.
3. Nombre: 3–120 chars; split `"Apellidos, Nombres"` por coma; normalización que elimina numeración inicial al importar.
4. Unicidad: prohibido duplicado normalizado dentro de la misma sección; duplicado global exige confirmación explícita del usuario.
5. Importación: máx 300 por lote, idempotente (omite existentes).
6. Cambio de sección bloqueado si el estudiante tiene calificaciones ligadas a `anio|seccionAntigua`.
7. `num_lista` autoincremental por sección (máximo + 1) y recalculado al reasignar.
8. Sincronizar registro es solo aditivo y reporta los que no están en el registro externo.

**Cursos / períodos**
9. Máx 4 períodos regulares por año; máx una etapa final por tipo (`COMPLETIVA`/`EXTRAORDINARIA`/`ESPECIAL`); `ETAPA` obligatoria si `TIPO=ETAPA`.
10. Meses de período solo del catálogo `['ago','sep','oct','nov','dic','ene','feb','mar','abr','may','jun']`.
11. Unicidad `(anio, codigo)` de período y `(anio, grado, letra)` de sección.
12. Año y grado de sección inmutables tras crear; estado inactivo si curso o sección inactivos.
13. Duplicar períodos solo a un año sin períodos y con formato `AAAA-AAAA`; los copiados nacen ABIERTO.
14. Cerrar período congela notas (solo editable por quien tiene permiso de cierre).

**Asignaturas / competencias**
15. `GRADOS = '*'` incluye todos los grados; código único (2–8 alfanumérico, mayúsculas); `OPT` = optativa.
16. Competencias: siempre 4 (C1..C4); la específica por asignatura reemplaza a la general `'*'` del mismo código; UNIQUE(asignatura, código).
17. Flags por asignatura solo pueden **limitar** los globales (si el global está apagado, la asignatura no lo activa); `nota_minima` por asignatura sobreescribe la global; pesos de completiva/extraordinaria son globales.
18. Cambiar reglas de config dispara reconstrucción de `RESULTADOS`.

**Asignaciones / permisos**
19. Unicidad `(anio, sección, asignatura, docente, período)`; la asignación de panel es para todo el año (`'*'`) y **reemplaza** al docente anterior (un solo docente por asignatura; las demás quedan inactivas).
20. `todasSecciones` replica la asignación a todas las secciones activas del grado.
21. Asignar docente exige que la asignatura se imparta en ese grado y que la sección pertenezca al año.
22. Copiar asignaciones entre años empareja por grado+letra, mapea períodos por código, no pisa existentes.
23. **Autorización central en servidor**: sin asignación activa el docente no ve ni edita nada; `puedeTrabajar` = admin de calificaciones O asignación propia con período `'*'` o el período puntual; secciones visibles = donde enseña ∪ donde es tutor; asignaturas visibles = solo las suyas (salvo admin/ver_todos).
24. Desactivar docente desactiva su usuario y revoca sesiones; crear/restablecer PIN muestra el PIN una sola vez y revoca sesiones previas.

**Tutorías**
25. Una sola tutoría `ACTIVA` por sección y año; cambiar tutor edita la fila activa, no crea otra.
26. El tutor ve información del curso y todas las observaciones del curso, pero no edita notas de asignaturas ajenas.

**Observaciones**
27. Ver: solo cursos con acceso; sin vista total, solo las propias (autor); tutor/admin de observaciones/ver_todos ven todas del curso.
28. Editar/anular: solo autor (con permiso `observaciones.editar`) o `observaciones.administrar`.
29. Tipos cerrados: ACADEMICA/CONDUCTA/ASISTENCIA/FAMILIA/OTRA; texto 3–600; fecha válida; asignatura del grado y período del año.
30. Nuevas observaciones solo a estudiantes activos; nunca borrar → `ANULADA` (queda en auditoría).

**Reportes / cálculo**
31. `cargarCurso_` es el contrato de datos de todos los impresos: por estudiante y asignatura `{notas, calc}` con la config efectiva de la asignatura; incluir encabezado del centro, tutor, orden de boletín, competencias resueltas y asistencia.
32. Situación final y situación de portada se determinan combinando las situaciones de todas las asignaturas.
33. Dashboard: nota mínima por asignatura para el riesgo; distribución `<70/70-79/80-89/≥90`; contadores de pendientes, en recuperación y por etapa.
34. Historial de auditoría inmutable con valor anterior/nuevo en TODAS las operaciones (crear/editar/estado/config).
35. Bootstrap entrega permisos y config del servidor; el cliente nunca decide permisos por su cuenta.
36. Cambiar `NOTA_MINIMA`/`ANO_ESCOLAR` u otras reglas reconstruye resultados y audita cada parámetro.

**Boletín**
37. Reproducir el formato de `Vista_Previa_Boletin.html`: carta horizontal, hoja 1 (contraportada con firmas por período + situación Promovido/Pendiente/Aplazado + observaciones + firmas de tutor y director; portada con insignia de grado dinámico, ciclo y formulario completo del centro), hoja 2 de calificaciones con competencias C1..C4, períodos, recuperaciones, completiva/extraordinaria/especial y situación final; opción sin portada.
38. Número de orden = `num_lista`; textos de impresión = `NOMBRE_REPORTE`/`ABREV`/`ORDEN_BOLETIN`; meses de períodos desde configuración.
