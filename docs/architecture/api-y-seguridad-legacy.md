# SGA Legacy — Documentación de API, Autenticación, Permisos y Frontend SPA

> Auditoría técnica del sistema legacy en **Google Apps Script** (SGA – Sistema de Gestión Académica, v1.0.0),
> como insumo para la migración a **React + Node (Express) + PostgreSQL**.
>
> Archivos analizados: `Code.js`, `Auth.js`, `Users.js`, `Crud.js`, `Utils.js`, `Config.js`, `Database.js`,
> `Engine.js`, `Grades.js`, `Students.js`, `Reports.js`, `Observations.js`, `Assignments.js`, `Courses.js`,
> `Index.html`, `JavaScript.html` (carpeta `SGA/legacy/`).

---

## 1. Arquitectura general de la capa de API

### 1.1 Superficie pública

En Apps Script, `google.script.run` permite al navegador invocar **cualquier función pública del proyecto**.
El legacy mitiga esto con una convención de seguridad explícita (comentario en `Code.js`): el navegador
**solo debe llamar a 3 funciones**:

| Función pública | Rol |
|---|---|
| `doGet()` | Sirve el HTML de la SPA (plantilla `Index`) con viewport y `XFrameOptionsMode.ALLOWALL`. |
| `apiLogin(usuario, clave)` | Único punto de autenticación. Devuelve `{ ok, data: { token, boot } }`. |
| `apiEjecutar(accion, token, datos)` | **Única puerta para el resto de operaciones** (dispatcher). |

Todo lo demás (funciones con sufijo `_`) se considera interna. El sufijo `_` es la convención de
"privado" en Apps Script.

### 1.2 Despachador `apiEjecutar(accion, token, datos)`

Flujo exacto (Code.js líneas 75–86):

1. Resuelve `ruta = rutas_()[String(accion)]`. Si no existe → `ErrorApp('Operación no válida.')`.
2. `ctx = sesionDe_(token)` → valida la sesión y construye el contexto con permisos (ver §3).
3. Si `ctx.debeCambiar` y la ruta **no** es `libre`, bloquea con error código `CAMBIAR_CLAVE`
   ("Debe cambiar su contraseña temporal antes de continuar."). Solo las 3 rutas de sesión son libres.
4. Si la ruta declara `permiso`, ejecuta `exigirPermiso_(ctx, ruta.permiso)`.
5. Normaliza `datos` a objeto (`{}` si no lo es) y llama `ruta.fn(ctx, d)`.
6. Devuelve `{ ok: true, data: resultado }`.
7. En cualquier error: `respuestaError_()` — si es `ErrorApp` (error de negocio) devuelve
   `{ ok:false, error: mensaje, codigo }`; si es un error técnico lo registra en la hoja `ERRORES`
   (`registrarError_`, ref. de 6 caracteres) y muestra un mensaje genérico con la referencia.

**Formato de respuesta estándar:** `{ ok: boolean, data?: any, error?: string, codigo?: string }`.
Códigos usados: `VALIDACION` (default), `PERMISO`, `SESION`, `LOGIN`, `BLOQUEO`, `CAMBIAR_CLAVE`,
`OCUPADO` (lock), `DUPLICADO`, `ERROR` (técnico).

### 1.3 Tabla COMPLETA de rutas de `rutas_()`

Convención de columnas:
- **Libre**: `libre: true` → no exige sesión (pero `apiEjecutar` igualmente llama a `sesionDe_(token)`; el ctx puede ser nulo para `bootstrap` cuando no hay token… *en la práctica* `bootstrap` y `cambiarClave` reciben el ctx de la sesión activa; `libre` significa que no se bloquean cuando `debeCambiar` es `true`).
- **Permiso (ruta)**: declarado en `rutas_()`; se verifica ANTES de llamar a la función.
- **Verificación interna**: permisos adicionales que la función atendedora verifica por dentro (leídos en el módulo correspondiente). Si la columna ruta está vacía, el control ocurre **solo** dentro de la función.

