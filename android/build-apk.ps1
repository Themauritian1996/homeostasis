# Construit homeostasis.apk sans Gradle (aapt2 + javac + d8 + apksigner).
# Usage :  powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
# Au premier lancement, télécharge les outils Android (≈ 300 Mo) dans android\.sdk et demande d'accepter la licence du SDK Android.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$sdk = Join-Path $here '.sdk'
$build = Join-Path $here 'build'
$jbr = 'C:\Program Files\Android\Android Studio\jbr'
if (-not (Test-Path "$jbr\bin\java.exe")) { throw "JDK introuvable ($jbr). Installez Android Studio ou modifiez `$jbr dans ce script." }
$env:JAVA_HOME = $jbr
$env:Path = "$jbr\bin;$env:Path"
$PLATFORM = 'android-34'
$BT = '34.0.0'

# 1. Outils en ligne de commande
$sdkmanager = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkmanager)) {
  New-Item -ItemType Directory -Force $sdk | Out-Null
  $zip = Join-Path $sdk 'cmdline-tools.zip'
  Write-Host 'Téléchargement des outils Android (commandlinetools, ~150 Mo)...'
  Invoke-WebRequest 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' -OutFile $zip
  Expand-Archive $zip -DestinationPath (Join-Path $sdk '_tmp') -Force
  New-Item -ItemType Directory -Force (Join-Path $sdk 'cmdline-tools') | Out-Null
  Move-Item (Join-Path $sdk '_tmp\cmdline-tools') (Join-Path $sdk 'cmdline-tools\latest')
  Remove-Item (Join-Path $sdk '_tmp') -Recurse -Force; Remove-Item $zip -Force
}
# 2. Plateforme + build-tools (sdkmanager affiche la licence à accepter)
if (-not (Test-Path (Join-Path $sdk "platforms\$PLATFORM\android.jar")) -or -not (Test-Path (Join-Path $sdk "build-tools\$BT\aapt2.exe"))) {
  & $sdkmanager "--sdk_root=$sdk" "platforms;$PLATFORM" "build-tools;$BT"
  if ($LASTEXITCODE -ne 0) { throw 'Installation du SDK interrompue.' }
}
$bt = Join-Path $sdk "build-tools\$BT"
$jar = Join-Path $sdk "platforms\$PLATFORM\android.jar"

# 3. Compilation
if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item -ItemType Directory -Force "$build\classes", "$build\gen", "$build\res\mipmap-xxxhdpi" | Out-Null
Copy-Item (Join-Path $root 'web\img\icon-192.png') "$build\res\mipmap-xxxhdpi\ic_launcher.png"
& "$bt\aapt2.exe" compile --dir "$build\res" -o "$build\res.zip"
& "$bt\aapt2.exe" link -o "$build\app.unsigned.apk" -I $jar --manifest (Join-Path $here 'AndroidManifest.xml') --java "$build\gen" "$build\res.zip" --min-sdk-version 24 --target-sdk-version 34 --version-code 610 --version-name 6.1
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link a échoué.' }
$src = @(Get-ChildItem (Join-Path $here 'src') -Recurse -Filter *.java | ForEach-Object FullName) + @(Get-ChildItem "$build\gen" -Recurse -Filter *.java | ForEach-Object FullName)
& javac -nowarn --release 8 -cp $jar -d "$build\classes" $src
if ($LASTEXITCODE -ne 0) { throw 'javac a échoué.' }
$classes = Get-ChildItem "$build\classes" -Recurse -Filter *.class | ForEach-Object FullName
& "$bt\d8.bat" --release --min-api 24 --lib $jar --output $build $classes
if ($LASTEXITCODE -ne 0) { throw 'd8 a échoué.' }
# Les fichiers du jeu sont ajoutés avec « jar » (chemins en / ; aapt2 -A écrit des \ sous Windows, illisibles sur Android)
New-Item -ItemType Directory -Force "$build\stage" | Out-Null
Copy-Item (Join-Path $root 'web') (Join-Path $build 'stage/assets') -Recurse
Push-Location $build
& jar uf app.unsigned.apk classes.dex
& jar uf app.unsigned.apk -C stage assets
Pop-Location
& "$bt\zipalign.exe" -f 4 "$build\app.unsigned.apk" "$build\app.aligned.apk"

# 4. Signature (clé de test locale ; pour le Play Store, utilisez votre propre clé)
$ks = Join-Path $here 'homeostasis-test.keystore'
if (-not (Test-Path $ks)) {
  & keytool -genkeypair -keystore $ks -storepass homeostasis -keypass homeostasis -alias homeostasis -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Homeostasis, O=Homeostasis, C=CA'
}
$out = Join-Path $root 'homeostasis.apk'
& "$bt\apksigner.bat" sign --ks $ks --ks-pass pass:homeostasis --key-pass pass:homeostasis --out $out "$build\app.aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'apksigner a échoué.' }
& "$bt\apksigner.bat" verify $out
Write-Host "APK prêt : $out ($([math]::Round((Get-Item $out).Length / 1MB, 1)) Mo)"
