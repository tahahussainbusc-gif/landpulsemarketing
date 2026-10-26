$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$rootPrefix = (Resolve-Path -LiteralPath $root).Path.TrimEnd("\") + "\"
$townsPath = Join-Path $root "Towns"
$teamPath = Join-Path $root "images\TEAM"
$logoPath = Join-Path $root "images\LOGO"
$masterManifestPath = Join-Path $townsPath "manifest.json"
$inventoryPath = Join-Path $townsPath "inventory.json"
$assetsManifestPath = Join-Path $root "assets-manifest.json"
$projectCount = 100
$propertyCount = 100
$imageExtensions = @(
    ".jpg", ".jpeg", ".jpe", ".jfif", ".pjpeg", ".pjp", ".png", ".apng",
    ".gif", ".webp", ".avif", ".bmp", ".dib", ".svg", ".tif", ".tiff",
    ".ico", ".heic", ".heif", ".jxl"
)
$videoExtensions = @(".mp4", ".m4v", ".mov", ".webm", ".ogv")

function Write-JsonFile {
    param($Value, [string]$Path)
    $json = (ConvertTo-Json -InputObject $Value -Depth 12) + [Environment]::NewLine
    if ((Test-Path -LiteralPath $Path -PathType Leaf) -and
        [System.IO.File]::ReadAllText($Path) -ceq $json) {
        return
    }
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8WithoutBom)
}

function ConvertTo-ManifestPath {
    param([string]$Path)
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    if (-not $resolvedPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Asset path is outside the website root: $Path"
    }
    $relativePath = $resolvedPath.Substring($rootPrefix.Length).Replace("\", "/")
    return (($relativePath -split "/" | ForEach-Object { [Uri]::EscapeDataString($_) }) -join "/")
}

function Get-Text {
    param($Details, [string]$Key, [string]$Fallback = "")
    $property = $Details.PSObject.Properties[$Key]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $Fallback
    }
    return ([string]$property.Value).Trim()
}

function Read-JsonObject {
    param([string]$Path)
    try {
        $value = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    } catch {
        throw "Invalid JSON at '$Path': $($_.Exception.Message)"
    }
    if ($null -eq $value -or $value -isnot [PSCustomObject]) {
        throw "Expected a JSON object at '$Path'."
    }
    return $value
}

if (-not (Test-Path -LiteralPath $townsPath -PathType Container)) {
    New-Item -ItemType Directory -Path $townsPath | Out-Null
}

$photosByListing = @{}
$townsImages = @(Get-ChildItem -LiteralPath $townsPath -File -Recurse |
    Where-Object { $imageExtensions -contains $_.Extension.ToLowerInvariant() } |
    Sort-Object FullName)
foreach ($imageFile in $townsImages) {
    $listingDirectory = $imageFile.Directory
    while ($null -ne $listingDirectory -and $listingDirectory.Name -notin @("For Sale", "For Rent")) {
        $listingDirectory = $listingDirectory.Parent
    }
    if ($null -eq $listingDirectory) {
        continue
    }

    $listingPathKey = $listingDirectory.FullName
    if (-not $photosByListing.ContainsKey($listingPathKey)) {
        $photosByListing[$listingPathKey] = [System.Collections.Generic.List[string]]::new()
    }
    $photosByListing[$listingPathKey].Add((ConvertTo-ManifestPath $imageFile.FullName))
}

if (-not (Test-Path -LiteralPath $masterManifestPath -PathType Leaf)) {
    $projects = [System.Collections.Generic.List[object]]::new()
    for ($projectNumber = 1; $projectNumber -le $projectCount; $projectNumber++) {
        $title = switch ($projectNumber) {
            1 { "Gulberg City"; break }
            2 { "Smart City"; break }
            3 { "Canal Palm"; break }
            default { "Project $($projectNumber.ToString('D3'))" }
        }
        $projects.Add([ordered]@{ title = $title })
    }
    Write-JsonFile ([ordered]@{ projects = $projects.ToArray() }) $masterManifestPath
}

$master = Read-JsonObject $masterManifestPath
if ($master.PSObject.Properties.Count -ne 1 -or
    $null -eq $master.projects -or $master.projects -isnot [System.Array] -or
    $master.projects.Count -ne $projectCount) {
    throw "$masterManifestPath must contain only a projects array with exactly $projectCount entries."
}

foreach ($project in $master.projects) {
    $projectPropertyNames = @($project.PSObject.Properties | ForEach-Object { $_.Name })
    if ($null -eq $project -or $project -isnot [PSCustomObject] -or
        $project.PSObject.Properties.Count -ne 1 -or
        $projectPropertyNames[0] -ne "title" -or
        $project.title -isnot [string] -or [string]::IsNullOrWhiteSpace($project.title)) {
        throw "Each project entry must contain only a non-empty title."
    }
}

