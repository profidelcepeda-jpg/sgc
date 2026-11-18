@echo off
rem ============================================================
rem  SGA - arranque de desarrollo (Windows)
rem  Abre el backend (4000) y el frontend (5173) en dos ventanas.
rem  Si ya estan escuchando, no los duplica.
rem  Requiere: PostgreSQL activo y dependencias ya instaladas.
rem ============================================================
setlocal
title SGA - arranque de desarrollo
cd /d "%~dp0"

netstat -ano | findstr ":4000" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo Iniciando backend en http://localhost:4000 ...
  start "SGA - Backend (4000)" /D "%~dp0backend" cmd /k npm.cmd run dev
) else (
  echo Backend ya esta escuchando en el puerto 4000.
)

netstat -ano | findstr ":5173" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo Iniciando frontend en http://localhost:5173 ...
  start "SGA - Frontend (5173)" /D "%~dp0frontend" cmd /k npm.cmd run dev
) else (
  echo Frontend ya esta escuchando en el puerto 5173.
)

echo Esperando a que los servidores esten listos...
timeout /t 7 /nobreak >nul
start "" "http://localhost:5173"

endlocal
