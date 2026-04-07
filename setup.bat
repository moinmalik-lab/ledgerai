@echo off
title LedgerAI Setup
cd /d "%~dp0"
echo.
echo  ================================
echo   LedgerAI - First Time Setup
echo  ================================
echo.

echo [1/2] Installing dependencies (no Python or Visual Studio required)...
call npm install
if %errorlevel% neq 0 (
  echo.
  echo ERROR: npm install failed. Make sure Node.js is installed from https://nodejs.org
  pause
  exit /b 1
)

echo.
echo [2/2] Setting up API key...
if not exist .env (
  copy .env.example .env >/dev/null
  echo.
  echo  Your .env file has been created.
  echo  Please add your Gemini API key to it now.
  echo  Get a free key at: https://aistudio.google.com/apikey
  echo.
  echo  Opening .env in Notepad...
  start notepad .env
) else (
  echo  .env already exists - skipping.
)

echo.
echo  Setup complete! Run start.bat to launch LedgerAI.
echo.
pause
