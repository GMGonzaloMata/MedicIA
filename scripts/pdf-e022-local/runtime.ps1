param([Parameter(Mandatory=$true)][ValidateSet('Prepare','Build','WrapperTests','ImportModel','ResumeImportModel','Start','Smoke','Fixture')][string]$Step)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Cache = Join-Path $Root 'node_modules/.cache/medicia-pdf-runtime-build-compat/runtime'
$Context = Join-Path $Cache 'context'
$Prefix = 'medicia-pdf-e022-local-01a1e570'
$Image = "$Prefix-reader:local"
$Base = 'sha256:9871d08b243d17ae399a290751e67ec22ec5250118a6fccba132d1acaf338aa4'
$BaseDigest = 'sha256:85b6c041ca253782ebb2f769ab765790f2a70c09467f66aac4b1beabf11d8236'
$ZipPath = 'C:\Users\lucho\Downloads\E022 - Paquete SageMaker piloto tecnico-20261116T143639Z-1-001.zip'
# -db y -db-data son exclusivamente del padre; este script nunca los inspecciona/modifica.
function Run-Docker([string[]]$Arguments) {
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker failed ($LASTEXITCODE). Preserve names/logs; no cleanup or retry." }
}
function Write-ExclusiveText([string]$Path, [string]$Text) {
    if (Test-Path -LiteralPath $Path) { throw 'Import evidence already exists; preserve it.' }
    $File = [IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try { $Bytes=[Text.Encoding]::UTF8.GetBytes($Text);$File.Write($Bytes,0,$Bytes.Length) } finally { $File.Dispose() }
}
function Assert-VolumeOwner([string]$Name, [string]$ExpectedOwner) {
    try {
        if ($ExpectedOwner -cnotmatch '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') { throw 'token' }
        $Rows = @(& {
            $ErrorActionPreference = 'Continue'
            $global:LASTEXITCODE = $null
            & docker volume inspect --format '{{json .Labels}}' $Name 2>&1
        })
        if ($global:LASTEXITCODE -ne 0 -or $Rows.Count -ne 1 -or $Rows[0] -isnot [string]) { throw 'docker' }
        # Un único label string: rechaza null/arrays/tipos/coerciones/duplicados y keys ajenas.
        if ($Rows[0] -cnotmatch '^\s*\{\s*"medicia\.pdf-e022\.owner"\s*:\s*"[a-f0-9-]{36}"\s*\}\s*$') { throw 'shape' }
        $Labels = $Rows[0] | ConvertFrom-Json -ErrorAction Stop
        if ($Labels.'medicia.pdf-e022.owner' -isnot [string] -or $Labels.'medicia.pdf-e022.owner' -cne $ExpectedOwner) { throw 'owner' }
    } catch { throw 'Exclusive model volume ownership mismatch' }
}
function Assert-LocalDocker {
    if ($env:DOCKER_HOST) { throw 'Import requires the exact local Docker context' }
    $Current = & docker context show
    if ($LASTEXITCODE -ne 0 -or $Current -cne 'desktop-linux') { throw 'Import requires the exact local Docker context' }
    $Endpoint = & docker --context desktop-linux context inspect desktop-linux --format '{{.Endpoints.docker.Host}}'
    if ($LASTEXITCODE -ne 0 -or $Endpoint -cne 'npipe:////./pipe/dockerDesktopLinuxEngine') { throw 'Import requires the exact local Docker context' }
}
function Assert-ImportRecovery([string]$Volume, [string]$ExpectedOwner, [string]$WrapperImage) {
    try {
        # Adopción humana L128 / ImportModel-vtopm7: NO autorización genérica de reutilización.
        if ($Volume -cne 'medicia-pdf-e022-local-01a1e570-model' -or $ExpectedOwner -cne '03281252-1af6-4587-a1c4-0e8c4908ae63' -or
            $WrapperImage -cne 'sha256:249d5e805e05afead656b382a255d2986a4fb5a2c13c2e3aef169453f3a2656b') { throw 'authorization' }
        Assert-LocalDocker
        Assert-VolumeOwner $Volume $ExpectedOwner
        Assert-New 'container' 'medicia-pdf-e022-local-01a1e570-import'
    } catch { throw 'Import recovery rejected; preserve volume and evidence.' }
}
function Get-VerifiedBuilder {
    # Solo registros autorizados del builder YA creado por el padre. Nunca bootstrap/create.
    try {
        $Config = Join-Path $Root 'node_modules/.cache/medicia-pdf-runtime-builder'
        $BuilderName = "$Prefix-builder"
        $NodeName = "$Prefix-node"
        $Kit = 'moby/buildkit@sha256:054d632d0d7e94b11cdc6048674773499a5170cf7d8ce0c326daaff6be43c8e0'
        $KitId = 'sha256:4a177e10126688bb9608de9661b5c2204222e232d261339ff4c94eb785b211fa'
        if ($env:BUILDX_CONFIG -and [IO.Path]::GetFullPath($env:BUILDX_CONFIG) -ine $Config) { throw 'config' }
        foreach ($Directory in @($Root,(Join-Path $Root 'node_modules'),(Join-Path $Root 'node_modules/.cache'),$Config,(Join-Path $Config 'instances'))) {
            $Item = Get-Item -LiteralPath $Directory -Force
            if (-not $Item.PSIsContainer -or ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'directory' }
        }
        foreach ($Name in @('medicia-owner.json','pin.json','image-verified.json','resources-verified.json',"instances/$BuilderName")) {
            $Item = Get-Item -LiteralPath (Join-Path $Config $Name) -Force
            if ($Item.PSIsContainer -or $Item.Length -gt 16384 -or ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'record' }
        }
        $Owner = Get-Content -LiteralPath (Join-Path $Config 'medicia-owner.json') -Raw | ConvertFrom-Json
        $Pin = Get-Content -LiteralPath (Join-Path $Config 'pin.json') -Raw | ConvertFrom-Json
        $ImageProof = Get-Content -LiteralPath (Join-Path $Config 'image-verified.json') -Raw | ConvertFrom-Json
        $Resource = Get-Content -LiteralPath (Join-Path $Config 'resources-verified.json') -Raw | ConvertFrom-Json
        $Instance = Get-Content -LiteralPath (Join-Path $Config "instances/$BuilderName") -Raw | ConvertFrom-Json
        if ($Owner.owner -cne '01a1e570-bf21-713e-a6ad-6707cb5b4178' -or $Owner.purpose -cne 'pdf-e022-local-builder' -or
            [IO.Path]::GetFullPath($Owner.root) -ine $Root -or $Owner.requestedBuildKit -cne 'v0.27.0' -or $Owner.privilegedContainerAuthorized -ne $true -or
            $Pin.version -cne 'v0.27.0' -or $Pin.image -cne $Kit -or $Pin.platform -cne 'linux/amd64' -or $Pin.builder -cne $BuilderName -or
            $Pin.platformManifest -cne 'sha256:ca9db05302dc3a4846e3401ecfbd27e349fcc614ab046a7d89a83b0a5c313cee' -or
            $ImageProof.image -cne $Kit -or $ImageProof.id -cne $KitId -or $ImageProof.os -cne 'linux' -or $ImageProof.arch -cne 'amd64' -or
            $ImageProof.builder -cne $BuilderName -or $ImageProof.node -cne $NodeName -or
            $Instance.Name -cne $BuilderName -or $Instance.Driver -cne 'docker-container' -or $Instance.Dynamic -ne $false -or @($Instance.Nodes).Count -ne 1) { throw 'identity' }
        $Node = @($Instance.Nodes)[0]
        if ($Node.Name -cne $NodeName -or $Node.Endpoint -cne 'desktop-linux' -or $Node.DriverOpts.image -cne $Kit -or
            @($Node.Flags).Count -ne 1 -or $Node.Flags[0] -cne '--allow-insecure-entitlement=network.host' -or
            $Resource.container -cne "buildx_buildkit_$NodeName" -or $Resource.id -cnotmatch '^[a-f0-9]{64}$' -or
            $Resource.image -cne $KitId -or $Resource.reference -cne $Kit -or $Resource.privileged -ne $true -or
            $Resource.volume -cne "buildx_buildkit_${NodeName}_state" -or $Resource.buildkitVersion -cne 'v0.27.0') { throw 'node' }
        $Endpoint = & docker --context desktop-linux context inspect desktop-linux --format '{{.Endpoints.docker.Host}}'
        if ($LASTEXITCODE -ne 0 -or $Endpoint -cne 'npipe:////./pipe/dockerDesktopLinuxEngine') { throw 'endpoint' }
        # Selectores explícitos; nunca full inspect, variables privadas ni --bootstrap.
        $Live = & docker --context desktop-linux container inspect --format '{{.Id}}|{{.Image}}|{{.Config.Image}}|{{.State.Running}}|{{.HostConfig.Privileged}}|{{range .Mounts}}{{.Type}}:{{.Name}}:{{.Destination}};{{end}}' $Resource.container
        if ($LASTEXITCODE -ne 0 -or $Live -cne "$($Resource.id)|${KitId}|${Kit}|true|true|volume:$($Resource.volume):/var/lib/buildkit;") { throw 'resource' }
        return $BuilderName
    } catch { throw 'Owned local builder validation failed; no build allowed' }
}
function Get-VerifiedImage {
    $Manifest = Get-Content -LiteralPath (Join-Path $Cache 'image-manifest.json') -Raw | ConvertFrom-Json
    $Keys = @($Manifest.PSObject.Properties.Name)
    if ($Keys.Count -ne 5 -or @('schema','baseImageId','baseManifestDigest','imageId','contextManifestSha256').Where({$_ -notin $Keys}).Count -ne 0 -or
        $Manifest.schema -ne 'pdf-e022-image.v2' -or $Manifest.baseImageId -ne $Base -or
        $Manifest.baseManifestDigest -isnot [string] -or $Manifest.baseManifestDigest -cne $BaseDigest -or
        $Manifest.imageId -cnotmatch '^sha256:[a-f0-9]{64}$' -or $Manifest.contextManifestSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'Invalid immutable image provenance' }
    $ContextHash = (Get-FileHash -LiteralPath (Join-Path $Cache 'context-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ContextHash -ne $Manifest.contextManifestSha256) { throw 'Build context provenance mismatch' }
    $Actual = & docker image inspect --format '{{.Id}}' $Manifest.imageId
    if ($LASTEXITCODE -ne 0 -or $Actual -ne $Manifest.imageId) { throw 'Immutable wrapper image mismatch' }
    return $Manifest.imageId
}
function Assert-New([ValidateSet('image','container','volume','network')][string]$Kind, [string]$Name) {
    $Format = if ($Kind -eq 'volume') { '{{.Name}}' } else { '{{.Id}}' }
    $Inspection = & {
        # PS 5.1 convierte stderr nativo en ErrorRecord incluso con redirección.
        # Continue vive SOLO en este scope hijo y esta consulta; afuera sigue Stop.
        $ErrorActionPreference = 'Continue'
        # El nativo actualiza el binding global en PS 5.1; uno local oculta el exit real.
        # Reiniciar y leer el mismo binding evita también reutilizar un exit anterior.
        $global:LASTEXITCODE = $null
        $Rows = @(& docker $Kind inspect --format $Format $Name 2>&1)
        [pscustomobject]@{
            ExitCode = $global:LASTEXITCODE
            Stdout = @($Rows | Where-Object { $_ -isnot [Management.Automation.ErrorRecord] })
            Stderr = @($Rows | Where-Object { $_ -is [Management.Automation.ErrorRecord] } | ForEach-Object { $_.ToString() })
        }
    }
    if ($Inspection.ExitCode -eq 0) { throw "Exclusive resource already exists: $Name. No reuse/cleanup." }
    $Missing = switch ($Kind) {
        'image' { "Error response from daemon: No such image: $Name" }
        'container' { "Error: No such container: $Name"; "Error response from daemon: No such container: $Name" }
        'volume' { "Error response from daemon: get ${Name}: no such volume" }
        'network' { "Error response from daemon: network $Name not found" }
    }
    $ErrorText = ($Inspection.Stderr -join "`n").Trim()
    # Docker --format puede emitir filas exactamente vacías; espacios/texto siguen siendo datos inesperados.
    if ($Inspection.ExitCode -eq 1 -and
        @($Inspection.Stdout | Where-Object { $_ -isnot [string] -or $_.Length -ne 0 }).Count -eq 0 -and
        $Inspection.Stderr.Count -gt 0 -and @($Missing) -ccontains $ErrorText) { return }
    throw "Cannot establish exclusive absence: $Name (exit $($Inspection.ExitCode)). No resource creation."
}
$Limits = @('--read-only','--user','65534:65534','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--cpus','2','--memory','2g','--memory-swap','2g','--pids-limit','96','--tmpfs','/tmp:rw,noexec,nosuid,size=128m,uid=65534,gid=65534')
# Entrada soportada: run-step.mjs, que acota TODO el proceso y sus hijos, incluso CopyTo/WaitForExit.
if (-not $env:MEDICIA_PDF_RUNTIME_DEADLINE) { throw 'Use run-step.mjs with an external process deadline' }
if ($Step -eq 'Build') { $Builder = Get-VerifiedBuilder }
Push-Location $Root
try {
    if ($Step -eq 'Prepare') { & node 'scripts/pdf-e022-local/prepare-source.mjs' }
    else { & node 'scripts/pdf-e022-local/prepare-source.mjs' '--validate-only' }
    if ($LASTEXITCODE -ne 0) { throw 'Closed build context validation failed; no Docker operation allowed' }
} finally { Pop-Location }
if ($Step -eq 'Prepare') { return }
if ($Step -eq 'Build') {
    $PreviousBuildxConfig = $env:BUILDX_CONFIG
    $PreviousDockerContext = $env:DOCKER_CONTEXT
    try {
    $env:BUILDX_CONFIG = Join-Path $Root 'node_modules/.cache/medicia-pdf-runtime-builder'
    $env:DOCKER_CONTEXT = 'desktop-linux'
    Push-Location $Root
    try {
        $BaseText = & node 'scripts/pdf-e022-local/prepare-source.mjs' '--verify-base'
        if ($LASTEXITCODE -ne 0) { throw 'Immutable OCI base validation failed; no Docker operation allowed' }
        $BaseProof = $BaseText | ConvertFrom-Json
    } finally { Pop-Location }
    # Buildx 0.38.1 Parse conserva la ruta Windows tras oci-layout://; NO /C:/ ni file URI.
    $BaseUri = 'oci-layout://' + ([IO.Path]::GetFullPath((Join-Path $Root 'node_modules/.cache/medicia-pdf-runtime-build-compat/base-oci')).Replace('\','/')) + '@' + $BaseDigest
    if ($BaseProof.baseImageId -cne $Base -or $BaseProof.manifestDigest -cne $BaseDigest -or $BaseProof.uri -cne $BaseUri) { throw 'OCI transport identity mismatch' }
    Assert-New 'image' $Image
    $LoadedBase = & docker image inspect --format '{{.Id}}' $Base
    if ($LASTEXITCODE -ne 0 -or $LoadedBase -ne $Base) { throw 'Authorized immutable base image is unavailable' }
    $Iid = Join-Path $Cache 'wrapper.iid'
    $ImageManifest = Join-Path $Cache 'image-manifest.json'
    $BuildMetadata = Join-Path $Cache 'wrapper-build.json'
    if ((Test-Path -LiteralPath $Iid) -or (Test-Path -LiteralPath $ImageManifest) -or (Test-Path -LiteralPath $BuildMetadata)) { throw 'Build evidence already exists; no overwrite/retry' }
    Run-Docker -Arguments @('--context','desktop-linux','buildx','build','--builder',$Builder,'--load','--pull=false','--network','default','--build-context',"e022base=$BaseUri",'--iidfile',$Iid,'--metadata-file',$BuildMetadata,'--tag',$Image,$Context)
    $ExportId = [IO.File]::ReadAllText($Iid).Trim()
    if ($ExportId -cnotmatch '^sha256:[a-f0-9]{64}$') { throw 'Build did not report an immutable image ID' }
    # buildx iidfile puede ser digest del manifest, NO necesariamente .Id del engine.
    # Ligar ambos digests del exporter y comprobar el config ID realmente cargado.
    $Export = Get-Content -LiteralPath $BuildMetadata -Raw | ConvertFrom-Json
    $BuiltId = $Export.'containerimage.config.digest'
    $ManifestId = $Export.'containerimage.digest'
    if ($BuiltId -cnotmatch '^sha256:[a-f0-9]{64}$' -or $ManifestId -cnotmatch '^sha256:[a-f0-9]{64}$' -or
        ($ExportId -cne $BuiltId -and $ExportId -cne $ManifestId)) { throw 'Built image identity mismatch' }
    $Loaded = & docker image inspect --format '{{.Id}}' $Image
    if ($LASTEXITCODE -ne 0 -or $Loaded -cne $BuiltId) { throw 'Built image identity mismatch' }
    $Actual = & docker image inspect --format '{{.Id}}' $BuiltId
    if ($LASTEXITCODE -ne 0 -or $Actual -cne $BuiltId) { throw 'Built image identity mismatch' }
    $Metadata = @{schema='pdf-e022-image.v2';baseImageId=$Base;baseManifestDigest=$BaseDigest;imageId=$BuiltId;contextManifestSha256=(Get-FileHash -LiteralPath (Join-Path $Cache 'context-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json
    $File = [IO.File]::Open($ImageManifest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
    try { $Bytes=[Text.Encoding]::UTF8.GetBytes($Metadata);$File.Write($Bytes,0,$Bytes.Length) } finally { $File.Dispose() }
    } finally {
        $env:BUILDX_CONFIG = $PreviousBuildxConfig
        $env:DOCKER_CONTEXT = $PreviousDockerContext
    }
    return
}
if ($Step -eq 'WrapperTests') {
    $WrapperImage = Get-VerifiedImage
    Assert-New 'container' "$Prefix-wrapper-tests"
    Run-Docker -Arguments (@('run','--name',"$Prefix-wrapper-tests",'--pull=never','--network','none') + $Limits +
        @('--entrypoint','python',$WrapperImage,'-B','-m','unittest','discover','-s','/app/tests','-v'))
    return
}
if ($Step -in @('ImportModel','ResumeImportModel')) {
    Assert-LocalDocker
    $WrapperImage = Get-VerifiedImage
    $Resuming = $Step -eq 'ResumeImportModel'
    if ($Resuming) {
        $Owner = '03281252-1af6-4587-a1c4-0e8c4908ae63'
        Assert-ImportRecovery "$Prefix-model" $Owner $WrapperImage
    } else {
        Assert-New 'volume' "$Prefix-model"
        Assert-New 'container' "$Prefix-import"
        $Owner = [Guid]::NewGuid().ToString()
    }
    $OuterName = if ($Resuming) { 'recovery-outer-model-manifest.json' } else { 'outer-model-manifest.json' }
    foreach ($Name in @($OuterName,'model-volume-owner.txt','model-import.stdout.log','model-import.stderr.log','model-import.exit.txt','model-import-recovery.json')) {
        if (Test-Path -LiteralPath (Join-Path $Cache $Name)) { throw 'Import evidence already exists; preserve it.' }
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $Zip = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        $Entries = @($Zip.Entries | Where-Object { $_.FullName -eq 'E022 - Paquete SageMaker piloto tecnico/model.tar.gz' })
        if ($Entries.Count -ne 1 -or $Entries[0].Length -ne 344096102) { throw 'Authorized model ZIP member mismatch' }
        $ManifestEntry = @($Zip.Entries | Where-Object { $_.FullName -eq 'E022 - Paquete SageMaker piloto tecnico/SHA256-manifest.json' })
        if ($ManifestEntry.Count -ne 1 -or $ManifestEntry[0].Length -gt 4096) { throw 'Missing bounded outer manifest' }
        $ManifestReader = [IO.StreamReader]::new($ManifestEntry[0].Open())
        try { $Manifest = $ManifestReader.ReadToEnd() | ConvertFrom-Json } finally { $ManifestReader.Dispose() }
        $ManifestText = $Manifest | ConvertTo-Json -Depth 8
        if (-not $ManifestText.Contains('a453f8cbcb580f8ff0e591ba90e872931a658d60e0fedb6184d4a619e9583f96')) { throw 'Outer manifest model hash mismatch' }
        if ($Resuming) {
            $Recovery = @{schema='pdf-e022-import-recovery.v1';authorization='odd/tasks/pdf-unified-report.md L128';failedRun='ImportModel-vtopm7';volume="$Prefix-model";owner=$Owner;wrapperImageId=$WrapperImage;contextManifestSha256=(Get-FileHash -LiteralPath (Join-Path $Cache 'context-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant();expectedArchiveSha256='a453f8cbcb580f8ff0e591ba90e872931a658d60e0fedb6184d4a619e9583f96';status='authorized-preflight-only-import-not-proved'} | ConvertTo-Json
            Write-ExclusiveText (Join-Path $Cache 'model-import-recovery.json') $Recovery
        }
        Write-ExclusiveText (Join-Path $Cache $OuterName) $ManifestText
        # Guardar el token ANTES de crear/importar: evidencia de intención, no de importación exitosa.
        Write-ExclusiveText (Join-Path $Cache 'model-volume-owner.txt') $Owner
        if (-not $Resuming) {
            Run-Docker -Arguments @('volume','create','--label',"medicia.pdf-e022.owner=$Owner", "$Prefix-model")
        }
        Assert-VolumeOwner "$Prefix-model" $Owner
        # verify_model.py INMUTABLE exige /model vacío antes del TAR, abre con xb,
        # valida TAR completo + allowlist/hashes y nunca importa código dinámico aquí.
        $Arguments = @('run','-i','--name',"$Prefix-import",'--pull=never','--network','none') + $Limits +
            @('--mount',"type=volume,source=$Prefix-model,target=/model",'--entrypoint','python',$WrapperImage,'-B','/app/verify_model.py')
        $Info = [Diagnostics.ProcessStartInfo]::new()
        $Info.FileName = 'docker'
        $Info.Arguments = ($Arguments -join ' ')
        $Info.UseShellExecute = $false
        $Info.RedirectStandardInput = $true
        $Info.RedirectStandardOutput = $true
        $Info.RedirectStandardError = $true
        $Process = [Diagnostics.Process]::new()
        $Process.StartInfo = $Info
        $Stream = $Entries[0].Open()
        try { if (-not $Process.Start()) { throw 'Cannot start exclusive importer' } }
        catch { $Stream.Dispose(); throw }
        $Output = $Process.StandardOutput.ReadToEndAsync()
        $Errors = $Process.StandardError.ReadToEndAsync()
        $TransferFailed = $false
        try {
            $Stream.CopyTo($Process.StandardInput.BaseStream, 1048576)
        } catch { $TransferFailed = $true }
        finally {
            $Stream.Dispose()
            try { $Process.StandardInput.Close() } catch { $TransferFailed = $true }
        }
        $Process.WaitForExit()
        Write-ExclusiveText (Join-Path $Cache 'model-import.stdout.log') $Output.Result
        Write-ExclusiveText (Join-Path $Cache 'model-import.stderr.log') $Errors.Result
        Write-ExclusiveText (Join-Path $Cache 'model-import.exit.txt') ([string]$Process.ExitCode)
        if ($TransferFailed -or $Process.ExitCode -ne 0) { throw 'Model import failed. Preserve exclusive volume/container/logs; do not start model.' }
        Write-Output $Output.Result
    } finally { $Zip.Dispose() }
    return
}
if ($Step -eq 'Start') {
    $WrapperImage = Get-VerifiedImage
    foreach ($Port in @(18080,18081)) {
        $Listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$Port)
        try { $Listener.Start() } finally { $Listener.Stop() }
    }
    Assert-New 'network' "$Prefix-net"
    Assert-New 'container' "$Prefix-model-server"
    Assert-New 'container' "$Prefix-reader-server"
    # No permite autocrear/reutilizar otro volumen al montar. Solo metadatos de propiedad, no env.
    $ExpectedOwner = [IO.File]::ReadAllText((Join-Path $Cache 'model-volume-owner.txt')).Trim()
    Assert-VolumeOwner "$Prefix-model" $ExpectedOwner
    # Verifica nuevamente TODOS los miembros antes de importar net1d. Lector no recibe este mount.
    Assert-New 'container' "$Prefix-model-preflight"
    Run-Docker -Arguments (@('run','--name',"$Prefix-model-preflight",'--pull=never','--network','none') + $Limits +
        @('--mount',"type=volume,source=$Prefix-model,target=/opt/ml/model,readonly",'--entrypoint','python',$WrapperImage,'-B','/app/verify_model.py','--check'))
    Run-Docker -Arguments @('network','create','--internal',"$Prefix-net")
    Run-Docker -Arguments (@('run','-d','--name',"$Prefix-model-server",'--pull=never','--network',"$Prefix-net") + $Limits +
        @('-p','127.0.0.1:18080:8080','--mount',"type=volume,source=$Prefix-model,target=/opt/ml/model,readonly",$Base,'serve'))
    Run-Docker -Arguments (@('run','-d','--name',"$Prefix-reader-server",'--pull=never','--network',"$Prefix-net") + $Limits +
        @('-p','127.0.0.1:18081:8081',$WrapperImage))
    Write-Output 'Started exclusive serial servers. Readiness/inference NOT yet proved; run Smoke once ready.'
    return
}
if ($Step -eq 'Smoke') {
    $WrapperImage = Get-VerifiedImage
    Assert-New 'container' "$Prefix-smoke"
    Run-Docker -Arguments (@('run','--name',"$Prefix-smoke",'--pull=never','--network',"$Prefix-net") + $Limits +
        @('--entrypoint','python',$WrapperImage,'-B','/app/smoke.py',"http://$Prefix-model-server`:8080","http://$Prefix-reader-server`:8081"))
    return
}
if ($Step -eq 'Fixture') {
    $WrapperImage = Get-VerifiedImage
    Assert-New 'container' "$Prefix-fixture"
    # Solo PDF inventado; archivo base64 en caché propia para el smoke TypeScript del padre.
    $Result = Run-Docker -Arguments (@('run','--name',"$Prefix-fixture",'--pull=never','--network','none') + $Limits + @('--entrypoint','python',$WrapperImage,'-B','/app/synthetic_pdf.py'))
    [IO.File]::WriteAllText((Join-Path $Cache 'synthetic.pdf.b64'), $Result.Trim())
}
