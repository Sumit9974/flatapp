# Creates FlatApp's own release signing key. Run once, on the PC that builds the APK:
#   powershell -ExecutionPolicy Bypass -File scripts\create-release-key.ps1
#
# Why: release APKs were signed with the public React Native debug key, which security apps flag
# (Sophos: PUA "App/Other/Android Abused Certificate"). See README, "Signing".
#
# You type the password here. It is stored only inside the key file and in your user-level Gradle
# settings (%USERPROFILE%\.gradle\gradle.properties), never in the project or git.
#
# BACK UP the key file AND the password. Without them no phone can ever update FlatApp again:
# each one would have to uninstall and reinstall it.

$ErrorActionPreference = 'Stop'

$keytool = 'C:\Android\jdk17\bin\keytool.exe'
$keyDir = Join-Path $HOME '.flatapp-keys'
$store = Join-Path $keyDir 'flatapp-release.jks'
$alias = 'flatapp'
$props = Join-Path $HOME '.gradle\gradle.properties'

if (-not (Test-Path $keytool)) { throw "keytool not found at $keytool (JDK 17 is expected in C:\Android\jdk17)." }
if (Test-Path $store) { Write-Host "A FlatApp key already exists at $store. Nothing changed."; exit 1 }
if ((Test-Path $props) -and (Select-String -Path $props -Pattern '^FLATAPP_UPLOAD_' -Quiet)) {
  Write-Host "$props already has FLATAPP_UPLOAD_ settings. Nothing changed."; exit 1
}

function Read-Secret([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Host ''
Write-Host 'FlatApp release key'
Write-Host 'Choose a password (at least 8 characters, letters, digits and symbols on a normal keyboard).'
$first = Read-Secret 'Password'
$second = Read-Secret 'Type it again'
if ($first -cne $second) { throw 'The two passwords are not the same. Nothing changed.' }
if ($first.Length -lt 8) { throw 'Use at least 8 characters. Nothing changed.' }
if ($first -notmatch '^[\x21-\x7E]+$') { throw 'Use only letters, digits and keyboard symbols, no spaces. Nothing changed.' }

New-Item -ItemType Directory -Force $keyDir | Out-Null
New-Item -ItemType Directory -Force (Split-Path $props) | Out-Null

# keytool reads the password from an environment variable of this process only (never the command line).
$env:FLATAPP_KS_PASS = $first
try {
  & $keytool -genkeypair -storetype PKCS12 -keystore $store -alias $alias -keyalg RSA -keysize 2048 `
    -validity 10000 -dname 'CN=FlatApp, O=FlatApp' -storepass:env FLATAPP_KS_PASS -keypass:env FLATAPP_KS_PASS
  if ($LASTEXITCODE -ne 0) { throw 'keytool failed. Nothing was written to the Gradle settings.' }
} finally {
  Remove-Item Env:FLATAPP_KS_PASS -ErrorAction SilentlyContinue
}

# .properties files treat a backslash as an escape, so double it; paths use forward slashes.
$escaped = $first -replace '\\', '\\'
$lines = @(
  '',
  "# FlatApp release signing key, created $(Get-Date -Format 'yyyy-MM-dd') by scripts/create-release-key.ps1",
  "FLATAPP_UPLOAD_STORE_FILE=$($store -replace '\\', '/')",
  "FLATAPP_UPLOAD_KEY_ALIAS=$alias",
  "FLATAPP_UPLOAD_STORE_PASSWORD=$escaped",
  "FLATAPP_UPLOAD_KEY_PASSWORD=$escaped"
)
Add-Content -Path $props -Value $lines -Encoding ascii
$first = $null; $second = $null; $escaped = $null; $lines = $null

Write-Host ''
Write-Host "Done. Key: $store"
Write-Host "Gradle settings: $props"
Write-Host 'Back up the key file and the password now (for example in your password manager).'
Write-Host 'Then tell Claude the key is ready.'
