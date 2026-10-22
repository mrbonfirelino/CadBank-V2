[Setup]
AppName=CadBank V2
AppVersion=2.0
DefaultDirName=C:\CadBank
UsePreviousAppDir=no
PrivilegesRequired=lowest
OutputDir=.
OutputBaseFilename=Setup-CadBank
Compression=lzma2
SolidCompression=yes
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\runtime\node\node.exe

[Files]
Source: "stage\CadBank\*"; DestDir: "{app}"; Excludes: "app\data,app\data\*"; Flags: recursesubdirs createallsubdirs
Source: "stage\CadBank\app\data\*"; DestDir: "{app}\app\data"; Flags: recursesubdirs createallsubdirs uninsneveruninstall

[Icons]
Name: "{userdesktop}\CadBank"; Filename: "{app}\abrir-cadbank.bat"; Comment: "Abrir o CadBank no navegador"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "CadBank"; ValueData: "wscript.exe ""{app}\cadbank-silent.vbs"""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\CadBank_is1"; ValueType: string; ValueName: "DisplayIcon"; ValueData: "{app}\runtime\node\node.exe"

[Run]
Filename: "wscript.exe"; Parameters: """{app}\cadbank-silent.vbs"""; Description: "Iniciar o servidor do CadBank agora"; Flags: postinstall skipifsilent
Filename: "http://localhost:3000"; Flags: shellexec postinstall skipifsilent; Description: "Abrir o CadBank no navegador"
