@echo off
echo ====================================================
echo   PARANDO TODOS OS PROCESSOS NODE.JS
echo ====================================================
echo.

taskkill /F /IM node.exe >nul 2>&1

if %errorlevel% EQU 0 (
    echo ✅ Todos os processos Node.js foram encerrados!
) else (
    echo ℹ️  Nenhum processo Node.js estava rodando.
)

echo.
echo ====================================================
echo   Aguarde 3 segundos...
echo ====================================================
timeout /t 3 /nobreak >nul

echo.
echo ✅ Pronto! Agora você pode executar INICIAR.bat
echo.
pause
