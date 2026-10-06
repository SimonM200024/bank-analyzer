@echo off
rem EBA DMS demo recreation - Windows launcher
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ni namescen. Namestite ga z ukazom:  winget install OpenJS.NodeJS.LTS
  pause
  exit /b 1
)
rem Open the app in an Edge app window (no browser chrome) once the server is up.
start "" cmd /c "timeout /t 2 >nul & (start msedge --app=http://localhost:4173 || start http://localhost:4173)"
node server.mjs %*
