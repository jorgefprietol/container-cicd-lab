import { createApp } from './http/app.js';

const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT inválido');
const revision = process.env.APP_REVISION ?? 'development';
const app = createApp({ revision, logger: (entry) => console.log(JSON.stringify(entry)) });
app.server.listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'started', port, revision }));
});
let closing = false;
function shutdown(): void {
  if (closing) return;
  closing = true;
  app.setReady(false);
  console.log(JSON.stringify({ event: 'shutdown' }));
  const deadline = setTimeout(() => {
    app.server.closeAllConnections();
    process.exit(1);
  }, 8_000);
  deadline.unref();
  app.server.close(() => {
    clearTimeout(deadline);
  });
  app.server.closeIdleConnections();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
