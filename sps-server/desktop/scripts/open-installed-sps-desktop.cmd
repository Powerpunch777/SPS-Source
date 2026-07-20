@echo off
setlocal

taskkill /im "SPS Desktop.exe" /f >nul 2>&1
timeout /t 2 /nobreak >nul

set "SPS_DESKTOP=%LOCALAPPDATA%\Programs\SPS Desktop\SPS Desktop.exe"
if exist "%SPS_DESKTOP%" (
  start "" "%SPS_DESKTOP%"
  exit /b 0
)

echo SPS Desktop 0.2.6 was not found in the standard installation folder.
echo Run SPS Desktop Setup 0.2.6.exe again, then open this file once more.
pause
exit /b 1
