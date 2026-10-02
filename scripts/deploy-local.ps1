param(
  [Parameter(Mandatory = $true)][string]$ImageRef,
  [string]$ExpectedRevision = '',
  [string]$StateDirectory = (Join-Path $env:LOCALAPPDATA 'container-cicd-lab')
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($ImageRef -cnotmatch '^ghcr\.io/jorgefprietol/container-cicd-lab@sha256:[a-f0-9]{64}$') {
  throw 'Solo se despliegan imágenes de este repositorio por digest SHA256'
}
if ($ExpectedRevision -and $ExpectedRevision -cnotmatch '^[a-f0-9]{40}$') { throw 'Revisión inválida' }
$composeFile = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\compose.deploy.yaml'))
New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
$lockPath = Join-Path $StateDirectory 'deploy.lock'
$deployLock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
function Invoke-DockerChecked {
  param([string[]]$Arguments)
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw ('Docker falló: ' + ($Arguments -join ' ')) }
}
function Test-DeployedApi {
  param([string]$Revision)
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8088/health/ready' -TimeoutSec 5
  if ($health.status -ne 'ready') { throw 'El servicio no está listo' }
  if ($Revision -and $health.revision -ne $Revision) { throw 'El servicio no tiene la revisión esperada' }
  $body = '{"lines":[{"unitPriceCents":2000,"quantity":2}],"discountBasisPoints":1000}'
  $quote = Invoke-RestMethod -Uri 'http://127.0.0.1:8088/api/v1/quotes' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 5
  if ($quote.totalCents -ne 3600 -or $quote.currency -ne 'USD') { throw 'La prueba funcional del despliegue falló' }
}
try {
  $currentFile = Join-Path $StateDirectory 'deployed-image.txt'
  $previous = if (Test-Path -LiteralPath $currentFile) { (Get-Content -LiteralPath $currentFile -Raw).Trim() } else { '' }
  if ($previous -and $previous -cnotmatch '^ghcr\.io/jorgefprietol/container-cicd-lab@sha256:[a-f0-9]{64}$') {
    throw 'El estado de despliegue anterior no es válido'
  }
  Invoke-DockerChecked -Arguments @('pull', '--platform', 'linux/amd64', $ImageRef)
  # Docker Desktop con containerd puede devolver Config vacío al inspeccionar un digest.
  # Crear sin arrancar resuelve la configuración real sin ejecutar la aplicación.
  $probeName = 'container-cicd-preflight-' + [guid]::NewGuid().ToString('N')
  $probeCreated = $false
  try {
    Invoke-DockerChecked -Arguments @('create', '--platform', 'linux/amd64', '--name', $probeName, '--entrypoint', '/usr/bin/node', $ImageRef, '--version')
    $probeCreated = $true
    $labels = & docker container inspect $probeName --format '{{json .Config.Labels}}'
    if ($LASTEXITCODE -ne 0) { throw 'No se puede inspeccionar el contenedor de preflight' }
    $metadata = $labels | ConvertFrom-Json
  } finally {
    if ($probeCreated) { Invoke-DockerChecked -Arguments @('rm', $probeName) }
  }
  if ($metadata.'org.opencontainers.image.source' -ne 'https://github.com/jorgefprietol/container-cicd-lab') {
    throw 'La imagen no pertenece a este repositorio'
  }
  if ($ExpectedRevision -and $metadata.'org.opencontainers.image.revision' -ne $ExpectedRevision) {
    throw 'La imagen no corresponde al commit verificado por CI'
  }
  $candidateEnv = Join-Path $StateDirectory 'candidate.env'
  [IO.File]::WriteAllText($candidateEnv, "IMAGE_REF=$ImageRef`n")
  $composeArgs = @('compose', '--project-name', 'container-cicd-lab', '--file', $composeFile)
  try {
    Invoke-DockerChecked -Arguments ($composeArgs + @('--env-file', $candidateEnv, 'up', '-d', '--wait', '--wait-timeout', '60'))
    Test-DeployedApi -Revision $ExpectedRevision
    if ($previous -and $previous -ne $ImageRef) { [IO.File]::WriteAllText((Join-Path $StateDirectory 'previous-image.txt'), $previous) }
    [IO.File]::WriteAllText($currentFile, $ImageRef)
    Write-Host ('Desplegado: ' + $ImageRef + ' en http://127.0.0.1:8088')
  } catch {
    $deploymentFailure = $_
    if ($previous) {
      $rollbackEnv = Join-Path $StateDirectory 'rollback.env'
      [IO.File]::WriteAllText($rollbackEnv, "IMAGE_REF=$previous`n")
      Invoke-DockerChecked -Arguments ($composeArgs + @('--env-file', $rollbackEnv, 'up', '-d', '--wait', '--wait-timeout', '60'))
      Test-DeployedApi -Revision ''
      Write-Host ('Rollback completado: ' + $previous)
    } else {
      Invoke-DockerChecked -Arguments ($composeArgs + @('--env-file', $candidateEnv, 'down'))
    }
    throw $deploymentFailure
  }
} finally { $deployLock.Dispose() }
