@echo off
chcp 65001 >nul
title Menu Principal - Parando...

echo ========================================
echo   MENU PRINCIPAL - PARANDO
echo ========================================
echo.

echo Fechando processos...

REM Fecha porta 4000 (backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000') do (
    echo Fechando Backend (porta 4000)
    taskkill /F /PID %%a >nul 2>&1
)

REM Fecha porta 3000 (frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    echo Fechando Frontend (porta 3000)
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ========================================
echo   SERVIDORES PARADOS!
echo ========================================
echo.
timeout /t 2 /nobreak >nul
