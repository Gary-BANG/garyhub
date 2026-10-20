[CmdletBinding()]
param([string]$Repo='D:\Codes\Own_Project\garyhub-repo')
$ErrorActionPreference='Stop'
if(-not(Get-Command git -ErrorAction SilentlyContinue)){
 $candidates=@('D:\Downloads\Git\cmd\git.exe','C:\Program Files\Git\cmd\git.exe',(Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'))
 $found=$candidates|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1
 if(-not $found){throw 'Git was not found. Server update is complete; source remains beside the installer.'}
 $env:Path=(Split-Path -Parent $found)+';'+$env:Path
}

try{
 $branch='update/garyhub-v1.3.5.3'
 $current=(& git -C $Repo branch --show-current | Out-String).Trim()
 if($LASTEXITCODE -ne 0 -or $current -ne $branch){throw ('Switch to the prepared '+$branch+' branch before pushing.')}
 $remote=(& git -C $Repo remote get-url origin | Out-String).Trim()
 if($remote -notmatch '^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)Gary-BANG/garyhub(?:\.git)?$'){throw 'Unexpected repository origin.'}
 $status=(& git -C $Repo status --porcelain | Out-String).Trim()
 if($status){throw 'Uncommitted changes exist. Review them before pushing.'}
 & git -C $Repo push -u origin $branch
 if($LASTEXITCODE -ne 0){throw 'Push failed. Local commit and server deployment are retained.'}
 Start-Process 'https://github.com/Gary-BANG/garyhub/compare/main...update/garyhub-v1.3.5.3?expand=1'
}catch{Write-Host ('STOPPED: '+$_.Exception.Message) -ForegroundColor Red;exit 1}
