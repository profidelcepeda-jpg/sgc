/*********************************************************************
 * ids.ts — Generador de IDs legados (PREFIJO-000001) atómico
 * El legacy usaba generadorId_ dentro de un bloqueo global. En PostgreSQL
 * la secuencia vive en la tabla id_counters y se incrementa en la MISMA
 * transacción que crea el registro, así dos peticiones concurrentes no
 * pueden obtener el mismo ID (el MAX en memoria sí podía).
 *********************************************************************/

import { Prisma } from '@prisma/client';

export async function siguienteIdTx_(tx: Prisma.TransactionClient, prefijo: string): Promise<string> {
  const filas = await tx.$queryRaw<Array<{ ultimo: number }>>`
    INSERT INTO "id_counters" ("prefijo", "ultimo") VALUES (${prefijo}, 1)
    ON CONFLICT ("prefijo") DO UPDATE SET "ultimo" = "id_counters"."ultimo" + 1
    RETURNING "ultimo"`;
  const n = Number(filas[0].ultimo);
  return prefijo + '-' + String(n).padStart(6, '0');
}
