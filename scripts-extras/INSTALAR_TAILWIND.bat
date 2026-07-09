@echo off
chcp 65001 >nul
title Instalando Tailwind CSS + Lucide React em todos os programas
color 0A

echo ============================================================
echo    INSTALACAO AUTOMATICA - Tailwind CSS + Lucide React
echo ============================================================
echo.

REM Movido para scripts-extras: BASE aponta para a raiz do projeto (um nivel acima).
set BASE=%~dp0..\

echo [1/8] Menu Principal...
cd /d "%BASE%menu-principal\frontend"
call npm install -D tailwindcss @tailwindcss/vite >nul 2>&1
call npm install lucide-react >nul 2>&1
if %ERRORLEVEL%==0 (echo    OK!) else (echo    ERRO!)

echo [2/8] Programa Estoque...
cd /d "%BASE%programa-estoque\frontend"
call npm install -D tailwindcss @tailwindcss/vite >nul 2>&1
call npm install lucide-react >nul 2>&1
if %ERRORLEVEL%==0 (echo    OK!) else (echo    ERRO!)

echo [3/8] Programas Auxiliares...
cd /d "%BASE%programas-auxiliares\frontend"
call npm install -D tailwindcss @tailwindcss/vite >nul 2>&1
call npm install lucide-react >nul 2>&1
if %ERRORLEVEL%==0 (echo    OK!) else (echo    ERRO!)

echo [4/8] Programa Requisicao Material...
cd /d "%BASE%programa-requisicao-material\frontend"
call npm install -D tailwindcss @tailwindcss/vite >nul 2>&1
call npm install lucide-react >nul 2>&1
if %ERRORLEVEL%==0 (echo    OK!) else (echo    ERRO!)

echo [5/8] Programa Separador OP...
cd /d "%BASE%programa-separador-op\frontend"
call npm install -D tailwindcss @tailwindcss/vite >nul 2>&1
call npm install lucide-react >nul 2>&1
if %ERRORLEVEL%==0 (echo    OK!) else (echo    ERRO!)

echo [6/8] Programa Separador Remessa...
cd /d "%BASE%programa-separador-remessa\frontend"
call npm install -D tailwindcss @tailwindcss/vite >nul 2>&1
call npm install lucide-react >nul 2>&1
if %ERRORLEVEL%==0 (echo    OK!) else (echo    ERRO!)

echo [7/8] Programa Inventario...
cd /d "%BASE%programa-inventario\frontend"
call npm install -D tailwindcss @tailwindcss/vite >nul 2>&1
call npm install lucide-react >nul 2>&1
if %ERRORLEVEL%==0 (echo    OK!) else (echo    ERRO!)

echo [8/8] Programa Recebimento...
cd /d "%BASE%programa-recebimento\frontend"
call npm install -D tailwindcss @tailwindcss/vite >nul 2>&1
call npm install lucide-react >nul 2>&1
if %ERRORLEVEL%==0 (echo    OK!) else (echo    ERRO!)

echo.
echo ============================================================
echo    INSTALACAO CONCLUIDA!
echo ============================================================
echo.
echo Agora voce pode iniciar os programas normalmente.
echo.
pause