| Acción | Función atendedora | Archivo | Libre | Permiso en ruta | Verificación interna |
|---|---|---|---|---|---|
| `sesion.bootstrap` | `bootstrap_(ctx)` | Reports.js | ✅ libre | — | nada (usa el ctx de la sesión) |
| `sesion.cerrar` | `cerrarSesion_(ctx)` | Auth.js | ✅ libre | — | nada |
| `sesion.cambiarClave` | `cambiarClave_(ctx, d.actual, d.nueva)` | Auth.js | ✅ libre | — | verifica PIN actual; `validarPoliticaClave_` |
| `cursos.listarLigero` | `cursosListarLigero_(ctx, p)` | Reports.js | — | `cursos.ver` | alcance por `seccionesPermitidas_` (docente solo sus cursos; `cursos.ver_todos` los ve todos) |
| `cursos.asignaturas` | `asignaturasCurso_(ctx, p)` | Reports.js | — | `calificaciones.ver` | `exigirSeccion_` + `asignaturasVisibles_` + `puedeTrabajar_` por asignatura |
| `calificaciones.grid` | `obtenerGrid_(ctx, p)` | Grades.js | — | — | `exigirPermiso_('calificaciones.ver')` + `exigirSeccion_` + `exigirAsignaturaVisible_` + `puedeTrabajar_` |
| `calificaciones.guardar` | `guardarNotas_(ctx, p)` | Grades.js | — | — | `calificaciones.registrar` **o** `calificaciones.editar` (por celda: registrar si la celda estaba vacía, editar si ya tenía nota) + período cerrado exige `calificaciones.cerrar` + `puedeTrabajar_` |
| `asistencia.obtener` | `obtenerAsistencia_(ctx, p)` | Grades.js | — | — | `exigirPermiso_('asistencia.ver')` + `exigirSeccion_` + `exigirAsignaturaVisible_` |
| `asistencia.guardar` | `guardarAsistencia_(ctx, p)` | Grades.js | — | — | `exigirPermiso_('asistencia.registrar')` + `puedeTrabajar_` |
| `reportes.curso` | `datosCurso_(ctx, p)` | Reports.js | — | — | `exigirPermiso_('reportes.ver')` + `exigirSeccion_` |
| `reportes.dashboard` | `dashboard_(ctx, p)` | Reports.js | — | — | `exigirPermiso_('reportes.ver')` + `exigirSeccion_` |
| `estudiantes.listar` | `listarEstudiantes_(ctx, p)` | Students.js | — | — | `exigirPermiso_('estudiantes.ver')` + `exigirSeccion_` |
| `estudiantes.guardar` | `guardarEstudiante_(ctx, p)` | Students.js | — | — | `estudiantes.crear` (nuevo) / `estudiantes.editar` (editar) + `exigirSeccion_` |
| `estudiantes.estado` | `estadoEstudiante_(ctx, p)` | Students.js | — | — | `exigirPermiso_('estudiantes.editar')` + `exigirSeccion_` (retirar/reactivar inscripción) |
| `estudiantes.importar` | `importarEstudiantes_(ctx, p)` | Students.js | — | — | `exigirPermiso_('estudiantes.crear')` + `exigirSeccion_` |
| `estudiantes.sincronizar` | `sincronizarRegistro_(ctx, p)` | Students.js | — | — | `exigirPermiso_('configuracion.administrar')` (lee hoja "registro" de otro libro) |
| `estudiantes.asignar` | `asignarEstudiante_(ctx, p)` | Students.js | — | — | `exigirPermiso_('estudiantes.editar')` + `exigirSeccion_` (inscribir/cambiar de sección) |
| `estudiantes.buscar` | `buscarEstudiantes_(ctx, d.q, d.ano)` | Students.js | — | — | `exigirPermiso_('estudiantes.ver')`; resultados acotados a `seccionesPermitidas_` |
| `estudiantes.consulta` | `consultaEstudiante_(ctx, p)` | Reports.js | — | — | `estudiantes.ver` **y** `calificaciones.ver` + `exigirSeccion_` |
| `estudiantes.historial` | `historialAcademico_(ctx, p)` | Reports.js | — | — | `exigirPermiso_('estudiantes.ver')`; omite años sin acceso |
| `crud.meta` | `crudMeta_(ctx, d.modulo)` | Crud.js | — | — | `exigirPermiso_(ctx, def.permisos.ver)` del módulo indicado |
| `crud.listar` | `crudListar_(ctx, d.modulo, d)` | Crud.js | — | — | `def.permisos.ver`; algunos módulos filtran por alcance (ej. `defCursos_` usa `seccionesPermitidas_`) |
| `crud.guardar` | `crudGuardar_(ctx, d.modulo, d)` | Crud.js | — | — | `def.permisos.crear` (nuevo) / `def.permisos.editar` (editar); hook `def.guardar` puede añadir más (ej. `guardarUsuario_`: crear admin exige `roles.administrar`, no cambiar el propio rol, no desactivar al único admin) |
| `crud.estado` | `crudEstado_(ctx, d.modulo, d)` | Crud.js | — | — | `def.permisos.estado || def.permisos.editar`; hooks `def.estado`/`def.despuesEstado` |
| `crud.opciones` | `opcionesRef_(d.ref, d)` | Crud.js | — | — | **Ninguna más allá de la sesión** (listas de referencia: docentes, roles, asignaturas, secciones, períodos, grados) |
| `usuarios.restablecer` | `restablecerAcceso_(ctx, p)` | Users.js | — | — | `exigirPermiso_('usuarios.editar')` (genera PIN nuevo, revoca sesiones) |
| `docentes.acceso` | `docenteAcceso_(ctx, p)` | Assignments.js | — | — | si ya existe usuario: `usuarios.editar` (restablece PIN); si no: `usuarios.crear` (crea usuario+PIN) |
| `docentes.accesosMasivo` | `docentesAccesosMasivo_(ctx)` | Assignments.js | — | — | `exigirPermiso_('usuarios.crear')` (crea acceso a todos los docentes activos sin usuario) |
| `asignaciones.panel` | `panelAsignaciones_(ctx, p)` | Assignments.js | — | — | `exigirPermiso_('asignaciones.ver')` |
| `asignaciones.asignar` | `asignarDocente_(ctx, p)` | Assignments.js | — | — | asignar: `asignaciones.crear`; quitar (idDocente vacío): `asignaciones.editar` |
| `asignaciones.copiar` | `copiarAsignaciones_(ctx, p)` | Assignments.js | — | — | `exigirPermiso_('asignaciones.crear')` |
| `observaciones.listar` | `listarObservaciones_(ctx, p)` | Observations.js | — | — | `exigirPermiso_('observaciones.ver')` + `exigirSeccion_`; el docente solo ve las suyas salvo tutor del curso, `cursos.ver_todos` u `observaciones.administrar`; `puedeEditar` = autor + `observaciones.editar`, u `observaciones.administrar` |
| `observaciones.guardar` | `guardarObservacion_(ctx, p)` | Observations.js | — | — | `observaciones.registrar` (nueva) / `observaciones.editar` (editar, solo autor o administrador) |
| `observaciones.estado` | `estadoObservacion_(ctx, p)` | Observations.js | — | — | `exigirPermiso_('observaciones.editar')` + autor/administrador (anular/restaurar) |
| `roles.listar` | `rolesListar_(ctx)` | Users.js | — | — | `exigirPermiso_('roles.ver')` |
| `roles.guardar` | `rolesGuardar_(ctx, p)` | Users.js | — | — | `exigirPermiso_('roles.administrar')`; el rol ADMINISTRADOR no se modifica |
| `periodos.duplicar` | `duplicarPeriodos_(ctx, p)` | Courses.js | — | — | `exigirPermiso_('periodos.administrar')` |
| `historial.listar` | `listarHistorial_(ctx, p)` | Reports.js | — | — | `exigirPermiso_('historial.ver')` |
| `config.obtener` | `configObtener_(ctx)` | Reports.js | — | — | `exigirPermiso_('configuracion.administrar')` |
| `config.guardar` | `configGuardar_(ctx, p)` | Reports.js | — | — | `exigirPermiso_('configuracion.administrar')` + `conBloqueo_` |

**Observaciones de seguridad relevantes para la migración:**
- Solo 3 rutas declaran `permiso` en la tabla; el resto confía en la verificación interna de cada función.
  Esto significa que el "mapa de permisos" está **distribuido** en el código, no centralizado.
- `crud.opciones` no verifica ningún permiso: cualquier usuario autenticado obtiene listas de
  docentes, roles, asignaturas, secciones y períodos. Es una fuga menor de información a considerar.
- Las rutas "libres" son 3 y todas de sesión. `apiEjecutar` exige sesión válida para cualquier otra
  ruta; no hay rutas anónimas de datos.
- El docente tiene alcance **por asignación** (tabla ASIGNACIONES) y **por tutoría**: ver §3.4.

---

## 2. Modelo de autenticación

### 2.1 Hash de claves (`nuevaSal_`, `pimienta_`, `hashClave_`)

Las "contraseñas" del sistema son **PIN de 4 dígitos** (no hay contraseñas complejas).

- **`nuevaSal_()`**: sal aleatoria de 40 caracteres hex (UUID+UUID truncado), única por credencial.
- **`pimienta_()`**: *pepper* — secreto del servidor guardado en **Propiedades del script** (`PEPPER`);
  se genera la primera vez (`UUID+UUID`) y se mezcla en el hash. Motivo: un PIN de 4 dígitos es
  trivialmente descifrable por fuerza bruta si solo se copia la hoja; el pepper evita que una copia
  del spreadsheet sirva para recuperar PINs.
- **`hashClave_(clave, sal, version)`**:
  - `v2` (default): cadena base = `sal + ':' + pimienta_() + ':' + clave`.
  - `v1` (legacy, sin pepper): `sal + ':' + clave`.
  - Algoritmo: **SHA-256 iterado 400 veces** (`SGA.HASH_ITER = 400`): `h = SHA256(h || salBytes)`.
  - Formato almacenado: `"v2$<hex>"` — **la versión va embebida como prefijo del hash**, lo que
    permite verificar hashes viejos (`verificarClave_` lee el prefijo) y re-versionar al cambiar el PIN.
- **`verificarClave_`** recomputa con la versión del hash guardado y compara en **tiempo constante**
  (`iguales_`, XOR byte a byte).
