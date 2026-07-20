param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RelativePath {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $resolvedBase = (Resolve-Path -LiteralPath $BasePath).Path
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    return [System.IO.Path]::GetRelativePath($resolvedBase, $resolvedPath).Replace([System.IO.Path]::DirectorySeparatorChar, "/")
}

function ConvertTo-YamlScalar {
    param([AllowNull()][object]$Value)

    if ($null -eq $Value) {
        return "null"
    }

    if ($Value -is [bool]) {
        if ($Value) { return "true" }
        return "false"
    }

    if ($Value -is [int] -or $Value -is [long]) {
        return [string]$Value
    }

    return "'" + ([string]$Value).Replace("'", "''") + "'"
}

function Set-Utf8NoBomLfContent {
    param(
        [Parameter(Mandatory = $true)][string]$LiteralPath,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][AllowEmptyString()][object[]]$Value
    )

    $text = ([string]::Join("`n", [string[]]$Value)) -replace "`r`n?", "`n"
    if (-not $text.EndsWith("`n")) {
        $text += "`n"
    }

    $encoding = [System.Text.UTF8Encoding]::new($false)
    $directory = [System.IO.Path]::GetDirectoryName($LiteralPath)
    $fileName = [System.IO.Path]::GetFileName($LiteralPath)
    $tempPath = Join-Path $directory ".$fileName.$([guid]::NewGuid()).tmp"

    try {
        [System.IO.File]::WriteAllText($tempPath, $text, $encoding)
        [System.IO.File]::Move($tempPath, $LiteralPath, $true)
    }
    finally {
        if (Test-Path -LiteralPath $tempPath) {
            Remove-Item -LiteralPath $tempPath -Force
        }
    }
}

function Get-QuestionPageNameForSlug {
    param([Parameter(Mandatory = $true)][string]$Slug)

    if ($Slug.EndsWith("questions")) {
        return "$Slug.md"
    }

    return "$Slug-questions.md"
}

function Get-VideoIdFromUrl {
    param([Parameter(Mandatory = $true)][string]$Url)

    if ($Url -match 'youtu\.be/(?<id>[^?&/]+)') {
        return $Matches.id
    }

    if ($Url -match '[?&]v=(?<id>[^?&]+)') {
        return $Matches.id
    }

    throw "Could not parse YouTube video id from URL '$Url'."
}

function Convert-TimeLabelToSeconds {
    param([Parameter(Mandatory = $true)][string]$Label)

    $parts = $Label.Split(":")
    if ($parts.Count -lt 2 -or $parts.Count -gt 3) {
        throw "Timestamp label '$Label' is not M:SS or H:MM:SS."
    }

    foreach ($part in $parts) {
        if ($part -notmatch '^\d+$') {
            throw "Timestamp label '$Label' contains a non-numeric part."
        }
    }

    if ($parts.Count -eq 2) {
        return ([int]$parts[0] * 60) + [int]$parts[1]
    }

    return ([int]$parts[0] * 3600) + ([int]$parts[1] * 60) + [int]$parts[2]
}

function Split-MarkdownTableRow {
    param(
        [Parameter(Mandatory = $true)][string]$Line,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][int]$LineNumber
    )

    $trimmed = $Line.Trim()
    if (-not $trimmed.StartsWith("|") -or -not $trimmed.EndsWith("|")) {
        throw "${Path}:$LineNumber is not a complete Markdown table row."
    }

    $body = $trimmed.Substring(1, $trimmed.Length - 2)
    $cells = New-Object System.Collections.Generic.List[string]
    $current = New-Object System.Text.StringBuilder
    $escaped = $false

    foreach ($char in $body.ToCharArray()) {
        if ($escaped) {
            [void]$current.Append($char)
            $escaped = $false
            continue
        }

        if ($char -eq "\") {
            [void]$current.Append($char)
            $escaped = $true
            continue
        }

        if ($char -eq "|") {
            $cells.Add($current.ToString().Trim())
            [void]$current.Clear()
            continue
        }

        [void]$current.Append($char)
    }

    $cells.Add($current.ToString().Trim())
    return $cells.ToArray()
}

