# Modelo de datos del legacy (Google Apps Script + Google Sheets)

**Proyecto:** SGA – Sistema de Gestión Académica, versión 1.0.0
**Fuentes analizadas (leídas completas):**
- `SGA/legacy/Config.js` — constantes, `HOJA`, `ESQUEMA`, `CONFIG_DEFECTO`, `ROLES_BASE`, `PERMISOS_CATALOGO`, `PERIODOS_BASE`, `CAMPO_ETAPA`
- `SGA/legacy/Database.js` — acceso a hojas, caché, generador de IDs, bloqueo, historial
- `SGA/legacy/Setup.js` — creación de hojas, siembra de datos, respaldos
- Verificaciones puntuales en `Auth.js` (`pimienta_`, `REV_<idUsuario>`, `hashClave_`) y `Grades.js` (`claveGrupo_`) para no inventar semántica.

> Regla de este documento: **solo se documenta lo que está en el código.** Cuando la semántica exacta de un campo vive en otro archivo (Grades.js, Reports.js, etc.), se indica explícitamente en lugar de inferirse.

---

## 1. Inventario de hojas (`HOJA.*`) y sus encabezados

### 1.1 Constantes globales (`SGA`)

| Constante | Valor | Descripción |
|---|---|---|
| `NOMBRE` | `'SGA – Sistema de Gestión Académica'` | Nombre del sistema |
| `VERSION` | `'1.0.0'` | Versión instalada |
| `PERIODOS_REGULARES` | `4` | P1..P4 (estructura de columnas C1..C4 / R1..R4) |
| `COMPETENCIAS` | `4` | C1..C4 por asignatura |
| `HASH_ITER` | `400` | Iteraciones del hash de contraseñas (versión v1) |
| `MESES` | `['ago','sep','oct','nov','dic','ene','feb','mar','abr','may','jun']` | Meses escolares (11); coinciden con las columnas de `ASISTENCIA` |
| `MAX_POR_PAGINA` | `200` | Límite de paginación |

Otras constantes relacionadas: `CAMPOS_NOTA_PERIODO = ['C1','C2','C3','C4','R1','R2','R3','R4']` y `CAMPO_ETAPA = { COMPLETIVA: 'CEC', EXTRAORDINARIA: 'CEEX', ESPECIAL: 'CESP' }` (mapea cada etapa de evaluación a la columna correspondiente de `RESULTADOS`). *Nota:* la tarea mencionaba "CAMPOS_ETAPAS"; en el código el nombre real es `CAMPO_ETAPA`.

### 1.2 Cómo se crean los encabezados (dinámica de `crearHojas_` en Setup.js)

`setupSystem()` recorre `ORDEN_HOJAS` y, para cada hoja:

1. Si la hoja no existe, la inserta.
2. Si la hoja está **vacía**, escribe los encabezados de `ESQUEMA[nombre].cols` en la fila 1, en el orden del array.
3. Si la hoja **ya tiene encabezados**, los encabezados de `ESQUEMA` que falten se **agregan al final** (columna siguiente vacía). Consecuencia: en bases modificadas, una columna puede estar en posición distinta a la del array `cols`. Por eso todo el acceso en `Database.js` es **por nombre de encabezado** (`mapaEncabezados_`), nunca por posición.
4. Formato de celda: las columnas cuyo encabezado coincide con `/^(FECHA|CREADA$|EXPIRA$|ULTIMA_ACTIVIDAD$|BLOQUEADO_HASTA$|ULTIMO_ACCESO$|MATRICULA$|TELEFONO$|SALT$|TOKEN_HASH$|HASH$)/` se formatean como **TEXTO** (`setNumberFormat('@')`) para que Google Sheets no convierta fechas, matrículas ni hashes.
5. La fila 1 se congela y se le aplica estilo (fondo `#1f3a5f`, fuente blanca, negrita).
6. `aplicarValidaciones_`: en `CALIFICACIONES`, las columnas desde `C1` hasta `NOTA_ETAPA` (inclusive) reciben validación numérica **0–100** obligatoria.

`ORDEN_HOJAS` (orden de creación en el libro; datos primero, técnicas al final):
`CONFIG, USUARIOS, ROLES, PERMISOS, ROL_PERMISOS, DOCENTES, CURSOS, SECCIONES, ESTUDIANTES, INSCRIPCIONES, ASIGNATURAS, COMPETENCIAS, ASIGNACIONES, TUTORIAS, PERIODOS, CALIFICACIONES, ASISTENCIA, OBSERVACIONES, RESULTADOS, HISTORIAL, SESIONES, CREDENCIALES, ERRORES` — 23 hojas, las mismas que declara `HOJA`.

Convención general: **la primera columna es siempre la clave** (el ID con prefijo, o la clave natural en tablas sin prefijo). Las filas cuyo primer campo está vacío se ignoran al leer (`objetos_`).

### 1.3 Hoja por hoja

#### CONFIG — configuración del sistema (sin prefijo)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| CLAVE | texto | Clave de configuración (clave primaria natural) |
| VALOR | texto/numérico* | Valor; el tipo real lo determina `CLAVES_BOOL` / `CLAVES_NUM` al leer (ver §4) |
| DESCRIPCION | texto | Descripción de la clave |
| FECHA_MODIFICACION | texto (fecha, formato @) | Fecha/hora de la última modificación |

#### ROLES (sin prefijo — el ID es el código textual, ej. `ADMINISTRADOR`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_ROL | texto | Código del rol (PK natural, ej. `DOCENTE`) |
| NOMBRE | texto | Nombre visible |
| DESCRIPCION | texto | Descripción |
| ES_SISTEMA | texto (`SI`/`NO`) | Marca los roles sembrados por el sistema (`ROLES_BASE`) |
| ESTADO | texto (`ACTIVO`/`INACTIVO`) | Estado |
| FECHA_CREACION | texto (fecha) | Creación |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |

#### PERMISOS (sin prefijo — ID textual, ej. `usuarios.ver`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_PERMISO | texto | Código del permiso (PK natural) |
| MODULO | texto | Módulo al que pertenece |
| DESCRIPCION | texto | Descripción |

#### ROL_PERMISOS (sin prefijo — tabla de unión)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_ROL | texto | FK → ROLES.ID_ROL |
| ID_PERMISO | texto | FK → PERMISOS.ID_PERMISO |

Clave natural compuesta `(ID_ROL, ID_PERMISO)`; `sembrarRoles_` deduplica con la llave `ID_ROL + '|' + ID_PERMISO`.

