# CartoNath Agenda v0.5 RC2

Release Candidate com backup local.

## Novidade
- Exportar backup em arquivo JSON com checksum SHA-256.
- Restaurar backup com validação antes de tocar no banco.
- Restauração substitui os dados atuais somente após confirmação.
- Uma cópia de segurança pré-restauração fica guardada internamente em `meta/preRestoreBackup`.

## Testes
`node tests.js`

## Importante
O gate final continua sendo o teste físico no iPhone instalado pela Tela de Início.
