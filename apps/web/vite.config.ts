import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Until the backend lands packages/contracts and packages/stdb-bindings, these
// aliases point at local shims. Repoint them (here AND in tsconfig.json paths)
// to ../../packages/* once those exist; no app code should need to change.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ch4se/contracts/format': r('./src/contracts-shim/format.ts'),
      '@ch4se/contracts': r('./src/contracts-shim/index.ts'),
      '@ch4se/stdb-bindings': r('./src/contracts-shim/stdb-bindings.ts'),
    },
  },
  server: { port: 5173 },
});
