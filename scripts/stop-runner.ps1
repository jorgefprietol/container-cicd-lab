param([string]$RunnerDirectory = 'D:\Cursos\.tools\github-runner-container-cicd-lab')
$ErrorActionPreference = 'Stop'
$runnerRoot = [IO.Path]::GetFullPath($RunnerDirectory)
$settings = Get-Content -LiteralPath (Join-Path $runnerRoot '.runner') -Raw | ConvertFrom-Json
if ($settings.gitHubUrl -ne 'https://github.com/jorgefprietol/container-cicd-lab') { throw 'Runner de otro repositorio' }
$allowedPaths = @((Join-Path $runnerRoot 'bin\Runner.Listener.exe'), (Join-Path $runnerRoot 'bin\Runner.Worker.exe'))
$runnerProcesses = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -in $allowedPaths }
foreach ($runnerProcess in $runnerProcesses) { Stop-Process -Id $runnerProcess.ProcessId }
Write-Host 'Runner detenido; los contenedores de la aplicación permanecen activos'