- **`guardarCredencial_(idUsuario, clave, debeCambiar)`** escribe la fila en la hoja `CREDENCIALES`
  (HASH, SALT, DEBE_CAMBIAR, INTENTOS_FALLIDOS=0, BLOQUEADO_HASTA='', FECHA_CAMBIO) e invalida caché.

> ⚠️ 400 iteraciones de SHA-256 es débil para un PIN de 4 dígitos (10.000 combinaciones). Sin el
> pepper, un atacante con la hoja + el pepper rompe cualquier PIN en segundos. Es una **deuda de
> seguridad** que la migración debe corregir (ver §6).

### 2.2 Política de claves

- **`validarPoliticaClave_(clave)`**: exige exactamente 4 dígitos (`/^\d{4}$/`) y rechaza PINs débiles.
- **`pinDebil_(pin)`**: rechaza `dddd` (cuatro dígitos iguales), `1234`, `4321`, `0123`.
- **`claveTemporal_()`**: genera un PIN temporal aleatorio de 4 dígitos derivado de un UUID
  (4 bytes → dígitos 0-9), reintenta hasta 50 veces para no caer en PIN débil; respaldo `'5827'`.
  Se usa al crear usuarios, al crear accesos de docentes y al restablecer acceso. Se muestra **una
  sola vez** al administrador y el usuario está obligado a cambiarla (`DEBE_CAMBIAR`).

### 2.3 Bloqueo por intentos fallidos

Doble mecanismo:

1. **Caché del script** (`bloqueoCache_`): clave `'fail:' + sha256(usuario).slice(0,24)` (hasheada para no
   exponer nombres en la caché). Contador con TTL = `MINUTOS_BLOQUEO` (config). Si
   `fallos >= MAX_INTENTOS_LOGIN * 2` se rechaza con código `BLOQUEO` **antes** de buscar al usuario.
   También bloquea usuarios inexistentes (el contador se incrementa igual).
2. **Hoja `CREDENCIALES`** (`INTENTOS_FALLIDOS`, `BLOQUEADO_HASTA`): al llegar a `MAX_INTENTOS_LOGIN`
   fallidos se fija `BLOQUEADO_HASTA = ahora + MINUTOS_BLOQUEO` y se reinicia el contador.
   `login_` rechaza si `BLOQUEADO_HASTA > ahora`.
- **Anti-enumeración**: para usuarios inexistentes se computa igualmente un hash con "sal-ficticia"
  (igualar el tiempo de respuesta) y se devuelve siempre el mismo mensaje genérico
  "Usuario o PIN incorrectos."
- El login de usuario o correo (`USUARIO` o `CORREO` coinciden, case-insensitive).
- Cada intento fallido y cada login exitoso quedan en el **historial de auditoría**
  (`LOGIN_FALLIDO` / `LOGIN`, módulo `AUTENTICACION`).
- `restablecerAcceso_` limpia también la caché de bloqueo del usuario.

### 2.4 Sesiones

- **`crearSesion_(idUsuario)`**:
  - Token = 2 UUIDs concatenados sin guiones → **64 caracteres hex** (256 bits).
  - En la hoja `SESIONES` solo se guarda el **hash** del token (`sha256Hex_`), nunca el token plano.
  - Columnas: ID, ID_USUARIO, TOKEN_HASH, CREADA, EXPIRA (`DURACION_SESION_MIN` config, default
    480 min, mínimo 5), ULTIMA_ACTIVIDAD, ESTADO='ACTIVA'.
  - Copia en **CacheService** con clave `'ses:<token_hash>'` y TTL `min(duración, 6h)`.
  - Antes de crear, `limpiarSesiones_(sh)`.
- **`limpiarSesiones_(sh)`**: solo si la hoja supera 800 filas, borra físicamente las sesiones
  vencidas hace más de 1 día (la hoja está ordenada por fecha de creación).
- **`sesionDe_(token)`** — se ejecuta en **cada** llamada de `apiEjecutar`:
  1. Valida formato del token (`/^[a-f0-9]{64}$/`).
  2. Busca `ses:<hash>` en caché; si venció, consulta la hoja `SESIONES` (TOKEN_HASH) y repuebla la
     caché si la sesión está ACTIVA y no expirada.
  3. Verifica expiración.
  4. **Revocación global**: lee la propiedad `REV_<idUsuario>` del Script Properties; si
     `creacion_sesion < REV_`, la sesión se considera inválida. Es el mecanismo de
     **revocación masiva** de sesiones.
  5. Verifica que el usuario exista y esté `ACTIVO`.
  6. Reconstruye el contexto (`contextoDe_`) con los permisos **vigentes al momento** (los permisos
     no se cachean en la sesión: cambios de rol aplican de inmediato).
- **`revocarSesiones_(idUsuario)`**: fija `REV_<idUsuario> = Date.now()`. Se llama al: restablecer
  PIN, cambiar el PIN de un usuario, cambiar su rol/permisos, desactivar el usuario y al guardar
  permisos de un rol (todos los usuarios del rol).
- **`cerrarSesion_(ctx)`**: borra la entrada de caché y marca la fila `ESTADO='CERRADA'`; audita `LOGOUT`.
- **`cambiarClave_(ctx, actual, nueva)`**: verifica PIN actual, valida política, exige distinto al
  actual, guarda credencial con `DEBE_CAMBIAR=false` y audita.

### 2.5 Flujo exacto de `login_(usuarioTxt, clave)`

```
1. limpiar_(usuarioTxt).toLowerCase(); clave = String(clave||'')
2. exigir_(usuarioTxt && clave)
3. cache.get('fail:'+sha256(usuario)) → si fallos ≥ MAX_INTENTOS_LOGIN*2 → throw BLOQUEO
4. buscar usuario en USUARIOS (por USUARIO o CORREO, lowercase)
5. buscar fila en CREDENCIALES por ID_USUARIO
6. si no existe usuario o credencial:
     hashClave_(clave,'sal-ficticia')            ← tiempo constante anti-enumeración
     cache.put(fallos+1)                         ← el usuario inexistente también acumula intentos
     throw "Usuario o PIN incorrectos." (LOGIN)
7. si BLOQUEADO_HASTA > ahora → reponer caché y throw BLOQUEO
8. ok = verificarClave_(clave, SALT, HASH)
9. activo = usuario ESTADO=='ACTIVO' y su rol no está INACTIVO
10. si !ok || !activo (dentro de conBloqueo_ / LockService):
      INTENTOS_FALLIDOS++; si ≥ MAX_INTENTOS_LOGIN → BLOQUEADO_HASTA=ahora+minutos, contador=0
      historial LOGIN_FALLIDO; throw genérico
11. debeCambiar = credencial.DEBE_CAMBIAR=='SI'
12. dentro de conBloqueo_:
      INTENTOS_FALLIDOS=0; BLOQUEADO_HASTA=''
      USUARIOS.ULTIMO_ACCESO = ahora
      token = crearSesion_(idUsuario)
      historial LOGIN
13. cache.remove(clave de fallos)
14. ctx = contextoDe_(usuario, debeCambiar)
15. return { token, ctx }   → apiLogin añade boot = bootstrap_(ctx)
```

