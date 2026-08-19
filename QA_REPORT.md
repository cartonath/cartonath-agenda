# CartoNath Agenda v0.4 RC2 — Relatório de pré-release

## Hardening aplicado
- dinheiro armazenado em centavos inteiros;
- banco IndexedDB versão 2 com migração de registros antigos;
- snapshot do nome do método preservado no histórico;
- soft-delete com ação Desfazer;
- métodos são arquivados em vez de destruídos;
- rascunho automático de novo atendimento;
- checagem de integridade ao abrir;
- tela de erro para falha de banco;
- cache/versionamento explícito da aplicação;
- navegação network-first e assets versionados;
- CSS com `dvh`, safe areas e scroll interno dos dialogs;
- financeiro separado por data de atendimento, previsão e recebimento real;
- conflito de horário gera aviso, não bloqueio;
- registros apagados deixam de contaminar agenda/financeiro.

## Testes automatizados
Execute `node tests.js`.

Cobertura lógica:
- precisão monetária;
- migração v1 -> v2;
- preservação histórica;
- faturado x recebido em meses diferentes;
- a receber por mês previsto;
- soft-delete;
- conflito de horário;
- validações;
- stress de 1.500 atendimentos / 6 meses.

## Limite do teste
Este pacote não substitui o teste final em um iPhone físico com Safari/Web App instalado.
Esse teste é obrigatório antes de uso real.

## Resultado desta build
- `node --check`: 4/4 arquivos JavaScript passaram.
- testes lógicos: 9/9 passaram após correção de migração detectada pelo gate.
- stress independente em Python: 5.000 atendimentos / 6 meses, sem inconsistência numérica.

## Teste de navegador automatizado
Foi tentado um teste E2E com Chromium/Playwright em viewport 390×844 e touch.
O ambiente desta sessão bloqueou navegação automatizada tanto para `localhost` quanto para `file://`
com `ERR_BLOCKED_BY_ADMINISTRATOR`. Portanto, **nenhum resultado de browser E2E foi considerado como aprovado**.
O teste físico no iPhone permanece gate obrigatório.

## Gate de release
- Lógica e sintaxe: APROVADO.
- Migração representativa v1 -> v2: APROVADA.
- Stress lógico: APROVADO.
- Browser E2E neste ambiente: NÃO EXECUTÁVEL por restrição do ambiente.
- Safari/iPhone físico: PENDENTE.
