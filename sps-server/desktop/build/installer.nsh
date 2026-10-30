; Never wait on a hidden error dialog during a silent updater handoff.
; Keep the old uninstaller's failure fatal and leave file cleanup to it.
!macro spsHandleUninstallResult TAG
  IfErrors spsUninstallLaunchFailed_${TAG}

  ${if} $R0 != 0
    IfSilent spsUninstallSilentFailure_${TAG}
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
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
