// Verificación temporal: últimas filas de auditoría del módulo AUTENTICACION
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../database/.env') });
import { prisma } from '../src/lib/db';

prisma.auditLog.findMany({
  where: { modulo: 'AUTENTICACION' },
  orderBy: { id: 'desc' },
  take: 10,
}).then(function (a) {
  a.forEach(function (x) { console.log(String(x.id) + ' | ' + x.accion + ' | ' + x.usuario + ' | ' + (x.descripcion || '')); });
  return prisma.$disconnect();
}).catch(function (e) { console.error(e); process.exitCode = 1; return prisma.$disconnect(); });
