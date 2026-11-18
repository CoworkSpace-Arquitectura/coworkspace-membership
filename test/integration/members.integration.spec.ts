import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/setup-app.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

/** Integración: registro y verificación de contraseña contra PostgreSQL real (bcrypt incluido). */
describe('Miembros (integración con la base de datos)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `prueba-${randomUUID()}@example.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.member.deleteMany({ where: { email } });
    await app.close();
  });

  it('registra un miembro guardando la contraseña cifrada y sin devolverla', async () => {
    const res = await request(app.getHttpServer())
      .post('/members')
      .send({ name: 'Ana Prueba', email, password: 'contrasena-segura' })
      .expect(201);

    expect(res.body).toMatchObject({ email, role: 'MEMBER' });
    expect(res.body).not.toHaveProperty('passwordHash');

    const stored = await prisma.member.findUniqueOrThrow({ where: { email } });
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/); // hash de bcrypt
    expect(stored.passwordHash).not.toContain('contrasena-segura');
  });

  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const ok = await request(app.getHttpServer())
      .post('/internal/auth/verify')
      .send({ email, password: 'contrasena-segura' })
      .expect(200);
    expect(ok.body).toMatchObject({ email, role: 'MEMBER' });

    await request(app.getHttpServer())
      .post('/internal/auth/verify')
      .send({ email, password: 'otra-contrasena' })
      .expect(401);
  });

  it('no permite dos cuentas con el mismo correo', async () => {
    await request(app.getHttpServer())
      .post('/members')
      .send({ name: 'Copia', email, password: 'contrasena-segura' })
      .expect(409);
  });

  it('publica la documentación de la API (OpenAPI)', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(res.body.openapi).toBeDefined();
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(0);
  });
});
