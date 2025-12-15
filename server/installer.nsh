!macro customInit
  ; Force close application if running
  nsExec::Exec 'taskkill /F /IM "Hap Assistente de Dados.exe"'
!macroend
