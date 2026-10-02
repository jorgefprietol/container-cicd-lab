# Despliegue en la laptop y operación

## Runner dedicado

El runner pertenece exclusivamente a `jorgefprietol/container-cicd-lab`, con etiqueta `container-cicd-lab-local`. En esta laptop se instala fuera del repositorio, en `D:\Cursos\.tools\github-runner-container-cicd-lab`. Sus credenciales y archivos `.runner` / `.credentials` nunca se suben a GitHub.

Se ejecuta como proceso oculto, bajo el usuario que usa Docker Desktop. Tras reiniciar Windows, abre Docker Desktop y ejecuta `scripts/start-runner.ps1`. `scripts/stop-runner.ps1` detiene solo los ejecutables de esa instalación; el servicio desplegado sigue en Docker.

GitHub recomienda runners propios en repositorios privados por el riesgo de que un pull request modifique un workflow para ejecutar código en el equipo. Aquí el repositorio es público por elección del propietario: se exige aprobación para todos los contribuidores externos, CI usa runners de GitHub y el despliegue local solo se activa desde main o por ejecución manual autorizada. Antes de aprobar un workflow externo, revisa cambios en `runs-on`, eventos, permisos y scripts. [Referencia oficial](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners).

## Estado

El estado estable se guarda fuera del checkout del runner, en `%LOCALAPPDATA%\container-cicd-lab`:

- `deployed-image.txt`: digest desplegado correctamente.
- `previous-image.txt`: última imagen estable reemplazada.
- `candidate.env` y `rollback.env`: referencias de Compose sin credenciales.
- `deploy.lock`: bloqueo de archivos para impedir despliegues locales simultáneos.

La configuración de registro de cada job se guarda en un `DOCKER_CONFIG` temporal. Al terminar se elimina exclusivamente esa carpeta, sin modificar el login de Docker del usuario.

## Verificar y consultar logs

```powershell
Invoke-RestMethod http://127.0.0.1:8088/health/ready
Invoke-RestMethod http://127.0.0.1:8088/metrics
docker compose -f compose.deploy.yaml --env-file "$env:LOCALAPPDATA\container-cicd-lab\candidate.env" logs --tail 100
gh run list --repo jorgefprietol/container-cicd-lab --limit 5
```

Si el runner está offline, GitHub conserva el trabajo en cola. Si Docker Desktop no está disponible, el job falla sin afirmar un despliegue exitoso. Rehabilita Docker y el runner y vuelve a ejecutar el job.

## Rollback manual

Abre **Actions → Deploy local laptop → Run workflow**, elige `main` e introduce el digest anterior, `sha256:...`. El workflow verifica la attestation y despliega ese mismo artefacto sin reconstruirlo.

```powershell
$previousImage = Get-Content "$env:LOCALAPPDATA\container-cicd-lab\previous-image.txt" -Raw
$digest = $previousImage.Trim().Split('@')[1]
gh workflow run deploy-local.yml --repo jorgefprietol/container-cicd-lab --ref main -f "digest=$digest"
```

Si un despliegue nuevo pasa el pull pero falla al arrancar o en la operación de prueba, el script vuelve al digest estable. En una primera instalación fallida retira únicamente el proyecto Compose de este laboratorio. Conserva el error como fallo del pipeline incluso si el rollback funciona.

## Apagar el laboratorio

```powershell
./scripts/stop-runner.ps1
docker compose -f compose.deploy.yaml --env-file "$env:LOCALAPPDATA\container-cicd-lab\candidate.env" down
```

Estos comandos actúan sobre este runner y este proyecto Compose. No eliminan imágenes ni otros proyectos de Docker.
