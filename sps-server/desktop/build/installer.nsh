; Never wait on a hidden error dialog during a silent updater handoff.
; Keep the old uninstaller's failure fatal, even after an explicit recovery.
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
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Automatic replacement failed. Open data-preserving recovery?$\r$\n$\r$\nBack up your SPS data and move any work saved inside the program installation folder before cleanup. Recovery checks the original 0.4.86 installation and asks again before removing verified program residue.$\r$\nAppData, Host Vault and external project folders are not cleanup targets. Setup will still stop; run the latest Setup again after recovery." /SD IDNO IDYES spsLegacyRecoveryOpen_${TAG}
    Goto spsUninstallFailed_${TAG}

    spsLegacyRecoveryOpen_${TAG}:
    Push $R0
    InitPluginsDir
    ClearErrors
    File /oname=$PLUGINSDIR\SpsLegacyRecovery.exe "${PROJECT_DIR}\.legacy-recovery\SpsLegacyRecovery.exe"
    IfErrors spsLegacyRecoveryUnavailable_${TAG}
    ExecWait '"$PLUGINSDIR\SpsLegacyRecovery.exe" --recover "$installationDir"' $R1
    IfErrors spsLegacyRecoveryUnavailable_${TAG}
    Goto spsLegacyRecoveryFinished_${TAG}

    spsLegacyRecoveryUnavailable_${TAG}:
    MessageBox MB_OK|MB_ICONEXCLAMATION "SPS recovery could not start. Keep your data backup and use Windows Installed Apps. Do not delete SPS data folders."

    spsLegacyRecoveryFinished_${TAG}:
    Pop $R0
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