### 2.5b `bootstrap_(ctx)` (payload de arranque)

Devuelve: `{ usuario: perfilPublico_ (id, usuario, nombre, rol, idDocente, debeCambiar), permisos[] ,
app, version, config: {ano, min, max, entera, decimales, filas}, anos[], grados[], cursos[] }`.
Es el "documento de arranque" con el que el frontend construye todo el menú y los selectores.

---

## 3. Sistema de permisos

### 3.1 Origen de los permisos

- Hoja `PERMISOS`: catálogo (`ID_PERMISO`, `MODULO`, `DESCRIPCION`). Ejemplos vistos en el código:
  `estudiantes.ver/crear/editar`, `calificaciones.ver/registrar/editar/cerrar/administrar`,
  `asistencia.ver/registrar`, `reportes.ver`, `observaciones.ver/registrar/editar/administrar`,
  `cursos.ver/crear/editar/ver_todos`, `docentes.ver/crear/editar`, `asignaturas.ver`,
  `asignaciones.ver/crear/editar`, `tutorias.ver`, `periodos.ver/administrar`, `usuarios.ver/crear/editar/eliminar`,
  `roles.ver/administrar`, `historial.ver`, `configuracion.administrar`.
- Hoja `ROL_PERMISOS`: par `ID_ROL → ID_PERMISO` (N filas por rol). Cacheada 600 s (`permisosPorRol_`).
- El rol **ADMINISTRADOR** siempre tiene todos los permisos (`permisosEfectivos_` hace cortocircuito).

### 3.2 `permisosEfectivos_(u)`

```
ADMINISTRADOR            → todosLosPermisos_()
resto: (permisos del rol) ∪ (u.PERMISOS_EXTRA, lista CSV)  − (u.PERMISOS_DENEGADOS, lista CSV)
```
Los extras y denegados son columnas de texto CSV en `USUARIOS` (validados contra el catálogo por
`permisosValidos_` al guardar). El resultado se reduce a un `set` de pertenencia O(1).

### 3.3 Contexto y comprobaciones

- **`contextoDe_(u, debeCambiar)`** construye el objeto `ctx` que viaja a todas las funciones:
  `{ id, usuario, nombre, correo, rol, idDocente, permisos: [...], set: {p:true}, debeCambiar }`
  y `sesionDe_` le añade `ctx.token = token_hash`.
- **`tiene_(ctx, permiso)`**: `ctx && ctx.set[permiso] === true`.
- **`exigirPermiso_(ctx, permiso)`**: lanza `ErrorApp('No tiene permiso…', 'PERMISO')` si no lo tiene.

### 3.4 Permisos por alcance (más allá del permiso nominal)

En `Assignments.js` vive la capa de **alcance por curso/asignatura**, que es la base de la seguridad
académica (las funciones de calificaciones la usan siempre):

- **`seccionesPermitidas_(ctx, ano)`**: todas las secciones si tiene `cursos.ver_todos`; si no, solo
  las secciones donde tiene ASIGNACIONES activas o TUTORIAS activa.
- **`exigirSeccion_(ctx, ano, idSeccion)`**: valida que la sección exista en el año y esté permitida
  (error `PERMISO`).
- **`asignaturasVisibles_(ctx, ano, sec)`**: todas si `calificaciones.administrar` o
  `cursos.ver_todos`; si no, solo las asignaturas con asignación propia (`misAsignaciones_`).
- **`puedeTrabajar_(ctx, ano, idSeccion, idAsig, idPeriodo)`**: `calificaciones.administrar` lo permite
  todo; si no, debe existir una asignación propia para esa sección+asignatura, y si el período se
  indica, que la asignación cubra ese período (`'*'` = todo el año) o no se indique período.
- **Observaciones** tiene su propia lógica de alcance: docente ve solo las suyas, salvo tutor del
  curso / `cursos.ver_todos` / `observaciones.administrar`; editar solo autor (+permiso) o admin.

### 3.5 Cómo lo usan Crud.js y los módulos

- Las definiciones CRUD declaran `permisos: { ver, crear, editar, estado }` y el motor los aplica
  (`crudMeta_/crudListar_/crudGuardar_/crudEstado_`).
- `crudMeta_` además filtra las **acciones** del módulo por permiso y expone
  `puedeCrear/puedeEditar/puedeEstado` para que el frontend pinte la UI acorde.
- Módulos con `guardar`/`estado` propios (usuarios, docentes parcialmente) re-implementan las
  comprobaciones con reglas de negocio extra (ver tabla §1.3).
- ` Crud.js` usa `conBloqueo_` (`LockService.getScriptLock()`, espera máx. 25 s, error `OCUPADO`)
  en toda escritura: las hojas no tienen transacciones, el lock es la "transacción".

---

## 4. Motor CRUD genérico (`Crud.js`)

### 4.1 `definiciones_()` — registro de módulos

```
{ usuarios, docentes, asignaturas, competencias, asignaciones, tutorias, periodos, cursos }
```
Cada uno lo aporta un módulo (`defUsuarios_` en Users.js, `defDocentes_` en Assignments.js, etc.).
Es una **función** (no constante) para no depender del orden de carga de los archivos. `def_(modulo)`
lanza "Módulo no válido" si el módulo no existe.

### 4.2 Anatomía de una definición de módulo (patrón a replicar)

| Propiedad | Uso |
|---|---|
| `titulo`, `singular` | Encabezados de pantalla y mensajes |
| `hoja` | Hoja destino (en el nuevo backend: tabla PostgreSQL) |
| `idKey` | Nombre de la columna ID (default: primera columna del ESQUEMA) |
| `etiqueta` | Campo usado en el mensaje de auditoría ("Registro: valor") |
| `permisos` | `{ ver, crear, editar, estado }` — permisos de catálogo |
| `columnas` | `[['CAMPO', 'Encabezado'], …]` — columnas de la tabla del listado |
| `campos` | Definición de campos del formulario (ver abajo) |
| `buscar` | Campos en los que busca el texto libre (`paginar_`) |
| `filtros` | `[{ k, et, ref | opciones }]` — desplegables de filtro |
| `estados` | Ciclo de estados posible, default `['ACTIVO','INACTIVO']` |
| `conAno` | Filtrado por año escolar (`ANO_ESCOLAR`) |
| `unico` / `msgUnico` | Reglas de unicidad compuestas `[[col1,col2],…]` |
| `ayuda` | Texto informativo en pantalla |
| `acciones` | `[{ id, et, permiso, global? }]` — acciones de fila o globales |
| `decorar(items, ctx)` | Enriquece las filas antes de mostrar (TXT de referencias, totales…) |
| `listar(ctx, p)` | **Reemplaza** el listado genérico (ej. cursos por alcance) |
| `guardar(ctx, p)` | **Reemplaza** el guardado genérico (usuarios) |
| `estado(ctx, p)` | **Reemplaza** el cambio de estado genérico |
| `antes(o, ctx, nuevo, previo)` | Validaciones/normalización **antes** de unicidad y escritura |
| `despues(ctx, id, o, nuevo)` | Post-acciones tras guardar (devuelve `extra` a la respuesta) |
| `despuesEstado(ctx, p)` | Post-acciones del cambio de estado |

