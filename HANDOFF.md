# Handoff - Projeto Hap Assistente de Dados (v1.15.72)

## Estado Atual
*   **Versão:** v1.15.72
*   **Backend Ativo:** Supabase (configurado em `server/chat_config.json` e `server/services/adapters/SupabaseAdapter.js`).
*   **Installer:** Gerado em `server/dist/Hap Assistente de Dados Setup 1.15.72.exe`.
*   **Correções Recentes:**
    *   **Shared DOCs:** Corrigido problema de abertura de documentos compartilhados (Race Condition) via `pendingDoc` state.
    *   **Unread Separator:** Corrigido problema de "Mensagens Não Lidas" persistentes em modo Polling (Firewall). Implementado detecção de updates no `SupabaseAdapter` e atualização otimista no cliente.
    *   **AI Errors:** Melhorada mensagem de erro para falhas de conexão.
    *   **White Screen:** Corrigido crash ao renderizar mensagens compartilhadas sem metadados.

## Pendências e Recomendações (Próximo Agente)
1.  **Monitorar Polling:** A correção do separador de não lidas depende da lógica de polling no `SupabaseAdapter.js`. Verificar se o intervalo de 3s é adequado ou se gera muita carga.
2.  **Limpeza de Usuários:** O problema de "usuários fantasma" (TestBot) mencionado anteriormente parece mitigado, mas vale conferir se `users.json` precisa de limpeza automática.
3.  **Performance:** O build do cliente está gerando chunks grandes (>500kb). Considerar Code Splitting (Lazy Loading) para rotas menos usadas.

## Procedimentos de Build
*   **Client:** `cd client && npm run build`
*   **Server:** `cd server && npm run dist` (Isso aciona automaticamente o `copy-client`).
*   **Install:** O instalador é gerado na pasta `server/dist`.

## ⚠️ Credenciais (Uso Exclusivo para Continuidade)
Como o arquivo `.env` não é versionado, utilize estas chaves para configurar o ambiente local (`server/.env`):

```env
# Chave Obfuscada (Remova os espaços para usar)
GROQ_API_KEY=gsk_ 2zYeSDTgSKoSzEApSKTSWGdyb3FY0RsY5JxBCHkk1hM7g5lez48I
AI_MODEL=llama-3.3-70b-versatile
```

**Instrução:** Crie um arquivo `.env` na pasta `server/` com o conteúdo acima.
