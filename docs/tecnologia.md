# Tecnologia

- Frontend: React, TypeScript, Vite, `oidc-client-ts` e Nginx.
- Backend: Node.js, Express, TypeScript, `jose`, ExcelJS e fast-xml-parser.
- Banco: PostgreSQL 16.
- Identidade: Keycloak, cliente publico e PKCE `S256`.
- Infraestrutura: Docker Swarm, Portainer, Traefik, `PortainerRede` e GHCR.

O backend aceita JWT OIDC e, durante `AUTH_MODE=hybrid`, JWT legado assinado
com segredo mantido exclusivamente no ambiente. Nenhum `client_secret` existe
no frontend.
