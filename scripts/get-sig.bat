@echo off
:: Navigate to project root
cd /d "%~dp0\.."
node scripts/build.mjs
