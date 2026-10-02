# Contrato HTTP

| Método     | Ruta             | Resultado                             |
| ---------- | ---------------- | ------------------------------------- |
| GET        | `/`              | Servicio, revisión y endpoints        |
| GET / HEAD | `/health/live`   | 200 si el proceso responde            |
| GET / HEAD | `/health/ready`  | 200 listo; 503 durante cierre         |
| POST       | `/api/v1/quotes` | Cotización en centavos USD            |
| GET        | `/metrics`       | Contador Prometheus por ruta y estado |

Las respuestas incluyen `x-request-id`, `cache-control: no-store`, `x-content-type-options: nosniff` y una política CSP restrictiva. Un request ID recibido se acepta solo si tiene entre 1 y 80 caracteres alfanuméricos, guion o guion bajo. En otro caso se genera un UUID. Los logs JSON no incluyen el cuerpo de la petición.

## Cotización

```json
{
  "lines": [{ "unitPriceCents": 2000, "quantity": 2 }],
  "discountBasisPoints": 1000
}
```

```json
{
  "subtotalCents": 4000,
  "discountCents": 400,
  "totalCents": 3600,
  "currency": "USD"
}
```

`lines` contiene entre 1 y 100 productos. `unitPriceCents` es un entero de 0 a 1.000.000.000 y `quantity` de 1 a 1.000. `discountBasisPoints` es opcional, por defecto cero, y admite enteros de 0 a 10.000. Un punto básico equivale a 0,01%; 1.000 equivale al 10%. El descuento se redondea sobre el subtotal con medio centavo hacia arriba. Los campos desconocidos se rechazan.

Se exige `Content-Type: application/json` y un cuerpo de hasta 16 KiB. Errores: 400 JSON o datos inválidos, 404 ruta inexistente, 405 método no permitido, 413 cuerpo excesivo, 415 tipo de contenido incorrecto, 503 servicio cerrándose. La respuesta tiene forma `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`.

La API es stateless y de cálculo: no guarda clientes, pedidos ni pagos. No necesita una base de datos o secretos de aplicación. Las métricas usan una etiqueta `unmatched` para rutas desconocidas, evitando cardinalidad arbitraria.
