# Uso do sistema

1. Acesse o cartao Precificacao 3DH no Portal ou abra o endereco diretamente.
2. O sistema inicia automaticamente o login central e reutiliza a sessao do Keycloak.
3. Durante a transicao, o acesso legado permanece em `/?login=legacy`.
4. Importe um ou mais XMLs de NF-e e informe frete, custos e percentuais estimados.
5. Revise valores de mercado, margens, resumo e conclusao da compra.
6. Consulte precificacoes anteriores por fornecedor, CNPJ ou numero da NF-e.
7. Exporte CSV ou XLSX quando possuir `precificacao:export`.

Os comandos exibidos dependem das permissoes do usuario, e a API aplica as
mesmas restricoes no servidor.
