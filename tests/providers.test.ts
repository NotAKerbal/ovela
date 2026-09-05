/// <reference types="vite/client" />
import { afterEach, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { internal } from '../convex/_generated/api';
const modules = import.meta.glob('../convex/**/*.ts');
afterEach(() => vi.unstubAllEnvs());
it('connects the empty Photos tile and updates only the bundled provider on redeploy', async () => {
  vi.stubEnv('IMMICH_URL', 'http://localhost:2283');
  const t = convexTest(schema, modules);
  const id = await t.run(ctx => ctx.db.insert('applications', { name: 'Photos', description: '', url: '', icon: 'photos', color: '', ink: '' }));
  await t.mutation(internal.providers.configureImmich, {});
  expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ provider: 'immich', url: 'http://localhost:2283' });
  vi.stubEnv('IMMICH_URL', 'https://photos.example.com');
  await t.mutation(internal.providers.configureImmich, {});
  expect(await t.run(ctx => ctx.db.query('applications').collect())).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ url: 'https://photos.example.com' });
});
it('preserves an existing custom Photos destination', async () => {
  vi.stubEnv('IMMICH_URL', 'http://localhost:2283');
  const t = convexTest(schema, modules);
  const id = await t.run(ctx => ctx.db.insert('applications', { name: 'Photos', description: '', url: 'https://existing.example.com', icon: 'photos', color: '', ink: '' }));
  await t.mutation(internal.providers.configureImmich, {});
  expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ url: 'https://existing.example.com' });
  expect(await t.run(ctx => ctx.db.query('applications').collect())).toHaveLength(2);
});
