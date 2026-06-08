$root = 'D:\Dropbox\Files\Desktop\jack'
$port = 3300
$l = [System.Net.HttpListener]::new()
$l.Prefixes.Add("http://localhost:$port/")
$l.Start()
Write-Host "Serving on http://localhost:$port/"
$mime = @{ '.html'='text/html'; '.mp4'='video/mp4'; '.js'='application/javascript'; '.css'='text/css'; '.jpg'='image/jpeg'; '.png'='image/png'; '.svg'='image/svg+xml'; '.woff2'='font/woff2' }
while ($l.IsListening) {
  $ctx  = $l.GetContext()
  $path = $ctx.Request.Url.AbsolutePath.TrimStart('/')
  if ($path -eq '') { $path = 'index.html' }
  $file = Join-Path $root $path
  if (Test-Path $file) {
    $ext  = [System.IO.Path]::GetExtension($file)
    $ct   = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
    $ctx.Response.ContentType = $ct
    # Range support for video
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $rangeHeader = $ctx.Request.Headers['Range']
    if ($rangeHeader -and $ct -eq 'video/mp4') {
      $range = $rangeHeader -replace 'bytes=',''
      $parts = $range -split '-'
      $start = [long]$parts[0]
      $end   = if ($parts[1]) { [long]$parts[1] } else { $bytes.Length - 1 }
      $len   = $end - $start + 1
      $ctx.Response.StatusCode = 206
      $ctx.Response.AddHeader('Content-Range', "bytes $start-$end/$($bytes.Length)")
      $ctx.Response.AddHeader('Accept-Ranges', 'bytes')
      $ctx.Response.ContentLength64 = $len
      $ctx.Response.OutputStream.Write($bytes, $start, $len)
    } else {
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
