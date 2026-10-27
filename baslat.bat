@echo off
chcp 65001 >nul
REM ============================================================
REM  Ada Translate — Windows başlatıcı
REM  Uygulamayi yerel bir web sunucusu uzerinden acar; boylece
REM  cumle cevirisi (offline yapay zeka modeli) de calisir.
REM  index.html'e cift tiklamak da olur ama o zaman yalnizca
REM  sozluk calisir, cumle cevirisi calismaz.
REM ============================================================

SET PORT=8123
SET "HERE=%~dp0"

REM Python var mi?
where python >nul 2>nul
if %ERRORLEVEL%==0 (
    set PY=python
    goto :start
)
where py >nul 2>nul
if %ERRORLEVEL%==0 (
    set PY=py
    goto :start
)
where python3 >nul 2>nul
if %ERRORLEVEL%==0 (
    set PY=python3
    goto :start
)

echo.
echo [!] Python bulunamadi. Uygulama yine de calisir:
echo     Klasordeki index.html dosyasina CIFT TIKLAYIN.
echo     (Sozluk calisir; cumle cevirisi icin masaustu surumunu kullanin.)
echo.
pause
exit /b

:start
echo Ada Translate baslatiliyor... (http://localhost:%PORT%/index.html)
echo Kapatmak icin bu pencerede Ctrl+C
start "" "http://localhost:%PORT%/index.html"
%PY% -m http.server %PORT% --directory "%HERE%"
