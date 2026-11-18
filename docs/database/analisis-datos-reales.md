# Análisis de la base de datos real (SGAp_Base_de_Datos.xlsx)

> Fuente: `C:\Users\FIDELOV\Desktop\SGn\documentacion\SGAp_Base_de_Datos.xlsx`
> (exportación del libro de Google Sheets en producción del Liceo Prof. Niove Estela
> Mariot, La Vega). Análisis ejecutado con lectura programática completa (exceljs).
> Este análisis alimenta el esquema `SGA/database/prisma/schema.prisma` y el seed
> generado en `SGA/database/seeds/sga-seed.json`.

## 1. Volumen de datos real

| Hoja | Filas | Hoja | Filas |
|---|---:|---|---:|
| ESTUDIANTES | 273 | CALIFICACIONES | 2 482 |
| INSCRIPCIONES | 273 | RESULTADOS | 2 429 |
| DOCENTES | 14 | HISTORIAL | 396 |
| SECCIONES | 10 | SESIONES | 35 |
| ASIGNATURAS | 10 | OBSERVACIONES | 3 |
| ASIGNACIONES | 10 | CREDENCIALES | 2 |
| TUTORIAS | 8 | USUARIOS | 2 |
| PERIODOS | 7 | ASISTENCIA / ERRORES | 0 |
| COMPETENCIAS | 4 | CURSOS | 6 |
| CONFIG | 32 | ROLES / PERMISOS / ROL_PERMISOS | 4 / 41 / 36 |

Año escolar activo: **2026-2027**. Todo el dato académico pertenece a ese año.

## 2. Verificación de integridad (todas sin hallazgos)

- FK de INSCRIPCIONES → ESTUDIANTES / CURSOS / SECCIONES: sin huérfanos.
- FK de CALIFICACIONES → ESTUDIANTES / ASIGNATURAS / SECCIONES / PERIODOS / DOCENTES: sin huérfanos.
- FK de RESULTADOS → ESTUDIANTES / ASIGNATURAS: sin huérfanos.
- Sin duplicados de `estudiante+asignatura+período` en CALIFICACIONES.
- Sin duplicados de `NUM_LISTA` dentro de sección.
- Todas las notas dentro de 0–100.
- `ID_ESTUDIANTE` / `ID_DOCENTE` / etc. siguen el formato `PRE-000001` consistente.

**El dato real es importable directamente con las claves legado como PK** (decisión
aplicada en el esquema Prisma). El seed generado (`seeds/sga-seed.json`, 20 tablas)
salió sin avisos de integridad.

## 3. Estructura confirmada (y diferencias con lo documentado antes)

1. **CURSOS tiene `NIVEL`** ("Secundaria") además de `GRADO` — el modelo anterior no lo
   tenía. El esquema Prisma lo incluye (`Course.nivel`).
2. **ASIGNATURAS tiene `NOTA_MINIMA` por asignatura** — en los datos reales está vacía
   (null = usa `CONFIG.NOTA_MINIMA` = 70). El esquema la modela como `Int?`.
3. **ASIGNATURAS**: `USA_RECUPERACION/COMPLETIVA/EXTRAORDINARIA/ESPECIAL` = SI en las 10;
   `ORDEN` ≠ `ORDEN_BOLETIN` (FIHR: 7→9, ART: 9→7) — el boletín NO usa el orden del CRUD.
4. **CALIFICACIONES** guarda también `ID_DOCENTE` (quien registró; vacío en 2292/2482,
   todas las filas nuevas lo traen), `ID_CURSO`, `MODIFICADO_POR` (valor: "migracion").
5. **RESULTADOS** confirma la estructura exacta: `PC1..PC4`, `CF_REAL`, `CF`, `CEC`,
   `CCF`, `CEEX`, `CEXF`, `CESP`, `ETAPA_LOGRO` (valores `CF`/`COMPLETIVA`), `NOTA_A`,
   `NOTA_R`, `ESTADO_RESULTADO` (valores reales: `INCOMPLETO` = 1969,
   `RECUPERACIÓN PENDIENTE` = 458, `LOGRADO` = 2).
6. **Las siglas CC/CRP/CT/CEC SÍ existen** — como `ABREV` de la hoja COMPETENCIAS
   (C1=CC Comunicativa, C2=CRP Pensamiento Lógico..., C3=CEC Ética y Ciudadana,
   C4=CT Científica y Tecnológica). ⚠️ Colisión de nombres: la abreviatura de la
   competencia C3 es "CEC" y la columna `CEC` de RESULTADOS significa "nota de la
   etapa completiva". No son lo mismo; el código nuevo debe distinguirlos.

## 4. Reglas del motor confirmadas por los datos

- `CF` siempre entero (0 decimales en 2429 filas); `CF_REAL` conserva decimales
  (53.875 … 89.1875) → redondeo half-up al entero, como documenta el motor.
- `DECIMALES_COMPETENCIA = 1` en CONFIG: los promedios de competencia se muestran
  truncados a 1 decimal.