$inventory = [System.Collections.Generic.List[object]]::new()
for ($projectIndex = 0; $projectIndex -lt $projectCount; $projectIndex++) {
    $projectTitle = $master.projects[$projectIndex].title.Trim()
    $projectFolder = "Project $($($projectIndex + 1).ToString('D3'))"
    $projectPath = Join-Path $townsPath $projectFolder
    New-Item -ItemType Directory -Path $projectPath -Force | Out-Null

    $projectManifestPath = Join-Path $projectPath "manifest.json"
    if (-not (Test-Path -LiteralPath $projectManifestPath -PathType Leaf)) {
        $propertyTitles = [System.Collections.Generic.List[object]]::new()
        for ($propertyNumber = 1; $propertyNumber -le $propertyCount; $propertyNumber++) {
            $propertyTitles.Add([ordered]@{ title = "Property $($propertyNumber.ToString('D3'))" })
        }
        Write-JsonFile ([ordered]@{ properties = $propertyTitles.ToArray() }) $projectManifestPath
    }

    $projectManifest = Read-JsonObject $projectManifestPath
    if ($projectManifest.PSObject.Properties.Count -ne 1 -or
        $null -eq $projectManifest.properties -or $projectManifest.properties -isnot [System.Array] -or
        $projectManifest.properties.Count -ne $propertyCount) {
        throw "$projectManifestPath must contain only a properties array with exactly $propertyCount entries."
    }

    for ($propertyIndex = 0; $propertyIndex -lt $propertyCount; $propertyIndex++) {
        $propertyTitle = $projectManifest.properties[$propertyIndex]
        $propertyTitleNames = @($propertyTitle.PSObject.Properties | ForEach-Object { $_.Name })
        if ($null -eq $propertyTitle -or $propertyTitle -isnot [PSCustomObject] -or
            $propertyTitle.PSObject.Properties.Count -ne 1 -or
            $propertyTitleNames[0] -ne "title" -or
            $propertyTitle.title -isnot [string] -or [string]::IsNullOrWhiteSpace($propertyTitle.title)) {
            throw "Each property entry in '$projectManifestPath' must contain only a non-empty title."
        }

        $propertyFolder = "Property $($($propertyIndex + 1).ToString('D3'))"
        $propertyPath = Join-Path $projectPath $propertyFolder
        New-Item -ItemType Directory -Path $propertyPath -Force | Out-Null

        foreach ($listingType in @(
            [PSCustomObject]@{ folder = "For Sale"; key = "sale" },
            [PSCustomObject]@{ folder = "For Rent"; key = "rent" }
        )) {
            $listingPath = Join-Path $propertyPath $listingType.folder
            New-Item -ItemType Directory -Path $listingPath -Force | Out-Null
            $listingManifestPath = Join-Path $listingPath "manifest.json"

            if (-not (Test-Path -LiteralPath $listingManifestPath -PathType Leaf)) {
                Write-JsonFile ([ordered]@{
                    title = ""
                    description = ""
                    price = ""
                    beds = ""
                    baths = ""
                    size = ""
                    category = ""
                    location = ""
                }) $listingManifestPath
            }

            $details = Read-JsonObject $listingManifestPath
            $linkedPhotos = [System.Collections.Generic.List[string]]::new()
            if ($photosByListing.ContainsKey($listingPath)) {
                foreach ($imagePath in $photosByListing[$listingPath]) {
                    if (-not $linkedPhotos.Contains($imagePath)) {
                        $linkedPhotos.Add($imagePath)
                    }
                }
            }

            $title = Get-Text $details "title"
            $description = Get-Text $details "description"
            $price = Get-Text $details "price"
            $beds = Get-Text $details "beds"
            $baths = Get-Text $details "baths"
            $size = Get-Text $details "size"
            $category = (Get-Text $details "category").ToLowerInvariant()
            $location = Get-Text $details "location" $projectTitle
            if (-not $location) {
                $location = $projectTitle
            }

            if ($title -and $description -and $price -and $beds -and $baths -and $size -and
                $category -in @("residential", "commercial", "plots", "villas") -and
                $linkedPhotos.Count -gt 0) {
                $inventory.Add([ordered]@{
                    manifestPath = ConvertTo-ManifestPath $listingManifestPath
                    projectTitle = $projectTitle
                    propertyTitle = $propertyTitle.title.Trim()
                    photos = $linkedPhotos.ToArray()
                    listingType = $listingType.key
                })
            }
        }
    }
}

