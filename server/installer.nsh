!macro customInit
  ; Force close application if running
  nsExec::Exec 'taskkill /F /IM "Hap Assistente de Dados.exe"'
!macroend

!macro un.customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Deseja excluir também os arquivos de backup e dados salvos?" IDNO +2
  RMDir /r "$APPDATA\HapAssistenteDeDados"
!macroend
