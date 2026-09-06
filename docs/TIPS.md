## Notações

- https://www.softwareideas.net/erd-relation-arrows
- https://www.freecodecamp.org/portuguese/news/notacao-pe-de-galinha-erd-simbolos-de-relacionamento-e-como-ler-diagramas/
- https://creately.com/guides/cardinality-symbols/

## Sync DBML > Diagrama

Regras:

- Cardinalidades default para relações novas:  — > → ONE_OR_MANY→ONE, < → ONE→ONE_OR_MANY, <> → ONE_OR_MANY→ONE_OR_MANY, - → ONE→ONE. 
- Deleção de tabelas no código remove do canvas com apply direto (1 passo)
- FK órfã (campo isFK sem ref correspondente) vira campo comum
- Match de nomes case-sensitive exato e previsível (User vs user = nova entidade)
- Ordem dos campos: espelha a ordem do bloco Table (reordena) — código como fonte da verdade visual.
- Recursos sem contraparte (enum, unique, default, notes…): conta avisos no resumo (ex: "3 constraints ignoradas")
- Mermaid: continua read-only (fora de escopo)

## Deploy (Caddy + Cloudflare)

Para um único app na VPS, Caddy é melhor que Nginx: um `Caddyfile` (`deploy/Caddyfile`), `reverse_proxy` trivial, e HTTPS automático se o origin estiver exposto. Nginx só vale se a VPS já for um farm de sites com configs prontas.

Atrás do Cloudflare (proxy laranja, SSL Full strict): Caddy termina TLS com Origin Certificate. Sem Cloudflare: omita `tls` e o Caddy emite Let's Encrypt. Com Cloudflare Tunnel, Caddy é opcional — o `cloudflared` pode apontar direto para `127.0.0.1:3000`.

```bash
npm run build && npm start   # Express em 127.0.0.1:3000
```

## SEO

Quando o site estiver no ar, envie `https://www.dbdraw.io/sitemap.xml` no [Google Search Console](https://search.google.com/search-console) e no Bing Webmaster. Como é um SPA, o que os buscadores catalogam de imediato são as meta tags e o HTML estático — não o canvas depois do login.

