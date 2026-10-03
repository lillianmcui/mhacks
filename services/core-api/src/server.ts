import { createActions } from './actions.ts';
import { loadConfig } from './config.ts';
import { createHttpServer } from './http.ts';
import { loadPorts } from './ports.ts';
import { connectStdbStore } from './store-stdb.ts';
import { createStubStore, stubPorts } from './stub.ts';

const log = (message: string) => console.log(`[core-api] ${message}`);

const config = loadConfig();
if (config.token === '') {
  console.error('[core-api] CORE_API_TOKEN is not set. Copy .env.example to .env and set it.');
  process.exit(1);
}

let connected = true;
const store =
  config.mode === 'stub'
    ? await createStubStore(config.matchRadiusM)
    : await connectStdbStore({
        uri: config.stdbUri,
        databaseName: config.stdbDatabase,
        token: config.stdbToken,
        // The cache is stale once the socket drops; restart rather than serve it.
        onDisconnect: error => {
          connected = false;
          console.error(`[core-api] SpacetimeDB disconnected${error ? `: ${error.message}` : ''}; exiting`);
          process.exit(1);
        },
      }).catch((error: unknown) => {
        console.error(
          `[core-api] cannot reach SpacetimeDB database "${config.stdbDatabase}" at ${config.stdbUri}: ` +
            `${error instanceof Error ? error.message : String(error)}\n` +
            '           Start it (make db), publish the module (make publish), or run the stub (make stub).'
        );
        process.exit(1);
      });

const ports = config.mode === 'stub' ? stubPorts : await loadPorts(config);
const server = createHttpServer({
  actions: createActions({ store, ports, log }),
  token: config.token,
  corsOrigin: config.corsOrigin,
  health: () => ({ mode: config.mode, spacetimedb: config.mode === 'stub' ? 'not used' : connected, adapters: ports.describe }),
  log,
});

server.listen(config.port, config.host, () => {
  log(`mode=${config.mode} listening on http://${config.host}:${config.port}`);
  log(`template: ${ports.describe.template} | grok: ${ports.describe.grok} | relay: ${ports.describe.relay}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    store.close();
    process.exit(0);
  });
}
