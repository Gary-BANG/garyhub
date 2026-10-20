[CmdletBinding()]
param([string]$Repo='D:\Codes\Own_Project\garyhub-repo',[ValidateSet('1.3.4.1','1.3.4.2')][string]$Variant)
$ErrorActionPreference='Stop'
if(-not(Get-Command git -ErrorAction SilentlyContinue)){
 $candidates=@('D:\Downloads\Git\cmd\git.exe','C:\Program Files\Git\cmd\git.exe',(Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'))
 $found=$candidates|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1
 if(-not $found){throw 'Git was not found. Server update is complete; source remains beside the installer.'}
 $env:Path=(Split-Path -Parent $found)+';'+$env:Path
}

function Git-Run { param([string[]]$GitArgs) & git -C $Repo @GitArgs; if($LASTEXITCODE -ne 0){throw ('Git failed: '+$GitArgs[0])} }
if(-not(Test-Path -LiteralPath (Join-Path $Repo '.git'))){Write-Host 'Server update is complete. The local repository was not found; source is retained beside the installer.';return}
$remote=(& git -C $Repo remote get-url origin 2>$null | Out-String).Trim()
if($remote -notmatch '^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)Gary-BANG/garyhub(?:\.git)?$'){throw 'Repository origin does not match Gary-BANG/garyhub.'}
$status=(& git -C $Repo status --porcelain | Out-String)
if($LASTEXITCODE -ne 0 -or $status.Trim()){throw 'Local changes were found. They were preserved; server update is complete.'}
$versionFile=Join-Path $Repo 'calendar-app\public\privacy-ledger-release.json'
if($Variant -eq '1.3.4.1' -and (Test-Path -LiteralPath $versionFile)){
 $localVersion=(Get-Content -LiteralPath $versionFile -Raw | ConvertFrom-Json).version
 if(Test-Path -LiteralPath (Join-Path $Repo 'calendar-app\totp-api.js')){throw 'Local source includes TOTP but the server baseline does not. Source was preserved for review.'}
}
$branch='update/garyhub-v1.3.5.4'
if((& git -C $Repo branch --list $branch | Out-String).Trim()){Write-Host ('Branch '+$branch+' already exists; it was preserved.');return}
$baseline=Get-Content -LiteralPath (Join-Path $PSScriptRoot ('repo-baseline-'+$Variant+'.json')) -Raw | ConvertFrom-Json
foreach($prop in $baseline.PSObject.Properties){
 $file=Join-Path $Repo $prop.Name
 if(-not(Test-Path -LiteralPath $file)){if(@($prop.Value) -contains 'MISSING'){continue};throw ('Expected local file missing: '+$prop.Name)}
 $text=[Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($file)).Replace("`r`n","`n").TrimEnd([char[]]"`n")
 $sha=[Security.Cryptography.SHA256]::Create()
 try{$hash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 if(@($prop.Value) -notcontains $hash){throw ('Local source differs from the reviewed baseline: '+$prop.Name+'. No files were overwritten.')}
}
$sourceRoot=Join-Path $PSScriptRoot ('source\'+$Variant)
$files=Get-ChildItem -LiteralPath $sourceRoot -File -Recurse
Git-Run -GitArgs @('switch','-c',$branch)
$paths=New-Object System.Collections.Generic.List[string]
foreach($file in $files){$relative=$file.FullName.Substring($sourceRoot.Length+1);$target=Join-Path $Repo $relative;[IO.Directory]::CreateDirectory((Split-Path -Parent $target))|Out-Null;[IO.File]::Copy($file.FullName,$target,$true);$paths.Add($relative.Replace('\','/'))}
for($i=0;$i -lt $paths.Count;$i+=50){$count=[Math]::Min(50,$paths.Count-$i);Git-Run -GitArgs (@('add','--')+$paths.GetRange($i,$count).ToArray())}
Git-Run -GitArgs @('commit','-m','Add Todo JSON import, previews and copyable AI prompts')
Write-Host ('Source committed locally on '+$branch+'. No remote push was performed.')
