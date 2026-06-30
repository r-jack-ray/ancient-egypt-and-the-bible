param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
    [int]$MaxRowsPerAliasGroup = 1000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-SearchTokens {
    param([AllowNull()][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return @()
    }

    $withoutTags = [regex]::Replace($Value.ToLowerInvariant(), '<[^>]*>', ' ')
    return @([regex]::Matches($withoutTags, '[a-z0-9]+') | ForEach-Object { $_.Value })
}

function Get-SearchAliasMap {
    param([Parameter(Mandatory = $true)][object[]]$AliasGroups)

    $aliasMap = @{}
    foreach ($group in $AliasGroups) {
        $terms = @($group | ForEach-Object { [string]$_ })
        foreach ($term in $terms) {
            $aliasMap[$term] = @($terms | Where-Object { $_ -ne $term })
        }
    }

    return $aliasMap
}

function Get-SearchAliasesForText {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][hashtable]$AliasMap
    )

    $aliases = @{}
    foreach ($token in Get-SearchTokens -Value $Text) {
        if (-not $AliasMap.ContainsKey($token)) {
            continue
        }

        foreach ($alias in $AliasMap[$token]) {
            $aliases[$alias] = $true
        }
    }

    return @($aliases.Keys)
}

function Test-TokenSetContainsAny {
    param(
        [Parameter(Mandatory = $true)][hashtable]$TokenSet,
        [Parameter(Mandatory = $true)][string[]]$Terms
    )

    foreach ($term in $Terms) {
        if ($TokenSet.ContainsKey($term)) {
            return $true
        }
    }

    return $false
}

function Test-HaystackContainsAll {
    param(
        [Parameter(Mandatory = $true)][string]$Haystack,
        [Parameter(Mandatory = $true)][string[]]$Terms
    )

    foreach ($term in $Terms) {
        if ($Haystack.IndexOf(" $term ", [StringComparison]::Ordinal) -lt 0) {
            return $false
        }
    }

    return $true
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$aliasPath = Join-Path $RepoRoot "site/data/search-aliases.json"
$questionsPath = Join-Path $RepoRoot "site/data/questions.json"

if (-not (Test-Path -LiteralPath $aliasPath)) {
    throw "Missing $aliasPath."
}

if (-not (Test-Path -LiteralPath $questionsPath)) {
    throw "Missing $questionsPath. Run scripts/Build-HugoSiteContent.ps1 first."
}

$aliasConfig = Get-Content -LiteralPath $aliasPath -Raw | ConvertFrom-Json
$aliasGroups = @($aliasConfig.aliasGroups)
if ($aliasGroups.Count -eq 0) {
    throw "No aliasGroups found in $aliasPath."
}

$dangerousTerms = @(
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "he", "i", "in",
    "is", "it", "of", "on", "or", "she", "the", "they", "to", "was", "we", "what",
    "when", "where", "who", "why", "with", "x", "v"
)
$dangerousTermSet = @{}
foreach ($term in $dangerousTerms) {
    $dangerousTermSet[$term] = $true
}

$seenTerms = @{}
for ($i = 0; $i -lt $aliasGroups.Count; $i++) {
    $groupNumber = $i + 1
    $terms = @($aliasGroups[$i] | ForEach-Object { [string]$_ })

    if ($terms.Count -lt 2) {
        throw "Alias group $groupNumber must contain at least two terms."
    }

    $localTerms = @{}
    foreach ($term in $terms) {
        if ($term -cne $term.ToLowerInvariant()) {
            throw "Alias group $groupNumber term '$term' must be lowercase."
        }
        if ($term -notmatch '^[a-z0-9]+$') {
            throw "Alias group $groupNumber term '$term' must use only ASCII letters and digits."
        }
        if ($term.Length -lt 2 -and $term -notmatch '^\d$') {
            throw "Alias group $groupNumber term '$term' is too short."
        }
        if ($dangerousTermSet.ContainsKey($term)) {
            throw "Alias group $groupNumber term '$term' is too broad for search aliases."
        }
        if ($localTerms.ContainsKey($term)) {
            throw "Alias group $groupNumber repeats term '$term'."
        }
        if ($seenTerms.ContainsKey($term)) {
            throw "Alias term '$term' appears in more than one group."
        }

        $localTerms[$term] = $true
        $seenTerms[$term] = $true
    }
}

$questions = @(Get-Content -LiteralPath $questionsPath -Raw | ConvertFrom-Json)
if ($questions.Count -eq 0) {
    throw "No question rows found in $questionsPath."
}

$aliasMap = Get-SearchAliasMap -AliasGroups $aliasGroups
$questionSearchRows = @($questions | ForEach-Object {
    $searchText = @($_.search_text, $_.episode_title, $_.question, $_.short_answer) -join " "
    $tokens = @(Get-SearchTokens -Value $searchText)
    $tokenSet = @{}
    foreach ($token in $tokens) {
        $tokenSet[$token] = $true
    }

    $aliases = @(Get-SearchAliasesForText -Text $searchText -AliasMap $aliasMap)
    $haystackTokens = @($tokens + $aliases | Select-Object -Unique)

    [pscustomobject]@{
        Question = $_
        TokenSet = $tokenSet
        Haystack = " " + ($haystackTokens -join " ") + " "
    }
})

foreach ($group in $aliasGroups) {
    $terms = @($group | ForEach-Object { [string]$_ })
    $matchingRows = @($questionSearchRows | Where-Object {
        Test-TokenSetContainsAny -TokenSet $_.TokenSet -Terms $terms
    })

    if ($matchingRows.Count -gt $MaxRowsPerAliasGroup) {
        throw "Alias group [$($terms -join ', ')] matches $($matchingRows.Count) rows; limit is $MaxRowsPerAliasGroup."
    }
}

$queryTests = @($aliasConfig.queryTests)
foreach ($test in $queryTests) {
    $query = [string]$test.query
    $queryTokens = @(Get-SearchTokens -Value $query)
    if ($queryTokens.Count -eq 0) {
        throw "Query test has an empty query."
    }

    $matches = @($questionSearchRows | Where-Object {
        Test-HaystackContainsAll -Haystack $_.Haystack -Terms $queryTokens
    })

    if ($null -ne $test.minResults -and $matches.Count -lt [int]$test.minResults) {
        throw "Query '$query' returned $($matches.Count) rows; expected at least $($test.minResults)."
    }
    if ($null -ne $test.maxResults -and $matches.Count -gt [int]$test.maxResults) {
        throw "Query '$query' returned $($matches.Count) rows; expected at most $($test.maxResults)."
    }
}

Write-Host "Search alias validation passed."
Write-Host "Alias groups: $($aliasGroups.Count)"
Write-Host "Question rows: $($questions.Count)"
Write-Host "Query tests: $($queryTests.Count)"
