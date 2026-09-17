@echo off
REM ============================================================================
REM  ALLEGER LES MEDIAS - a double-cliquer.
REM
REM  Premier lancement : ESSAI. L'outil mesure et transcode en local, il
REM  n'ecrit RIEN en base ni dans le stockage. Lis le rapport, puis relance
REM  avec --go si les chiffres te vont.
REM
REM  L'outil demande l'adresse et le mot de passe de l'administrateur. Ils ne
REM  sont ecrits nulle part : pas de cle de service sur le disque.
REM ============================================================================
setlocal
cd /d "%~dp0\..\.."
echo.
echo === ALLEGER LES MEDIAS ===
echo.
echo   1. Essai (rien n'est ecrit)
echo   2. Appliquer pour de vrai
echo   3. Essai sur 2 medias seulement
echo.
set /p choix="Ton choix (1, 2 ou 3) : "
echo.
if "%choix%"=="2" (
  node tools\transcodage\alleger.mjs --go
) else if "%choix%"=="3" (
  node tools\transcodage\alleger.mjs --max 2
) else (
  node tools\transcodage\alleger.mjs
)
echo.
pause
