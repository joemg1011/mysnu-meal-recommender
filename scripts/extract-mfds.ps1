param(
  [Parameter(Mandatory=$true)][string]$Source,
  [int]$Limit = 5,
  [string]$Output
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($Source)
try {
  $stringsEntry = $archive.GetEntry('xl/sharedStrings.xml')
  $stringsStream = $stringsEntry.Open()
  try {
    $stringsDoc = [xml](New-Object System.IO.StreamReader($stringsStream)).ReadToEnd()
    $strings = @($stringsDoc.sst.si | ForEach-Object { $_.InnerText })
  } finally { $stringsStream.Dispose() }

  $sheetEntry = $archive.GetEntry('xl/worksheets/sheet1.xml')
  $sheetStream = $sheetEntry.Open()
  $reader = [System.Xml.XmlReader]::Create($sheetStream)
  $writer = if ($Output) { New-Object System.IO.StreamWriter($Output, $false, [System.Text.UTF8Encoding]::new($false)) } else { $null }
  try {
    $count = 0
    while ($reader.Read() -and ($Output -or $count -lt $Limit)) {
      if ($reader.NodeType -ne [System.Xml.XmlNodeType]::Element -or $reader.LocalName -ne 'row') { continue }
      $fragment = $reader.ReadOuterXml()
      $row = New-Object System.Xml.XmlDocument
      $row.LoadXml($fragment)
      $values = [ordered]@{}
      foreach ($cell in $row.DocumentElement.ChildNodes) {
        if ($cell.LocalName -ne 'c') { continue }
        $column = [regex]::Match($cell.GetAttribute('r'), '^[A-Z]+').Value
        $value = $cell.InnerText
        if ($cell.GetAttribute('t') -eq 's' -and $value -match '^\d+$') { $value = $strings[[int]$value] }
        $values[$column] = $value
      }
      if ($writer) {
        if ($values['C'] -eq 'D' -and $values['R'] -match '^\d+(\.\d+)?$') {
          $item = [ordered]@{
            code = $values['A']; name = $values['B']; origin = $values['F']; basis = $values['Q'];
            kcal = [double]$values['R']; serving = $values['EX']; weight = $values['EY']; method = $values['FB']
          }
          $writer.WriteLine(([pscustomobject]$item | ConvertTo-Json -Compress))
        }
      } else { [pscustomobject]$values | ConvertTo-Json -Compress }
      $count++
    }
  } finally { if ($writer) { $writer.Dispose() }; $reader.Dispose(); $sheetStream.Dispose() }
} finally { $archive.Dispose() }
