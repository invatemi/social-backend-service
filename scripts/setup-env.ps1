# Копирует все .env.example → .env (если .env ещё не существует).
# Запуск:  .\scripts\setup-env.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$envFiles = @(
    @{ Example = ".env.example"; Target = ".env" },
    @{ Example = "services\auth-service\.env.example"; Target = "services\auth-service\.env" },
    @{ Example = "services\user-service\.env.example"; Target = "services\user-service\.env" },
    @{ Example = "services\post-service\.env.example"; Target = "services\post-service\.env" },
    @{ Example = "services\message-service\.env.example"; Target = "services\message-service\.env" },
    @{ Example = "services\notifications-service\.env.example"; Target = "services\notifications-service\.env" }
)

foreach ($file in $envFiles) {
    $examplePath = Join-Path $root $file.Example
    $targetPath = Join-Path $root $file.Target

    if (-not (Test-Path $examplePath)) {
        Write-Warning "Пропущено: $($file.Example) не найден"
        continue
    }

    if (Test-Path $targetPath) {
        Write-Host "Пропущено: $($file.Target) уже существует"
        continue
    }

    Copy-Item $examplePath $targetPath
    Write-Host "Создан: $($file.Target)"
}

Write-Host ""
Write-Host "Готово. Отредактируйте .env файлы и замените все replace-with-* значения на свои секреты."
