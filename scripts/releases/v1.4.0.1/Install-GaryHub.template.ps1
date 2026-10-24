[CmdletBinding()]
param(
 [string]$Server='root@162.35.168.17',
 [string]$KeyPath=(Join-Path $env:USERPROFILE '.ssh\garyhub_interserver_ed25519'),
 [string]$Repo='D:\Codes\Own_Project\garyhub-repo',
 [switch]$SkipSourceSync,
 [switch]$Rollback
)
$ErrorActionPreference='Stop'
try{
 if(-not(Get-Command ssh.exe -ErrorAction SilentlyContinue)){throw 'Windows OpenSSH client is required.'}
 if(-not(Test-Path -LiteralPath $KeyPath)){throw ('Existing SSH key not found: '+$KeyPath)}
 if($Server.StartsWith('-') -or $Server -match '\s'){throw 'Invalid SSH target.'}
 $zip=Join-Path $PSScriptRoot 'payload.zip'
 $bytes=[IO.File]::ReadAllBytes($zip)
 $expected='PACKAGE_SHA256'
 $sha=[Security.Cryptography.SHA256]::Create()
 try{$actual=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 if($actual -ne $expected){throw 'Package checksum mismatch. Download and extract the complete ZIP again.'}
 $build='INSTALLER_BUILD_ID'
 $version='RELEASE_VERSION'
 $requires='REQUIRES_VERSION'
 $folder=Join-Path $env:LOCALAPPDATA ('GaryHub\updates\'+$build)
 [IO.Directory]::CreateDirectory($folder)|Out-Null
 $marker=Join-Path $folder 'package.sha256'
 if((Test-Path -LiteralPath $marker) -and ([IO.File]::ReadAllText($marker)).Trim() -ne $expected){throw 'A different package exists in this release cache.'}
 $cachedZip=Join-Path $folder 'package.zip';[IO.File]::WriteAllBytes($cachedZip,$bytes)
 Expand-Archive -LiteralPath $cachedZip -DestinationPath $folder -Force
 [IO.File]::WriteAllText($marker,$expected)
 $bootstrap=@'
import base64,hashlib,io,os,pathlib,subprocess,sys,zipfile
os.umask(0o077)
data=base64.b64decode("PAYLOAD_BASE64",validate=False)
expected="PACKAGE_SHA256"
if hashlib.sha256(data).hexdigest()!=expected:raise RuntimeError("Package checksum mismatch")
root=pathlib.Path("/opt/garyhub-update-INSTALLER_BUILD_ID")
if root.is_symlink():raise RuntimeError("Unexpected release directory symlink")
if root.exists() and any(root.iterdir()) and not (root/"package.sha256").is_file():raise RuntimeError("Nonempty release directory without package marker; review required")
root.mkdir(mode=0o700,parents=True,exist_ok=True)
marker=root/"package.sha256"
if marker.exists() and marker.read_text().strip()!=expected:raise RuntimeError("Another package already occupies this release directory")
with zipfile.ZipFile(io.BytesIO(data)) as z:
 for name in z.namelist():
  p=pathlib.PurePosixPath(name)
  if p.is_absolute() or ".." in p.parts:raise RuntimeError("Invalid archive path")
 z.extractall(root)
marker.write_text(expected)
args=["python3",str(root/"deploy.py")]
if ROLLBACK_FLAG:args.append("--rollback")
sys.exit(subprocess.call(args))
'@
 $mode=if($Rollback){'True'}else{'False'}
 $script=$bootstrap.Replace('PAYLOAD_BASE64',[Convert]::ToBase64String($bytes)).Replace('ROLLBACK_FLAG',$mode)
 Write-Host 'Connecting to GaryHub. Enter your existing SSH key passphrase if prompted.'
 if($Rollback){Write-Host ('Restoring previous v'+$requires+' application images; preserving all current records.')}
 else{Write-Host ('Installer '+$build+': checking, testing, backing up, deploying, verifying HTTPS and publishing in-site update notices.')}
 $serverLines=New-Object System.Collections.Generic.List[string]
 $script | & ssh.exe -T -i $KeyPath -o ConnectTimeout=20 -o StrictHostKeyChecking=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=8 $Server python3 - | ForEach-Object {Write-Host $_;$serverLines.Add([string]$_)}
 if($LASTEXITCODE -ne 0){throw 'Server did not report completion. Send the final STOPPED output back; do not bypass checks.'}
 if(-not $Rollback -and -not $SkipSourceSync){
  try{
   $sourceRoot=Join-Path $folder 'git-source'
   & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $sourceRoot 'Push-GitHub.ps1') -Repo $Repo -PackageRoot $sourceRoot -PrepareOnly
   if($LASTEXITCODE -ne 0){throw 'Source preparation stopped; the server update remains complete.'}
  }catch{Write-Warning ('Server update completed. Local source preparation needs review: '+$_.Exception.Message)}
 }
 if($Rollback){Write-Host 'ROLLBACK COMPLETE. Current user records were retained.'}
 else{Write-Host ('COMPLETE v'+$version+'. Mouse hover, magnification and descriptions are restored; existing records retained.')}
 Write-Host ('Source, tests and documentation: '+$folder)
 Write-Host 'Please send the final output back to verify the actual server result.'
}catch{Write-Host ('STOPPED: '+$_.Exception.Message) -ForegroundColor Red;exit 1}