**Tipos de campo admitidos por `crudValidar_`:**
`texto` (max default 150, `req`, `minusculas`), `num` (`min`/`max`), `correo`, `enum` (`opciones`),
`ref` (`ref: 'docentes' | 'roles' | 'asignaturas' | 'asignaturas*' | 'secciones' | 'periodos*' | 'grados'`),
`patron` (`patron` + `msg`), `si_no`. Modificadores: `req`, `soloCrear` (no editable en edición),
`soloLectura`, `defecto`.

### 4.3 `crudMeta_(ctx, modulo)` — metadatos para el frontend

Devuelve lo que la UI necesita para **generarse sola**:
`{ modulo, idKey, titulo, singular, columnas, campos, filtros, conAno, estados, acciones(filtradas por permiso), puedeCrear, puedeEditar, puedeEstado, ayuda }`.
Se exige `def.permisos.ver`. El frontend (vCrud) no conoce nada de los módulos: pinta lo que el
servidor manda.

### 4.4 `crudListar_(ctx, modulo, p)`

1. `exigirPermiso_(def.permisos.ver)`.
2. `p.tam` default `FILAS_POR_PAGINA` (config).
3. Si `def.listar` existe → delega (listado custom con alcance).
4. Si no: lee todas las filas, filtra por `ANO_ESCOLAR` si `conAno`, aplica `decorar`, elimina `_fila`
   y llama a **`paginar_(items, p, buscar)`** (Utils.js): búsqueda normalizada (`norm_`, sin acentos),
   filtros exactos, `tam` acotado 1..`MAX_POR_PAGINA` (200), devuelve
   `{ items, total, pagina, paginas, tam }`.

### 4.5 `crudGuardar_(ctx, modulo, p)`

1. `nuevo = !p.id`; exige `permisos.crear` o `permisos.editar`.
2. Si `def.guardar` → delega (usuarios con toda su lógica).
3. Dentro de `conBloqueo_`:
   - Localiza la fila previa (o lanza "El registro no existe.").
   - **`crudValidar_(d, p.datos, previo, ctx)`**: recorre `d.campos`; ignora `soloCrear` al editar y
     `soloLectura`; undefined → conserva valor previo o `defecto`; valida por tipo (num con rango,
     correo, enum, ref contra `opcionesRef_`, patrón, max de longitud); texto obligatorio con
     `req`. Devuelve objeto limpio `{COLUMNA: valor}`.
   - `def.antes(o, ctx, nuevo, previo)` — ganchos de negocio.
   - **`crudUnico_`**: para cada grupo `d.unico`, construye clave `norm_(v1)|norm_(v2)…`, compara con
     todos los registros **excluyendo al propio registro y a los INACTIVOS/CERRADO**; duplicado →
     `msgUnico` o "Ya existe un registro con esos mismos datos."
   - Inserta (ID con `generadorId_` formato `PREF-000001`, FECHA_CREACION/MODIFICACION, ESTADO
     default) o actualiza solo las columnas presentes; FECHA_MODIFICACION.
   - `invalidar_(hoja)` y `invalidar_('__sec')` (cachés de hojas).
   - **Auditoría**: `historial_(usuario, CREAR|EDITAR, hoja, id, "Singular: etiqueta", cambios)`;
     `crudCambios_` produce un diff `"antes → después"` por campo, truncado a 400 chars. Escritura en
     lote con `vaciarHistorial_()` (buffer en memoria).
   - `def.despues(...)` y respuesta `{ id, ...extra }` (ej. `claveTemporal` de usuarios).

### 4.6 `crudEstado_(ctx, modulo, p)`

Permiso `estado || editar`. Si `def.estado` existe delega. Si no: valida que el estado esté en
`d.estados`, cambia `ESTADO` + FECHA_MODIFICACION, audita `ESTADO` (con valores antes/después) y
ejecuta `def.despuesEstado`. El soft-delete (ACTIVO/INACTIVO) es el patrón de "borrado": **nunca se
borran filas**, se desactivan (y `crudUnico_` ignora inactivos para permitir re-crear).

### 4.7 `opcionesRef_(ref, p)` — listas desplegables

Atiende `crud.opciones`. Devuelve `{id, texto}` ordenado: docentes activos (nombre con título), roles
activos, asignaturas activas (por ORDEN), `asignaturas*` (con `*`=Todas), secciones del año
(`grado seccion (año)`), `periodos*` (regulares del año + `*`=Todo el año), grados (de la config
`GRADOS`). ⚠️ No verifica permisos (ver §1.3).

---

## 5. Frontend SPA (`Index.html` + `JavaScript.html`)

### 5.1 Estructura de la SPA

`Index.html` es la plantilla servida por `doGet()`: incluye `Styles` y `JavaScript` con
`incluir_()` (equivalente a bundling manual). DOM mínimo:

- `#login` — pantalla de login (usuario + PIN, `inputmode numeric`).
- `#loading` — overlay con contador de llamadas concurrentes (`S.nCall`).
- `#app` — cabecera (botón menú, marca, **selector de año escolar**, caja de usuario con "PIN" y "Salir"), `#nav` (menú lateral construido según permisos) y `#main` (área de vista).
- `#modalBg/#modal` — modal genérico; `#toast` — notificaciones.

### 5.2 Capa cliente de API

- Estado global `S`: `{ boot, ano, view, curso, asig, modo, per, grid, asigs, dirty, errors, …, token }`.
- **Token**: se guarda en `sessionStorage['sga_tk']` (no cookie). `init()` al cargar intenta
  `sesion.bootstrap` con el token guardado; si falla → login.
- **`call(fn, arg, silent)`**: única forma de hablar con el servidor para operaciones:
  `google.script.run.withSuccessHandler(done).withFailureHandler(…).apiEjecutar(fn, S.token, arg)`.
  - Devuelve `Promise` con la respuesta `{ok, data|error}`.
  - Gestiona el overlay de loading (contador), y si la respuesta trae `codigo==='SESION'` muestra el
    login con aviso ("su sesión expiró… sus datos sin guardar se conservan").
- **`entrar()`** llama directamente `apiLogin(u,c)` (no por `call`), guarda el token y llama
  `arranca(r.data.boot)`. Si `boot.usuario.debeCambiar` abre el modal obligatorio de cambio de PIN.
- **`salir()`** llama `sesion.cerrar`, borra el token y recarga.
- **Protección de datos en edición**: `guardaSalida()` pregunta `confirm()` si hay celdas `S.dirty`
  pendientes; `beforeunload` bloquea el cierre con cambios sin guardar; **Ctrl+S** guarda en la vista
  de calificaciones.
- Modal/toast genéricos (`modal(html)`, `toast(msg, tipo)`), helper `esc()` para escapado HTML.

### 5.3 Menú y vistas (inventario de pantallas)

El menú es una constante `MENU = [vista, icono, texto, permiso]`; se filtra por `can(permiso)`
(según `S.boot.permisos`), aunque **el servidor revalida cada permiso**. La sección "ADMINISTRACIÓN"
solo aparece si hay al menos una vista de administración permitida.

