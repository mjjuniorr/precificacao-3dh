# Deploy no Portainer

## Publicar imagens no GHCR

O workflow `Publish Docker images` roda a cada push na branch `main` e publica:

- `ghcr.io/mjjuniorr/precificacao-nfe-api:TAG_DO_COMMIT`
- `ghcr.io/mjjuniorr/precificacao-nfe-web:TAG_DO_COMMIT`

A tag corresponde aos sete primeiros caracteres do commit. O workflow tambem
publica `latest`, mas a stack de producao deve usar a tag imutavel.

## Variaveis da stack

Configure no Portainer:

```env
APP_IMAGE=ghcr.io/mjjuniorr/precificacao-nfe-web:TAG_DO_COMMIT
API_IMAGE=ghcr.io/mjjuniorr/precificacao-nfe-api:TAG_DO_COMMIT
APP_HOST=precificacao.3dhmanaus.shop
APP_REPLICAS=1

POSTGRES_DB=precificacao
POSTGRES_USER=precificacao
POSTGRES_PASSWORD=senha-forte-do-banco

CORS_ORIGIN=https://precificacao.3dhmanaus.shop
AUTH_MODE=oidc
OIDC_ISSUER=https://auth.3dhmanaus.shop/realms/3dh
OIDC_JWKS_URL=
OIDC_CLIENT_ID=precificacao-web
OIDC_AUDIENCE=precificacao-web
PORTAL_URL=https://portal.3dhmanaus.shop

TRAEFIK_ENTRYPOINTS=websecure
TRAEFIK_CERTRESOLVER=letsencryptresolver
TRAEFIK_PRIORITY=1
```

A aplicacao nao armazena senha local. O login utiliza o cliente publico
`precificacao-web` do realm `3dh`.

## Criar stack

1. No Portainer, acesse **Stacks**.
2. Crie uma stack para a Precificacao.
3. Cole o conteudo de `docker-compose.producao-vps.yml`.
4. Configure as variaveis acima.
5. Confirme que a rede externa `PortainerRede` existe.
6. Confirme que as imagens GHCR estao publicas ou configure o registry.
7. Faça o deploy.

## Traefik

Somente `precificacao-web` e publicado. As labels seguem o padrao da VPS:

- `traefik.enable=true`
- `traefik.docker.network=PortainerRede`
- router para `precificacao.3dhmanaus.shop`
- TLS com o certresolver do ambiente
- middleware `precificacao_sslheader`
- `passHostHeader=true`
- porta interna `80`

O Nginx encaminha `/api` para `precificacao-api:4000`.

## Identidade

Antes do deploy, o Keycloak de producao precisa possuir:

- cliente publico `precificacao-web`;
- Authorization Code ativado e PKCE `S256`;
- redirect e logout `https://precificacao.3dhmanaus.shop/*`;
- origem web `https://precificacao.3dhmanaus.shop`;
- audience mapper `precificacao-web`;
- roles `precificacao:view`, `precificacao:import`, `precificacao:edit`,
  `precificacao:export` e `precificacao:admin`.

Mantenha `OIDC_JWKS_URL` vazio em producao para usar o JWKS derivado do emissor
publico. Preencha somente quando houver um endereco interno estavel definido
pela infraestrutura.
