@echo off
echo ====================================================
echo   MATANDO TODOS OS PROCESSOS NODE.JS
echo ====================================================
echo.

taskkill /F /IM node.exe 2>nul

echo.
echo ✅ TODOS os processos Node.js foram encerrados!
echo.
echo Aguarde 3 segundos antes de reiniciar...
timeout /t 3 /nobreak >nul

echo.
echo Agora execute o INICIAR.bat
echo.
pause
