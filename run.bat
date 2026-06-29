@echo off
title efootdoscria Launcher
echo ===================================================
echo   Iniciando o efootdoscria...
echo ===================================================
echo.

:: Verificar se o .env existe
if not exist .env (
    echo [ERRO] Arquivo .env nao encontrado!
    echo Copie o .env.example para .env ou configure as variaveis manualmente.
    pause
    exit /b 1
)

:: Verificar se as chaves do Supabase estao configuradas
findstr /C:"NEXT_PUBLIC_SUPABASE_URL" .env >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Variaveis do Supabase nao encontradas no .env!
    echo Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env
    pause
    exit /b 1
)

echo [+] Instalando dependencias...
call bun install
if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias.
    pause
    exit /b 1
)

echo [+] Sincronizando banco de dados (Supabase)...
call bun run db:push

echo.
echo [+] Iniciando o servidor (Next.js) na porta 3000...
echo.
echo ===================================================
echo   O jogo usa Supabase como banco de dados e
 echo   Supabase Realtime para comunicacao em tempo real.
echo   Nao e necessario PartyKit ou SQLite local.
echo.
echo   Acesse: http://localhost:3000
echo ===================================================
echo.
echo Pressione Ctrl+C para parar o servidor.
echo.

bun run dev
