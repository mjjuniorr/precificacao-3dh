# Sistema Precificacao 3DH

Sistema web para importar XML de NF-e, consolidar produtos por SKU e gerar uma tabela de precificacao com edicao manual, historico e exportacao CSV/XLSX. O acesso e centralizado pelo Portal 3DH com OpenID Connect.

## Rodar localmente

1. Inicie o Portal 3DH e o Keycloak de homologacao nas portas `4180` e `8080`.
2. Copie `.env.example` para `.env`.
3. Execute:

```bash
docker compose -f docker-compose.homologacao-pc.yml --env-file .env up --build
```

4. Acesse `http://localhost:8796` e entre com sua conta do Portal 3DH.

## Acesso e permissoes

O frontend usa Authorization Code com PKCE e guarda a sessao somente em `sessionStorage`. A API valida assinatura, emissor, audiencia, expiracao e as seguintes roles:

- `precificacao:view`
- `precificacao:import`
- `precificacao:edit`
- `precificacao:export`
- `precificacao:admin`

Importacoes, alteracoes, exportacoes e exclusoes administrativas geram registros de auditoria com o identificador e o nome do usuario.

## Estrutura

- `frontend/`: React, TypeScript, TailwindCSS e Nginx.
- `backend/`: Node.js, Express, parser NF-e, calculos e exportacao.
- `docker-compose.homologacao-pc.yml`: homologacao local no PC.
- `docker-compose.producao-vps.yml`: stack Docker Swarm para Portainer e Traefik.
- `.github/workflows/publish-images.yml`: build e publicacao no GHCR.
- `docs/`: documentacao de requisitos, tecnologia, deploy e uso.

## Formula principal

O sistema ignora os impostos informados no XML. Eles podem servir como referencia fiscal, mas nao entram automaticamente na precificacao.

- O valor liquido da NF-e (`vNF`) e rateado entre os produtos.
- Frete e outros custos informados como total sao divididos igualmente pela quantidade total de unidades.
- O ICMS estimado e calculado sobre o valor liquido de compra.
- O preco sugerido usa o calculo reverso:
  `precoSugerido = custoAntesVenda / (1 - impostoVenda% - margemDesejada%)`
- O valor de mercado comeca com a sugestao, mas permanece editavel.
- O imposto de venda e calculado sobre o valor de mercado.
- O custo completo estimado da venda soma aquisicao, frete, outros custos, ICMS estimado e imposto de venda.
