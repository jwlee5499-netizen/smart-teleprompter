# Smart Voice Prompter - Standalone Local Server for Windows
# Runs natively on any Windows PC without Node.js or any third-party software

$port = 5180
$distPath = Join-Path $PSScriptRoot "dist"

if (-not (Test-Path $distPath)) {
    Write-Host "[오류] dist 폴더를 찾을 수 없습니다." -ForegroundColor Red
    pause
    exit 1
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
} catch {
    Write-Host "[안내] 포트 $port 가 이미 사용 중이거나 권한이 필요합니다. 브라우저를 직접 엽니다." -ForegroundColor Yellow
    Start-Process "http://localhost:$port/"
    exit 0
}

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "   스마트 음성 추적 프롬프터 (Smart Teleprompter)" -ForegroundColor Green
Write-Host "   포터블 로컬 서버가 시작되었습니다!" -ForegroundColor White
Write-Host "   접속 주소: http://localhost:$port/" -ForegroundColor Yellow
Write-Host "   (종료하려면 이 창을 닫으세요)" -ForegroundColor Gray
Write-Host "=========================================================" -ForegroundColor Cyan

# 브라우저 자동 오픈
Start-Process "http://localhost:$port/"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".ttf"  = "font/ttf"
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawUrl = $request.Url.LocalPath
        if ($rawUrl -eq "/" -or [string]::IsNullOrWhiteSpace($rawUrl)) {
            $rawUrl = "/index.html"
        }

        # Remove leading slash and resolve path
        $relativeFile = $rawUrl.TrimStart("/").Replace("/", "\")
        $filePath = Join-Path $distPath $relativeFile

        if (-not (Test-Path $filePath -PathType Leaf)) {
            # SPA fallback: if file not found, serve index.html
            $filePath = Join-Path $distPath "index.html"
        }

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = "application/octet-stream"
            if ($mimeTypes.ContainsKey($ext)) {
                $contentType = $mimeTypes[$ext]
            }

            $response.ContentType = $contentType
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
        }

        $response.OutputStream.Close()
    } catch {
        # Ignore client disconnect errors
    }
}
