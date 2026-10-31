; Never wait on a hidden error dialog during a silent updater handoff.
; Keep the old uninstaller's failure fatal and leave file cleanup to it.
!macro spsHandleUninstallResult TAG
  IfErrors spsUninstallLaunchFailed_${TAG}

  ${if} $R0 != 0
    IfSilent spsUninstallSilentFailure_${TAG}
    ReadRegStr $R1 ${TAG} "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    StrCmp $R1 "0.4.86" spsLegacyUninstallRecovery_${TAG}
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    Goto spsUninstallFailed_${TAG}

    spsLegacyUninstallRecovery_${TAG}:
    MessageBox MB_OK|MB_ICONEXCLAMATION "Automatic replacement failed; no recovery was started.$\r$\n$\r$\nBack up your SPS data. Uninstall SPS Desktop from Windows Installed Apps without deleting app data, then run the latest Setup.$\r$\nDo not delete SPS AppData or project folders. First back up or move projects saved inside the program installation folder."
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    Goto spsUninstallFailed_${TAG}

    spsUninstallSilentFailure_${TAG}:
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    spsUninstallFailed_${TAG}:
    SetErrorLevel $R0
    Quit
  ${endif}

  Goto spsUninstallResultDone_${TAG}

  spsUninstallLaunchFailed_${TAG}:
  DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
  SetErrorLevel 2
  Quit

  spsUninstallResultDone_${TAG}:
!macroend

!macro customUnInstallCheck
  !insertmacro spsHandleUninstallResult SHELL_CONTEXT
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro spsHandleUninstallResult HKEY_CURRENT_USER
!macroend
