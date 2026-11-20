# Datos personales y semillas de la base de datos

El SGA maneja datos académicos de menores de edad: nombres, matrículas,
calificaciones, asistencia y observaciones. Este documento fija la regla de
tratamiento dentro del repositorio.

## Regla

| Archivo | Contenido | ¿Se versiona? |
|---|---|---|
| `database/seeds/sga-seed.anon.json` | Semilla anonimizada, misma estructura y volúmenes | **Sí** |
| `database/seeds/sga-seed.json` | Datos personales reales | **No** (ignorado por Git) |

`sga-seed.json` permanece en el equipo local para reproducir la base real, pero
no debe compartirse, adjuntarse ni subirse a ningún remoto.

## Uso del script de carga

```powershell
# Semilla anonimizada (por defecto)
node scripts/seed.js

# Semilla real, solo en local
node scripts/seed.js --real
```

El script avisa por consola cuando se usa `--real`. La carga es idempotente
(`upsert`) y no migra credenciales: los PIN se recrean con
`backend/scripts/crear-acceso.ts`.

## Historial de Git

El archivo real estuvo versionado en commits anteriores. Sacarlo del árbol
(`git rm --cached`) impide que vuelva a entrar, pero **no lo borra del
historial**. Mientras no se decida una reescritura de historial o se restrinja
el acceso al repositorio, se debe tratar el repositorio completo como material
con datos personales y no publicarlo.

## Credenciales

Ningún PIN, contraseña, hash, token ni contenido de `.env` se documenta en el
repositorio. El acceso de administrador se crea o restablece con el script
sancionado y el valor se entrega por un canal aparte.
