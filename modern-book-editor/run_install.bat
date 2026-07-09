@echo off
cd /d %~dp0
npm install > install.log 2>&1
echo DONE >> install.log
