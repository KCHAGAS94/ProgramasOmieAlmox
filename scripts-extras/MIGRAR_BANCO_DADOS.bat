@echo off
echo ========================================
echo   MIGRANDO PARA BANCO DE DADOS CENTRALIZADO
echo ========================================
echo.
echo Isso vai:
echo  1. Atualizar paths nos backends
echo  2. Testar se tudo funciona
echo  3. Remover arquivos antigos
echo.
pause

echo.
echo [1/3] Atualizando paths nos backends...
echo.

REM A atualizacao dos paths sera feita manualmente
REM pois envolve analise de codigo JavaScript

echo IMPORTANTE:
echo.
echo Os arquivos JA FORAM COPIADOS para banco-de-dados/
echo.
echo Proximos passos:
echo  1. Atualizar os paths nos arquivos server.js de cada backend
echo  2. Testar se tudo funciona
echo  3. Remover os arquivos .json antigos dos backends
echo.
echo Estrutura criada:
echo.
echo banco-de-dados/
echo   compartilhado/       (dados compartilhados)
echo   recebimento/         (programa recebimento)
echo   inventario/          (programa inventario)
echo   requisicao-material/ (requisicao de material)
echo   separador-op/        (separador OP)
echo   separador-remessa/   (separador remessa)
echo.
echo Veja banco-de-dados/README.md para mais informacoes
echo.
pause
