# Run as admin to configure oflow-mcp in TRAE Work
$mcpPath = "$env:USERPROFILE\AppData\Roaming\TRAE SOLO CN\User\mcp.json"
$existing = Get-Content -Path $mcpPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($existing.mcpServers.PSObject.Properties.Name -contains "oflow-mcp") {
    Write-Host "oflow-mcp already exists, skipping." -ForegroundColor Yellow
    exit 0
}
$oflowConfig = @{
    command = "oflow-mcp"
    args = @()
    env = @{}
}
$existing.mcpServers | Add-Member -MemberType NoteProperty -Name "oflow-mcp" -Value $oflowConfig -Force
$existing | ConvertTo-Json -Depth 10 | Set-Content -Path $mcpPath -Encoding UTF8
Write-Host "oflow-mcp added successfully!" -ForegroundColor Green
Write-Host "Restart TRAE Work and type /mcp to verify." -ForegroundColor Cyan