#### USUARIOS (prefijo `USR`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_USUARIO | texto `USR-000001` | PK |
| NOMBRE | texto | Nombre |
| APELLIDOS | texto | Apellidos |
| CORREO | texto | Correo |
| USUARIO | texto | Nombre de usuario (login) |
| ROL | texto | FK → ROLES.ID_ROL |
| ID_DOCENTE | texto `DOC-…` o vacío | FK opcional → DOCENTES.ID_DOCENTE (vincula el usuario con su ficha de docente) |
| PERMISOS_EXTRA | texto | Permisos adicionales al rol (lista; formato definido en Auth.js) |
| PERMISOS_DENEGADOS | texto | Permisos revocados al rol (lista) |
| ESTADO | texto (`ACTIVO`/`INACTIVO`) | Estado |
| FECHA_CREACION | texto (fecha) | Creación |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |
| ULTIMO_ACCESO | texto (fecha, formato @) | Último inicio de sesión |

#### CREDENCIALES (sin prefijo; PK = ID_USUARIO)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_USUARIO | texto | PK/FK → USUARIOS.ID_USUARIO (1:1) |
| HASH | texto (formato @) | Hash del PIN, formato `v2$<hex>` (o `v1$<hex>`) |
| SALT | texto (formato @) | Sal aleatoria por usuario |
| DEBE_CAMBIAR | texto (`SI`/`NO`) | Obliga a cambiar el PIN en el próximo acceso |
| INTENTOS_FALLIDOS | numérico | Contador de intentos fallidos |
| BLOQUEADO_HASTA | texto (fecha, formato @) | Bloqueo temporal por intentos |
| FECHA_CAMBIO | texto (fecha, formato @) | Fecha del último cambio de credencial |

Nota (Auth.js): el hash es SHA‑256 iterado `SGA.HASH_ITER` (400) veces; en versión `v2` se mezcla la "pimienta" del servidor: `sal:PEPPER:clave`.

#### SESIONES (prefijo `SES`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_SESION | texto `SES-000001` | PK |
| ID_USUARIO | texto | FK → USUARIOS.ID_USUARIO |
| TOKEN_HASH | texto (formato @) | SHA‑256 del token de sesión (el token en claro nunca se guarda; 64 hex) |
| CREADA | texto (fecha, formato @) | Fecha/hora de creación |
| EXPIRA | texto (fecha, formato @) | Fecha/hora de expiración (por defecto `DURACION_SESION_MIN` minutos) |
| ULTIMA_ACTIVIDAD | texto (fecha, formato @) | Última actividad |
| ESTADO | texto (`ACTIVA`/`CERRADA`) | Estado de la sesión |

#### ESTUDIANTES (prefijo `EST`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_ESTUDIANTE | texto `EST-000001` | PK |
| MATRICULA | texto (formato @) | Matrícula (guardada como texto) |
| NOMBRES | texto | Nombres |
| APELLIDOS | texto | Apellidos |
| NOMBRE_COMPLETO | texto | Denormalizado (`NOMBRES + APELLIDOS`) |
| SEXO | texto | Sexo |
| FECHA_NACIMIENTO | texto (fecha) | Fecha de nacimiento |
| ESTADO | texto (`ACTIVO`/`INACTIVO`/`ELIMINADO`) | Estado |
| FECHA_CREACION | texto (fecha) | Creación |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |

#### INSCRIPCIONES (prefijo `INS`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_INSCRIPCION | texto `INS-000001` | PK |
| ANO_ESCOLAR | texto `AAAA-AAAA` | Año escolar |
| ID_ESTUDIANTE | texto | FK → ESTUDIANTES.ID_ESTUDIANTE |
| ID_CURSO | texto | FK → CURSOS.ID_CURSO |
| ID_SECCION | texto | FK → SECCIONES.ID_SECCION |
| NUM_LISTA | numérico | Número de lista dentro de la sección |
| ESTADO | texto | Estado de la inscripción |
| FECHA_CREACION | texto (fecha) | Creación |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |

#### DOCENTES (prefijo `DOC`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_DOCENTE | texto `DOC-000001` | PK |
| TITULO | texto | Título profesional |
| NOMBRES | texto | Nombres |
| APELLIDOS | texto | Apellidos |
| NOMBRE_COMPLETO | texto | Denormalizado |
| CORREO | texto | Correo |
| TELEFONO | texto (formato @) | Teléfono |
| ESTADO | texto | Estado |
| FECHA_CREACION | texto (fecha) | Creación |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |

#### CURSOS (prefijo `CUR`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_CURSO | texto `CUR-000001` | PK |
| ANO_ESCOLAR | texto `AAAA-AAAA` | Año escolar del curso |
| NIVEL | texto | Nivel educativo |
| GRADO | texto | Grado (valores de `CONFIG.GRADOS`, ej. `1ro`) |
| ESTADO | texto | Estado |
| FECHA_CREACION | texto (fecha) | Creación |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |

#### SECCIONES (prefijo `SEC`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_SECCION | texto `SEC-000001` | PK |
| ID_CURSO | texto | FK → CURSOS.ID_CURSO |
| SECCION | texto | Letra/identificador de la sección (ej. `A`, `Z`) |
| ESTADO | texto | Estado |
| FECHA_CREACION | texto (fecha) | Creación |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |

#### ASIGNATURAS (prefijo `ASI`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_ASIGNATURA | texto `ASI-000001` | PK |
| CODIGO | texto | Código de la asignatura |
| NOMBRE | texto | Nombre |
| NOMBRE_REPORTE | texto | Nombre usado en reportes/boletines |
| ABREV | texto | Abreviatura |
| AREA | texto | Área curricular |
| GRADOS | texto | Lista de grados a los que aplica (ej. `1ro,2do`) |
| ORDEN | numérico | Orden de presentación |
| ORDEN_BOLETIN | numérico | Orden en el boletín |
| USA_RECUPERACION | texto (`SI`/`NO`) | Permite RP por período |
| USA_COMPLETIVA | texto (`SI`/`NO`) | Permite etapa completiva |
| USA_EXTRAORDINARIA | texto (`SI`/`NO`) | Permite etapa extraordinaria |
| USA_ESPECIAL | texto (`SI`/`NO`) | Permite evaluación especial |
| NOTA_MINIMA | numérico | Nota mínima de aprobación (propia de la asignatura) |
| ESTADO | texto | Estado |
| FECHA_CREACION | texto (fecha) | Creación |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |

