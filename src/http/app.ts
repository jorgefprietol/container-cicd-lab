import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { calculateQuote, InputError } from '../domain/quote.js';

const MAX_BODY_BYTES = 16_384;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface RequestLog {
  readonly event: 'request';
  readonly requestId: string;
  readonly method: string;
  readonly route: string;
  readonly status: number;
  readonly durationMs: number;
}

export interface AppOptions {
  readonly revision: string;
  readonly logger: (entry: RequestLog) => void;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    request.resume();
    throw new HttpError(415, 'unsupported_media_type', 'Utiliza application/json');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) {
      request.resume();
      throw new HttpError(413, 'payload_too_large', 'El cuerpo supera 16 KiB');
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'invalid_json', 'El cuerpo no contiene JSON válido');
  }
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

export function createApp(options: AppOptions) {
  let ready = true;
  const counts = new Map<string, number>();
  const routes = new Set(['/', '/health/live', '/health/ready', '/api/v1/quotes', '/metrics']);
  const server = createServer({ maxHeaderSize: 8_192 }, (request, response) => {
    void handle(request, response);
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.setTimeout(10_000, (socket) => socket.destroy());

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const started = performance.now();
    const incomingId = request.headers['x-request-id'];
    const requestId =
      typeof incomingId === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(incomingId)
        ? incomingId
        : randomUUID();
    const path = (request.url ?? '/').split('?')[0] ?? '/';
    const route = routes.has(path) ? path : 'unmatched';
    response.setHeader('x-request-id', requestId);
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    response.on('finish', () => {
      const key = `${route}:${response.statusCode}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      options.logger({
        event: 'request',
        requestId,
        method: request.method ?? 'UNKNOWN',
        route,
        status: response.statusCode,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
      });
    });

    try {
      if ((request.method === 'GET' || request.method === 'HEAD') && path === '/health/live') {
        return json(response, 200, { status: 'up', revision: options.revision });
      }
      if ((request.method === 'GET' || request.method === 'HEAD') && path === '/health/ready') {
        return json(response, ready ? 200 : 503, {
          status: ready ? 'ready' : 'draining',
          revision: options.revision,
        });
      }
      if (request.method === 'GET' && path === '/') {
        return json(response, 200, {
          service: 'container-cicd-lab',
          revision: options.revision,
          endpoints: ['/health/live', '/health/ready', '/api/v1/quotes', '/metrics'],
        });
      }
      if (request.method === 'GET' && path === '/metrics') {
        response.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
        const lines = [
          '# HELP http_requests_total Completed HTTP requests',
          '# TYPE http_requests_total counter',
        ];
        for (const [key, count] of counts) {
          const [name, status] = key.split(':');
          lines.push(`http_requests_total{route="${name}",status="${status}"} ${count}`);
        }
        response.end(lines.join('\n') + '\n');
        return;
      }
      if (request.method === 'POST' && path === '/api/v1/quotes') {
        if (!ready) throw new HttpError(503, 'unavailable', 'El servicio se está cerrando');
        const quote = calculateQuote(await readJson(request));
        return json(response, 200, quote);
      }
      request.resume();
      if (routes.has(path)) {
        response.setHeader(
          'allow',
          path === '/api/v1/quotes' ? 'POST' : path.startsWith('/health/') ? 'GET, HEAD' : 'GET',
        );
        throw new HttpError(405, 'method_not_allowed', 'Método no permitido');
      }
      throw new HttpError(404, 'not_found', 'Ruta no encontrada');
    } catch (error) {
      const failure =
        error instanceof HttpError
          ? error
          : error instanceof InputError
            ? new HttpError(400, 'invalid_input', error.message)
            : new HttpError(500, 'internal_error', 'Error interno');
      json(response, failure.status, {
        error: { code: failure.code, message: failure.message, requestId },
      });
    }
  }

  return {
    server,
    setReady(value: boolean) {
      ready = value;
    },
  };
}
