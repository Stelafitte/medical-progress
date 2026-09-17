@echo off
REM ============================================================================
REM  METTRE EN LIGNE CAMPUS SANTE AUGMENTE - a double-cliquer, sans passer par
REM  le relais.
REM
REM  POURQUOI CE FICHIER (17/09). Un `wrangler deploy` lance depuis le relais
REM  s'est fige une heure sur une question que la fenetre n'affichait pas. Le
REM  relais est la seule porte vers le PC : bloque, il emporte tout avec lui.
REM  Ici, la fenetre est la tienne, une question eventuelle est visible, et le
REM  relais reste libre.
REM
REM  CI=1 et la telemetrie coupee : wrangler ne pose plus de question.
REM  wrangler MET EN LIGNE LE CONTENU DU DISQUE, pas git. D'ou le `git status`
REM  affiche avant : ce que tu vois est ce qui part.
REM ============================================================================
setlocal
cd /d "%~dp0"
set CI=1
set WRANGLER_SEND_METRICS=false

echo.
echo === CE QUI VA PARTIR (etat du disque, pas de git) ===
call git status --short
echo.

echo === TESTS ===
call npx.cmd vitest run --reporter=dot
if errorlevel 1 goto :echec

echo.
echo === CONSTRUCTION ===
call npm.cmd run build
if errorlevel 1 goto :echec

echo.
echo === MISE EN LIGNE ===
call npx.cmd wrangler deploy
if errorlevel 1 goto :echec

echo.
echo === EN LIGNE ===
echo https://stelafitte-medical-progress.dfasm-connect.workers.dev
goto :fin

:echec
echo.
echo *** ECHEC : rien n'a ete mis en ligne. Lis l'erreur ci-dessus. ***

:fin
echo.
pause
