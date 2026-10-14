@echo off
chcp 65001 > nul
title 스마트 음성 추적 프롬프터 (Smart Teleprompter)

echo =======================================================
echo   🎙️ 스마트 음성 추적 프롬프터 (Smart Teleprompter)
echo =======================================================
echo.

cd /d "%~dp0"

echo [안내] 프롬프터 로컬 서버를 시작합니다...
echo 브라우저가 자동으로 열립니다: http://localhost:5180
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"

pause
