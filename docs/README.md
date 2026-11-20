# Documentación del SGA (migración)

Índice de la documentación técnica generada a partir del código real del legacy.

## Estructura

- [`migration/documento-arquitectura-definitivo.md`](migration/documento-arquitectura-definitivo.md) — **documento maestro**: síntesis, decisiones y plan por fases.
- `architecture/`
  - `api-y-seguridad-legacy.md` — rutas de la API, autenticación, sesiones, permisos, CRUD declarativo, vistas del SPA y traducción a REST.
  - `modulos-funcionales-legacy.md` — reglas de negocio por módulo y estructura del boletín.
  - `navegacion-modulos.md` — estructura funcional, catálogo único de módulos, permisos y navegación del frontend actual.
  - `politica-alcance.md` — política de permisos y alcance académico del CRUD, con la matriz permiso → alcance.
- `security/`
  - `datos-personales.md` — tratamiento de la semilla con datos reales y reglas de privacidad del repositorio.
- `database/`
  - `modelo-datos-legacy.md` — hojas, columnas, relaciones, IDs, configuración, roles/permisos y mapeo a PostgreSQL.
  - `analisis-datos-reales.md` — análisis del Excel real (SGAp_Base_de_Datos.xlsx): integridad, volúmenes, calidad de datos y hallazgos.
- `modules/`
  - `motor-calificaciones.md` — fórmulas exactas del motor académico, reglas y casos de prueba (golden tests).

## Cómo ejecutar (desarrollo)

Requisitos: PostgreSQL 18 activo en `localhost:5432` con la base `sga_db` y el archivo
`SGA/database/.env` (ya creado en este equipo). Las dependencias de `backend/` y
`frontend/` ya están instaladas.

**Opción rápida:** doble clic en `SGA/iniciar.cmd`. Abre el backend y el frontend en dos
ventanas y lanza el navegador en <http://localhost:5173>.

**Manual (PowerShell 5.1, dos terminales):**

```powershell
# Terminal 1 - API
Set-Location SGA\backend
npm.cmd run dev          # http://localhost:4000  (recarga con tsx watch)

# Terminal 2 - interfaz
Set-Location SGA\frontend
npm.cmd run dev          # http://localhost:5173  (proxy /api -> 4000)
```

Abrir <http://localhost:5173> e iniciar sesión con el usuario **`admin`**. El PIN no se
documenta en el repositorio: se crea o restablece con
`npx.cmd tsx scripts/crear-acceso.ts admin <PIN> --permanente` desde `SGA/backend`.
Sin `--permanente`, el PIN es temporal y el sistema obliga a cambiarlo al entrar.

Comprobaciones útiles:

```powershell
curl.exe http://localhost:4000/api/health
curl.exe http://localhost:5173/api/health        # a través del proxy de Vite
```

Si el puerto 4000 está ocupado por un servidor viejo, el nuevo backend no arranca:
`netstat -ano | findstr :4000` y detener ese PID con `Stop-Process -Id <PID> -Force`.

Pruebas y verificación (desde `SGA/backend`):

```powershell
npm.cmd run build
npx.cmd vitest run                 # 123 pruebas (golden, seguridad, CRUD y módulos)
npx.cmd tsx scripts/verificar-crud.ts    # contra la BD real, revierte cada escritura
```

## Estado del plan

| Fase | Estado |
|---|---|
| 1. Auditoría del sistema original | ✅ Completada |
| 2. Diseño de la base de datos | ✅ Completada: PostgreSQL 18 local (`sga_db`), esquema validado, **7 migraciones** aplicadas y CHECK 0–100 completos (C1..C4, R1..R4, etapas y C.F.). La semilla versionada es la anonimizada; la real queda fuera de Git |
| 3. Backend | 🔄 En curso: **motor de calificaciones** (24 golden tests + paridad 2/2 contra producción), **autenticación completa** (login con bloqueo por intentos, sesiones httpOnly, permisos efectivos, cambio de PIN y bloqueo por clave temporal; 12 tests), **motor CRUD declarativo** (8 módulos, 21 tests puros) y **verificación contra la BD real** (`scripts/verificar-crud.ts`). Total **60/60 tests**. Falta persistencia de calificaciones/asistencia y módulos REST de estudiantes/reportes |
| 4. Frontend | 🔄 En curso: login con cambio obligatorio de PIN, panel con estado real de la BD y los **8 módulos CRUD** (listar/buscar/filtrar/paginar, alta, edición, estados, restablecer PIN, accesos de docentes y copia de períodos) sobre React + Vite |
| 5. Boletines y reportes | ⬜ |
| 6. Pruebas y transición | ⬜ |

## Regla inquebrantable

Ninguna migración puede alterar una calificación ya calculada correctamente por el
sistema original. El motor de calificaciones debe pasar los 24 golden tests de
`Tests.js` antes de reemplazar nada.
