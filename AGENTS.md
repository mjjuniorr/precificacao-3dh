# Instrucoes para agentes

Antes de alterar este projeto:

1. Leia integralmente `README.md`.
2. Consulte no repositorio `mjjuniorr/Portal-3DH-Manaus`:
   - `AGENTS.md`;
   - `docs/INTEGRACAO-OIDC.md`;
   - `docs/INTEGRACAO-PRECIFICACAO.md`;
   - `docs/SISTEMAS-INTEGRADOS.md`.
3. Preserve banco, volumes, XMLs, precificacoes, formulas e auditoria.
4. Mantenha Portal e Precificacao em repositorios e stacks separados.

## Autenticacao

- Cliente publico `precificacao-web`, Authorization Code com PKCE `S256`.
- Tokens do frontend somente em `sessionStorage`.
- API valida assinatura, issuer, audience, expiracao e permissoes.
- Produção permanece em `AUTH_MODE=hybrid` ate validacao completa do SSO.
- OIDC inicia automaticamente; o legado fica em `/?login=legacy`.
- Nao mude para `oidc` sem confirmacao explicita do usuario.
- Nunca versione senhas, tokens, `.env` real ou segredos da VPS.

## Validacao

Execute testes, typecheck, build Docker e validacao do Compose. Nao faça deploy
nem remova volumes sem autorizacao explicita.
