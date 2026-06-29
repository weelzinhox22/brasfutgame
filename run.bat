@echo off
title efootdoscria Launcher
echo ===================================================
echo   Iniciando os servicos do efootdoscria (Serverless)...
echo ===================================================
echo.

:: Start Next.js Frontend
echo [+] Iniciando o Frontend (Next.js) na porta 3000...
start "efootdoscria - Frontend (Porta 3000)" cmd /k "bun run dev"

:: Start PartyKit Dev Server
echo [+] Iniciando o Servidor de Tempo Real (PartyKit) na porta 1999...
start "efootdoscria - PartyKit (Porta 1999)" cmd /k "npx partykit dev"

echo.
echo ===================================================
echo   Todos os servicos foram iniciados!
echo   - Acesse o jogo em: http://localhost:3000
echo ===================================================
echo.
pause
