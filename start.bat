@echo off
rem CadBank - inicializar (local ou servidor)
setlocal
rem Usa o Node.js instalado globalmente (a pasta .tools/portatil nao existe mais)
for /f "delims=" %%i in ('where node 2^>nul') do (
  set "NODE_CMD=%%i"
  goto :found
)
echo ERRO: Node.js nao encontrado. Instale em https://nodejs.org
pause
exit /b 1
:found

if not exist "%~dp0web\dist\index.html" (
  echo Construindo frontend...
  pushd "%~dp0web" && call npm run build && popd
)

echo.
echo  ============================================
echo   CadBank rodando em http://localhost:3000
echo   (acesso na rede: http://SEU-IP:3000)
echo   Usuario padrao: admin / admin123
echo  ============================================
echo.
pushd "%~dp0server"
node src\index.js
popd
