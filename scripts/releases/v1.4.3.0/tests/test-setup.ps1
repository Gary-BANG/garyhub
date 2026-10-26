param([Parameter(Mandatory=$true)][string]$PackageRoot)
$ErrorActionPreference='Stop'
$temp=Join-Path ([IO.Path]::GetTempPath()) ('garyhub-r2-setup-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temp)|Out-Null
$key=Join-Path $temp 'synthetic-key.txt';[IO.File]::WriteAllText($key,'Not a real key')
$global:CapturedPython=''
function global:Read-Host {
 param([string]$Prompt,[switch]$AsSecureString)
 if($AsSecureString){return ConvertTo-SecureString ('c'*64) -AsPlainText -Force}
 if($Prompt -eq 'Cloudflare Account ID'){return 'a'*32}
 if($Prompt -eq 'Private R2 bucket name'){return 'music-fixture'}
 if($Prompt -eq 'R2 Access Key ID'){return 'b'*32}
 throw 'Unexpected prompt in synthetic setup test'
}
function global:ssh.exe {
 process {$global:CapturedPython += [string]$_+"`n"}
 end {$global:LASTEXITCODE=0;Write-Output 'Synthetic SSH: no network connection made.'}
}
try{
 & (Join-Path $PackageRoot 'Setup-R2.ps1') -KeyPath $key -Server 'root@synthetic.invalid'
 if($LASTEXITCODE -ne 0){throw 'Setup helper failed'}
 if($global:CapturedPython -notmatch "base64.b64decode\('([A-Za-z0-9+/=]+)'\)"){throw 'Credential envelope was not embedded'}
 $value=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Matches[1]))|ConvertFrom-Json
 if($value.R2_BUCKET -ne 'music-fixture' -or $value.R2_SECRET_ACCESS_KEY -ne ('c'*64)){throw 'Credential envelope differs'}
 if($global:CapturedPython.Contains('CONFIG_JSON_B64')){throw 'Unexpanded setup placeholder'}
 Write-Output 'SETUP POWERSHELL PASS: real ZIP/hash/stream reader, hidden-secret conversion and SSH envelope; network stubbed.'
}finally{
 $global:CapturedPython='';Remove-Item -LiteralPath $temp -Recurse -Force
 Remove-Item Function:\Read-Host -ErrorAction SilentlyContinue
 Remove-Item Function:\ssh.exe -ErrorAction SilentlyContinue
}
