// The lifecycle against a real SpacetimeDB module. Needs a running instance
// and a CLEAN database; `make e2e` republishes one and sets the variables.
//
//   CH4SE_E2E=1 SPACETIMEDB_URI=ws://127.0.0.1:3000 SPACETIMEDB_DATABASE=ch4se-test
import { test } from 'node:test';
import { connectStdbStore } from '../src/store-stdb.ts';
import { runLifecycle } from './lifecycle.ts';

test('lifecycle against SpacetimeDB', { skip: process.env.CH4SE_E2E !== '1' }, async () => {
  const store = await connectStdbStore({
    uri: process.env.SPACETIMEDB_URI ?? 'ws://127.0.0.1:3000',
    databaseName: process.env.SPACETIMEDB_DATABASE ?? 'ch4se-test',
  });
  try {
    await runLifecycle(store);
  } finally {
    store.close();
  }
});
