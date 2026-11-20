# Organización de módulos y navegación del SGA

Documento de referencia de la reorganización del frontend. Describe la estructura
funcional aprobada, el catálogo único de módulos y las reglas de integración con
los permisos del backend.

## 1. Estructura funcional

| Área | Módulos |
|---|---|
| Panel principal | Panel |
| Evaluación y seguimiento | Calificaciones, Asistencia, Observaciones |
| Gestión académica | Estudiantes, Docentes, Cursos y secciones, Asignaturas, Competencias, Períodos, Asignaciones, Tutorías |
| Consultas y reportes | Consultas, Reportes |
| Administración del sistema | Usuarios, Roles y permisos, Configuración |

El orden anterior se declara una sola vez en `frontend/src/modulos.ts` y de ahí se
construyen el menú lateral, las tarjetas del panel y la miga de pan de la cabecera.

## 2. Catálogo único

`frontend/src/modulos.ts` expone:

- `MODULOS`: definición de cada módulo (id, etiqueta, sigla, descripción, permiso,
  icono y grupo).
- `GRUPOS`: categorías de navegación con su icono.
- `modulosDelGrupo` / `gruposDisponibles`: filtran por el mapa de permisos efectivos
  que devuelve `/api/auth/bootstrap`.
- `MODULO_POR_ID`: resolución del módulo activo para la cabecera y las rutas.

No se mantienen listas paralelas de módulos en el menú, el panel o `App.tsx`.

## 3. Navegación

- Menú lateral con categorías desplegables; la categoría del módulo activo queda
  siempre abierta y el elemento activo se marca con fondo, borde y punto indicador.
- Cabecera uniforme con área, módulo y usuario de la sesión.
- En pantallas menores de 900 px el menú se convierte en un panel deslizante con
  fondo oscuro, botón de apertura y cierre, y cierre automático al elegir módulo.
- La URL usa hash (`#/calificaciones`) para enlaces directos y botones atrás/adelante,
  sin agregar dependencias de enrutamiento.
- Antes de mostrar un módulo, `App.tsx` verifica que exista y que el permiso
  declarado esté presente en `ctx.set`; un hash manipulado vuelve al panel.

## 4. Permisos por módulo

| Módulo | Permiso de acceso |
|---|---|
| Calificaciones | `calificaciones.ver` |
| Asistencia | `asistencia.ver` |
| Observaciones | `observaciones.ver` |
| Estudiantes | `estudiantes.ver` |
| Docentes | `docentes.ver` |
| Cursos y secciones | `cursos.ver` |
| Asignaturas | `asignaturas.ver` |
| Competencias | `asignaturas.ver` |
| Períodos | `periodos.ver` |
| Asignaciones | `asignaciones.ver` |
| Tutorías | `tutorias.ver` |
| Consultas | `estudiantes.ver` |
| Reportes | `reportes.ver` |
| Usuarios | `usuarios.ver` |
| Roles y permisos | `roles.ver` |
| Configuración | `configuracion.administrar` |

Los permisos de lectura son solo la puerta de entrada. Cada servicio del backend
sigue aplicando sus reglas de alcance y de escritura (`asistencia.registrar`,
`calificaciones.editar`, `observaciones.administrar`, etc.).

## 5. Integración entre módulos

- **Estudiantes** usa `/api/students` para matrícula y edición; la consulta del
  expediente abre **Consultas** con el estudiante seleccionado.
- **Consultas** reutiliza los servicios de estudiantes, calificaciones, asistencia y
  observaciones según los permisos del usuario; no duplica el motor de cálculo.
- **Reportes** consume `reports.service.ts`, que a su vez reutiliza el motor de
  calificaciones y los resúmenes de asistencia.
- **Calificaciones** y **Asistencia** comparten el alcance docente resuelto por
  `crud/autorizacion.ts` (asignaciones y tutorías activas).
- **Configuración** conserva solo parámetros del sistema y enlaces contextuales a
  períodos y reportes; los catálogos académicos se administran en Gestión académica
  para no repetir accesos.
