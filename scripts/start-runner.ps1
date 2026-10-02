param([string]$RunnerDirectory = 'D:\Cursos\.tools\github-runner-container-cicd-lab')
$ErrorActionPreference = 'Stop'
$runnerRoot = [IO.Path]::GetFullPath($RunnerDirectory)
$registration = Join-Path $runnerRoot '.runner'
if (-not (Test-Path -LiteralPath $registration)) { throw 'El runner todavía no está registrado' }
$settings = Get-Content -LiteralPath $registration -Raw | ConvertFrom-Json
if ($settings.gitHubUrl -ne 'https://github.com/jorgefprietol/container-cicd-lab') { throw 'Runner de otro repositorio' }
$listenerPath = Join-Path $runnerRoot 'bin\Runner.Listener.exe'
$existing = Get-CimInstance Win32_Process -Filter "Name = 'Runner.Listener.exe'" | Where-Object { $_.ExecutablePath -eq $listenerPath }
if ($existing) { Write-Host 'El runner ya está activo'; return }
$process = Start-Process -FilePath 'cmd.exe' -ArgumentList '/d', '/c', 'run.cmd' -WorkingDirectory $runnerRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runnerRoot 'runner.stdout.log') -RedirectStandardError (Join-Path $runnerRoot 'runner.stderr.log') -PassThru
[IO.File]::WriteAllText((Join-Path $runnerRoot 'launcher.pid'), [string]$process.Id)
Write-Host ('Runner iniciado en segundo plano. PID: ' + $process.Id)
