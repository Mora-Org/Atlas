# ================================================
# Dynamic CMS - Pre-Commit Test Runner
# ================================================
# Usage: .\run_tests.ps1
# Run this before every commit to validate changes.
# ================================================

Write-Host "`n🧪 Running test suite..." -ForegroundColor Cyan
Write-Host "========================`n" -ForegroundColor DarkGray

Push-Location "$PSScriptRoot\backend"

# Run pytest with verbose output
python -m pytest tests/ -v --tb=short

$exitCode = $LASTEXITCODE

# Cleanup test artifacts
Write-Host "`n🧹 Cleaning up test artifacts..." -ForegroundColor Yellow
Remove-Item -Path "test_temp.db" -ErrorAction SilentlyContinue
Remove-Item -Path "tests\test_temp.db" -ErrorAction SilentlyContinue
Remove-Item -Path "tests\__pycache__" -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path "__pycache__" -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path ".pytest_cache" -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path "tests\.pytest_cache" -Recurse -ErrorAction SilentlyContinue

Pop-Location

if ($exitCode -eq 0) {
    Write-Host "`n✅ All tests passed! Safe to commit." -ForegroundColor Green
} else {
    Write-Host "`n❌ Tests failed! Fix the issues before committing." -ForegroundColor Red
}

exit $exitCode
