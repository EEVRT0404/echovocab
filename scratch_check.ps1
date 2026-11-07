$content = [System.IO.File]::ReadAllText("app.js")
$openBraces = ($content -split '\{').Length
$closeBraces = ($content -split '\}').Length
$openParens = ($content -split '\(').Length
$closeParens = ($content -split '\)').Length
$openBrackets = ($content -split '\[').Length
$closeBrackets = ($content -split '\]').Length

Write-Output "Braces: $openBraces vs $closeBraces"
Write-Output "Parens: $openParens vs $closeParens"
Write-Output "Brackets: $openBrackets vs $closeBrackets"
