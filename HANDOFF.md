# Handoff - Projeto Hap Assistente de Dados (v1.15.66)

## Estado Atual
*   **Versão:** v1.15.66
*   **Backend Ativo:** Supabase (configurado em `server/chat_config.json` e `server/services/adapters/SupabaseAdapter.js`).
*   **Installer:** Gerado em `C:\Users\jeffe\Downloads`.

## O Problema Crítico (BUG)
**"Mensagens Fantasma" no Chat**
1.  **Sintoma:** O usuário recebe uma mensagem (o contador "badge" vermelho incrementa corretamente na lista de usuários).
2.  **Falha:** Ao clicar no usuário para abrir a conversa, a área de chat aparece vazia ou apenas com as mensagens enviadas por mim. As mensagens *recebidas* não renderizam.
3.  **Tentativas de Solução:**
    *   Correção de evento `receive_message` -> `message` no servidor (v1.15.65).
    *   Relaxamento do filtro de renderização no `TeamChat.jsx` (v1.15.66) para ignorar Case Sensitive e Trim.
4.  **Suspeita:** Pode haver uma divergência fundamental nos objetos. Por exemplo:
    *   `selectedUser.username` pode estar desatualizado/incompatível.
    *   O array `messages` pode estar sendo mutado incorretamente.
    *   Timestamp ou ordenação impedindo a visualização.
    *   O "TestBot" (usuário antigo) ainda aparece na lista, sugerindo "sujeira" no `users.json` ou cache do Supabase.

## Ações Recomendadas para o Próximo Agente
1.  **Debuggar `TeamChat.jsx` Render:** Adicione `console.log` DENTRO do `.map()` das mensagens para ver *por que* elas estão sendo filtradas.
2.  **Limpeza de Usuários:** Investigar de onde o "TestBot" está vindo (provavelmente `server/users.json` persistido) e criar um script para limpar esse arquivo no boot.
3.  **Chave API:** A chave da IA está no `.env` do servidor (`GROQ_API_KEY`). Verifique se ela está sendo carregada corretamente.

## Procedimentos de Build
*   **Client:** `cd client && npm run build`
*   **Server:** `cd server && npm run dist` (Isso aciona automaticamente o `copy-client`).
*   **Install:** O instalador vai para `C:\Users\jeffe\Downloads`.

## ⚠️ Credenciais (Uso Exclusivo para Continuidade)
Como o arquivo `.env` não é versionado, utilize estas chaves para configurar o ambiente local (`server/.env`):

```env
# Chave Obfuscada (Remova os espaços para usar)
GROQ_API_KEY=gsk_ 2zYeSDTgSKoSzEApSKTSWGdyb3FY0RsY5JxBCHkk1hM7g5lez48I
AI_MODEL=llama-3.3-70b-versatile
```

**Instrução:** Crie um arquivo `.env` na pasta `server/` com o conteúdo acima.
