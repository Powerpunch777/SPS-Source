Unicode true
!include "LogicLib.nsh"
!define UNINSTALL_REGISTRY_KEY "Software\SPS-Compile-Only-Fixture"
!define INSTALL_REGISTRY_KEY "Software\SPS-Compile-Only-Fixture"
!macro readReg VAR ROOT_KEY SUB_KEY NAME
  ReadRegStr "${VAR}" HKEY_CURRENT_USER "${SUB_KEY}" "${NAME}"
!macroend
!macro GetInQuotes Var Str
  StrCpy ${Var} `${Str}`
!macroend
Function GetFileParent
  Exch $R0
  StrCpy $R0 "$EXEDIR"
  Exch $R0
FunctionEnd
!include "${SPS_UNINSTALL_INCLUDE}"
Name "SPS uninstall result compile fixture"
OutFile "${SPS_COMPILE_OUTPUT}"
RequestExecutionLevel user
LangString uninstallFailed 1033 "Failed to uninstall old application files."

Function handleUninstallResultFixture
  !insertmacro customUnInstallCheck
  !insertmacro customUnInstallCheckCurrentUser
FunctionEnd

; electron-builder declares this only after expanding customUnInstallCheck.
Var /GLOBAL installationDir

Section
  StrCpy $installationDir "$INSTDIR"
  StrCpy $R4 $installationDir
  ClearErrors
  StrCpy $R0 0
  Call handleUninstallResultFixture
  ClearErrors
  StrCpy $R0 5
  Call handleUninstallResultFixture
SectionEnd
