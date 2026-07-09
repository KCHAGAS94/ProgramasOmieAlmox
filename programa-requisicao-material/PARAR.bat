@echo off
chcp 65001 >nul
title Requisição de Material - Parando...

echo ========================================
echo   REQUISIÇÃO DE MATERIAL - PARANDO
echo ========================================
echo.

echo Fechando processos...

REM Fecha porta 4011 (backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4011') do (
    echo Fechando Backend (porta 4011)
    taskkill /F /PID %%a >nul 2>&1
)

REM Fecha porta 3011 (frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3011') do (
    echo Fechando Frontend (porta 3011)
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ========================================
echo   SERVIDORES PARADOS!
echo ========================================
echo.
timeout /t 2 /nobreak >nul