function Get-QuestionRowsFromMarkdown {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][object]$PageMeta
    )

    $lines = Get-Content -LiteralPath $Path
    $tableStart = -1
    $expectedColumnCount = 4
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\|\s*Time\s*\|\s*Question\s*\|\s*Short answer / answer direction\s*\|\s*Expanded answer\s*\|\s*$') {
            $tableStart = $i
            break
        }
    }

    if ($tableStart -lt 0) {
        throw "Missing four-column Q&A table header in $Path."
    }

    $separatorPattern = '^\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*$'

    if ($tableStart + 1 -ge $lines.Count -or $lines[$tableStart + 1] -notmatch $separatorPattern) {
        $lineNumber = $tableStart + 2
        throw "${Path}:$lineNumber is not a valid $expectedColumnCount-column table separator."
    }

    $rows = New-Object System.Collections.Generic.List[object]
    $rowIndex = 0

    for ($i = $tableStart + 2; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ([string]::IsNullOrWhiteSpace($line)) {
            break
        }

        if ($line.TrimStart().StartsWith("|")) {
            $cells = Split-MarkdownTableRow -Line $line -Path $Path -LineNumber ($i + 1)
            if ($cells.Count -ne $expectedColumnCount) {
                throw "${Path}:$($i + 1) has $($cells.Count) cells; expected $expectedColumnCount."
            }

            $timeCell = $cells[0]
            $question = $cells[1]
            $answer = $cells[2]
            $expandedAnswer = $cells[3]

            if ([string]::IsNullOrWhiteSpace($question) -or [string]::IsNullOrWhiteSpace($answer)) {
                throw "${Path}:$($i + 1) has an empty question or answer cell."
            }

            if ([string]::IsNullOrWhiteSpace($expandedAnswer)) {
                throw "${Path}:$($i + 1) has an empty expanded answer cell."
            }

            if ($expandedAnswer -match '_Expansion pending\._') {
                throw "${Path}:$($i + 1) has a pending expanded answer placeholder."
            }

            if ($timeCell -notmatch '<a\s+href="(?<href>https://(?:youtu\.be/[^"?]+|www\.youtube\.com/watch\?[^"]+)[^"]*[?&]t=(?<seconds>\d+)[^"]*)"\s+target="_blank"\s+rel="noopener noreferrer">(?<label>[^<]+)</a>') {
                throw "${Path}:$($i + 1) has a malformed timestamp anchor."
            }

            $href = $Matches.href
            $startSeconds = [int]$Matches.seconds
            $timeLabel = $Matches.label
            $labelSeconds = Convert-TimeLabelToSeconds -Label $timeLabel
            if ($startSeconds -ne $labelSeconds) {
                throw "${Path}:$($i + 1) timestamp label '$timeLabel' does not match ?t=$startSeconds."
            }

            $rowVideoId = Get-VideoIdFromUrl -Url $href
            if ($PageMeta.video_id -and $rowVideoId -ne $PageMeta.video_id) {
                throw "${Path}:$($i + 1) links to video '$rowVideoId', expected '$($PageMeta.video_id)'."
            }

            $rowIndex++
            $rows.Add([ordered]@{
                episode_number = $PageMeta.number
                episode_title = $PageMeta.title
                question_page = $PageMeta.question_page
                content_path = $PageMeta.content_path
                time_label = $timeLabel
                start_seconds = $startSeconds
                video_url = $href
                question = $question
                short_answer = $answer
                expanded_answer = $expandedAnswer
                row_index = $rowIndex
                is_numbered = $PageMeta.is_numbered
                is_special = $PageMeta.is_special
                search_text = (@($PageMeta.number, $PageMeta.title, $question, $answer, $expandedAnswer) -join " ").ToLowerInvariant()
            })

            continue
        }

        throw "${Path}:$($i + 1) interrupts the Q&A table."
    }

    if ($rows.Count -eq 0) {
        throw "No question rows found in $Path."
    }

    return $rows.ToArray()
}

function Get-PageTitleFromMarkdown {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string[]]$Lines,
        [Parameter(Mandatory = $true)][string]$Fallback
    )

    foreach ($line in $Lines) {
        if ($line -match '^#\s+(?<title>.+?)\s*$') {
            return $Matches.title
        }
    }

    return $Fallback
}

