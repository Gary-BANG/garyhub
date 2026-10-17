[CmdletBinding()]
param([string]$Repo='D:\Codes\Own_Project\garyhub-repo')
$ErrorActionPreference='Stop'
try{
 $branch='update/garyhub-v1.3.5.0'
 $current=(& git -C $Repo branch --show-current | Out-String).Trim()
 if($LASTEXITCODE -ne 0 -or $current -ne $branch){throw ('Switch to the prepared '+$branch+' branch before pushing.')}
 $remote=(& git -C $Repo remote get-url origin | Out-String).Trim()
 if($remote -notmatch 'github\.com[:/]Gary-BANG/garyhub(?:\.git)?$'){throw 'Unexpected repository origin.'}
 $status=(& git -C $Repo status --porcelain | Out-String).Trim()
 if($status){throw 'Uncommitted changes exist. Review them before pushing.'}
 & git -C $Repo push -u origin $branch
 if($LASTEXITCODE -ne 0){throw 'Push failed. Local commit and server deployment are retained.'}
 Start-Process 'https://github.com/Gary-BANG/garyhub/compare/main...update/garyhub-v1.3.5.0?expand=1'
}catch{Write-Host ('STOPPED: '+$_.Exception.Message) -ForegroundColor Red;exit 1}