#### COMPETENCIAS (prefijo `COM`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_COMPETENCIA | texto `COM-000001` | PK |
| ID_ASIGNATURA | texto | FK → ASIGNATURAS.ID_ASIGNATURA |
| CODIGO | texto | Código (ej. `CC`, `CRP`, `CEC`, `CT` según el orden corregido CC–CRP–CEC–CT) |
| NOMBRE | texto | Nombre de la competencia |
| ABREV | texto | Abreviatura |
| ORDEN | numérico | Orden de la competencia dentro de la asignatura |
| ESTADO | texto | Estado |

#### ASIGNACIONES (prefijo `ASG`) — asignación docente–asignatura–sección por período
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_ASIGNACION | texto `ASG-000001` | PK |
| ANO_ESCOLAR | texto | Año escolar |
| ID_DOCENTE | texto | FK → DOCENTES.ID_DOCENTE |
| ID_ASIGNATURA | texto | FK → ASIGNATURAS.ID_ASIGNATURA |
| ID_CURSO | texto | FK → CURSOS.ID_CURSO |
| ID_SECCION | texto | FK → SECCIONES.ID_SECCION |
| ID_PERIODO | texto | FK → PERIODOS.ID_PERIODO |
| ESTADO | texto | Estado |
| FECHA_CREACION | texto (fecha) | Creación |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |

#### TUTORIAS (prefijo `TUT`) — docente tutor de una sección
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_TUTORIA | texto `TUT-000001` | PK |
| ANO_ESCOLAR | texto | Año escolar |
| ID_DOCENTE | texto | FK → DOCENTES.ID_DOCENTE |
| ID_CURSO | texto | FK → CURSOS.ID_CURSO |
| ID_SECCION | texto | FK → SECCIONES.ID_SECCION |
| ESTADO | texto | Estado |
| FECHA_CREACION | texto (fecha) | Creación |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |

#### PERIODOS (prefijo `PER`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_PERIODO | texto `PER-000001` | PK |
| ANO_ESCOLAR | texto | Año escolar |
| CODIGO | texto | Código (`P1..P4`, `COMP`, `EXTRA`, `ESP`) |
| NOMBRE | texto | Nombre visible |
| TIPO | texto | `REGULAR` o `ETAPA` |
| ETAPA | texto | `''` en regulares; `COMPLETIVA`/`EXTRAORDINARIA`/`ESPECIAL` en etapas |
| ORDEN | numérico | 1–7 según `PERIODOS_BASE` |
| MESES | texto | Meses asociados, separados por coma (ej. `ago,sep,oct`); vacío en etapas |
| ESTADO | texto | `ABIERTO`/`CERRADO` (siembra con `ABIERTO`) |
| FECHA_CREACION | texto (fecha) | Creación |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |

Siembra (`PERIODOS_BASE`): `P1 1er Periodo REGULAR orden 1 meses ago,sep,oct` · `P2 2do Periodo REGULAR orden 2 nov,dic,ene` · `P3 3er Periodo REGULAR orden 3 feb,mar` · `P4 4to Periodo REGULAR orden 4 abr,may,jun` · `COMP Completivo ETAPA/COMPLETIVA orden 5` · `EXTRA Extraordinario ETAPA/EXTRAORDINARIA orden 6` · `ESP Evaluación especial ETAPA/ESPECIAL orden 7`.

#### CALIFICACIONES (prefijo `CAL`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_CALIFICACION | texto `CAL-000001` | PK |
| CLAVE_GRUPO | texto | Clave de agrupación (ver §2.1) |
| ANO_ESCOLAR | texto | Año escolar |
| ID_ESTUDIANTE | texto | FK → ESTUDIANTES.ID_ESTUDIANTE |
| ID_DOCENTE | texto | FK → DOCENTES.ID_DOCENTE (docente que registra) |
| ID_ASIGNATURA | texto | FK → ASIGNATURAS.ID_ASIGNATURA |
| ID_CURSO | texto | FK → CURSOS.ID_CURSO |
| ID_SECCION | texto | FK → SECCIONES.ID_SECCION |
| ID_PERIODO | texto | FK → PERIODOS.ID_PERIODO |
| C1..C4 | numérico 0–100 (validado) | Competencias C1..C4 del período |
| R1..R4 | numérico 0–100 (validado) | Recuperaciones (RP) de las competencias C1..C4 |
| NOTA_ETAPA | numérico 0–100 (validado) | Nota de la etapa/período |
| FECHA_CREACION | texto (fecha) | Creación |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |
| MODIFICADO_POR | texto | Usuario que modificó |

#### ASISTENCIA (prefijo `ASH`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_ASISTENCIA | texto `ASH-000001` | PK |
| CLAVE_GRUPO | texto | Clave de agrupación (ver §2.1) |
| ANO_ESCOLAR | texto | Año escolar |
| ID_ESTUDIANTE | texto | FK → ESTUDIANTES.ID_ESTUDIANTE |
| ID_ASIGNATURA | texto | FK → ASIGNATURAS.ID_ASIGNATURA |
| ID_SECCION | texto | FK → SECCIONES.ID_SECCION |
| ago, sep, oct, nov, dic, ene, feb, mar, abr, may, jun | texto | Una columna por mes escolar (`SGA.MESES`); el contenido exacto de las marcas lo define Grades.js (no inferido aquí) |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |
| MODIFICADO_POR | texto | Usuario que modificó |

#### OBSERVACIONES (prefijo `OBS`)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_OBSERVACION | texto `OBS-000001` | PK |
| ANO_ESCOLAR | texto | Año escolar |
| ID_ESTUDIANTE | texto | FK → ESTUDIANTES.ID_ESTUDIANTE |
| ID_CURSO | texto | FK → CURSOS.ID_CURSO |
| ID_SECCION | texto | FK → SECCIONES.ID_SECCION |
| ID_DOCENTE | texto | FK → DOCENTES.ID_DOCENTE (autor) |
| ID_ASIGNATURA | texto | FK → ASIGNATURAS.ID_ASIGNATURA |
| ID_PERIODO | texto | FK → PERIODOS.ID_PERIODO |
| TIPO | texto | Tipo de observación |
| FECHA | texto (fecha) | Fecha de la observación |
| OBSERVACION | texto | Texto de la observación |
| ESTADO | texto | Estado (incluye anulación, según `observaciones.editar`) |
| FECHA_CREACION | texto (fecha) | Creación |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |
| CREADO_POR | texto | Usuario que la creó |

