@echo off
chcp 65001 > nul
title 스마트 프롬프터 (무설치 포터블 실행기)

cd /d "%~dp0"

echo =======================================================
echo   🎙️ 스마트 프롬프터 - 무설치 포터블 실행기
echo   (Node.js 설치 불필요 / 다른 PC 및 오프라인 완벽 지원)
echo =======================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"

pause