| Vista (id) | Acciones API que usa | Descripción |
|---|---|---|
| `inicio` | `reportes.dashboard` | **Dashboard**: KPIs (estudiantes, promedio general, % aprobando, en riesgo, pendientes, en recuperación, completiva/extraordinaria/especial, promovidos/repitentes), promedio por asignatura y período, distribución de promedios (barras), cuadro de honor (Top 5), lista de estudiantes en riesgo. Selector de curso y período P1–P4. |
| `calif` | `cursos.listarLigero`, `cursos.asignaturas`, `calificaciones.grid`, `calificaciones.guardar`, `asistencia.obtener`, `asistencia.guardar` | **Grid de notas**: 3 modos — *Períodos* (por competencia: nota P y recuperación RP, RP se habilita sola si la nota < mínimo), *Resultados y evaluaciones finales* (PC1-4, C.F., completiva CEC/CCF, extraordinaria CEEX/CEXF, especial CESP, A/R/estado), *Asistencia* (por meses agrupados en períodos). Validación visual inmediata (rango, entera, RP≥P), celdas sucias ("● Sin guardar"), guardado por lotes con informe de filas rechazadas, atajos Enter/↓/↑/Tab/Ctrl+S, filtros (buscar, solo pendientes) y orden. Respeto de `puedeEditar` y períodos cerrados (solo lectura). |
| `est` | `estudiantes.listar`, `estudiantes.guardar`, `estudiantes.estado`, `estudiantes.importar`, `estudiantes.sincronizar`, `crud.opciones`, `crud.guardar` (modulo cursos) | **Estudiantes por curso**: tabla con nº, nombre, matrícula, estado (ACTIVO/RETIRADO); modal alta/edición; retirar/reactivar; importar lista pegada; sincronizar con hoja "registro" (solo admin config); "Nuevo curso" (usa `crud.guardar` módulo `cursos`). |
| `consulta` | `estudiantes.buscar`, `estudiantes.consulta`, `estudiantes.historial`, `observaciones.listar`, `reportes.curso` (vía boletín) | **Consulta individual**: buscador con debounce (nombre o matrícula), ficha con tabla completa por asignatura (P1–P4, PC, C.F., C.C.F., C.EX.F., especial, estado), resumen de asistencia por período y anual, historial académico de todos los años, observaciones del estudiante y botón "Ver boletín". |
| `rep` | `reportes.curso` | **Reportes imprimibles/PDF** (5 tipos): `entrega` (tarjetas de entrega de calificaciones P1–P3, 4 por hoja con logo/encabezado/firma), `registro` (registro por asignatura y período, o todos), `boletín` final (portada opcional 2 mitades + hoja de calificaciones estilo Excel oficial con leyenda, asistencia, situación y mensajes), `pend` (pendientes y recuperaciones del período), `situacion` (situación final del curso). **Descarga PDF** en el navegador con html2canvas + jsPDF (Carta horizontal, escalado y paginación de hojas largas). Bloque `IMP` configurable (logo Base64, encabezados, temas por grado, márgenes, nombres de archivo). |
| `obs` | `observaciones.listar`, `observaciones.guardar`, `observaciones.estado` | **Observaciones**: filtros por curso/estudiante/tipo/texto/incluir anuladas, tabla paginada, alta/edición (estudiante, tipo, fecha, asignatura, período, texto ≤600), anular/restaurar. |
| `asig` | `asignaciones.panel`, `asignaciones.asignar`, `asignaciones.copiar`, `crud.opciones` | **Asignación de docentes**: vista "Por curso" (un select de docente por asignatura, con estado Asignada/Sin docente/Por períodos/Docente inactivo y opción "aplicar a todas las secciones del grado") y vista "Por docente" (listado agrupado con botón quitar y formulario de asignación); "Tabla avanzada" (salta al CRUD `asignaciones`); copiar asignaciones desde otro año. |
| `cursos`, `docentes`, `asignaturas`, `competencias`, `asignaciones`, `tutorias`, `periodos`, `usuarios` (CRUDS) | `crud.meta`, `crud.listar`, `crud.guardar`, `crud.estado`, `crud.opciones`, `usuarios.restablecer`, `docentes.acceso`, `docentes.accesosMasivo`, `periodos.duplicar` | **Tablas genéricas CRUD** (ver §5.4). Acciones especiales de fila: `restablecer` (usuarios: PIN nuevo mostrado una vez) y `acceso` (docentes: crear usuario+PIN o restablecerlo). Acciones globales: `accesos` (docentes) y `duplicar` (períodos, modal año origen→destino). |
| `roles` | `roles.listar`, `roles.guardar` | **Roles y permisos**: tarjetas por rol con checkboxes agrupados por módulo (catálogo del servidor), "Nuevo rol", guardar permisos (el rol ADMINISTRADOR aparece bloqueado). |
| `hist` | `historial.listar` | **Historial de auditoría**: tabla Fecha/Usuario/Acción/Módulo/Descripción/Antes/Después con búsqueda y filtro por módulo, paginada. |
| `cfg` | `config.obtener`, `config.guardar` | **Configuración**: tabla Clave/Valor/Descripción con inputs editables y guardado en lote. |

### 5.4 Componente de tabla genérica CRUD (`vCrud`/`cargaCrud`/`modalCrud`)

- Pide `crud.meta` y construye: barra de búsqueda (debounce), filtro por año si `conAno`, desplegables
  de filtro (opciones traídas de `crud.opciones`), acciones globales, botón "+ Nuevo" si `puedeCrear`.
- Tabla generada desde `meta.columnas`; columna ESTADO con chips de color; columna de acciones
  (Editar / cambiar estado con etiqueta según `ESTADO_ACCION` / acciones de fila).
- `modalCrud` genera el **formulario dinámicamente** desde `meta.campos`: `select` para `ref` y
  `enum` (opciones de refs precargadas por `crud.opciones`), select SI/NO para `si_no`, input con
  atributos (decimal, maxlength, uppercase en sección, PIN). Respeta `soloCrear` (disabled al editar).
  Al guardar manda `{modulo, id, datos}`; si la respuesta trae `claveTemporal`, muestra el modal
  "no se volverá a mostrar".
- Paginador genérico `pagerHtml` con total/página/páginas.

### 5.5 Otras piezas de UI

- Chips de estado semánticos (`chipClase`: bad/ok/warn/info/mut) usados en todos los módulos.
- KPI cards (`kpi`) y gráficos de barras CSS puros en el dashboard.
- Componentes de impresión: hojas `.pg` (Carta horizontal), tarjetas 2×2, portada de boletín con
  mitades izquierda (firmas/períodos/situación) y derecha (datos del centro/insignia), estilos por
  grado (`TEMAS_BOLETIN`).
- **Todo el cálculo académico ocurre en el servidor**: el frontend "solo presenta datos y valida
  visualmente" (cabeecera de JavaScript.html).

---

## 6. Traducción a la nueva arquitectura (React + Node + PostgreSQL)

### 6.1 Correspondencia de acciones → endpoints REST

La acción-única (`apiEjecutar(accion, token, datos)`) se convierte en recursos REST. Convenciones:
`POST /api/auth/*` para sesión; recursos por dominio; los CRUD genéricos se mapean a un router
dinámico `/:modulo`.

