$scratch = "C:\Users\cheta\.gemini\antigravity-ide\brain\c148ac0e-0e5c-4653-9e17-e600631cf18c\scratch\zenodo_masks"
if (!(Test-Path $scratch)) {
    New-Item -ItemType Directory -Force -Path $scratch | Out-Null
}

Write-Host "Downloading Oil Spill mask (5.95 MB)..."
curl.exe -L -o "$scratch\01_Train_Val_Oil_Spill_mask.7z" "https://zenodo.org/api/records/8346860/files/01_Train_Val_Oil_Spill_mask.7z/content"

Write-Host "Downloading Lookalike mask (0.41 MB)..."
curl.exe -L -o "$scratch\01_Train_Val_Lookalike_mask.7z" "https://zenodo.org/api/records/8253899/files/01_Train_Val_Lookalike_mask.7z/content"

Write-Host "Downloading No Oil mask (0.40 MB)..."
curl.exe -L -o "$scratch\01_Train_Val_No_Oil_mask.7z" "https://zenodo.org/api/records/8253899/files/01_Train_Val_No_Oil_mask.7z/content"

Get-ChildItem $scratch
