@echo off
setlocal

set "PATCH=%USERPROFILE%\Downloads\SPS Desktop 0.2.6 app.asar"
set "INSTALL=%LOCALAPPDATA%\Programs\SPS22P"
set "TARGET=%INSTALL%\resources\app.asar"

if not exist "%PATCH%" (
  echo SPS Desktop 0.2.6 app patch was not found in Downloads.
  pause
  exit /b 1
)
if not exist "%TARGET%" (
  echo The existing SPS22P installation was not found.
  pause
  exit /b 1
)

taskkill /im "SPS Desktop.exe" /f >nul 2>&1
if not exist "%TARGET%.2.5-backup" copy /y "%TARGET%" "%TARGET%.2.5-backup" >nul
copy /y "%PATCH%" "%TARGET%" >nul

start "" "%INSTALL%\SPS Desktop.exe"
exit /b 0
