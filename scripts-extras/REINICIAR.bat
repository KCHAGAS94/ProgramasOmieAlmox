@echo off
echo ====================================================
echo   REINICIANDO SISTEMA COMPLETO
echo ====================================================
echo.

echo [1/3] Parando todos os processos Node.js...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo       Processos encerrados!

echo.
echo [2/3] Aguardando 3 segundos...
timeout /t 3 /nobreak >nul

echo.
echo [3/3] Iniciando sistema...
echo.

call INICIAR.bat