| Acción legacy | Endpoint propuesto |
|---|---|
| `apiLogin` | `POST /api/auth/login` |
| `sesion.bootstrap` | `GET /api/auth/bootstrap` (o `GET /api/me`) |
| `sesion.cerrar` | `POST /api/auth/logout` |
| `sesion.cambiarClave` | `POST /api/auth/cambiar-clave` |
| `cursos.listarLigero` | `GET /api/cursos?ligero=1&ano=` |
| `cursos.asignaturas` | `GET /api/cursos/:idSeccion/asignaturas?ano=` |
| `calificaciones.grid` | `GET /api/cursos/:idSeccion/calificaciones/:idAsignatura` |
| `calificaciones.guardar` | `PATCH /api/cursos/:idSeccion/calificaciones/:idAsignatura` (lote de filas, respuesta parcial con errores por celda) |
| `asistencia.obtener` | `GET /api/cursos/:idSeccion/asistencia/:idAsignatura` |
| `asistencia.guardar` | `PATCH /api/cursos/:idSeccion/asistencia/:idAsignatura` |
| `reportes.curso` | `GET /api/cursos/:idSeccion/reportes/datos` (o `GET /api/reportes/:idSeccion`) |
| `reportes.dashboard` | `GET /api/cursos/:idSeccion/dashboard?periodo=` |
| `estudiantes.listar` | `GET /api/cursos/:idSeccion/estudiantes?incluirRetirados=1` |
| `estudiantes.guardar` | `POST /api/estudiantes` / `PATCH /api/estudiantes/:id` (con `idSeccion` en body) |
| `estudiantes.estado` | `PATCH /api/inscripciones/:idEstudiante/estado` (o `DELETE` lógico: `PATCH … {estado:'RETIRADO'}`) |
| `estudiantes.importar` | `POST /api/cursos/:idSeccion/estudiantes/importar` |
| `estudiantes.sincronizar` | `POST /api/cursos/:idSeccion/estudiantes/sincronizar` |
| `estudiantes.asignar` | `POST /api/inscripciones` (inscribir) / `PATCH /api/inscripciones/:id` (mover de sección) |
| `estudiantes.buscar` | `GET /api/estudiantes?q=&ano=` |
| `estudiantes.consulta` | `GET /api/estudiantes/:id/ficha?ano=` |
| `estudiantes.historial` | `GET /api/estudiantes/:id/historial` |
| `crud.meta` | `GET /api/crud/:modulo/meta` (o embebido en cada recurso `/api/:modulo/_meta`) |
| `crud.listar` | `GET /api/crud/:modulo?q=&pagina=&tam=&ano=&filtros…` |
| `crud.guardar` | `POST /api/crud/:modulo` / `PATCH /api/crud/:modulo/:id` |
| `crud.estado` | `PATCH /api/crud/:modulo/:id/estado` |
| `crud.opciones` | `GET /api/refs/:ref?ano=` (docentes, roles, asignaturas, secciones, periodos, grados) |
| `usuarios.restablecer` | `POST /api/usuarios/:id/restablecer-acceso` |
| `docentes.acceso` | `POST /api/docentes/:id/acceso` |
| `docentes.accesosMasivo` | `POST /api/docentes/accesos-masivo` |
| `asignaciones.panel` | `GET /api/asignaciones/panel?ano=` |
| `asignaciones.asignar` | `PUT /api/asignaciones` (upsert) con `todasSecciones` opcional |
| `asignaciones.copiar` | `POST /api/asignaciones/copiar` |
| `observaciones.listar` | `GET /api/observaciones?idSeccion=&idEstudiante=&tipo=&q=&pagina=` |
| `observaciones.guardar` | `POST /api/observaciones` / `PATCH /api/observaciones/:id` |
| `observaciones.estado` | `PATCH /api/observaciones/:id/estado` |
| `roles.listar` | `GET /api/roles` |
| `roles.guardar` | `POST /api/roles` / `PATCH /api/roles/:id` / `PUT /api/roles/:id/permisos` |
| `periodos.duplicar` | `POST /api/periodos/duplicar` |
| `historial.listar` | `GET /api/historial?q=&modulo=&pagina=` |
| `config.obtener` | `GET /api/config` |
| `config.guardar` | `PUT /api/config` (lote `{items:[{clave,valor}]}`) |

### 6.2 Cambios en autenticación

1. **Hash**: reemplazar `SHA-256×400 + sal + pepper` por **argon2id** (preferente, con `memoryCost`
   alto) o **bcrypt** (cost ≥ 12). Como las credenciales legacy son PINs de 4 dígitos, la fuerza real
   vendrá del pepper → guardar un `pepper` en variable de entorno del servidor (KMS/secret manager)
   y seguir mezclándolo, o mejor: **forzar rotación de PINs** en la migración (el hash v1/v2 se
   invalida y los usuarios entran con PIN temporal → cambio obligatorio al primer login, que el
   flujo `debeCambiar` ya soporta).
2. **Versionado del hash**: mantener el patrón `version$hash` en una columna `hash_version` +
   `password_hash`, y re-hashear al login si la versión es vieja (upgrade transparente).
3. **PIN de 4 dígitos**: decisión de producto. Si se conserva, compenzar con argon2id fuerte +
   pepper + bloqueo por intentos (rate limiting por IP **y** por cuenta, p.ej. `express-rate-limit`)
   + permitir PINs más largos opcionalmente. La política `pinDebil_`/`validarPoliticaClave_` se
   traduce a una regla Zod con lista de PINs débiles.
4. **Sesiones**: reemplazar hoja `SESIONES` + CacheService por:
   - **Opción A (recomendada)**: cookie `httpOnly; Secure; SameSite=Lax` con el token (JWT corto o
     id de sesión en DB con expiración). El hash del token se guarda en la tabla `sessions`
     (igual que el legacy), con índice por hash.
   - **Opción B**: token Bearer en memoria del SPA (equivalente a `sessionStorage`, vulnerable a XSS;
     la cookie httpOnly es más segura y elimina el manejo manual del token).
   - `limpiarSesiones_` → job de limpieza (`pg_cron` o job programado). `revocarSesiones_` →
     `UPDATE sessions SET revocada=true WHERE user_id=…` o columna `revoke_before` por usuario
     (equivalente exacto a la propiedad `REV_<id>`).
   - El lock de escritura (`conBloqueo_`, LockService) **desaparece**: las transacciones de
     PostgreSQL y los `unique` de DB lo reemplazan (usar transacciones + `SELECT … FOR UPDATE`
     donde haga falta, p. ej. contador de intentos de login).
5. **Anti-enumeración / bloqueo**: mantener el mensaje genérico y el hash "ficticio" (o comparación
   con hash dummy) para usuarios inexistentes; tabla `login_attempts` con ventana temporal.

### 6.3 Autorización

- Centralizar: **middleware** `requireAuth` (sesión válida) + `requirePermission('calificaciones.editar')`
  por ruta — resuelve la dispersión del legacy (solo 3 rutas declaraban permiso).
