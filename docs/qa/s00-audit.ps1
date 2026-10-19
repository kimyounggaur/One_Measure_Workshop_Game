$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$designPath = Join-Path $PSScriptRoot '..\source\one_measure_workshop_development_design.md'
$promptsPath = Join-Path $PSScriptRoot '..\source\one_measure_workshop_vibe_coding_promptpack.md'
if (-not (Test-Path -LiteralPath $designPath)) { $designPath = Join-Path $workspace 'source-design.md' }
if (-not (Test-Path -LiteralPath $promptsPath)) { $promptsPath = Join-Path $workspace 'source-prompts.md' }
$design = Get-Content -Raw -Encoding utf8 -LiteralPath $designPath
$prompts = Get-Content -Raw -Encoding utf8 -LiteralPath $promptsPath
$checks = 0
function Assert-Contract([bool]$ok, [string]$name) {
  if (-not $ok) { throw "FAIL: $name" }
  $script:checks++
  Write-Output "PASS: $name"
}
$designMatch = [regex]::Match($design, '```json\s*(\{\s*"unitTick":\s*240,\s*"barUnits":\s*8,[\s\S]*?)\s*```')
$promptMatch = [regex]::Match($prompts, '```json\s*(\{\s*"fixtureVersion":\s*1,[\s\S]*?)\s*```')
Assert-Contract $designMatch.Success 'Design oracle JSON found'
Assert-Contract $promptMatch.Success 'Prompt appendix A oracle JSON found'
$designOracle = $designMatch.Groups[1].Value | ConvertFrom-Json
$oracle = $promptMatch.Groups[1].Value | ConvertFrom-Json
Assert-Contract (($oracle.expectedAnswerCounts -join ',') -eq '1,1,1,3,2,1') 'Exact expected answer counts'
Assert-Contract ($oracle.unitTick -eq 240 -and $oracle.barUnits -eq 8) 'Unit 240tick and 8u bar'
Assert-Contract ($oracle.puzzles.Count -eq 6 -and $designOracle.puzzles.Count -eq 6) 'Six puzzles in each source'
for ($puzzleIndex=0; $puzzleIndex -lt 6; $puzzleIndex++) {
  $actual = $oracle.puzzles[$puzzleIndex]
  $other = $designOracle.puzzles[$puzzleIndex]
  Assert-Contract ($actual.id -eq $other.id -and $actual.answerCount -eq $other.answerCount) "$($actual.id): identity/count agree"
  $actualSet = @($actual.answers | ForEach-Object { $_ -join ' ' } | Sort-Object)
  $otherSet = @($other.answers | ForEach-Object { $_ -join ' ' } | Sort-Object)
  Assert-Contract (($actualSet -join '|') -eq ($otherSet -join '|')) "$($actual.id): complete answer set agrees"
  Assert-Contract (($actualSet | Select-Object -Unique).Count -eq $actual.answerCount) "$($actual.id): unique oracle count"
  for ($answerIndex=0; $answerIndex -lt $actual.answers.Count; $answerIndex++) {
    $start = 0
    $onsets = @()
    foreach ($token in $actual.answers[$answerIndex]) {
      Assert-Contract ($token -match '^[NR](1|2|4|8)$') "$($actual.id): legal oracle token $token"
      if ($token.StartsWith('N')) { $onsets += $start }
      $start += [int]$token.Substring(1)
    }
    Assert-Contract ($start -eq 8) "$($actual.id) answer $answerIndex : total 8u"
    Assert-Contract (($onsets -join ',') -eq ($actual.onsetsU[$answerIndex] -join ',')) "$($actual.id) answer $answerIndex : onsets agree"
  }
}
Assert-Contract ((4 * 480) -eq 1920) 'PPQ480 => whole1920'
Assert-Contract ((1920 * 3 / 4) -eq 1440 -and (1920 * 6 / 8) -eq 1440) 'Future 3/4 and 6/8 are 1440tick'
Assert-Contract ((1920 / 480 * 60 / 80) -eq 3) '4/4 quarter80 is 3sec'
Assert-Contract ((1440 / 480 * 60 / (80*4*3/8)) -eq 1.5) '6/8 dottedQuarter80 is 1.5sec'
Assert-Contract ((1120-1000-100) -eq 20 -and (920-1000-(-100)) -eq 20) 'Positive and negative offset signs'
Assert-Contract ((1000-160-250) -eq 590 -and (4000+160-250) -eq 3910 -and [Math]::Max(4000,4000+160-250) -eq 4000) 'Offset -250 early input window'
Assert-Contract ((1000-160+250) -eq 1090 -and (4000+160+250) -eq 4410 -and [Math]::Max(4000,4000+160+250) -eq 4410) 'Offset +250 late grace'
Assert-Contract (($oracle.puzzles[5].answers[0] -join ' ') -eq 'R1 N1 N2 N1 R1 N2') 'L6 full semantic oracle'
Assert-Contract ($design.Contains('R1 N1 N2 N2 N2') -and $prompts.Contains('R1 N1 N2 N2 N2')) 'Both sources retain L6 same-onset counterexample'
Assert-Contract ($oracle.puzzles[1].palette[0] -eq 'N1' -and ($oracle.puzzles[1].initial -join ' ') -eq 'N2 N2 N2 N2') 'L2 initial N2 outside new-piece palette preserved'
Assert-Contract (($oracle.puzzles[1].lockedStartsU -join ',') -eq '0,4,6') 'L2 lock starts preserved'
$requirements = Import-Csv -Encoding utf8 -LiteralPath (Join-Path $PSScriptRoot '..\requirements.csv')
Assert-Contract ($requirements.Count -eq 24) '24 requirement rows'
Assert-Contract (($requirements.id -join ',') -eq ((1..24 | ForEach-Object { 'R{0:d2}' -f $_ }) -join ',')) 'R01-R24 exact IDs'
foreach ($row in $requirements) {
  Assert-Contract (-not [string]::IsNullOrWhiteSpace($row.source_sections) -and -not [string]::IsNullOrWhiteSpace($row.implementation_module) -and -not [string]::IsNullOrWhiteSpace($row.test_ids) -and -not [string]::IsNullOrWhiteSpace($row.owner_stage)) "$($row.id): trace fields present"
}
Write-Output "S00 document audit: $checks checks passed. This is NOT an application or device test."
