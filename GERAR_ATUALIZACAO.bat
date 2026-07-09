@echo off
REM ==================================================================
REM   GERAR_ATUALIZACAO.bat  (rodar no PC X - desenvolvimento)
REM   Gera dist-atualizacao\atualizacao.zip com a fonte da aplicacao.
REM   ASCII puro / sem acentos de proposito.
REM   O chcp 65001 abaixo e SO para a saida do node (animacao) sair
REM   com acentos e graficos corretos; este .bat continua em ASCII.
REM ==================================================================
chcp 65001 >nul
title Gerador de Pacote de Atualizacao
cd /d "%~dp0"
cls

if not exist "node_modules\adm-zip" (
    echo Instalando dependencia adm-zip ...
    call npm install
    cls
)

node gerar-pacote.js

echo.
pause
