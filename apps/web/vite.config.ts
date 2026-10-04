import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The contracts and the generated SpacetimeDB bindings are the backend's
// packages, used from source. Keep these aliases in step with tsconfig.json
// paths. `spacetimedb` itself resolves from packages/stdb-bindings/node_modules,
// so run `make install` at the repo root first.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ch4se/contracts': r('../../packages/contracts/src/index.ts'),
      '@ch4se/stdb-bindings': r('../../packages/stdb-bindings/src/index.ts'),
    },
  },
  // The aliased packages live outside this app's root.
  server: { port: 5173, fs: { allow: [r('../..')] } },
});