function Get-PageDescriptionFromMarkdown {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string[]]$Lines,
        [Parameter(Mandatory = $true)][string]$Fallback
    )

    foreach ($line in $Lines) {
        $trimmed = $line.Trim()
        if (
            $trimmed.Length -eq 0 -or
            $trimmed.StartsWith("#") -or
            $trimmed.StartsWith("<!--") -or
            $trimmed -eq "Time links open the YouTube video at the relevant timestamp."
        ) {
            continue
        }

        if ($trimmed.StartsWith("|")) {
            break
        }

        return $trimmed
    }

    return $Fallback
}

function ConvertTo-PlainDescriptionText {
    param([Parameter(Mandatory = $true)][string]$Text)

    $plainText = [regex]::Replace($Text, '<[^>]+>', ' ')
    $plainText = [regex]::Replace($plainText, '\[([^\]]+)\]\([^)]+\)', '$1')
    $plainText = [regex]::Replace($plainText, '[*_~]', '')
    $plainText = $plainText.Replace([string][char]96, '')
    $plainText = [Net.WebUtility]::HtmlDecode($plainText)
    $plainText = [regex]::Replace($plainText, '\s+', ' ').Trim()
    return $plainText.Replace('"', "'")
}

function Limit-DescriptionText {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [int]$MaximumLength = 88
    )

    if ($Text.Length -le $MaximumLength) {
        return $Text
    }

    $trimmed = $Text.Substring(0, $MaximumLength - 3).TrimEnd()
    $lastSpace = $trimmed.LastIndexOf(' ')
    if ($lastSpace -ge [Math]::Floor($MaximumLength * 0.65)) {
        $trimmed = $trimmed.Substring(0, $lastSpace)
    }

    return $trimmed.TrimEnd([char[]]' ,;:') + '...'
}

function Get-RepresentativeDescriptionTopics {
    param(
        [Parameter(Mandatory = $true)][object[]]$Rows,
        [int]$MaximumLength = 88
    )

    $targetIndices = if ($Rows.Count -eq 1) {
        @(0)
    }
    elseif ($Rows.Count -eq 2) {
        @(0, 1)
    }
    else {
        @(
            [int][Math]::Floor($Rows.Count / 3),
            [int][Math]::Floor(($Rows.Count * 2) / 3)
        )
    }

    $selectedIndices = [Collections.Generic.HashSet[int]]::new()
    $topics = New-Object System.Collections.Generic.List[string]

    foreach ($targetIndex in $targetIndices) {
        $topicCountBeforeSelection = $topics.Count
        $candidateIndices = @(0..($Rows.Count - 1) | Sort-Object @{ Expression = { [Math]::Abs($_ - $targetIndex) } }, @{ Expression = { $_ } })
        $fallbackTopic = $null
        $fallbackIndex = -1

        foreach ($candidateIndex in $candidateIndices) {
            if ($selectedIndices.Contains($candidateIndex)) {
                continue
            }

            $candidateTopic = ConvertTo-PlainDescriptionText -Text ([string]$Rows[$candidateIndex].question)
            if ([string]::IsNullOrWhiteSpace($candidateTopic)) {
                continue
            }

            if (-not $fallbackTopic) {
                $fallbackTopic = $candidateTopic
                $fallbackIndex = $candidateIndex
            }

            if ($candidateTopic.Length -le $MaximumLength) {
                [void]$selectedIndices.Add($candidateIndex)
                $topics.Add($candidateTopic)
                break
            }
        }

        if ($topics.Count -eq $topicCountBeforeSelection) {
            if (-not $fallbackTopic) {
                throw "Could not select a representative question for the generated page description."
            }

            [void]$selectedIndices.Add($fallbackIndex)
            $topics.Add((Limit-DescriptionText -Text $fallbackTopic -MaximumLength $MaximumLength))
        }
    }

    return $topics.ToArray()
}

