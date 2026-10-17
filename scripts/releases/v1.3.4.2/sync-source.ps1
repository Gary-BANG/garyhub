[CmdletBinding()]
param([string]$Repo='D:\Codes\Own_Project\garyhub-repo')
$ErrorActionPreference='Stop'
function Git-Run { param([string[]]$GitArgs) & git -C $Repo @GitArgs; if($LASTEXITCODE -ne 0){throw ('Git failed: '+$GitArgs[0])} }
if(-not(Test-Path -LiteralPath (Join-Path $Repo '.git'))){Write-Host 'Source kept with the update package. Local repository was not found; server upgrade is complete.';return}
$remote=(& git -C $Repo remote get-url origin 2>$null | Out-String).Trim()
if($remote -notmatch 'github\.com[:/]Gary-BANG/garyhub(?:\.git)?$'){throw 'Local repository origin does not match Gary-BANG/garyhub; source was not copied.'}
$status=(& git -C $Repo status --porcelain | Out-String)
if($LASTEXITCODE -ne 0 -or $status.Trim()){throw 'Local repository has uncommitted changes. Server update is complete; source is retained beside the installer.'}
$branch='update/garyhub-v1.3.4.2'
$existing=(& git -C $Repo branch --list $branch | Out-String).Trim()
if($existing){Write-Host ('Local source branch already exists: '+$branch+'. It was not overwritten.');return}
$baseline=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'repo-baseline.json') -Raw | ConvertFrom-Json
foreach($prop in $baseline.PSObject.Properties){
 $file=Join-Path $Repo $prop.Name
 if(-not(Test-Path -LiteralPath $file)){throw ('Local baseline missing: '+$prop.Name)}
 $text=[IO.File]::ReadAllText($file).Replace("`r`n","`n").TrimEnd([char[]]"`n")
 $sha=[Security.Cryptography.SHA256]::Create()
 try{$hash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 if(@($prop.Value) -notcontains $hash){throw ('Local source differs from reviewed baseline: '+$prop.Name+'. No source was overwritten.')}
}
$sourceRoot=Join-Path $PSScriptRoot 'source'
foreach($item in (Get-ChildItem -LiteralPath $sourceRoot -File -Recurse)){
 $relative=$item.FullName.Substring($sourceRoot.Length+1).Replace('\','/')
 $destination=Join-Path $Repo $relative
 if(-not($baseline.PSObject.Properties.Name -contains $relative) -and (Test-Path -LiteralPath $destination)){
  $existingText=[IO.File]::ReadAllText($destination).Replace("`r`n","`n").TrimEnd([char[]]"`n")
  $packageText=[IO.File]::ReadAllText($item.FullName).Replace("`r`n","`n").TrimEnd([char[]]"`n")
  if($existingText -cne $packageText){throw ('An existing file conflicts with this release: '+$relative+'. No source was overwritten.')}
 }
}
Git-Run -GitArgs @('switch','-c',$branch)
$files=Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'source') -File -Recurse
$paths=New-Object System.Collections.Generic.List[string]
foreach($file in $files){$relative=$file.FullName.Substring((Join-Path $PSScriptRoot 'source').Length+1);$target=Join-Path $Repo $relative;$dir=Split-Path -Parent $target;[IO.Directory]::CreateDirectory($dir)|Out-Null;[IO.File]::Copy($file.FullName,$target,$true);$paths.Add($relative.Replace('\','/'))}
$ignore=Join-Path $Repo '.gitignore';$text=if(Test-Path -LiteralPath $ignore){[IO.File]::ReadAllText($ignore)}else{''}
foreach($line in @('/lab-service/homepage-protected.json','/lab-service/profile-private.json')){if(-not($text -split '\r?\n' -contains $line)){$text=$text.TrimEnd()+"`n"+$line+"`n"}}
[IO.File]::WriteAllText($ignore,$text,(New-Object Text.UTF8Encoding($false)));$paths.Add('.gitignore')
Git-Run -GitArgs (@('add','--')+$paths.ToArray())
Git-Run -GitArgs @('commit','-m','Add encrypted TOTP, expiring grants and subscriber profile policies')
Write-Host ('Source committed locally on '+$branch+'. No remote push was performed.')
