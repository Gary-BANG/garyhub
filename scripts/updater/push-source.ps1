[CmdletBinding()]
param(
 [string]$Repo='D:\Codes\Own_Project\garyhub-repo',
 [string]$PackageRoot='',
 [switch]$PrepareOnly
)
$ErrorActionPreference='Stop'
function Git-Read {
 param([string]$At,[string[]]$Arguments)
 $lines=@(& git -C $At @Arguments)
 if($LASTEXITCODE -ne 0){throw ('Git failed: '+($Arguments -join ' '))}
 return (($lines | Out-String).Trim())
}
function Git-Do {
 param([string]$At,[string[]]$Arguments)
 & git -C $At @Arguments | Out-Host
 if($LASTEXITCODE -ne 0){throw ('Git failed: '+($Arguments -join ' '))}
}
function Assert-PackageFile {
 param([string]$Relative,[string]$Expected)
 if([IO.Path]::IsPathRooted($Relative) -or $Relative -match '(^|[/\\])\.\.([/\\]|$)'){throw 'Unsafe package path.'}
 $file=Join-Path $PackageRoot $Relative
 if(-not(Test-Path -LiteralPath $file -PathType Leaf)){throw ('Package file missing: '+$Relative)}
 if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Expected){throw ('Package checksum mismatch: '+$Relative)}
}
function Assert-Branch {
 param([string]$Reference)
 # Verify the branch's Git blobs, independently of Windows line-ending conversion.
 foreach($p in $manifest.files.PSObject.Properties){
  $blob=Git-Read -At $Repo -Arguments @('rev-parse',($Reference+':'+$p.Name))
  if($blob -ne $p.Value.git_blob){throw ('Branch content differs from the package: '+$p.Name)}
 }
 $paths=Git-Read -At $Repo -Arguments @('diff','--name-only',('origin/main...'+$Reference),'--')
 $unexpected=@($paths -split "`r?`n" | Where-Object {$_ -and $_ -notin $manifest.files.PSObject.Properties.Name})
 if($unexpected.Count){throw ('Branch contains unrelated changes: '+($unexpected -join ', '))}
}
try {
 if(-not(Get-Command git -ErrorAction SilentlyContinue)){
  $candidates=@('D:\Downloads\Git\cmd\git.exe','C:\Program Files\Git\cmd\git.exe',(Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'))
  $found=$candidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
  if(-not $found){throw 'Git was not found. Install or enable your existing Git first.'}
  $env:Path=(Split-Path -Parent $found)+';'+$env:Path
 }
 # Resolve the default inside the script body: Windows PowerShell 5.1 may
 # evaluate $PSScriptRoot as empty in a parameter default expression.
 if([string]::IsNullOrWhiteSpace($PackageRoot)){
  if(-not [string]::IsNullOrWhiteSpace($PSScriptRoot)){$PackageRoot=$PSScriptRoot}
  elseif(-not [string]::IsNullOrWhiteSpace($PSCommandPath)){$PackageRoot=[IO.Path]::GetDirectoryName($PSCommandPath)}
  elseif($MyInvocation.MyCommand.Path){$PackageRoot=[IO.Path]::GetDirectoryName($MyInvocation.MyCommand.Path)}
  else{throw 'Cannot locate the extracted package. Run PUSH-TO-GITHUB.cmd from the fully extracted folder.'}
 }
 $packageDirectory=Get-Item -LiteralPath $PackageRoot -Force
 if(-not $packageDirectory.PSIsContainer){throw 'PackageRoot must be an extracted directory.'}
 $PackageRoot=$packageDirectory.FullName
 $manifest=Get-Content -LiteralPath (Join-Path $PackageRoot 'manifest.json') -Raw | ConvertFrom-Json
 if($manifest.schema_version -ne 1 -or $manifest.repository -ne 'Gary-BANG/garyhub' -or $manifest.branch -notmatch '^(?:chore|update)/[a-z0-9][a-z0-9._-]{0,100}$'){throw 'Unexpected package manifest.'}
 foreach($p in $manifest.package_files.PSObject.Properties){Assert-PackageFile -Relative $p.Name -Expected $p.Value}
 if($manifest.commit_message -match '[\r\n]' -or -not $manifest.commit_message -or $manifest.commit_message.Length -gt 160){throw 'Invalid commit message.'}
 if($manifest.base_commit -notmatch '^[0-9a-f]{40}$'){throw 'Invalid reviewed base commit.'}
 $remote=Git-Read -At $Repo -Arguments @('config','--get','remote.origin.url')
 if($remote -notmatch '^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)Gary-BANG/garyhub(?:\.git)?$'){throw 'Repository origin does not match Gary-BANG/garyhub.'}
 Write-Host '1/4 Fetching main. Your current worktree and uncommitted files are preserved.'
 Git-Do -At $Repo -Arguments @('fetch','origin','main')
 & git -C $Repo merge-base --is-ancestor $manifest.base_commit origin/main
 if($LASTEXITCODE -ne 0){throw 'Remote main does not contain the reviewed base; no patch applied.'}
 $branch=$manifest.branch
 $localRef='refs/heads/'+$branch
 & git -C $Repo show-ref --verify --quiet $localRef
 $exists=$LASTEXITCODE -eq 0
 if(-not $exists){
  $remoteLine=Git-Read -At $Repo -Arguments @('ls-remote','--heads','origin',('refs/heads/'+$branch))
  if($remoteLine){Git-Do -At $Repo -Arguments @('fetch','origin',('refs/heads/'+$branch+':'+$localRef));$exists=$true}
 }
 if($exists){
  Assert-Branch -Reference $localRef
  Write-Host '2/4 Existing package branch verified; reusing its commit.'
 }else{
  $workRoot=Join-Path $env:LOCALAPPDATA 'GaryHub\github-push'
  [IO.Directory]::CreateDirectory($workRoot) | Out-Null
  $work=Join-Path $workRoot ('workflow-'+[Guid]::NewGuid().ToString('N'))
  Write-Host '2/4 Preparing the reviewed changes in a separate worktree...'
  Git-Do -At $Repo -Arguments @('worktree','add','-b',$branch,$work,'origin/main')
  Write-Host ('REVIEW_WORKTREE='+$work)
  $patch=Join-Path $PackageRoot 'changes.patch'
  Git-Do -At $work -Arguments @('apply','--check',$patch)
  Git-Do -At $work -Arguments @('apply',$patch)
  $paths=@($manifest.files.PSObject.Properties.Name)
  Git-Do -At $work -Arguments (@('add','--')+$paths)
  $staged=Git-Read -At $work -Arguments @('diff','--cached','--name-only')
  $actual=@($staged -split "`r?`n" | Where-Object {$_})
  $unexpected=@($actual | Where-Object {$_ -notin $paths})
  if($unexpected.Count){throw 'Unrelated files were staged; worktree preserved for inspection.'}
  if($actual.Count -eq 0){throw 'No staged changes; main may already contain this workflow.'}
  Git-Do -At $work -Arguments @('diff','--cached','--check')
  Git-Do -At $work -Arguments @('commit','-m',$manifest.commit_message)
  Assert-Branch -Reference $localRef
 }
 Write-Host '3/4 Package branch and exact changed-file content verified.'
 if($PrepareOnly){Write-Host ('PREPARED: '+$branch+'. No remote push performed.');exit 0}
 Write-Host '4/4 Pushing the review branch using your existing GitHub credentials...'
 Git-Do -At $Repo -Arguments @('push','-u','origin',($localRef+':refs/heads/'+$branch))
 $url='https://github.com/Gary-BANG/garyhub/compare/main...'+$branch+'?expand=1'
 Write-Host ('COMPLETE: pushed '+$branch)
 Write-Host 'Review the PR and merge on GitHub. This package does not deploy the server.'
 Write-Host $url
 Write-Host ('PR description: '+(Join-Path $PackageRoot 'PR-DESCRIPTION.md'))
 try{Start-Process $url}catch{Write-Host 'Open the PR URL above manually.'}
}catch{
 Write-Host ('STOPPED: '+$_.Exception.Message) -ForegroundColor Red
 Write-Host 'Existing work and any prepared worktree are retained. Send the final output for review.'
 exit 1
}
