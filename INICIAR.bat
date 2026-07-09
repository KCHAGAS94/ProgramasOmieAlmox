@echo off
REM ==================================================================
REM   INICIAR_SUPERVISOR.bat
REM   Sobe o sistema em LOOP. Quando o painel Configuracoes pede
REM   reinicio, o servidor grava "restart.flag" e encerra; este
REM   script ve o flag, apaga, libera as portas e sobe de novo
REM   (carregando o codigo novo). Sem acentos / ASCII puro de proposito.
REM ==================================================================
cd /d "%~dp0"
cls

REM Marca que o sistema esta supervisionado (o backend so permite
REM reinicio remoto quando esta variavel vale 1).
set SISTEMA_SUPERVISOR=1

echo ====================================================
echo   PROGRAMAS OMIE - MODO SUPERVISOR
echo   (reinicio remoto habilitado)
echo ====================================================
echo.

REM ---- Instala dependencias se faltar (inclui adm-zip e multer) ----
set NEED_INSTALL=0
if not exist "node_modules" set NEED_INSTALL=1
if not exist "node_modules\tailwindcss" set NEED_INSTALL=1
if not exist "node_modules\lucide-react" set NEED_INSTALL=1
if not exist "node_modules\@tailwindcss\vite" set NEED_INSTALL=1
if not exist "node_modules\better-sqlite3" set NEED_INSTALL=1
if not exist "node_modules\adm-zip" set NEED_INSTALL=1
if not exist "node_modules\multer" set NEED_INSTALL=1

if %NEED_INSTALL%==1 (
    echo Instalando/atualizando dependencias...
    echo Isso pode demorar 2-5 minutos.
    echo.
    call npm install
    cls
    echo Instalacao concluida!
    echo.
)

:loop

REM ---- Se um update mudou dependencias, reinstala antes de subir ----
if exist "npm-install.flag" (
    echo.
    echo Mudanca em dependencias detectada. Rodando npm install...
    del /f /q "npm-install.flag" >nul 2>&1
    call npm install
    echo.
)

REM ---- Remove flag de reinicio antigo, se houver ----
if exist "restart.flag" del /f /q "restart.flag" >nul 2>&1

REM ---- Libera portas presas de execucao anterior ----
echo Liberando portas...
for %%P in (3000 3001 3002 3003 3004 3005 3007 3008 3009 3011 4000) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
        taskkill /F /PID %%a >nul 2>&1
    )
)

REM ---- Limpa cache do Vite ----
if exist "node_modules\.vite" rd /s /q "node_modules\.vite" >nul 2>&1

REM ---- Pequena espera para as portas liberarem ----
timeout /t 2 /nobreak >nul

echo.
echo ====================================================
echo   Iniciando servidores...
echo ====================================================
echo   Menu Principal:          http://localhost:3000
echo   Programa Separador:      http://localhost:3001
echo   Programa Recebimento:    http://localhost:3002
echo   Separador OP:            http://localhost:3003
echo   Separador Remessa:       http://localhost:3004
echo   Gestao de Estoque:       http://localhost:3005
echo   Programa Inventario:     http://localhost:3007
echo   Programas Auxiliares:    http://localhost:3008
echo   Requisicao de Material:  http://localhost:3011
echo   Relatorio:               http://localhost:3009
echo.
echo   Para parar de vez: feche esta janela ou Ctrl+C
echo ====================================================
echo.

REM ---- Sobe todos os servidores (bloqueante) ----
call npm start

REM ---- Quando chega aqui, o npm start terminou ----
REM Se existe restart.flag, foi um pedido de reinicio: volta ao loop.
if exist "restart.flag" (
    echo.
    echo ====================================================
    echo   REINICIO SOLICITADO - subindo novamente...
    echo ====================================================
    del /f /q "restart.flag" >nul 2>&1
    timeout /t 2 /nobreak >nul
    goto loop
)

echo.
echo ====================================================
echo   Sistema encerrado.
echo ====================================================
pause
