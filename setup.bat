@echo off
chcp 65001 >nul
echo.
echo ╔══════════════════════════════════════╗
echo ║     J.A.R.V.I.S  Windows Kurulum    ║
echo ╚══════════════════════════════════════╝
echo.

REM Python kontrolü
python --version >nul 2>&1
if errorlevel 1 (
    echo [HATA] Python bulunamadi. python.org adresinden Python 3.10+ yukle.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do echo [OK] %%i

REM Virtual environment
if not exist "venv" (
    echo [*] Virtual environment olusturuluyor...
    python -m venv venv
)

call venv\Scripts\activate.bat

REM API key dosyası
if not exist "config\api_keys.json" (
    copy "config\api_keys.example.json" "config\api_keys.json" >nul
    echo [*] config\api_keys.json olusturuldu — Gemini API anahtarini buraya gir
)

echo [*] Paketler yukleniyor...
pip install --upgrade pip -q
pip install -r requirements.txt -q

REM React arayuzunun Edge WebView2 calisma zamanini kontrol et
set "WEBVIEW2_FOUND="
for /d %%D in ("%ProgramFiles(x86)%\Microsoft\EdgeWebView\Application\*") do (
    if exist "%%~D\msedgewebview2.exe" set "WEBVIEW2_FOUND=1"
)
for /d %%D in ("%ProgramFiles%\Microsoft\EdgeWebView\Application\*") do (
    if exist "%%~D\msedgewebview2.exe" set "WEBVIEW2_FOUND=1"
)
for /d %%D in ("%LOCALAPPDATA%\Microsoft\EdgeWebView\Application\*") do (
    if exist "%%~D\msedgewebview2.exe" set "WEBVIEW2_FOUND=1"
)
if not defined WEBVIEW2_FOUND (
    echo [HATA] Microsoft Edge WebView2 Runtime bulunamadi.
    echo JARVIS'in React masaustu arayuzu icin WebView2 gereklidir.
    echo Kurulum sayfasi: https://developer.microsoft.com/microsoft-edge/webview2/
    start "" "https://developer.microsoft.com/microsoft-edge/webview2/"
    pause
    exit /b 1
)
echo [OK] Microsoft Edge WebView2 Runtime bulundu.

echo.
echo ╔══════════════════════════════════════╗
echo ║         Kurulum Tamamlandi!          ║
echo ╚══════════════════════════════════════╝
echo.
echo JARVIS'i baslatmak icin:
echo   venv\Scripts\activate.bat
echo   python main.py
echo Node.js, hazir React arayuzunu calistirmak icin gerekmez.
echo.
set /p choice="Simdi baslatilsin mi? (e/h): "
if /i "%choice%"=="e" python main.py
