[CmdletBinding()]
param([string]$Server='root@162.35.168.17',[string]$KeyPath=(Join-Path $env:USERPROFILE '.ssh\garyhub_interserver_ed25519'))
$ErrorActionPreference='Stop'
try{
 if(-not(Get-Command ssh.exe -ErrorAction SilentlyContinue)){throw 'Windows OpenSSH is required.'}
 if(-not(Test-Path -LiteralPath $KeyPath)){throw 'Existing SSH key was not found.'}
 if($Server.StartsWith('-') -or $Server -match '\s'){throw 'Invalid SSH target.'}
 $bytes=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'payload.zip'))
 $sha=[Security.Cryptography.SHA256]::Create()
 try{$actual=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 if($actual -ne 'PACKAGE_SHA256'){throw 'Package checksum mismatch.'}
 Add-Type -AssemblyName System.IO.Compression
 $stream=New-Object IO.MemoryStream(,$bytes)
 $archive=New-Object IO.Compression.ZipArchive($stream,[IO.Compression.ZipArchiveMode]::Read)
 try{$entry=$archive.GetEntry('configure-r2.py');if(-not $entry){throw 'R2 configuration helper is missing.'};$reader=New-Object IO.StreamReader($entry.Open());try{$script=$reader.ReadToEnd()}finally{$reader.Dispose()}}finally{$archive.Dispose();$stream.Dispose()}
 Write-Host 'Install GaryHub v1.4.3.0 first. Enter R2 values locally; do not send them in chat.'
 $account=(Read-Host 'Cloudflare Account ID').Trim()
 $bucket=(Read-Host 'Private R2 bucket name').Trim()
 $access=(Read-Host 'R2 Access Key ID').Trim()
 $secure=Read-Host 'R2 Secret Access Key (hidden)' -AsSecureString
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{$secret=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
 if($account -notmatch '^[a-f0-9]{32}$' -or $bucket -notmatch '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$' -or $access -notmatch '^[a-f0-9]{32}$' -or $secret -notmatch '^[a-f0-9]{64}$'){throw 'One or more R2 fields are invalid. Use R2 S3 credentials, not the general Cloudflare API token.'}
 $config=@{R2_ACCOUNT_ID=$account;R2_BUCKET=$bucket;R2_ACCESS_KEY_ID=$access;R2_SECRET_ACCESS_KEY=$secret}|ConvertTo-Json -Compress
 $script=$script.Replace('CONFIG_JSON_B64',[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($config)))
 $secret=$null;$config=$null;$secure.Dispose()
 $script | & ssh.exe -T -i $KeyPath -o ConnectTimeout=20 -o StrictHostKeyChecking=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=8 $Server python3 -
 $script=$null
 if($LASTEXITCODE -ne 0){throw 'R2 setup did not complete. Send only the final STOPPED message; keep all keys private.'}
 Write-Host 'R2 configured. Refresh https://calendar.garyhub.uk/music/ and upload a short MP3.'
}catch{Write-Host ('STOPPED: '+$_.Exception.Message) -ForegroundColor Red;exit 1}
