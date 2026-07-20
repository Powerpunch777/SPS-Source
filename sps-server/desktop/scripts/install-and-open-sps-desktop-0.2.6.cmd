@echo off
setlocal

set "SETUP=%USERPROFILE%\Downloads\SPS Desktop Setup 0.2.6.exe"
set "SPS_DESKTOP=%LOCALAPPDATA%\Programs\SPS Desktop\SPS Desktop.exe"

if not exist "%SETUP%" (
  echo SPS Desktop Setup 0.2.6.exe was not found in Downloads.
  echo Wait for the Tailscale transfer to finish, then run this file again.
  pause
  exit /b 1
)

taskkill /im "SPS Desktop.exe" /f >nul 2>&1
echo Installing SPS Desktop 0.2.6. This can take several minutes.
"%SETUP%" /S

if not exist "%SPS_DESKTOP%" (
  echo Installation did not create the SPS Desktop application folder.
  pause
  exit /b 1
)

start "" "%SPS_DESKTOP%"
exit /b 0
