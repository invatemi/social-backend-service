# Applies Prisma migrations and seeds roles for local Docker Compose.
# Run after: docker compose up -d  (services healthy)
# Usage: .\scripts\bootstrap-db.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$services = @(
    "social-auth-service",
    "social-user-service",
    "social-post-service",
    "social-message-service",
    "social-notifications-service"
)

foreach ($service in $services) {
    Write-Host "==== migrate $service ===="
    docker compose exec -T $service npx prisma migrate deploy
}

Write-Host "==== seed roles (auth_db) ===="
docker compose exec -T auth-db psql -U postgres -d auth_db -c @"
INSERT INTO roles (id, name) VALUES
  (1, 'admin'), (2, 'moderator'), (3, 'user'), (4, 'guest')
ON CONFLICT (id) DO NOTHING;
"@

Write-Host "==== seed roles (users_db) ===="
docker compose exec -T user-db psql -U postgres -d users_db -c @"
INSERT INTO roles (id, name) VALUES
  (1, 'admin'), (2, 'moderator'), (3, 'user'), (4, 'guest')
ON CONFLICT (id) DO NOTHING;
"@

Write-Host ""
Write-Host "Done. Smoke check: http://127.0.0.1:8088/api/auth/health"