foreach ($listingPath in @(Get-ChildItem -LiteralPath $townsPath -Directory -Recurse |
        Where-Object { $_.Name -in @("For Sale", "For Rent") } |
        Sort-Object FullName)) {
    if ($listingPath.Parent.Parent.Name -match '^Project \d{3}$' -and
        $listingPath.Parent.Name -match '^Property \d{3}$') {
        continue
    }

    $listingManifestPath = Join-Path $listingPath.FullName "manifest.json"
    if (-not (Test-Path -LiteralPath $listingManifestPath -PathType Leaf)) {
        Write-JsonFile ([ordered]@{
            title = ""
            description = ""
            price = ""
            beds = ""
            baths = ""
            size = ""
            category = ""
            location = ""
        }) $listingManifestPath
    }

    $details = Read-JsonObject $listingManifestPath
    $linkedPhotos = [System.Collections.Generic.List[string]]::new()
    if ($photosByListing.ContainsKey($listingPath.FullName)) {
        foreach ($imagePath in $photosByListing[$listingPath.FullName]) {
            if (-not $linkedPhotos.Contains($imagePath)) {
                $linkedPhotos.Add($imagePath)
            }
        }
    }

    $title = Get-Text $details "title"
    $description = Get-Text $details "description"
    $price = Get-Text $details "price"
    $beds = Get-Text $details "beds"
    $baths = Get-Text $details "baths"
    $size = Get-Text $details "size"
    $category = (Get-Text $details "category").ToLowerInvariant()
    if ($title -and $description -and $price -and $beds -and $baths -and $size -and
        $category -in @("residential", "commercial", "plots", "villas") -and
        $linkedPhotos.Count -gt 0) {
        $listingType = if ($listingPath.Name -eq "For Sale") { "sale" } else { "rent" }
        $projectTitle = $listingPath.Parent.Parent.Name
        $propertyTitle = $listingPath.Parent.Name
        $inventory.Add([ordered]@{
            manifestPath = ConvertTo-ManifestPath $listingManifestPath
            projectTitle = $projectTitle
            propertyTitle = $propertyTitle
            photos = $linkedPhotos.ToArray()
            listingType = $listingType
        })
    }
}

$logo = $null
if (Test-Path -LiteralPath $logoPath -PathType Container) {
    $logoFile = Get-ChildItem -LiteralPath $logoPath -File |
        Where-Object { $imageExtensions -contains $_.Extension.ToLowerInvariant() } |
        Sort-Object @{ Expression = { if ($_.BaseName -ieq "logo") { 0 } else { 1 } } }, FullName |
        Select-Object -First 1
    if ($null -ne $logoFile) {
        $logo = ConvertTo-ManifestPath $logoFile.FullName
    }
}

$teamProfiles = [System.Collections.Generic.List[object]]::new()
if (Test-Path -LiteralPath $teamPath -PathType Container) {
    foreach ($teamFolder in (Get-ChildItem -LiteralPath $teamPath -Directory | Sort-Object Name)) {
        $detailsPath = Join-Path $teamFolder.FullName "details.json"
        if (-not (Test-Path -LiteralPath $detailsPath -PathType Leaf)) {
            continue
        }

        $photoFile = Get-ChildItem -LiteralPath $teamFolder.FullName -File -Recurse |
            Where-Object { $imageExtensions -contains $_.Extension.ToLowerInvariant() } |
            Sort-Object @{ Expression = { if ($_.BaseName -ieq $teamFolder.Name) { 0 } else { 1 } } }, FullName |
            Select-Object -First 1
        $videoFile = Get-ChildItem -LiteralPath $teamFolder.FullName -File -Recurse |
            Where-Object { $videoExtensions -contains $_.Extension.ToLowerInvariant() } |
            Sort-Object FullName |
            Select-Object -First 1

        $photoPath = ""
        if ($null -ne $photoFile) {
            $photoPath = ConvertTo-ManifestPath $photoFile.FullName
        }
        $introVideoPath = ""
        if ($null -ne $videoFile) {
            $introVideoPath = ConvertTo-ManifestPath $videoFile.FullName
        }

        $teamProfiles.Add([ordered]@{
            folder = $teamFolder.Name
            details = ConvertTo-ManifestPath $detailsPath
            initials = $teamFolder.Name.Substring(0, [Math]::Min(3, $teamFolder.Name.Length)).ToUpperInvariant()
            photo = $photoPath
            introVideo = $introVideoPath
        })
    }
}

Write-JsonFile ([ordered]@{
    logo = $logo
    teams = $teamProfiles.ToArray()
}) $assetsManifestPath
Write-JsonFile ([ordered]@{ listings = $inventory.ToArray() }) $inventoryPath
Write-Output "Prepared $projectCount projects with $propertyCount properties each."
Write-Output "Scanned every For Sale and For Rent folder; indexed $($inventory.Count) complete listing(s)."
Write-Output "Auto-detected the brand logo and $($teamProfiles.Count) team profile(s), including available photos and videos."
Write-Output "Master manifest: $masterManifestPath"
Write-Output "Generated listing index: $inventoryPath"
Write-Output "Generated shared asset manifest: $assetsManifestPath"
