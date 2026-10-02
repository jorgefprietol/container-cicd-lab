# Container CI/CD Lab

[![CI](https://github.com/jorgefprietol/container-cicd-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/jorgefprietol/container-cicd-lab/actions/workflows/ci.yml)

Proyecto independiente de contenerización y entrega de software. Incluye una API de cotizaciones en TypeScript, Docker multietapa, CI en GitHub, imágenes en GHCR y CD hacia Docker Desktop en la laptop Windows del propietario.

## Ejecutar con Docker

```powershell
git clone https://github.com/jorgefprietol/container-cicd-lab.git
cd container-cicd-lab
docker compose up --build -d --wait
Invoke-RestMethod http://127.0.0.1:8089/health/ready
```

La instancia de desarrollo usa **8089**. La instancia desplegada por Actions usa **8088** y un proyecto Compose separado. Ambas escuchan únicamente en loopback.

```powershell
$requestBody = @{
  lines = @(@{ unitPriceCents = 2000; quantity = 2 })
  discountBasisPoints = 1000
} | ConvertTo-Json -Depth 4
Invoke-RestMethod http://127.0.0.1:8089/api/v1/quotes -Method Post -ContentType application/json -Body $requestBody
```

El resultado es USD 36,00: subtotal de 4.000 centavos y descuento de 400 centavos. [Contrato HTTP](docs/api.md).

## Desarrollo y verificaciones

Node.js 22 o superior, npm, PowerShell 7 y Docker Desktop con contenedores Linux.

```powershell
npm ci --ignore-scripts
npm run verify
pwsh -NoProfile -File tests/deploy-local.test.ps1
docker build -t container-cicd-lab:local .
node scripts/container-test.mjs container-cicd-lab:local
```

`npm run verify` comprueba formato, lint, tipos y cobertura. Los umbrales son 90% de líneas y funciones, y 85% de ramas. Se mide dominio y HTTP; el arranque de proceso se verifica en la prueba del contenedor, incluyendo SIGTERM.

## Pipeline

1. **quality**: instalación desde lockfile, formato, ESLint, tipos, pruebas, cobertura, auditoría npm y validación de workflows con actionlint.
2. **container**: construye una imagen `linux/amd64`, prueba el contenedor real, bloquea vulnerabilidades altas o críticas y genera un SBOM SPDX.
3. **publish**: recupera y verifica la imagen ya probada, la publica sin reconstruir en GHCR y firma procedencia y SBOM con GitHub OIDC.
4. **Controlador privado**: `container-cicd-lab-deploy` comprueba CI exitoso en `main`, verifica la firma y el commit, despliega por digest y ejecuta readiness y una prueba funcional. Si falla, restaura la versión previa.

Los pull requests ejecutan únicamente CI en runners de GitHub. No publican imágenes ni despliegan en la laptop. Las imágenes se etiquetan `sha-<commit completo>`; los tags `vX.Y.Z` agregan una etiqueta de versión y deben apuntar a la historia de `main`. El despliegue utiliza `@sha256:...`, nunca una etiqueta mutable.

## Operación local

```powershell
# Estado y logs de la aplicación entregada por Actions
docker compose -f compose.deploy.yaml --env-file "$env:LOCALAPPDATA\container-cicd-lab\candidate.env" ps
Invoke-RestMethod http://127.0.0.1:8088/health/ready
npm run smoke

# Reiniciar el runner después de reiniciar Windows
# Desde el checkout privado container-cicd-lab-deploy
./scripts/start-runner.ps1
# Detener la recepción de trabajos
./scripts/stop-runner.ps1
```

El runner está registrado exclusivamente en el repositorio privado `container-cicd-lab-deploy`. El código público usa únicamente runners de GitHub. El runner privado se ejecuta como proceso oculto bajo la cuenta del usuario; no se instala como servicio ni como tarea de inicio. Docker Desktop y el runner deben estar activos para recibir despliegues. El contenedor tiene `restart: unless-stopped` y vuelve a arrancar cuando Docker Desktop está disponible.

[Arquitectura y decisiones](docs/architecture.md) · [Pipeline y mantenimiento](docs/pipeline.md) · [Despliegue, rollback y runner](docs/operations.md) · [Verificación](docs/verification.md).
