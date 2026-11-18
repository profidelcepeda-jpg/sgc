import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'http';
import { app } from './app';

describe('API Smoke & Health Tests (app.ts)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/health responde 200 con metadatos del servicio', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      servicio: 'sga-backend',
      version: '0.1.0',
    });
  });

  it('GET /api/health/db responde con estado de la base de datos sin filtrar errores crudos', async () => {
    const res = await fetch(`${baseUrl}/api/health/db`);
    expect([200, 503]).toContain(res.status);
    const body = await res.json();
    if (res.status === 200) {
      expect(body).toEqual({ ok: true, db: 'connected' });
    } else {
      expect(body).toEqual({ ok: false, db: 'unavailable', error: 'Base de datos no disponible.' });
    }
  });

  it('Ruta inexistente responde 404', async () => {
    const res = await fetch(`${baseUrl}/api/ruta-que-no-existe`);
    expect(res.status).toBe(404);
  });
});
