@echo off
chcp 65001 >nul
echo ============================================
echo   日本拳法 孝徳会 大会運営システム - デモ起動
echo ============================================
echo.

cd /d "%~dp0"

echo [1/2] 依存パッケージを確認中...
call npm install --silent 2>nul
echo [2/2] 開発サーバーを起動中...
echo.
echo ========================================
echo   PC:     http://localhost:3000
echo   スマホ:  同じWi-Fiで上記URLへアクセス
echo ========================================
echo.
echo  終了するには Ctrl+C を押してください
echo.

call npm run dev -- --hostname 0.0.0.0
