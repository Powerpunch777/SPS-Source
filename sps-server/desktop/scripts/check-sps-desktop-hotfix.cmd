@echo off
setlocal

set "TARGET=%LOCALAPPDATA%\Programs\SPS22P\resources\app.asar"
if not exist "%TARGET%" (
  echo SPS22P app.asar was not found.
  pause
  exit /b 1
)

echo Installed app.asar SHA256:
certutil -hashfile "%TARGET%" SHA256
echo Expected SPS 0.2.6 SHA256:
echo 6BD6D6F04F1420F39FB62E17055ED57C35F6771B9BEAD1BF8EFAA76619099630
pause
