@echo off
setlocal
title Lien Web Port
cd /d "%~dp0"

set "PYTHON_EXE=%~dp0python\python.exe"
if not exist "%PYTHON_EXE%" (
  echo.
  echo The bundled Windows Python runtime was not found:
  echo   "%PYTHON_EXE%"
  echo.
  echo Keep the python folder beside this launcher.
  pause
  exit /b 1
)

set "GAME_DIR="
set "INSTALL_IMAGE="
set "GAME_IMAGE="
if defined LIEN_GAME_DIR set "GAME_DIR=%LIEN_GAME_DIR%"
if not defined GAME_DIR if exist "%~dp0assets\.complete.json" set "GAME_DIR=%~dp0"
if not defined GAME_DIR if exist "%~dp0lien_inst.img" set "GAME_DIR=%~dp0"
if not defined GAME_DIR if exist "%~dp0*.img" set "GAME_DIR=%~dp0"
if not defined GAME_DIR if exist "%~dp0..\lien_inst.img" set "GAME_DIR=%~dp0.."
if not defined GAME_DIR if exist "%~dp0..\*.img" set "GAME_DIR=%~dp0.."
if not defined GAME_DIR if exist "%~dp0DATA" set "GAME_DIR=%~dp0"
if not defined GAME_DIR if exist "%~dp0..\DATA" set "GAME_DIR=%~dp0.."

if not defined GAME_DIR (
  echo.
  echo Lien game data could not be found.
  echo.
  echo Put assets\.complete.json, lien_inst.img/lien_game.img, or the game
  echo archives beside this launcher. You can also set LIEN_GAME_DIR.
  pause
  exit /b 1
)

for %%I in ("%GAME_DIR%") do set "GAME_DIR=%%~fI"
if exist "%GAME_DIR%\lien_inst.img" set "INSTALL_IMAGE=%GAME_DIR%\lien_inst.img"
if exist "%GAME_DIR%\lien_game.img" set "GAME_IMAGE=%GAME_DIR%\lien_game.img"
if not exist "%GAME_DIR%\assets\.complete.json" if not defined INSTALL_IMAGE if not exist "%GAME_DIR%\*.img" if not exist "%GAME_DIR%\DATA" if not exist "%GAME_DIR%\GGD" (
  echo.
  echo No portable assets, installation CD image, or installed archives were found in:
  echo   "%GAME_DIR%"
  pause
  exit /b 1
)

set "PYTHONUTF8=1"
set "PYTHONDONTWRITEBYTECODE=1"
echo Starting Lien from "%GAME_DIR%"
echo Close this window or press Ctrl+C to stop the server.
echo.

set IMAGE_ARGS=
if defined INSTALL_IMAGE set IMAGE_ARGS=--install-image "%INSTALL_IMAGE%"
if defined GAME_IMAGE set IMAGE_ARGS=%IMAGE_ARGS% --game-image "%GAME_IMAGE%"
"%PYTHON_EXE%" "%~dp0server.py" --game-dir "%GAME_DIR%" %IMAGE_ARGS% --open %*
set "LIEN_EXIT_CODE=%ERRORLEVEL%"
if not "%LIEN_EXIT_CODE%"=="0" (
  echo.
  echo Lien stopped with error code %LIEN_EXIT_CODE%.
  pause
)
exit /b %LIEN_EXIT_CODE%