- **Usuarios** y **Roles y permisos** comparten el catálogo de permisos de la base;
  la asignación de roles se hace desde Usuarios y la matriz de permisos desde Roles.

## 6. Utilidades compartidas

`frontend/src/lib/formato.ts` centraliza:

- `qs`: construcción de query strings.
- `formatearNumero`: formato numérico local con decimales configurables.
- `formatearFechaISO`: fecha local para `<input type="date">`.

Estas funciones estaban repetidas en Asistencia, Consultas, Estudiantes, Reportes y
Panel.

## 7. Deuda técnica pendiente

Los siguientes archivos siguen concentrando responsabilidades y requieren una
refactorización por etapas, con pruebas de paridad, fuera de esta reorganización de
navegación:

- `backend/src/modules/crud/crud.modulos.ts`: definiciones y lógica de ocho dominios.
  La separación propuesta es `crud.comun.ts` + `crud.definiciones/{usuarios,docentes,catalogos,asignaciones,periodos,cursos}.ts`,
  manteniendo `crud.modulos.ts` como registro.
- `frontend/src/componentes/ModuloCrud.tsx`: tabla, formulario y diálogos de acciones.
- `frontend/src/index.css`: hoja única de estilos; puede dividirse por área cuando se
  estabilicen los componentes.
- `frontend/src/tipos.ts`: contratos de API del frontend; una carpeta `tipos/` por
  módulo reduciría el archivo único.

Ninguna de estas tareas cambia reglas de negocio ni el motor de calificaciones.

## 8. Diagnóstico de la estructura anterior (ETAPA 1)

Hallazgos comprobados en el código antes de la reorganización:

1. **Menú plano.** Los 16 módulos se listaban en un solo bloque, en el orden del
   catálogo, sin categorías, iconos ni jerarquía; el usuario tenía que recorrer toda
   la lista para encontrar un área.
2. **Sigla duplicada.** Asistencia y Asignaturas compartían la sigla `AS`, usada como
   identificador visual del módulo.
3. **Sin ubicación en la URL.** El módulo activo solo vivía en el estado de React:
   recargar la página volvía siempre al panel y no se podían compartir enlaces.
4. **Cabecera sin contexto.** Mostraba el nombre del módulo y el usuario, pero no el
   área funcional a la que pertenecía.
5. **Accesos duplicados en Configuración.** La pestaña académica repetía seis accesos
   CRUD (cursos, asignaturas, competencias, docentes, asignaciones, tutorías) que ya
   existían en el menú: dos caminos para la misma pantalla.
6. **Panel y menú desincronizados.** El panel pintaba una rejilla plana de módulos
   construida aparte del menú, con riesgo de que ambas listas divergieran.
7. **Utilidades repetidas.** `qs`, el formato numérico y el formato de fecha estaban
   copiados en Asistencia, Consultas, Estudiantes, Reportes y Panel, con variantes
   menores entre copias.
8. **`App.tsx` sobrecargado.** Concentraba sesión, carga diferida y un `switch` de
   nueve pantallas.
9. **Backend sin duplicación funcional demostrada.** Cada servicio aplica su propio
   alcance y sus permisos; no se encontró un módulo de backend que pudiera retirarse
   sin perder funciones. No se modificó ninguna regla, esquema ni migración.

No se eliminó ningún módulo. Las dos duplicaciones reales (accesos CRUD en
Configuración y listas paralelas de módulos) se resolvieron reutilizando el catálogo
y retirando solo los atajos redundantes.

## 9. Verificación

- `npm run lint`: sin errores.
- `npm run build`: backend (`tsc -b`) y frontend (`tsc -b && vite build`) correctos.
- `npm run test:backend`: 123 pruebas aprobadas, incluidos los golden tests del motor.
- Sin cambios en `prisma/schema.prisma`, migraciones, seeds ni catálogo de permisos.
- Sin dependencias nuevas: la navegación por hash usa la API del navegador.

