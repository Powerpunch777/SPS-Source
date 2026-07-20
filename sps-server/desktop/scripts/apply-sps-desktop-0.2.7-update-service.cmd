@echo off
setlocal

set "PATCH=%USERPROFILE%\Downloads\SPS Desktop 0.2.7 app.asar"
set "INSTALL=%LOCALAPPDATA%\Programs\SPS22P"
set "TARGET=%INSTALL%\resources\app.asar"
set "EXPECTED=C565E74BE27FE8676DF2DBFEDE333C55F8A14480DA6385FAC850250F906F27CE"

if not exist "%PATCH%" (
  echo SPS Desktop 0.2.7 app patch was not found in Downloads.
  pause
  exit /b 1
)
if not exist "%TARGET%" (
  echo The existing SPS22P installation was not found.
  pause
  exit /b 1
)

taskkill /im "SPS Desktop.exe" /f >nul 2>&1
if not exist "%TARGET%.2.6-backup" copy /y "%TARGET%" "%TARGET%.2.6-backup" >nul
copy /y "%PATCH%" "%TARGET%" >nul

for /f "skip=1 tokens=1" %%H in ('certutil -hashfile "%TARGET%" SHA256') do (
  set "ACTUAL=%%H"
  goto :verify
)

:verify
if /I not "%ACTUAL%"=="%EXPECTED%" (
  echo The SPS Desktop update patch could not be verified.
  pause
  exit /b 1
)

start "" "%INSTALL%\SPS Desktop.exe"
echo SPS Desktop 0.2.7 is ready. Future Desktop releases will update from the app.
timeout /t 3 >nul
exit /b 0