function Get-PageDescriptionOverrideFromMarkdown {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyString()][string[]]$Lines,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $descriptionOverride = $null

    foreach ($line in $Lines) {
        if ($line -match '^\s*<!--\s*seo-description\s*:\s*(?<description>.*?)\s*-->\s*$') {
            if ($descriptionOverride) {
                throw "$Path contains more than one seo-description override."
            }

            $descriptionOverride = ConvertTo-PlainDescriptionText -Text $Matches.description
            if ([string]::IsNullOrWhiteSpace($descriptionOverride)) {
                throw "$Path contains an empty seo-description override."
            }
            continue
        }

        if ($line -match '^\s*<!--\s*seo-description\b') {
            throw "$Path contains a malformed seo-description override. Use: <!-- seo-description: Concise page description. -->"
        }
    }

    return $descriptionOverride
}

function New-QuestionPageDescription {
    param(
        [Parameter(Mandatory = $true)][object]$PageMeta,
        [Parameter(Mandatory = $true)][object[]]$Rows
    )

    if ($Rows.Count -eq 0) {
        throw "Cannot generate a page description without curated question rows."
    }

    $episodeTitle = ConvertTo-PlainDescriptionText -Text ([string]$PageMeta.title)
    $episodeTitle = $episodeTitle.TrimEnd('.')
    if ([string]::IsNullOrWhiteSpace($episodeTitle)) {
        throw "Cannot generate a page description without an episode title."
    }

    $sourceLabel = if ($PageMeta.is_numbered) {
        "$episodeTitle (Live Stream #$($PageMeta.number))"
    }
    else {
        $episodeTitle
    }

    $topics = @(Get-RepresentativeDescriptionTopics -Rows $Rows)

    $questionLabel = if ($Rows.Count -eq 1) { "question" } else { "questions" }
    if ($topics.Count -eq 1) {
        return ('Explore {0} transcript-grounded {1} from {2}: "{3}"' -f $Rows.Count, $questionLabel, $sourceLabel, $topics[0])
    }

    return ('Explore {0} transcript-grounded {1} from {2}, including "{3}" and "{4}"' -f $Rows.Count, $questionLabel, $sourceLabel, $topics[0], $topics[1])
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$liveStreamListPath = Join-Path $RepoRoot "src/live-stream-list.md"
$questionsSourceDir = Join-Path $RepoRoot "docs/questions"
$siteDir = Join-Path $RepoRoot "site"
$siteDataDir = Join-Path $siteDir "data"
$siteQuestionsDir = Join-Path $siteDir "content/questions"

if (-not (Test-Path -LiteralPath $liveStreamListPath)) {
    throw "Missing $liveStreamListPath."
}

if (-not (Test-Path -LiteralPath $questionsSourceDir)) {
    throw "Missing $questionsSourceDir."
}

New-Item -ItemType Directory -Force -Path $siteDataDir, $siteQuestionsDir | Out-Null

$questionFiles = @(Get-ChildItem -LiteralPath $questionsSourceDir -Filter "*.md" | Sort-Object Name)
if ($questionFiles.Count -eq 0) {
    throw "No Markdown files found under $questionsSourceDir."
}

$questionFileByName = @{}
foreach ($file in $questionFiles) {
    $questionFileByName[$file.Name] = $file
}

$episodes = New-Object System.Collections.Generic.List[object]
$episodesByNumber = @{}
$episodesBySlug = @{}

$liveStreamLines = Get-Content -LiteralPath $liveStreamListPath
foreach ($line in $liveStreamLines) {
    if ($line -notmatch '^\s*-\s+\[(?<label>.+)\]\((?<url>https://www\.youtube\.com/watch\?v=(?<video>[^)&]+)[^)]*)\)\s+`(?<slug>[^`]+)`\s*$') {
        continue
    }

    $label = $Matches.label
    $url = $Matches.url
    $videoId = $Matches.video
    $slug = $Matches.slug
    $number = $null
    $title = $label
    $isNumbered = $false

    if ($label -match '^Live Stream #(?<number>\d+):\s*(?<title>.+)$') {
        $number = [int]$Matches.number
        $title = $Matches.title
        $isNumbered = $true
    }

    $expectedQuestionPage = Get-QuestionPageNameForSlug -Slug $slug
    $hasQuestionPage = $questionFileByName.ContainsKey($expectedQuestionPage)

    $episode = [ordered]@{
        number = $number
        title = $title
        slug = $slug
        youtube_url = $url
        video_id = $videoId
        question_page = $(if ($hasQuestionPage) { "questions/$expectedQuestionPage" } else { $null })
        content_path = $(if ($hasQuestionPage) { "questions/$slug/" } else { $null })
        status = $(if ($hasQuestionPage) { "curated" } else { "missing_question_page" })
        is_numbered = $isNumbered
        is_special = -not $isNumbered
        question_count = 0
        series = $(if ($isNumbered) { "numbered livestream" } elseif ($slug -like "dr-falk-plays-assassin-s-creed-origins-*") { "Assassin's Creed side content" } else { "special stream" })
    }

    $episodes.Add($episode)
    $episodesBySlug[$slug] = $episode
    if ($isNumbered) {
        $episodesByNumber[[int]$number] = $episode
    }
}

if ($episodes.Count -eq 0) {
    throw "No episodes parsed from $liveStreamListPath."
}

$allQuestionRows = New-Object System.Collections.Generic.List[object]
$numberedPageCount = 0
$specialPageCount = 0
$descriptionOverrideCount = 0
$pageDescriptions = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

Get-ChildItem -LiteralPath $siteQuestionsDir -Filter "*.md" |
    Where-Object { $_.Name -ne "_index.md" } |
    Remove-Item -Force

foreach ($file in $questionFiles) {
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
    $sourceRelativePath = Get-RelativePath -BasePath $RepoRoot -Path $file.FullName
    $lines = @(Get-Content -LiteralPath $file.FullName)
    $pageTitle = Get-PageTitleFromMarkdown -Lines $lines -Fallback $baseName
    $pageIntro = Get-PageDescriptionFromMarkdown -Lines $lines -Fallback $pageTitle

    $pageMeta = $null
    if ($baseName -match '^(?<number>\d+)-') {
        $number = [int]$Matches.number
        if (-not $episodesByNumber.ContainsKey($number)) {
            throw "$($file.FullName) starts with episode number $number, but no matching entry exists in src/live-stream-list.md."
        }

        $episode = $episodesByNumber[$number]
        $pageMeta = [ordered]@{
            number = $number
            title = $episode.title
            slug = $episode.slug
            video_id = $episode.video_id
            question_page = "questions/$($file.Name)"
            content_path = "questions/$($episode.slug)/"
            is_numbered = $true
            is_special = $false
            series = "numbered livestream"
        }
        $numberedPageCount++
    }
    else {
        $slug = $baseName
        if ($slug.EndsWith("-questions")) {
            $slug = $slug.Substring(0, $slug.Length - "-questions".Length)
        }

        $episode = $null
        if ($episodesBySlug.ContainsKey($slug)) {
            $episode = $episodesBySlug[$slug]
        }

        $pageMeta = [ordered]@{
            number = $null
            title = $(if ($episode) { $episode.title } else { $pageIntro })
            slug = $slug
            video_id = $(if ($episode) { $episode.video_id } else { $null })
            question_page = "questions/$($file.Name)"
            content_path = "questions/$slug/"
            is_numbered = $false
            is_special = $true
            series = $(if ($slug -like "dr-falk-plays-assassin-s-creed-origins-*") { "Assassin's Creed side content" } else { "special stream" })
        }
        $specialPageCount++

        if (-not $episode) {
            $episode = [ordered]@{
                number = $null
                title = $pageMeta.title
                slug = $slug
                youtube_url = $null
                video_id = $null
                question_page = "questions/$($file.Name)"
                content_path = "questions/$slug/"
                status = "curated"
                is_numbered = $false
                is_special = $true
                question_count = 0
                series = $pageMeta.series
            }
            $episodes.Add($episode)
            $episodesBySlug[$slug] = $episode
        }
    }

    $rows = @(Get-QuestionRowsFromMarkdown -Path $file.FullName -PageMeta ([pscustomobject]$pageMeta))
    foreach ($row in $rows) {
        $allQuestionRows.Add($row)
    }

    $descriptionOverride = Get-PageDescriptionOverrideFromMarkdown -Lines $lines -Path $sourceRelativePath
    $descriptionSource = "generated_from_questions"
    if ($descriptionOverride) {
        $pageDescription = $descriptionOverride
        $descriptionSource = "curated_override"
        $descriptionOverrideCount++
    }
    else {
        $pageDescription = New-QuestionPageDescription -PageMeta ([pscustomobject]$pageMeta) -Rows $rows
    }

    $descriptionKey = ([regex]::Replace($pageDescription, '\s+', ' ')).Trim()
    if (-not $pageDescriptions.Add($descriptionKey)) {
        throw "Generated duplicate page description for $sourceRelativePath."
    }

    $matchingEpisode = $episodesBySlug[$pageMeta.slug]
    $matchingEpisode.question_page = "questions/$($file.Name)"
    $matchingEpisode.content_path = $pageMeta.content_path
    $matchingEpisode.status = "curated"
    $matchingEpisode.question_count = $rows.Count

    $sortKey = $(if ($pageMeta.is_numbered) { $pageMeta.number } else { 0 })
    $frontMatter = @(
        "---",
        "title: $(ConvertTo-YamlScalar $pageTitle)",
        "description: $(ConvertTo-YamlScalar $pageDescription)",
        "description_source: $(ConvertTo-YamlScalar $descriptionSource)",
        "source_file: $(ConvertTo-YamlScalar $sourceRelativePath)",
        "episode_number: $(ConvertTo-YamlScalar $pageMeta.number)",
        "episode_title: $(ConvertTo-YamlScalar $pageMeta.title)",
        "slug: $(ConvertTo-YamlScalar $pageMeta.slug)",
        "video_id: $(ConvertTo-YamlScalar $pageMeta.video_id)",
        "question_page: $(ConvertTo-YamlScalar $pageMeta.question_page)",
        "question_count: $($rows.Count)",
        "is_numbered: $(ConvertTo-YamlScalar $pageMeta.is_numbered)",
        "is_special: $(ConvertTo-YamlScalar $pageMeta.is_special)",
        "series: $(ConvertTo-YamlScalar $pageMeta.series)",
        "sort_key: $sortKey",
        "generated_from_docs_questions: true",
        "---",
        "",
        "<!-- Generated by scripts/Build-HugoSiteContent.ps1 from $sourceRelativePath. Do not edit this mirror by hand. -->",
        ""
    )

    $outputPath = Join-Path $siteQuestionsDir $file.Name
    Set-Utf8NoBomLfContent -LiteralPath $outputPath -Value @($frontMatter + $lines)
}

$expectedGeneratedCount = $questionFiles.Count
$actualGeneratedCount = @(Get-ChildItem -LiteralPath $siteQuestionsDir -Filter "*.md" | Where-Object { $_.Name -ne "_index.md" }).Count
if ($actualGeneratedCount -ne $expectedGeneratedCount) {
    throw "Generated $actualGeneratedCount question pages, expected $expectedGeneratedCount."
}

$episodeData = @($episodes | ForEach-Object { [pscustomobject]$_ })
$questionData = @($allQuestionRows | ForEach-Object { [pscustomobject]$_ })

Set-Utf8NoBomLfContent -LiteralPath (Join-Path $siteDataDir "episodes.json") -Value ($episodeData | ConvertTo-Json -Depth 8)
Set-Utf8NoBomLfContent -LiteralPath (Join-Path $siteDataDir "questions.json") -Value ($questionData | ConvertTo-Json -Depth 8)

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw "Node.js is required to build the prebuilt search index."
}

& $nodeCommand.Source (Join-Path $RepoRoot "scripts/Build-SearchIndex.mjs") $RepoRoot

Write-Host "Generated $actualGeneratedCount Hugo question pages from docs/questions."
Write-Host "Numbered pages: $numberedPageCount"
Write-Host "Special pages: $specialPageCount"
Write-Host "Description overrides: $descriptionOverrideCount"
Write-Host "Question rows: $($allQuestionRows.Count)"
Write-Host "Wrote site/data/episodes.json, site/data/questions.json, and site/static/search/."
