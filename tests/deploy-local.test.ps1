$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$global:deploymentTest = @{ Calls = [Collections.Generic.List[object]]::new(); FailHealth = $false; FailPull = $false; HasFailed = $false }
$revision = 'a' * 40
$image = 'ghcr.io/jorgefprietol/container-cicd-lab@sha256:' + ('b' * 64)
$previous = 'ghcr.io/jorgefprietol/container-cicd-lab@sha256:' + ('c' * 64)
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('container-cicd-deploy-test-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $testRoot | Out-Null
$deployScript = Join-Path $PSScriptRoot '..\scripts\deploy-local.ps1'

function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function global:docker {
  $global:LASTEXITCODE = 0
  $global:deploymentTest.Calls.Add(@($args))
  if ($args[0] -eq 'pull' -and $global:deploymentTest.FailPull) { $global:LASTEXITCODE = 1; return }
  if ($args[0] -eq 'image') {
    return '{"org.opencontainers.image.source":"https://github.com/jorgefprietol/container-cicd-lab","org.opencontainers.image.revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
  }
}
function global:Invoke-RestMethod {
  param($Uri, $Method, $ContentType, $Body, $TimeoutSec)
  if ($Uri -like '*/health/ready') {
    if ($global:deploymentTest.FailHealth -and -not $global:deploymentTest.HasFailed) {
      $global:deploymentTest.HasFailed = $true
      throw 'Candidate unhealthy'
    }
    return @{ status = 'ready'; revision = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
  }
  return @{ totalCents = 3600; currency = 'USD' }
}

try {
  $successState = Join-Path $testRoot 'success'
  & $deployScript -ImageRef $image -ExpectedRevision $revision -StateDirectory $successState
  Assert-True ((Get-Content -LiteralPath (Join-Path $successState 'deployed-image.txt') -Raw) -eq $image) 'No se registró el despliegue exitoso'

  $rollbackState = Join-Path $testRoot 'rollback'
  New-Item -ItemType Directory -Path $rollbackState | Out-Null
  [IO.File]::WriteAllText((Join-Path $rollbackState 'deployed-image.txt'), $previous)
  $global:deploymentTest.FailHealth = $true
  $global:deploymentTest.Calls.Clear()
  $failed = $false
  try { & $deployScript -ImageRef $image -ExpectedRevision $revision -StateDirectory $rollbackState } catch { $failed = $true }
  Assert-True $failed 'Un candidato enfermo debe fallar el pipeline'
  Assert-True ((Get-Content -LiteralPath (Join-Path $rollbackState 'deployed-image.txt') -Raw) -eq $previous) 'Rollback alteró la versión estable'
  $rollbackCalls = @($global:deploymentTest.Calls | Where-Object { ($_ -join ' ') -like '*rollback.env*up*' })
  Assert-True ($rollbackCalls.Count -eq 1) 'No se restauró la imagen anterior'

  $global:deploymentTest.HasFailed = $false
  $global:deploymentTest.Calls.Clear()
  $failed = $false
  try { & $deployScript -ImageRef $image -ExpectedRevision $revision -StateDirectory (Join-Path $testRoot 'first-failure') } catch { $failed = $true }
  Assert-True $failed 'Una primera instalación enferma debe fallar'
  $cleanupCalls = @($global:deploymentTest.Calls | Where-Object { ($_ -join ' ') -like '*candidate.env*down*' })
  Assert-True ($cleanupCalls.Count -eq 1) 'No se retiró la primera instalación fallida'

  $global:deploymentTest.FailPull = $true
  $global:deploymentTest.Calls.Clear()
  $failed = $false
  try { & $deployScript -ImageRef $image -StateDirectory (Join-Path $testRoot 'pull-failure') } catch { $failed = $true }
  Assert-True $failed 'Un pull fallido debe propagarse'
  Assert-True ($global:deploymentTest.Calls.Count -eq 1) 'Un pull fallido no debe tocar el contenedor'

  $global:deploymentTest.Calls.Clear()
  $failed = $false
  try { & $deployScript -ImageRef 'ghcr.io/other/app:latest' -StateDirectory $testRoot } catch { $failed = $true }
  Assert-True $failed 'Una imagen externa o mutable debe rechazarse'
  Assert-True ($global:deploymentTest.Calls.Count -eq 0) 'La validación debe ocurrir antes de Docker'
  $global:LASTEXITCODE = 0
  Write-Host '5 escenarios de despliegue OK: éxito, rollback, primer fallo, pull fallido y rechazo de referencia no confiable'
} finally {
  Remove-Item -LiteralPath Function:\docker -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath Function:\Invoke-RestMethod -ErrorAction SilentlyContinue
  $resolvedRoot = [IO.Path]::GetFullPath($testRoot)
  $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (-not $resolvedRoot.StartsWith($resolvedTemp) -or [IO.Path]::GetFileName($resolvedRoot) -notlike 'container-cicd-deploy-test-*') { throw 'Limpieza no permitida' }
  Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
}
