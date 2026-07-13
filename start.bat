@echo off
echo Starting Modern Book Editor (Local Mode)
echo.

cd /d "%~dp0server"
start cmd /k "npm run dev"

cd /d "%~dp0modern-book-editor"
start cmd /k "npm run dev"

echo.
echo ============================================
echo  Services starting...
echo  Frontend: http://localhost:5173
echo  Backend:  http://localhost:3001
echo ============================================
echo.
pause