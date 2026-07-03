# Requisitos

- Login central OIDC com Authorization Code e PKCE `S256`.
- Transicao por `AUTH_MODE=legacy|hybrid|oidc`.
- Em `hybrid`, OIDC automatico e login legado explicito em `/?login=legacy`.
- Permissoes `view`, `import`, `edit`, `export` e `admin` validadas na API.
- Importacao de XML de NF-e sem usar impostos fiscais como custo automatico.
- Consolidacao por SKU, historico, versoes e protecao contra NF-e duplicada.
- Persistencia PostgreSQL com autoria e auditoria.
- Exportacao CSV e XLSX.
- Dominio `precificacao.3dhmanaus.com.br`.
- Banco e stack independentes na `PortainerRede`.
