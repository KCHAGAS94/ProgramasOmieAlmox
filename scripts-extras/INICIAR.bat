@echo off
REM Movido para scripts-extras: sobe um nivel para a raiz do projeto.
cd /d "%~dp0.."
cls

echo ====================================================
echo   PROGRAMAS OMIE - React + Node.js
echo   (Usando NPM Workspaces - 1 node_modules)
echo ====================================================
echo.

REM Verifica se precisa instalar (node_modules da raiz OU Tailwind faltando)
set NEED_INSTALL=0

if not exist "node_modules" set NEED_INSTALL=1

REM Verifica se Tailwind e lucide-react estao instalados
if not exist "node_modules\tailwindcss" set NEED_INSTALL=1
if not exist "node_modules\lucide-react" set NEED_INSTALL=1
if not exist "node_modules\@tailwindcss\vite" set NEED_INSTALL=1
if not exist "node_modules\better-sqlite3" set NEED_INSTALL=1

if %NEED_INSTALL%==1 (
    echo Instalando/atualizando dependencias...
    echo Isso pode demorar 2-5 minutos.
    echo.

    call npm install

    cls
    echo.
    echo Instalacao concluida!
    echo.
)

REM Limpa cache do Vite para evitar problemas
echo Limpando cache do Vite...
if exist "node_modules\.vite" rd /s /q "node_modules\.vite" 2>nul
echo Cache limpo!
echo.

echo ====================================================
echo   Iniciando servidores...
echo ====================================================
echo.
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
echo   Para parar: Ctrl+C
echo ====================================================
echo.

timeout /t 2 /nobreak > nul

REM Abre navegador apos 5 segundos
start /b cmd /c "timeout /t 5 /nobreak > nul && start http://localhost:3000"

REM Inicia todos os servidores
npm start
