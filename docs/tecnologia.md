# Tecnologia

## Frontend

- React com TypeScript.
- Vite para build.
- TailwindCSS para base de estilos.
- Nginx para servir arquivos estaticos e encaminhar `/api` para o backend.

## Backend

- Node.js com Express.
- `fast-xml-parser` para leitura dos XMLs.
- `pg` para acesso ao PostgreSQL.
- `xlsx` para gerar CSV e XLSX.
- Migração automatica na inicializacao.

## Banco de dados

Tabelas criadas automaticamente:

- `import_batches`: lotes de importacao e resumo.
- `nfe_xmls`: XMLs originais importados.
- `nfe_notes`: dados de notas fiscais.
- `pricing_items`: tabela consolidada de precificacao por SKU.

## Autenticacao

A versao inicial usa senha unica (`APP_PASSWORD`) e token assinado por `JWT_SECRET`. A separacao da autenticacao em modulo deixa o projeto preparado para trocar por SSO/OIDC futuramente.
