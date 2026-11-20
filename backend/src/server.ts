/*********************************************************************
 * server.ts — Punto de entrada para el servidor HTTP del backend SGA
 * Inicia el listener en el puerto configurado y maneja el cierre limpio.
 * La aplicación Express reside en app.ts para desacoplar tests y runtime.
 *********************************************************************/

import dotenv from 'dotenv';
import path from 'path';
// El .env vive junto al schema de Prisma (SGA/database/.env)
dotenv.config({ path: path.resolve(__dirname, '../../database/.env') });

import { app } from './app';
import { prisma } from './lib/db';

const PORT = Number(process.env.PORT || 4000);

const server = app.listen(PORT, () => {
  console.log('SGA backend escuchando en http://localhost:' + PORT);
});

async function cerrar() {
  await prisma.$disconnect();
  server.close();
}

process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
