@echo off
cls
color 0A
title Menu Principal - Iniciando...

echo.
echo ===============================================
echo      MENU PRINCIPAL - SISTEMA DE INICIO
echo ===============================================
echo.

echo [PASSO 1/5] Limpando processos antigos...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| find ":4000" ^| find "LISTENING"') do (
    echo   Fechando processo na porta 4000...
    taskkill /F /PID %%a 2>nul
)

for /f "tokens=5" %%a in ('netstat -ano ^| find ":3000" ^| find "LISTENING"') do (
    echo   Fechando processo na porta 3000...
    taskkill /F /PID %%a 2>nul
)

timeout /t 2 >nul

echo.
echo [PASSO 2/5] Verificando pastas...
echo.

if not exist "%~dp0backend" (
    echo   ERRO: Pasta backend nao encontrada!
    pause
    exit /b 1
)

if not exist "%~dp0frontend" (
    echo   ERRO: Pasta frontend nao encontrada!
    pause
    exit /b 1
)

echo   OK - Pastas encontradas
echo.

echo [PASSO 3/5] Iniciando Backend (porta 4000)...
cd /d "%~dp0backend"
start "Menu Principal - Backend" cmd /k "color 02 && title Menu Principal Backend && npm start"

echo   Backend iniciado em nova janela
timeout /t 4 >nul

echo.
echo [PASSO 4/5] Iniciando Frontend (porta 3000)...
cd /d "%~dp0frontend"
start "Menu Principal - Frontend" cmd /k "color 03 && title Menu Principal Frontend && npm run dev"

echo   Frontend iniciado em nova janela
timeout /t 5 >nul

echo.
echo [PASSO 5/5] Abrindo navegador...
start http://localhost:3000
echo   Navegador aberto

echo.
echo ===============================================
echo       SERVIDORES INICIADOS COM SUCESSO!
echo ===============================================
echo.
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:4000
echo.
echo   Rede Local: http://192.168.1.70:3000
echo.
echo ===============================================
echo   ATENCAO: Nao feche as janelas do CMD!
echo ===============================================
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
