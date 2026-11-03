@echo off
setlocal
cd /d "%~dp0"
if not exist "venv\Scripts\python.exe" (
    echo Python environment not found. Run the project setup first.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo Node.js / npm not found. Install Node.js to develop the React UI.
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo Installing React development packages...
    pushd frontend
    call npm ci
    if errorlevel 1 (
        popd
        pause
        exit /b 1
    )
    popd
)

start "Jarvis React UI" cmd /k "cd /d ""%~dp0frontend"" && npm run dev -- --strictPort"
set "JARVIS_UI_DEV_URL=http://127.0.0.1:5173"
echo Waiting for the React development server...
powershell -NoProfile -Command "$deadline=(Get-Date).AddSeconds(45); do { try { $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',5173); $c.Close(); exit 0 } catch { Start-Sleep -Milliseconds 400 } } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
    echo React development server did not start.
    pause
    exit /b 1
)

echo Starting Jarvis with React hot reload. Close both windows to stop development.
venv\Scripts\python.exe dev.py
