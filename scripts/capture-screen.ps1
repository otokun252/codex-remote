param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$target = [System.IO.Path]::GetFullPath($OutputPath)
$dir = Split-Path -Parent $target
if (-not [string]::IsNullOrWhiteSpace($dir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

try {
  $sourcePoint = New-Object System.Drawing.Point($bounds.Left, $bounds.Top)
  $graphics.CopyFromScreen($sourcePoint, [System.Drawing.Point]::Empty, $bounds.Size)
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output $target
}
finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
