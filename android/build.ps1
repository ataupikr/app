$ErrorActionPreference='Stop'
$androidRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
$androidJavaHome=(Get-ChildItem -LiteralPath "$androidRoot/tools/java" -Directory | Select-Object -First 1).FullName
$androidPlatform=(Get-ChildItem -LiteralPath "$androidRoot/tools/sdk/platforms" -Directory | Select-Object -First 1).FullName
$androidBuildTools=(Get-ChildItem -LiteralPath "$androidRoot/tools/sdk/build-tools" -Directory | Select-Object -First 1).FullName
$androidOutput=Join-Path (Split-Path -Parent $androidRoot) 'output/android'
$androidBuild=Join-Path $androidRoot 'build'
$androidSigning=Join-Path $androidRoot 'signing'
foreach($folder in @($androidOutput,$androidBuild,"$androidBuild/generated","$androidBuild/classes","$androidBuild/dex",$androidSigning)){New-Item -ItemType Directory -Path $folder -Force | Out-Null}
function Invoke-AndroidTool($exe,$arguments){& $exe @arguments;if($LASTEXITCODE -ne 0){throw "Android build gagal: $exe"}}
Invoke-AndroidTool "$androidBuildTools/aapt2.exe" @('compile','--dir',"$androidRoot/res",'-o',"$androidBuild/resources.zip")
Invoke-AndroidTool "$androidBuildTools/aapt2.exe" @('link','-I',"$androidPlatform/android.jar",'--manifest',"$androidRoot/AndroidManifest.xml",'--java',"$androidBuild/generated",'-o',"$androidBuild/unsigned.apk","$androidBuild/resources.zip")
$androidSources=@(Get-ChildItem -LiteralPath "$androidRoot/src" -Filter '*.java' -Recurse | ForEach-Object FullName)+@(Get-ChildItem -LiteralPath "$androidBuild/generated" -Filter '*.java' -Recurse | ForEach-Object FullName)
Invoke-AndroidTool "$androidJavaHome/bin/javac.exe" (@('-encoding','UTF-8','--release','8','-classpath',"$androidPlatform/android.jar",'-d',"$androidBuild/classes")+$androidSources)
$androidClasses=@(Get-ChildItem -LiteralPath "$androidBuild/classes" -Filter '*.class' -Recurse | ForEach-Object FullName)
Invoke-AndroidTool "$androidJavaHome/bin/java.exe" (@('-cp',"$androidBuildTools/lib/d8.jar",'com.android.tools.r8.D8','--min-api','29','--lib',"$androidPlatform/android.jar",'--output',"$androidBuild/dex")+$androidClasses)
Invoke-AndroidTool "$androidJavaHome/bin/jar.exe" @('uf',"$androidBuild/unsigned.apk",'-C',"$androidBuild/dex",'classes.dex')
Invoke-AndroidTool "$androidBuildTools/zipalign.exe" @('-f','-p','4',"$androidBuild/unsigned.apk","$androidBuild/aligned.apk")
if(-not (Test-Path -LiteralPath "$androidSigning/internal.jks")){
 $randomBytes=New-Object byte[] 32;[System.Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
 [IO.File]::WriteAllText("$androidSigning/password.txt",[Convert]::ToBase64String($randomBytes))
 Invoke-AndroidTool "$androidJavaHome/bin/keytool.exe" @('-genkeypair','-keystore',"$androidSigning/internal.jks",'-alias','26motor-internal','-storepass:file',"$androidSigning/password.txt",'-keypass:file',"$androidSigning/password.txt",'-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=26 Motor Premium Internal, O=26 Motor, C=ID')
}
Invoke-AndroidTool "$androidJavaHome/bin/java.exe" @('-jar',"$androidBuildTools/lib/apksigner.jar",'sign','--ks',"$androidSigning/internal.jks",'--ks-key-alias','26motor-internal','--ks-pass',"file:$androidSigning/password.txt",'--out',"$androidOutput/26Motor-Premium-1.1.0.apk","$androidBuild/aligned.apk")
Invoke-AndroidTool "$androidJavaHome/bin/java.exe" @('-jar',"$androidBuildTools/lib/apksigner.jar",'verify','--verbose',"$androidOutput/26Motor-Premium-1.1.0.apk")
Get-FileHash -LiteralPath "$androidOutput/26Motor-Premium-1.1.0.apk" -Algorithm SHA256 | Format-List


