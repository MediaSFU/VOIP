; Inno Setup script for packaging the MediaSFU Flutter desktop app into a Windows installer.
; Requires Inno Setup 6+ (iscc.exe) installed locally.

#define MyAppName "MediaSFU"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "MediaSFU"
#define MyAppExeName "voip_flutter.exe"
#define MyReleaseDir "..\..\build\windows\x64\runner\Release"
#define MyOutputDir "..\..\build\installer"
#define MyIcon "..\..\windows\runner\resources\app_icon.ico"

[Setup]
AppId={{9E8B7C11-9A93-4E1A-9D5E-40944432A9C8}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir={#MyOutputDir}
OutputBaseFilename=MediaSFU-Setup
SetupIconFile={#MyIcon}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "{#MyReleaseDir}\\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
