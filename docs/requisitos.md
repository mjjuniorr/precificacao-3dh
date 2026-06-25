# Requisitos

## Funcionais

- Login simples protegido por `APP_PASSWORD`.
- Upload de um ou varios XMLs de NF-e.
- Validacao basica de estrutura NF-e (`infNFe`, emitente e itens).
- Extracao de SKU, descricao, NCM, quantidade, custo unitario, total, fornecedor, numero e emissao.
- Consolidacao de produtos repetidos por SKU.
- Calculo de custo medio ponderado quando um SKU aparece em mais de uma nota.
- Parametros gerais de frete, outros custos, ICMS estimado, imposto de venda e margem.
- Edicao por item de categoria, frete unitario, outros custos unitarios, ICMS estimado, imposto de venda, margem e valor de mercado.
- Os impostos presentes no XML nao sao usados nos calculos.
- O valor liquido da NF-e e a base de compra rateada entre os produtos.
- Frete e outros custos totais sao divididos pela quantidade total de unidades, gerando o mesmo valor unitario para todos os produtos.
- O sistema sugere um preco pelo calculo reverso, mantendo o valor de mercado editavel.
- O custo completo estimado da venda inclui a despesa tributaria calculada sobre o valor de mercado.
- Recalculo automatico apos salvar alteracoes.
- Historico de importacoes.
- Consulta de precificacoes por fornecedor, CNPJ e numero da NF-e.
- Registro de responsavel, data e hora da criacao e da ultima alteracao.
- Guardiao de chave de acesso para impedir que uma NF-e repetida seja tratada silenciosamente como nova.
- Abertura da precificacao existente ou criacao explicita de uma nova versao.
- Exportacao CSV e XLSX.
- Resumo analitico da compra com totais, margem media, peso do frete e conclusao automatica.

## Infraestrutura

- Frontend e backend com imagens Docker separadas.
- PostgreSQL com volume persistente.
- Docker Compose para homologacao local.
- Stack Docker Swarm para Portainer.
- Traefik usando a rede externa `PortainerRede`.
- Dominio previsto: `precificacao.3dhmanaus.shop`.