#### RESULTADOS (prefijo `RES`) — resultados consolidados calculados
| Columna | Tipo inferido | Descripción |
|---|---|---|
| ID_RESULTADO | texto `RES-000001` | PK |
| CLAVE_GRUPO | texto | Clave de agrupación (ver §2.1) |
| ANO_ESCOLAR | texto | Año escolar |
| ID_ESTUDIANTE | texto | FK → ESTUDIANTES.ID_ESTUDIANTE |
| ID_ASIGNATURA | texto | FK → ASIGNATURAS.ID_ASIGNATURA |
| ID_SECCION | texto | FK → SECCIONES.ID_SECCION |
| PC1..PC4 | numérico/texto | Promedios de las competencias C1..C4 (se recalculan con `reconstruirResultados_`; semántica completa en Grades.js) |
| CF_REAL | numérico/texto | Calificación final real (antes de etapas) |
| CF | numérico/texto | Calificación final |
| CEC | numérico/texto | Resultado con etapa completiva (`CAMPO_ETAPA.COMPLETIVA`) |
| CCF | numérico/texto | Calificación final con completiva |
| CEEX | numérico/texto | Resultado con etapa extraordinaria (`CAMPO_ETAPA.EXTRAORDINARIA`) |
| CEXF | numérico/texto | Calificación final con extraordinaria |
| CESP | numérico/texto | Resultado con evaluación especial (`CAMPO_ETAPA.ESPECIAL`) |
| ETAPA_LOGRO | texto | Etapa con la que logró la aprobación |
| NOTA_A | numérico/texto | Nota adicional de etapa (semántica exacta en Grades.js, no inferida aquí) |
| NOTA_R | numérico/texto | Nota adicional de etapa (semántica exacta en Grades.js, no inferida aquí) |
| ESTADO_RESULTADO | texto | Estado del resultado |
| FECHA_MODIFICACION | texto (fecha) | Última modificación |

#### HISTORIAL (sin prefijo — auditoría, solo append)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| FECHA | texto (fecha) | Fecha/hora del evento (`ahora_()`) |
| USUARIO | texto | Usuario que ejecutó |
| ACCION | texto | Acción (ej. `CREAR`, `LOGOUT`, `RESTABLECER_ACCESO`) |
| MODULO | texto | Módulo (ej. `USUARIOS`, `AUTENTICACION`) |
| ID_REGISTRO | texto | ID del registro afectado |
| DESCRIPCION | texto | Descripción del cambio |
| VALOR_ANTERIOR | texto | Valor antes del cambio |
| VALOR_NUEVO | texto | Valor después del cambio |

#### ERRORES (sin prefijo — log técnico, solo append)
| Columna | Tipo inferido | Descripción |
|---|---|---|
| FECHA | texto (fecha) | Fecha/hora |
| USUARIO | texto | Usuario implicado |
| FUNCION | texto | Función donde ocurrió |
| REFERENCIA | texto | Referencia corta (`E` + 6 hex, mostrada al usuario) |
| MENSAJE | texto (máx 300) | Mensaje del error |
| DETALLE | texto (máx 800) | Stack truncado |

---

## 2. Relaciones entre hojas

### 2.1 `CLAVE_GRUPO` (formato exacto)

Definida en `Grades.js`:

```js
function claveGrupo_(ano, idSeccion, idAsig) { return ano + '|' + idSeccion + '|' + idAsig; }
```

Formato: **`<ANO_ESCOLAR>|<ID_SECCION>|<ID_ASIGNATURA>`**, con separador `|` (pipe). Ejemplo: `2026-2027|SEC-000001|ASI-000003`.

Usada en `CALIFICACIONES`, `ASISTENCIA` y `RESULTADOS` como **clave de agrupación** que identifica a todo el grupo (sección × asignatura × año). Dos modos de lectura en `leerPorClave_`:
- **exacto**: coincide el `CLAVE_GRUPO` completo (todas las filas del grupo).
- **prefijo**: coincide si el valor empieza por el prefijo dado. Ejemplo real en Students.js al cambiar de sección: `ano + '|' + antigua + '|'` — trae todas las filas de esa sección/año sin importar la asignatura.

### 2.2 Claves foráneas por hoja

| Hoja | Campo | Referencia |
|---|---|---|
| USUARIOS | ROL | ROLES.ID_ROL |
| USUARIOS | ID_DOCENTE | DOCENTES.ID_DOCENTE (opcional) |
| CREDENCIALES | ID_USUARIO | USUARIOS.ID_USUARIO (1:1) |
| SESIONES | ID_USUARIO | USUARIOS.ID_USUARIO |
| INSCRIPCIONES | ID_ESTUDIANTE | ESTUDIANTES.ID_ESTUDIANTE |
| INSCRIPCIONES | ID_CURSO | CURSOS.ID_CURSO |
| INSCRIPCIONES | ID_SECCION | SECCIONES.ID_SECCION |
| SECCIONES | ID_CURSO | CURSOS.ID_CURSO |
| COMPETENCIAS | ID_ASIGNATURA | ASIGNATURAS.ID_ASIGNATURA |
| ASIGNACIONES | ID_DOCENTE | DOCENTES.ID_DOCENTE |
| ASIGNACIONES | ID_ASIGNATURA | ASIGNATURAS.ID_ASIGNATURA |
| ASIGNACIONES | ID_CURSO | CURSOS.ID_CURSO |
| ASIGNACIONES | ID_SECCION | SECCIONES.ID_SECCION |
| ASIGNACIONES | ID_PERIODO | PERIODOS.ID_PERIODO |
| TUTORIAS | ID_DOCENTE | DOCENTES.ID_DOCENTE |
| TUTORIAS | ID_CURSO | CURSOS.ID_CURSO |
| TUTORIAS | ID_SECCION | SECCIONES.ID_SECCION |
| CALIFICACIONES | ID_ESTUDIANTE | ESTUDIANTES.ID_ESTUDIANTE |
| CALIFICACIONES | ID_DOCENTE | DOCENTES.ID_DOCENTE |
| CALIFICACIONES | ID_ASIGNATURA | ASIGNATURAS.ID_ASIGNATURA |
| CALIFICACIONES | ID_CURSO | CURSOS.ID_CURSO |
| CALIFICACIONES | ID_SECCION | SECCIONES.ID_SECCION |
| CALIFICACIONES | ID_PERIODO | PERIODOS.ID_PERIODO |
| ASISTENCIA | ID_ESTUDIANTE | ESTUDIANTES.ID_ESTUDIANTE |
| ASISTENCIA | ID_ASIGNATURA | ASIGNATURAS.ID_ASIGNATURA |
| ASISTENCIA | ID_SECCION | SECCIONES.ID_SECCION |
| OBSERVACIONES | ID_ESTUDIANTE | ESTUDIANTES.ID_ESTUDIANTE |
| OBSERVACIONES | ID_CURSO | CURSOS.ID_CURSO |
| OBSERVACIONES | ID_SECCION | SECCIONES.ID_SECCION |
| OBSERVACIONES | ID_DOCENTE | DOCENTES.ID_DOCENTE |
| OBSERVACIONES | ID_ASIGNATURA | ASIGNATURAS.ID_ASIGNATURA |
| OBSERVACIONES | ID_PERIODO | PERIODOS.ID_PERIODO |
| RESULTADOS | ID_ESTUDIANTE | ESTUDIANTES.ID_ESTUDIANTE |
| RESULTADOS | ID_ASIGNATURA | ASIGNATURAS.ID_ASIGNATURA |
| RESULTADOS | ID_SECCION | SECCIONES.ID_SECCION |
| ROL_PERMISOS | ID_ROL | ROLES.ID_ROL |
| ROL_PERMISOS | ID_PERMISO | PERMISOS.ID_PERMISO |

