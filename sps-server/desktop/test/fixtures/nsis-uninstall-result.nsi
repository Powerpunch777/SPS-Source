Unicode true
!include "LogicLib.nsh"
!define UNINSTALL_REGISTRY_KEY "Software\SPS-Compile-Only-Fixture"
!include "${SPS_UNINSTALL_INCLUDE}"
Name "SPS uninstall result compile fixture"
OutFile "${SPS_COMPILE_OUTPUT}"
RequestExecutionLevel user
LangString uninstallFailed 1033 "Failed to uninstall old application files."

Section
  ClearErrors
  StrCpy $R0 0
  !insertmacro customUnInstallCheck
  ClearErrors
  StrCpy $R0 5
  !insertmacro customUnInstallCheckCurrentUser
SectionEnd