- Pesos en CONFIG: completiva 50/50, extraordinaria 30/70 (coincide con el motor).
- Ejemplo real de la cadena de etapas: `RES-000289` con `CF=54 → CEC=90 → CCF=72 →
  ETAPA_LOGRO=COMPLETIVA → NOTA_A=72` (aprobó por completiva).
- Recuperaciones R1..R4 registradas solo en 13 filas (válido: solo se usan cuando
  nota < 70); sus valores van de 44 a 78.

## 5. Estado y calidad de los datos (aviso para la importación)

- **273 estudiantes / 273 inscripciones**: una inscripción por estudiante; todos ACTIVO.
- **ESTUDIANTES.SEXO, MATRICULA, FECHA_NACIMIENTO: 100% vacíos** en los datos reales
  (el sistema no los captura). Se modelan como nullables.
- **Solo la sección SEC-000008 (5to A) tiene calificaciones** (92 grupos
  `año|sección|asignatura`); el resto del centro recién arranca el ciclo.
- Los datos provienen de una migración previa (LEEME): "148 estudiantes del SGC
  anterior, 254 filas de calificaciones (1016 notas), 36 inscripciones duplicadas
  eliminadas". Nombres de estudiantes con estilo mixto ("Araujo Nova, Luis Yoendry"
  vs "Ilary Mariel Acevedo Malena" — algunos conservan el formato "Apellidos, Nombres").
- **Docentes con un solo nombre** (posibles duplicados, según LEEME): Elis, Katerne,
  Jenny, Karina, Ingrid, Heredia. Ejemplo: DOC-000006 "Karina" vs DOC-000009
  "Karina Fernández"; DOC-000005 "Jenny" vs DOC-000014 "Jenny Vásquez";
  DOC-000007 "Ingrid" vs DOC-000011 "Ingri Adames". → Pendiente de decisión del
  usuario antes de descartar; se importan tal cual.
- Un estudiante duplicado resuelto en origen: 1roB N.º 16 ("Baptiste, Aneudi" /
  "Jn_Baptiste, Aneudi") — se conservó el que tenía notas.
- SESIONES: 33 ACTIVA / 2 CERRADA (no se migran como sesiones vivas; el token
  legado no sirve en el nuevo sistema).
- HISTORIAL (396 filas): EDITAR_NOTA=181, CREAR=170, LOGIN=35… usuario dominante
  "profid". Se conserva como auditoría histórica en el seed
  (`auditLogHistorico`), no como datos vivos.

## 6. Configuración completa (32 claves) — semilla del nuevo `config`

Valores operativos clave: `ANO_ESCOLAR=2026-2027`, `NOTA_MINIMA=70`,
`NOTA_MAXIMA=100`, `NOTA_ENTERA=SI`, `PCT_COMPLETIVA_CF=50`, `PCT_COMPLETIVA_CEC=50`,
`PCT_EXTRA_CF=30`, `PCT_EXTRA_CE=70`, `DECIMALES_COMPETENCIA=1`,
`GRADOS=1ro,2do,3ro,4to,5to,6to`, `DURACION_SESION_MIN=480`,
`MAX_INTENTOS_LOGIN=5`, `MINUTOS_BLOQUEO=10`, `FILAS_POR_PAGINA=25`,
`PERMITIR_DEMO=NO`. Datos del encabezado del boletín: REGIONAL/DISTRITO `06`,
`CENTRO=Liceo Prof. Niove Estela Mariot`, `CODIGO_CENTRO=15843`, PROVINCIA y
MUNICIPIO `La Vega`, `TANDA=Jornada Escolar Extendida`, `NIVEL=Secundaria`,
`DIRECTOR=Silveria Yohanna Rodríguez`, dirección del centro.

## 7. Lo que NO se migra a datos vivos

| Hoja | Razón |
|---|---|
| SESIONES | Tokens legado inválidos en el nuevo sistema (se recrean al login) |
| CREDENCIALES | Contiene HASH/SALT con el algoritmo viejo; se recrea con hash nuevo + rehash al primer login (el esquema guarda `version` para el rehash) |
| ERRORES / ASISTENCIA | Sin filas |
| LEEME | Metadatos de instalación; su contenido relevante vive en este documento |

## 8. Cadena de importación lista para usar

```powershell
# 1. Regenerar el seed desde el Excel (idempotente)
Set-Location SGA\database
node scripts/importar-excel.js "C:\Users\FIDELOV\Desktop\SGn\documentacion\SGAp_Base_de_Datos.xlsx"

# 2. Validar el esquema (requiere DATABASE_URL de entorno)
$env:DATABASE_URL = "postgresql://usuario:clave@localhost:5432/sga"
npx.cmd prisma validate

# 3. (Pendiente de instalar PostgreSQL) crear BD y cargar el seed
#    npx.cmd prisma migrate deploy    # migraciones
#    cargar seeds/sga-seed.json con un script de seed de Prisma
```

**Requisito pendiente del entorno**: instalar PostgreSQL (no está en esta máquina;
descarga manual desde postgresql.org — no hay winget/choco disponibles).
