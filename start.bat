@echo off
rem CadBank - inicializar (local ou servidor)
setlocal
set "NODE=%~dp0.tools\node-v22.14.0-win-x64"
set "PATH=%NODE%;%PATH%"

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
