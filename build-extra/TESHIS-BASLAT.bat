@echo off
REM Ada Translate - teshis baslatici
setlocal
chcp 65001 >nul 2>&1

REM Ag paylasimi (UNC) uzerinden calistirilirsa cd /d calismaz.
REM pushd UNC yolunu gecici bir surucu harfine baglar.
pushd "%~dp0" 2>nul
if errorlevel 1 (
  echo UYARI: Bu klasore gecilemedi: %~dp0
)

echo ============================================
echo   Ada Translate - teshis modu
echo ============================================
echo Klasor: %CD%
echo.

echo %~dp0 | findstr /b "\\\\" >nul
if not errorlevel 1 (
  echo *** DIKKAT: Program bir AG PAYLASIMI ustunden calistiriliyor. ***
  echo     Windows bu durumda uygulamayi engelleyebilir.
  echo     EN SAGLAM COZUM: klasoru yerel diske kopyalayin,
  echo     ornegin C:\ADA Translate\ , sonra oradan calistirin.
  echo.
)

if not exist "Ada Translate.exe" (
  echo HATA: "Ada Translate.exe" bu klasorde yok.
  echo Portable exe'yi / ZIP'i once bir klasore cikardiniz mi?
  echo.
  pause
  popd
  exit /b 1
)

echo Uygulama baslatiliyor... Pencere acilmazsa asagidaki ciktiya bakin.
echo.

"Ada Translate.exe" --enable-logging --no-sandbox --disable-gpu-sandbox

echo.
echo ============================================
echo Uygulama kapandi. Cikis kodu: %ERRORLEVEL%
echo ============================================

if exist "ada-hata.log" (
  echo.
  echo --- ada-hata.log icerigi ---
  type "ada-hata.log"
) else (
  echo ada-hata.log bu klasorde olusmadi.
  echo Ag paylasiminda log su klasorde olabilir:
  echo   %LOCALAPPDATA%\AdaTranslate-cache
)
echo.
pause
popd
