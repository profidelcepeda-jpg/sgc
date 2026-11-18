// anonimizar-seed.js — Anonimiza los datos personales en sga-seed.json
// Reemplaza nombres de estudiantes, docentes y usuarios por identificadores sintéticos,
// conservando íntegramente la estructura académica, IDs, relaciones, notas y auditoría.
//
// Uso:
//   node scripts/anonimizar-seed.js [--in-place]
//
// Sin --in-place genera: seeds/sga-seed.anon.json
// Con --in-place sobreescribe: seeds/sga-seed.json

const fs = require('fs');
const path = require('path');

const rutaEntrada = path.join(__dirname, '..', 'seeds', 'sga-seed.json');
const enSitio = process.argv.includes('--in-place');
const rutaSalida = enSitio
  ? rutaEntrada
  : path.join(__dirname, '..', 'seeds', 'sga-seed.anon.json');

if (!fs.existsSync(rutaEntrada)) {
  console.error('No se encontró el archivo origen:', rutaEntrada);
  process.exit(1);
}

console.log('Leyendo seed:', rutaEntrada);
const seed = JSON.parse(fs.readFileSync(rutaEntrada, 'utf8'));
const t = seed.tablas;

let estudiantesAnon = 0;
let docentesAnon = 0;
let usuariosAnon = 0;

// 1. Estudiantes
if (Array.isArray(t.students)) {
  for (const s of t.students) {
    const sufijo = s.id ? s.id.replace(/^EST-/, '') : String(estudiantesAnon + 1).padStart(6, '0');
    s.nombres = 'Estudiante';
    s.apellidos = `Demo ${sufijo}`;
    s.nombreCompleto = `Estudiante Demo ${sufijo}`;
    if (s.matricula) s.matricula = `MAT-${sufijo}`;
    estudiantesAnon++;
  }
}

// 2. Docentes
if (Array.isArray(t.teachers)) {
  for (const doc of t.teachers) {
    const sufijo = doc.id ? doc.id.replace(/^DOC-/, '') : String(docentesAnon + 1);
    doc.nombreCompleto = `Docente ${sufijo}`;
    if (doc.correo) doc.correo = `docente.${sufijo.toLowerCase()}@ejemplo.edu`;
    docentesAnon++;
  }
}

// 3. Usuarios (conservar cuenta administrativa 'admin')
if (Array.isArray(t.users)) {
  for (const u of t.users) {
    if (u.usuario && u.usuario.toLowerCase() === 'admin') {
      u.nombre = 'Administrador del Sistema';
      u.correo = 'admin@ejemplo.edu';
      continue;
    }
    const sufijo = u.id ? u.id.replace(/^USR-/, '') : String(usuariosAnon + 1);
    u.nombre = `Usuario ${sufijo}`;
    if (u.usuario) u.usuario = `usuario_${sufijo.toLowerCase()}`;
    if (u.correo) u.correo = `usuario.${sufijo.toLowerCase()}@ejemplo.edu`;
    usuariosAnon++;
  }
}

// 4. Observaciones: anonimizar texto si menciona nombres
if (Array.isArray(t.observations)) {
  for (const obs of t.observations) {
    if (obs.titulo) {
      obs.titulo = obs.titulo.replace(/estudiante\s+[A-Za-zÁ-ÿ]+/gi, 'estudiante');
    }
  }
}

seed.anonimizado = true;
seed.fechaAnonimizacion = new Date().toISOString();

fs.writeFileSync(rutaSalida, JSON.stringify(seed, null, 1), 'utf8');

console.log(`\nAnonimización completada exitosamente:`);
console.log(`  - Estudiantes anonimizados: ${estudiantesAnon}`);
console.log(`  - Docentes anonimizados: ${docentesAnon}`);
console.log(`  - Usuarios anonimizados: ${usuariosAnon}`);
console.log(`  - Archivo de salida: ${rutaSalida}\n`);
