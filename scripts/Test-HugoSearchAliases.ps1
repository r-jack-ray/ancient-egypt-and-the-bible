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
        [Parameter(Mandatory = $true)][hashtable]$AliasMap,
        [Parameter(Mandatory = $true)][object[]]$PhraseAliasGroups
    )

    $aliases = @{}
    $tokens = @(Get-SearchTokens -Value $Text)
    foreach ($token in $tokens) {
        if (-not $AliasMap.ContainsKey($token)) {
            continue
        }

        foreach ($alias in $AliasMap[$token]) {
            $aliases[$alias] = $true
        }
    }

    $normalizedText = " " + ($tokens -join " ") + " "
    foreach ($group in $PhraseAliasGroups) {
        $terms = @($group | ForEach-Object { Get-NormalizedSearchPhrase -Value ([string]$_) } | Where-Object { $_ })
        if ($terms.Count -lt 2) {
            continue
        }

        $hasMatch = $false
        foreach ($term in $terms) {
            if ($normalizedText.IndexOf(" $term ", [StringComparison]::Ordinal) -ge 0) {
                $hasMatch = $true
                break
            }
        }

        if (-not $hasMatch) {
            continue
        }

        foreach ($alias in $terms) {
            $aliases[$alias] = $true
        }
    }

    return @($aliases.Keys)
}

function Get-NormalizedSearchPhrase {
    param([AllowNull()][string]$Value)

    return (@(Get-SearchTokens -Value $Value) -join " ")
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

function Test-HaystackContainsAnyPhrase {
    param(
        [Parameter(Mandatory = $true)][string]$Haystack,
        [Parameter(Mandatory = $true)][string[]]$Terms
    )

    foreach ($term in $Terms) {
        if ($Haystack.IndexOf(" $term ", [StringComparison]::Ordinal) -ge 0) {
            return $true
        }
    }

    return $false
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
$phraseAliasProperty = $aliasConfig.PSObject.Properties["phraseAliasGroups"]
$phraseAliasGroups = @()
if ($null -ne $phraseAliasProperty) {
    $phraseAliasGroups = @($phraseAliasProperty.Value)
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

for ($i = 0; $i -lt $phraseAliasGroups.Count; $i++) {
    $groupNumber = $i + 1
    $terms = @($phraseAliasGroups[$i] | ForEach-Object { Get-NormalizedSearchPhrase -Value ([string]$_) })

    if ($terms.Count -lt 2) {
        throw "Phrase alias group $groupNumber must contain at least two terms."
    }

    $localTerms = @{}
    foreach ($term in $terms) {
        if ([string]::IsNullOrWhiteSpace($term)) {
            throw "Phrase alias group $groupNumber contains an empty term."
        }
        if ($term -cne $term.ToLowerInvariant()) {
            throw "Phrase alias group $groupNumber term '$term' must be lowercase."
        }
        if ($term -notmatch '^[a-z0-9]+( [a-z0-9]+)*$') {
            throw "Phrase alias group $groupNumber term '$term' must use only ASCII letters, numbers, and single spaces."
        }
        if ($term.Length -lt 2) {
            throw "Phrase alias group $groupNumber term '$term' is too short."
        }
        if ($dangerousTermSet.ContainsKey($term)) {
            throw "Phrase alias group $groupNumber term '$term' is too broad for search aliases."
        }
        if ($localTerms.ContainsKey($term)) {
            throw "Phrase alias group $groupNumber repeats term '$term'."
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

    $aliases = @(Get-SearchAliasesForText -Text $searchText -AliasMap $aliasMap -PhraseAliasGroups $phraseAliasGroups)
    $haystackTokens = @($tokens + $aliases | Select-Object -Unique)

    [pscustomobject]@{
        Question = $_
        TokenSet = $tokenSet
        NormalizedText = " " + ($tokens -join " ") + " "
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

foreach ($group in $phraseAliasGroups) {
    $terms = @($group | ForEach-Object { Get-NormalizedSearchPhrase -Value ([string]$_) })
    $matchingRows = @($questionSearchRows | Where-Object {
        Test-HaystackContainsAnyPhrase -Haystack $_.NormalizedText -Terms $terms
    })

    if ($matchingRows.Count -gt $MaxRowsPerAliasGroup) {
        throw "Phrase alias group [$($terms -join ', ')] matches $($matchingRows.Count) rows; limit is $MaxRowsPerAliasGroup."
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
Write-Host "Phrase alias groups: $($phraseAliasGroups.Count)"
Write-Host "Question rows: $($questions.Count)"
Write-Host "Query tests: $($queryTests.Count)"