Campos de tipo "referencia blanda" (no FK estricta pero hacen correspondencia): `HISTORIAL.USUARIO` → nombre/ID de usuario; `CALIFICACIONES.MODIFICADO_POR`, `OBSERVACIONES.CREADO_POR`, `ASISTENCIA.MODIFICADO_POR` → usuario; `PERIODOS.MESES` → nombres de columna de `ASISTENCIA`.

Nota: en Google Sheets **no hay integridad referencial**: todas estas FK son solo por convención de valores de texto. En PostgreSQL sí se pueden declarar.

---

## 3. Sistema de IDs

- **Formato:** `PREFIJO-NNNNNN` (seis dígitos con ceros a la izquierda), ej. `USR-000001`, `EST-000042`. La PRIMERA columna de cada hoja es siempre su ID.
- **Prefijos por hoja** (de `ESQUEMA`): `USR` USUARIOS · `SES` SESIONES · `EST` ESTUDIANTES · `INS` INSCRIPCIONES · `DOC` DOCENTES · `CUR` CURSOS · `SEC` SECCIONES · `ASI` ASIGNATURAS · `COM` COMPETENCIAS · `ASG` ASIGNACIONES · `TUT` TUTORIAS · `PER` PERIODOS · `CAL` CALIFICACIONES · `ASH` ASISTENCIA · `OBS` OBSERVACIONES · `RES` RESULTADOS. Sin prefijo (PK natural o técnica): `CONFIG`, `ROLES`, `PERMISOS`, `ROL_PERMISOS`, `CREDENCIALES`, `HISTORIAL`, `ERRORES`.
- **Generación (`generadorId_(nombre)` en Database.js):**
  1. Lee la **columna 1 completa** de la hoja.
  2. Aplica la regex `^PREF-(\d+)$` a cada valor y conserva el **máximo** numérico encontrado.
  3. Devuelve un closure que en cada llamada hace `max++` y formatea `pref + '-' + ('000000' + max).slice(-6)`.
- **No es un contador persistente**: se re-deriva de los datos en cada ejecución; si se borra la fila con el ID máximo, ese ID puede reutilizarse.
- **Concurrencia**: el documen­to dice "úselo dentro de un bloqueo" — la generación solo es segura dentro de `conBloqueo_` (§6). Fuera del bloqueo, dos ejecuciones simultáneas pueden calcular el mismo `max` y duplicar IDs.
- **Referencias**: todas las relaciones entre hojas usan este ID textual; jamás posiciones de fila.

---

## 4. `CONFIG_DEFECTO` completo

Se siembra en la hoja `CONFIG` solo para las claves que no existan (`sembrarConfig_` no pisa valores ya editados). Al leer, `config_()` combina estos valores con los de la hoja y convierte tipos según `CLAVES_BOOL` (booleanos `SI/NO`) y `CLAVES_NUM` (numéricos); todo lo demás queda como texto.

| Clave | Valor por defecto | Tipo | Descripción |
|---|---|---|---|
| NOMBRE_SISTEMA | `SGA – Sistema de Gestión Académica` | texto | Nombre que se muestra en pantalla |
| VERSION | `1.0.0` | texto | Versión instalada |
| ANO_ESCOLAR | `2026-2027` | texto (AAAA-AAAA) | Año escolar activo |
| NOTA_MINIMA | `70` | num | Nota mínima de aprobación |
| NOTA_MAXIMA | `100` | num | Nota máxima permitida |
| NOTA_ENTERA | `SI` | bool | SI = notas enteras; NO = permite decimales |
| PCT_COMPLETIVA_CF | `50` | num | % de la C.F. en la completiva |
| PCT_COMPLETIVA_CEC | `50` | num | % de la C.E.C. en la completiva |
| PCT_EXTRA_CF | `30` | num | % de la C.F. en la extraordinaria |
| PCT_EXTRA_CE | `70` | num | % de la C.E.EX en la extraordinaria |
| DECIMALES_COMPETENCIA | `1` | num | Decimales mostrados (truncados) en el promedio de competencia |
| ACTIVAR_RECUPERACION | `SI` | bool | Permite RP por período |
| ACTIVAR_COMPLETIVA | `SI` | bool | Permite la etapa completiva |
| ACTIVAR_EXTRAORDINARIA | `SI` | bool | Permite la etapa extraordinaria |
| ACTIVAR_ESPECIAL | `SI` | bool | Permite la evaluación especial |
| GRADOS | `1ro,2do,3ro,4to,5to,6to` | texto | Lista ordenada de grados del centro |
| DURACION_SESION_MIN | `480` | num | Duración máxima de cada sesión en minutos |
| MAX_INTENTOS_LOGIN | `5` | num | Intentos fallidos antes de bloqueo temporal |
| MINUTOS_BLOQUEO | `10` | num | Minutos de bloqueo tras los intentos fallidos |
| FILAS_POR_PAGINA | `25` | num | Filas por página en tablas de administración |
| REGIONAL | `06 - La Vega` | texto | Regional educativa |
| DISTRITO | `06-05 La Vega` | texto | Distrito educativo |
| CENTRO | `Liceo Prof. Niove Estela Mariot` | texto | Nombre del centro educativo |
| CODIGO_CENTRO | `15843` | texto | Código del centro |
| DIRECCION_CENTRO | `` (vacío) | texto | Dirección del centro |
| PROVINCIA | `La Vega` | texto | Provincia |
| MUNICIPIO | `La Vega` | texto | Municipio |
| TANDA | `Jornada Escolar Extendida` | texto | Tanda |
| NIVEL | `Secundaria` | texto | Nivel educativo |
| DIRECTOR | `Silveria Yohanna Rodríguez` | texto | Director(a) (firma del boletín) |
| REGISTRO_SPREADSHEET_ID | `` (vacío) | texto | ID del libro REGISTRO opcional para sincronizar estudiantes |
| PERMITIR_DEMO | `NO` | bool | SI = permite `crearDatosDemo()` (nunca en producción) |

