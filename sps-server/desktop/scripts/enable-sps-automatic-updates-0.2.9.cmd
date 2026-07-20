@echo off
setlocal

set "PATCH=%USERPROFILE%\Downloads\SPS Desktop 0.2.9 app.asar"
set "INSTALL=%LOCALAPPDATA%\Programs\SPS22P"
set "TARGET=%INSTALL%\resources\app.asar"
set "EXPECTED=E7F27FE88F87388695D2F8AA4FC14450492FE9E1E39D7AA202D0F95A74C12617"

if not exist "%PATCH%" (
  echo SPS Desktop 0.2.9 app patch was not found in Downloads.
  pause
  exit /b 1
)
if not exist "%TARGET%" (
  echo The existing SPS22P installation was not found.
  pause
  exit /b 1
)

taskkill /im "SPS Desktop.exe" /f >nul 2>&1
if not exist "%TARGET%.pre-auto-update-backup" copy /y "%TARGET%" "%TARGET%.pre-auto-update-backup" >nul
copy /y "%PATCH%" "%TARGET%" >nul

for /f "skip=1 tokens=1" %%H in ('certutil -hashfile "%TARGET%" SHA256') do (
  set "ACTUAL=%%H"
  goto :verify
)

:verify
if /I not "%ACTUAL%"=="%EXPECTED%" (
  echo The SPS Desktop automatic-update patch could not be verified.
  pause
  exit /b 1
)

start "" "%INSTALL%\SPS Desktop.exe"
echo SPS Desktop automatic updates are enabled.
timeout /t 3 >nul
exit /b 0
