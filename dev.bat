@echo off
cd /d "%~dp0"
if not exist "venv\Scripts\python.exe" (
    echo Python environment not found. Run the project setup first.
    pause
    exit /b 1
)
venv\Scripts\python.exe dev.py
