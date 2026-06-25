# Deploy no Portainer

## Publicar imagens no GHCR

1. Suba o projeto para um repositorio GitHub.
2. Garanta que GitHub Actions tenha permissao de `packages: write`.
3. Rode o workflow `Publish Docker images` ou faca push na branch `main`.
4. As imagens publicadas serao:

- `ghcr.io/mjjuniorr/precificacao-nfe-api:latest`
- `ghcr.io/mjjuniorr/precificacao-nfe-web:latest`

## Variaveis da stack

Configure no Portainer:

```env
POSTGRES_DB=precificacao
POSTGRES_USER=precificacao
POSTGRES_PASSWORD=senha-forte-do-banco
IMAGE_TAG=latest
PRECIFICACAO_HOST=precificacao.3dhmanaus.shop
AUTH_HOST=auth.3dhmanaus.shop
PORTAL_HOST=portal.3dhmanaus.shop
TRAEFIK_ENTRYPOINTS=websecure
TRAEFIK_CERTRESOLVER=letsencryptresolver
```

A aplicacao nao armazena senha local. O login utiliza o cliente publico
`precificacao-web` do realm `3dh` no Keycloak do Portal.

## Criar stack

1. No Portainer, acesse **Stacks**.
2. Crie uma nova stack.
3. Cole o conteudo de `docker-compose.producao-vps.yml`.
4. Confirme que a rede externa `PortainerRede` ja existe.
5. Faça o deploy.

## Traefik

O servico `web` possui as labels:

- `traefik.enable=true`
- `traefik.docker.network=PortainerRede`
- `traefik.http.routers.precificacao-nfe.rule=Host(\`precificacao.3dhmanaus.shop\`)`
- `traefik.http.routers.precificacao-nfe.entrypoints=websecure`
- `traefik.http.routers.precificacao-nfe.tls.certresolver=letsencryptresolver`
- `traefik.http.services.precificacao-nfe.loadbalancer.server.port=80`

O frontend encaminha `/api` internamente para o servico `api:4000`, entao apenas o container web precisa ficar publico no Traefik.