Claves tipadas: `CLAVES_BOOL = ['NOTA_ENTERA','ACTIVAR_RECUPERACION','ACTIVAR_COMPLETIVA','ACTIVAR_EXTRAORDINARIA','ACTIVAR_ESPECIAL']`; `CLAVES_NUM = ['NOTA_MINIMA','NOTA_MAXIMA','PCT_COMPLETIVA_CF','PCT_COMPLETIVA_CEC','PCT_EXTRA_CF','PCT_EXTRA_CE','DECIMALES_COMPETENCIA','DURACION_SESION_MIN','MAX_INTENTOS_LOGIN','MINUTOS_BLOQUEO','FILAS_POR_PAGINA']`.

---

## 5. Roles y permisos

### 5.1 `ROLES_BASE`

| ID_ROL | NOMBRE | DESCRIPCION |
|---|---|---|
| ADMINISTRADOR | Administrador | Acceso completo al sistema |
| COORDINADOR | Coordinador | Consulta información académica de todos los cursos |
| DOCENTE | Docente | Solo sus cursos y asignaturas asignados |
| CONSULTA | Solo consulta | Consulta información autorizada sin modificarla |

Se siembran con `ES_SISTEMA = 'SI'` y `ESTADO = 'ACTIVO'`.

### 5.2 `PERMISOS_CATALOGO` (41 permisos)

Cada fila es `[id, módulo, descripción, roles por defecto]`, donde `C`=Coordinador, `D`=Docente, `S`=Solo consulta. **El ADMINISTRADOR siempre tiene todos** (no aparece en el mapa). Cadena vacía = solo administrador.

| ID_PERMISO | Módulo | Descripción | ADMIN | COORD | DOCENTE | CONSULTA |
|---|---|---|---|---|---|---|
| usuarios.ver | usuarios | Ver usuarios | ✔ | | | |
| usuarios.crear | usuarios | Crear usuarios | ✔ | | | |
| usuarios.editar | usuarios | Editar usuarios, cambiar roles y restablecer acceso | ✔ | | | |
| usuarios.eliminar | usuarios | Activar/desactivar usuarios | ✔ | | | |
| roles.ver | roles | Ver roles y permisos | ✔ | | | |
| roles.administrar | roles | Crear roles y cambiar sus permisos | ✔ | | | |
| estudiantes.ver | estudiantes | Ver estudiantes | ✔ | ✔ | ✔ | ✔ |
| estudiantes.crear | estudiantes | Registrar estudiantes | ✔ | | | |
| estudiantes.editar | estudiantes | Editar, retirar y asignar estudiantes | ✔ | | | |
| docentes.ver | docentes | Ver docentes | ✔ | ✔ | | ✔ |
| docentes.crear | docentes | Registrar docentes | ✔ | | | |
| docentes.editar | docentes | Editar docentes | ✔ | | | |
| cursos.ver | cursos | Ver cursos y secciones | ✔ | ✔ | ✔ | ✔ |
| cursos.ver_todos | cursos | Ver todos los cursos (sin esta, solo los asignados) | ✔ | ✔ | | ✔ |
| cursos.crear | cursos | Crear cursos y secciones | ✔ | | | |
| cursos.editar | cursos | Editar cursos y secciones | ✔ | | | |
| asignaturas.ver | asignaturas | Ver asignaturas y competencias | ✔ | ✔ | ✔ | ✔ |
| asignaturas.crear | asignaturas | Crear asignaturas | ✔ | | | |
| asignaturas.editar | asignaturas | Editar asignaturas | ✔ | | | |
| asignaciones.ver | asignaciones | Ver asignación de docentes | ✔ | ✔ | | |
| asignaciones.crear | asignaciones | Asignar docentes | ✔ | | | |
| asignaciones.editar | asignaciones | Editar asignaciones | ✔ | | | |
| tutorias.ver | tutorias | Ver tutorías | ✔ | ✔ | ✔ | ✔ |
| tutorias.crear | tutorias | Asignar tutorías | ✔ | | | |
| tutorias.editar | tutorias | Cambiar tutorías | ✔ | | | |
| periodos.ver | periodos | Ver períodos académicos | ✔ | ✔ | ✔ | ✔ |
| periodos.administrar | periodos | Crear y editar períodos académicos | ✔ | | | |
| calificaciones.ver | calificaciones | Consultar calificaciones | ✔ | ✔ | ✔ | ✔ |
| calificaciones.registrar | calificaciones | Registrar calificaciones nuevas | ✔ | | ✔ | |
| calificaciones.editar | calificaciones | Modificar calificaciones ya registradas | ✔ | | ✔ | |
| calificaciones.cerrar | calificaciones | Cerrar y reabrir períodos | ✔ | | | |
| calificaciones.administrar | calificaciones | Registrar/modificar calificaciones de cualquier curso (sin necesitar asignación) | ✔ | | | |
| asistencia.ver | asistencia | Consultar asistencia | ✔ | ✔ | ✔ | ✔ |
| asistencia.registrar | asistencia | Registrar asistencia | ✔ | | ✔ | |
| observaciones.ver | observaciones | Ver observaciones (el docente ve las suyas y las de los cursos que tutorea) | ✔ | ✔ | ✔ | |
| observaciones.registrar | observaciones | Registrar observaciones de estudiantes | ✔ | | ✔ | |
| observaciones.editar | observaciones | Editar y anular las observaciones propias | ✔ | | ✔ | |
| observaciones.administrar | observaciones | Ver, editar o anular las observaciones de cualquier docente | ✔ | | | |
| reportes.ver | reportes | Ver y descargar reportes y boletines | ✔ | ✔ | ✔ | ✔ |
| historial.ver | historial | Ver el historial de auditoría | ✔ | | | |
| configuracion.administrar | configuracion | Administrar la configuración del sistema | ✔ | | | |

Mecánica de siembra (`sembrarRoles_`): solo los permisos **nuevos** (que no existan en `PERMISOS`) reciben sus roles por defecto; así no se pisan cambios que el administrador haya hecho en `ROL_PERMISOS`. Además, `USUARIOS.PERMISOS_EXTRA` / `PERMISOS_DENEGADOS` permiten ajustes individuales por usuario (gestión en Auth.js).

---

## 6. Bloqueo, caché y auditoría (y qué implican para PostgreSQL/Node)

