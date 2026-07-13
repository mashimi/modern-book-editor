@echo off
cd /d %~dp0
echo Installing frontend dependencies...
cd modern-book-editor
call npm install
echo.
echo Installing server dependencies...
cd ..\server
call npm install
echo.
echo Done! Run 'npx tsx index.ts' in the server folder to start the backend.
pause