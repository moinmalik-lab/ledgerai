@echo off
title LedgerAI
cd /d "%~dp0"
if not exist .env (
  echo ERROR: .env file not found. Please run setup.bat first.
  pause
  exit /b 1
)
if not exist node_modules (
  echo ERROR: Dependencies not installed. Please run setup.bat first.
  pause
  exit /b 1
)
npm run electron