### 6.1 Bloqueo global — `conBloqueo_` (LockService)

- `LockService.getScriptLock()` + `waitLock(25000)`: **un único mutex a nivel de script** para toda escritura. Si no se consigue en 25 s, lanza `ErrorApp('El sistema está ocupado guardando otros cambios…', 'OCUPADO')`.
- Se libera en `finally`. `setupSystem()` usa su propio lock de 30 s.
- Patrón de escritura típico: `conBloqueo_(() => { leer; mutar; escribirFilas_/agregarFilas_; generadorId_; historial_; vaciarHistorial_; invalidar_(hoja); })`.
- **Implicación Node/PostgreSQL:** desaparece la necesidad de un mutex global de aplicación. Reemplazar por: transacciones ACID, `SELECT … FOR UPDATE` o unique/PK constraints para las invariantes (IDs únicos, duplicados de inscripción, etc.), y unique indexes como última barrera. Las colas de "OCUPADO" del legacy simplemente no existen; la concurrencia real la gestionan MVCC y los niveles de aislamiento. Si alguna operación de "solo uno a la vez" persiste (ej. setup/migraciones), un advisory lock de Postgres (`pg_advisory_lock`) es el equivalente directo.

### 6.2 Cachés — `_mem` y CacheService

- **`_mem` (objeto en memoria de UNA ejecución):** `tabla_(nombre)` lee la hoja completa una sola vez y la memoiza; `invalidar_(nombre)` / `invalidarTodo_()` la limpian tras escribir. Cada ejecución HTTP vuelve a empezar con caché fría: **todo se relee de la hoja en cada request.**
- **CacheService (persiste entre ejecuciones, ~6 h máximo):**
  - `sga_cfg` → configuración tipada (`config_()`), TTL **300 s**; `limpiarCacheCfg_()` la invalida al cambiar CONFIG.
  - `sga_rp` → mapa rol→permisos (`permisosPorRol_` en Auth.js), misma estrategia.
  - `ses:<TOKEN_HASH>` → información de sesión validada, TTL = segundos hasta expiración (tope 6 h); si no está en caché se valida contra la hoja `SESIONES`.
- **Lectura selectiva:** `leerPorClave_` escanea solo la columna clave y lee por bloques las filas coincidentes (modo exacto o prefijo) — optimización para hojas grandes (`CALIFICACIONES`, `ASISTENCIA`, `RESULTADOS`).
- **Implicación Node/PostgreSQL:** `_mem` se sustituye por caché en proceso (o request-scoped) con invalidación explícita tras escribir; CacheService por Redis o simple caché en memoria con TTL. Las "lecturas selectivas por clave" desaparecen: un índice en Postgres hace ese trabajo de forma nativa. `invalidar_` tras cada escritura se traduce en bust del cache key (o eventos de invalidación) — es el punto donde con más facilidad se introducen bugs de datos viejos si se olvida.

### 6.3 Historial de auditoría — `historial_` / `vaciarHistorial_`

- `historial_(usuario, accion, modulo, idRegistro, descripcion, antes, despues)` **acumula en un buffer en memoria** (`_bufferHistorial`).
- `vaciarHistorial_()` escribe el buffer **en un solo lote** al final de la operación, en la hoja `HISTORIAL` (creciendo la hoja si hace falta). Está envuelto en try/catch: **la auditoría nunca rompe la operación de negocio** (a cambio, si falla el flush, se pierde ese tramo de auditoría silenciosamente).
- Errores técnicos: `registrarError_` escribe en `ERRORES` (append inmediato) y devuelve una referencia `E`+6 hex al usuario.
- **Implicación Node/PostgreSQL:** escribir auditoría dentro de la **misma transacción** que el cambio (o triggers de auditoría en la BD): se gana atomicidad (no se pierde el log si falla) y se elimina el buffer manual. Para errores de aplicación, un log estructurado + tabla `error_log` si se quiere conservar la referencia visible al usuario.

---

## 7. Mapeo propuesto a PostgreSQL