- El modelo RBAC se mantiene: `roles`, `role_permissions`, `user_permissions_extra/denied`
  (o tabla `user_permissions` con tipo `grant|deny`). El cortocircuito ADMINISTRADOR y la
  precedencia extra→denegado se replican en `permisosEfectivos_` → `getEffectivePermissions(userId)`.
- **El alcance por asignación/tutoría es la parte crítica**: `seccionesPermitidas_`, `exigirSeccion_`,
  `asignaturasVisibles_`, `puedeTrabajar_` deben ser funciones de servicio reutilizadas por cada
  handler (no se pueden olvidar): sugerencia de middleware/validador de scope
  `requireSectionScope('idSeccion')` + `requireAssignmentScope('idSeccion','idAsignatura', periodo?)`.
- `crud.opciones` (refs) debería al menos exigir autenticación y limitar catálogos sensibles
  (roles/docentes) a usuarios con permiso de administración.

### 6.4 Validaciones con Zod (reemplazo de `exigir_`/`texto_`/`crudValidar_`)

| Legacy (Utils/Crud) | Zod propuesto |
|---|---|
| `exigir_(cond, msg)` | excepciones de dominio propias + `safeParse` con mensajes en español; un `AppError` con `codigo` replicando `VALIDACION/PERMISO/…` |
| `texto_(v, et, {req,min,max})` | `z.string().trim().min(min).max(max, {message:…})` |
| `correoValido_` | `z.string().email()` + `toLowerCase()` |
| `num_` + rangos | `z.coerce.number().min(c.min).max(c.max)` |
| `enum_` / tipo `enum` | `z.enum([...opciones])` |
| tipo `ref` | `z.string().regex(/^REF-\d{6}$/)` + verificación de existencia en DB |
| tipo `patron` | `z.string().regex(new RegExp(patron), {message: c.msg})` |
| `limpiar_` (control chars) | `.trim()` + transform que elimina `\u0000-\u001F` y colapsa espacios |
| `validarPoliticaClave_` + `pinDebil_` | `z.string().regex(/^\d{4}$/).refine(pin => !PINES_DEBILES.has(pin))` |
| `validarNota` | `z.number().min(0).max(cfg.NOTA_MAXIMA)` + `.int()` si `NOTA_ENTERA` |
| `validarRegistro` (reglas cruzadas RP/etapas) | `z.superRefine` sobre el objeto fusionado (reglas RP≥P, RP solo si P<min, etapas habilitadas) |
| `crudValidar_` (campos dinámicos) | generador de schemas Zod **a partir de la definición de módulo** (mismas `definiciones` migradas a config TS), para conservar el patrón declarativo |
| `crudUnico_` | constraints `UNIQUE` de PostgreSQL (con `partial index` que excluya inactivos: `WHERE estado IN ('ACTIVO',...)`) — el legacy ignoraba inactivos/cerrado al comparar |
| `paginar_` | helper común `paginate(items/query, {q, filtros, pagina, tam})` con `MAX=200` |
| fechas `yyyy-MM-dd HH:mm:ss` | `timestamptz` de PostgreSQL; endpoints aceptan/retornan ISO-8601 |

### 6.5 Otros mapeos

- **Auditoría**: buffer `historial_`/`vaciarHistorial_` → tabla `audit_log` escrita en la misma
  transacción (trigger o servicio), misma estructura (usuario, acción, módulo, id, descripción,
  valor_anterior, valor_nuevo). La vista "Historial" sigue funcionando igual.
- **Errores técnicos**: hoja `ERRORES` + ref → logger estructurado (pino) + id de correlación
  devuelto al cliente, manteniendo el principio "el usuario solo ve una referencia".
- **Respuesta**: conservar el envelope `{ ok, data, error, codigo }` (o pasar a códigos HTTP
  estándar + `Problem Details`); si se conserva, el frontend React lo consume igual que hoy.
- **Motor CRUD genérico**: convertir cada `defXxx_` a módulos de configuración TS (tabla, campos,
  tipos, refs, permisos, hooks `antes/despues` como funciones de servicio). El router dinámico
  `/api/crud/:modulo` valida el módulo contra un registro cerrado (whitelist) — **nunca** aceptar
  nombres de tabla del cliente sin whitelist.
- **Frontend**: la SPA se traduce a React conservando el inventario de §5.3; `call()` → cliente HTTP
  con interceptores (401 → login; `CAMBIAR_CLAVE` → flujo obligatorio); `S.dirty`/`S.errors` →
  estado local del grid; el grid de calificaciones (3 modos, atajos, guardado por lote con errores
  por celda) es el componente más complejo y merece prototipo temprano; los reportes PDF (html2canvas
  + jsPDF) pueden mantenerse en cliente sin cambios de dependencias.

### 6.6 Riesgos de la migración (checklist)

1. **Permisos distribuidos**: en el legacy la mayoría de rutas NO declaran permiso en la tabla de
   rutas; se confía en el interior de cada función. Al portar a Express, cualquier handler olvidado
   queda **sin protección** → mitiguación: middleware obligatorio + tests de autorización por
   endpoint (matriz rol×endpoint).
2. **Motor CRUD genérico con permisos por acción**: `crud.guardar` decide crear vs editar por la
   presencia de `id`, y el permiso cambia (`crear` vs `editar`). Mantener esa semántica
   explícitamente (POST vs PATCH) y asegurar que el metadata (`crud.meta`) y los permisos nunca se
   calculen solo en el cliente.
3. **Unicidad que ignora inactivos**: `crudUnico_` permite duplicados si el otro registro está
   INACTIVO/CERRADO — replicarlo con índices únicos parciales, no con `UNIQUE` simple.
4. **Hooks `antes/despues` con lógica de negocio**: varios módulos (usuarios, asignaciones,
   períodos) concentran reglas en hooks (último admin, no cambiar propio rol, períodos por año,
   reasignación de docente). Son fáciles de perder en una reescritura → portarlos como tests de
   caracterización primero.
5. **PIN de 4 dígitos + hash débil**: riesgo de seguridad heredado; decidir política antes de
   migrar credenciales (rotación forzada recomendada).
6. **Token en `sessionStorage`** → pasar a cookie httpOnly (o aceptar el riesgo XSS documentado).
7. **Sesión con permisos "en vivo"**: `sesionDe_` recalcula permisos en cada llamada; si se usan
   JWT con claims de permisos, un cambio de rol no aplica hasta expirar → mantener lookup de DB por
   request (o TTL muy corto) para conservar el comportamiento.
8. **`crud.opciones` sin permisos**: fuga menor; decidir si se protege.
9. **Escalado del guardado por lote**: `guardarNotas_` acepta filas parcialmente válidas y devuelve
   `errores` por celda; replicar exactamente esa semántica transaccional (guardar lo válido, reportar
   lo rechazado) o documentar el cambio de contrato con el frontend.
10. **Datos de hojas**: migración ETL desde Sheets (CREDENCIALES→users+credentials, SESIONES→descartar,
    CALIFICACIONES/RESULTADOS→tablas, HISTORIAL→audit_log); conservar IDs `PREF-000001` como
    claves de negocio o generarlos de nuevo con secuencias.

---

*Documento generado por auditoría estática del código legacy (noviembre 2026). Todas las referencias
de línea corresponden a los archivos de `SGA/legacy/` en el momento del análisis.*
