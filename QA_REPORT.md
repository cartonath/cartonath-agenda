# CartoNath Agenda v0.5 RC2 — Relatório de pré-release

## Mudança desta versão
Backup e restauração offline, sem servidor.

## Proteções implementadas
- exportação inclui clientes, métodos, agenda, históricos e dados financeiros;
- checksum SHA-256 detecta alteração/corrupção do arquivo;
- importação valida aplicação, versão, estrutura, IDs e referências antes de tocar no banco;
- restauração usa uma única transação IndexedDB para substituir os três conjuntos principais;
- antes da restauração, o estado atual é guardado internamente;
- botão “Desfazer última restauração” recupera esse estado anterior;
- método personalizado e preço histórico continuam preservados;
- exportação tenta usar a folha de compartilhamento do aparelho e cai para download se necessário;
- nenhuma nuvem, conta ou servidor foi adicionado.

## Gates executados
- Sintaxe JavaScript: PASS em `core.v05.js`, `app.v05.js`, `sw.v05.js`, `tests.js` e `backup_stress.js`.
- Testes lógicos: 16/16 PASS.
- Migração legada -> modelo atual: PASS.
- Precisão monetária em centavos: PASS.
- Faturado/recebido/a receber em meses diferentes: PASS.
- Soft-delete: PASS.
- Conflito de horário: PASS.
- Backup íntegro: PASS.
- Backup adulterado: corretamente REJEITADO.
- Backup com cliente inexistente: corretamente REJEITADO.
- Backup com ID duplicado: corretamente REJEITADO.
- Método customizado dentro do backup: PASS.
- Registros soft-deleted no backup: PASS.
- Stress operacional base: 1.500 atendimentos / 6 meses: PASS.
- Stress de backup: 10.000 atendimentos, 500 clientes e 25 métodos: PASS.
- Tamanho do arquivo no stress de 10.000 atendimentos: ~2,94 MB.
- Manifest PWA, paths relativos, ícones e cache versionado: PASS.
- IDs críticos da interface: PASS.

## Teste E2E de navegador
Foi tentado Playwright/Chromium em viewport móvel, inclusive com origem interceptada localmente.
O ambiente desta sessão bloqueou a navegação automatizada com `ERR_BLOCKED_BY_ADMINISTRATOR`.
Por isso, nenhum teste E2E de navegador foi falsamente marcado como aprovado.

## Gate ainda obrigatório
Safari/iPhone físico depois que esta versão for publicada:
instalação, exportar para Arquivos/iCloud, restaurar, desfazer restauração, teclado, modo avião,
matar/reabrir o app e reiniciar o aparelho.

Até esse gate passar, a versão é Release Candidate e deve usar apenas dados de teste.