| Hoja legacy | Tabla propuesta | Notas |
|---|---|---|
| USUARIOS | `users` | PK `id` (BIGINT serial o UUID); conservar el código legacy `USR-000001` en columna `legacy_code` si se desea trazabilidad. FK `role_id → roles.id`, FK opcional `teacher_id → teachers.id`. Columnas `extra_permissions`, `denied_permissions` (TEXT[] o JSONB). UNIQUE(`username`). Índice en `email`. |
| ROLES | `roles` | PK `id`; UNIQUE(`name`). `is_system boolean`. Sembrar los 4 roles base. |
| PERMISOS | `permissions` | PK `id`; UNIQUE(`code`) (`usuarios.ver`). Índice por `module`. |
| ROL_PERMISOS | `role_permissions` | PK compuesta (`role_id`, `permission_id`), ambas FK. |
| CREDENCIALES | `credentials` (o columnas dentro de `users`) | 1:1 con `users` (PK=FK `user_id`). `password_hash`, `salt` (con pepper en variable de entorno, ver abajo), `must_change boolean`, `failed_attempts int`, `locked_until timestamptz`, `changed_at timestamptz`. **Actualizar el algoritmo de hash** (SHA‑256×400 → bcrypt/argon2id) con migración incremental al login. |
| SESIONES | `sessions` | PK `id`; FK `user_id`; UNIQUE(`token_hash`); índice por `user_id`, `state`. `created_at`, `expires_at`, `last_activity_at`. Caducar por job o por comparación en la consulta. |
| ESTUDIANTES | `students` | PK `id`; UNIQUE(`matricula`) (texto, no número); `full_name` generado o mantenido por trigger. Índice en `last_name, first_name`. Estado enum. |
| INSCRIPCIONES | `enrollments` | FK estudiante/curso/sección. UNIQUE(`school_year`, `student_id`) (un estudiante una inscripción por año — verificar contra la lógica de Students.js antes de imponerlo). UNIQUE(`section_id`, `list_number`). Índices por `student_id`, `school_year`, `section_id`. |
| DOCENTES | `teachers` | PK `id`; índice `full_name`; `phone` TEXT. |
| CURSOS | `school_years` + `courses` | La hoja CURSOS mezcla año y grado: separar `school_years` (UNIQUE `code` '2026-2027') de `courses` (FK `school_year_id`, `grade`, `level`). UNIQUE(`school_year_id`, `grade`). |
| SECCIONES | `sections` | FK `course_id → courses.id`; UNIQUE(`course_id`, `name`). |
| ASIGNATURAS | `subjects` | Catálogo global (no depende de año). UNIQUE(`code`). Flags booleanos para las 4 etapas, `min_grade`, `bulletin_order`, `order`. |
| COMPETENCIAS | `subjects_competencies` (o `competencies`) | FK `subject_id`; UNIQUE(`subject_id`, `code`); índice por (`subject_id`, `order`). Ojo: orden histórico CC–CRP–CEC–CT (corrección de Setup.js). |
| ASIGNACIONES | `teaching_assignments` | FK docente/asignatura/curso/sección/periodo. UNIQUE(`periodo_id`, `seccion_id`, `asignatura_id`) (un solo docente por grupo-período — validar contra Grades.js). Índice por `teacher_id`. |
| TUTORIAS | `tutoring_records` (o `section_tutors`) | FK docente/curso/sección. UNIQUE(`school_year`, `section_id`). |
| PERIODOS | `periods` | FK `school_year`; UNIQUE(`school_year_id`, `code`); `kind` ('REGULAR'/'ETAPA'), `stage` nullable, `order`, `months TEXT[]`, `status` ('ABIERTO'/'CERRADO'). |
| CALIFICACIONES | `grade_records` | FK estudiante/docente/asignatura/curso/sección/periodo. La `CLAVE_GRUPO` **no necesita columna**: expresa la FK lógica (`periodo → asignación → sección`); si se quiere, columna generada. UNIQUE(`periodo_id`, `student_id`, `asignatura_id`). `C1..C4`, `R1..R4`, `nota_etapa` NUMERIC(5,2) con CHECK 0–100 (reemplaza la validación de hoja). Índices por (`section_id`, `subject_id`), `student_id`, `periodo_id`. |
| ASISTENCIA | `attendance` | **Rediseñar**: en legacy hay una columna por mes (11 columnas de texto). En Postgres conviene una fila por evento: `attendance(id, student_id, subject_id, section_id, school_year_id, date, mark, modified_by, modified_at)` con UNIQUE(`student_id`, `subject_id`, `date`). Si se quiere migrar 1:1, `months JSONB`, pero pierde integridad. |
| OBSERVACIONES | `observations` | FK estudiante/docente/asignatura/curso/sección/periodo; `type`, `obs_date`, `text`, `status`, `created_by`. Índices por `student_id`, (`docente`, `periodo`). |
| RESULTADOS | `grade_records` ampliado o `result_summaries` | Se recalcula (`reconstruirResultados_`); en Postgres puede ser vista/materializada a partir de `grade_records` + pesos de CONFIG. Si se mantiene tabla: UNIQUE(`student_id`, `subject_id`, `section_id`, `school_year_id`); columnas `pc1..pc4`, `cf_real`, `cf`, `cec`, `ccf`, `ceex`, `cexf`, `cesp`, `stage_achieved`, `nota_a`, `nota_r`, `status`. |
| HISTORIAL | `audit_log` | `occurred_at`, `username`, `action`, `module`, `record_id`, `description`, `old_value JSONB`, `new_value JSONB`. Escritura en la misma transacción que el cambio (o triggers). Índices por `occurred_at`, `module`, `record_id`. |
| ERRORES | `error_log` | `occurred_at`, `username`, `function`, `reference` (UNIQUE, formato `E`+6hex), `message`, `detail` (stack). |
| CONFIG | `config` | PK `key`; `value JSONB` (o TEXT + columna de tipo) + `description` + `updated_at`. Migrar los tipos de `CLAVES_BOOL/CLAVES_NUM` a JSONB tipado. Alternativa: tabla `school_profile` para los datos del centro y tabla `settings` para parámetros. |
| (sin hoja) | `school_years` | Nueva tabla normalizada a partir de la clave repetida `ANO_ESCOLAR` ('2026-2027'), que hoy está duplicada en decenas de filas. |

### 7.1 Datos que en legacy viven en `PropertiesService` (fuera de las hojas)

| Propiedad | Uso en legacy | Dónde debe ir en el nuevo sistema |
|---|---|---|
| `DB_ID` | ID del Spreadsheet que hace de base de datos (`ss_()`) | Ya no aplica: la cadena de conexión vive en configuración del servidor (`DATABASE_URL` / variables de entorno). Nunca en la BD que apunta. |
| `PEPPER` (creada por `pimienta_()`) | Secreto del servidor mezclado en el hash del PIN: `sal:PEPPER:clave` | **Gestor de secretos** (variable de entorno del servidor / KMS / Vault). Rotación con doble-verificación (hash nuevo + viejo) y rehash al login. |
| `REV_<idUsuario>` | Marca de tiempo de revocación global: al restablecer acceso, cambiar rol o desactivar usuario, `revocarSesiones_` fija la fecha y `sesionDe_` invalida toda sesión creada antes | Columna en `users`: `sessions_revoked_at timestamptz` (o `token_revoked_at`); la validación de sesión la compara con `created_at`. Simple, indexable y atómico con el resto del cambio del usuario. |

### 7.2 Resumen de índices recomendados

- `sessions(token_hash)` UNIQUE; `sessions(user_id)`.
- `enrollments(school_year_id, student_id)` UNIQUE; `enrollments(section_id, list_number)` UNIQUE.
- `grade_records(periodo_id, section_id, subject_id)` y `grade_records(student_id, school_year_id)`.
- `attendance(student_id, subject_id, date)` UNIQUE.
- `observations(student_id)`, `observations(docente_id, periodo_id)`.
- `audit_log(occurred_at DESC)`, `audit_log(module, record_id)`.
- FKs declaradas con `ON DELETE RESTRICT` por defecto (el legacy nunca borra: usa `ESTADO = INACTIVO/ELIMINADO`, que en el nuevo sistema puede mantenerse como soft-delete o reemplazarse por borrado real según el módulo).
- Conservar la convención de estados del legacy como enums: `ACTIVO/INACTIVO/ELIMINADO` para personas y catálogos; `ABIERTO/CERRADO` para períodos; `ACTIVA/CERRADA` para sesiones.

### 7.3 Ajustes por la escala de datos

- `CALIFICACIONES` ≈ estudiantes × asignaturas × períodos por año → tabla grande: buena candidata a particionado por `school_year_id` si el histórico crece.
- La desnormalización `NOMBRE_COMPLETO` (ESTUDIANTES, DOCENTES) puede mantenerse como columna generada (`GENERATED ALWAYS AS (nombres || ' ' || apellidos) STORED`).
- El recálculo de `RESULTADOS` (hoy `reconstruirResultados_` reescrito en lote) se puede convertir en una vista materializada refrescada tras cerrar períodos, eliminando la redundancia de datos derivados.
