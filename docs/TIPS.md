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

Deploy em container: ver **Deploy (Docker Compose)** abaixo.

## Deploy (Docker Compose)

Imagem: Node + `dist` + `/api` (`Dockerfile`). O Compose sobe o serviço `app` (porta `127.0.0.1:3000`), lê variáveis de `.env` e persiste dados em volume (`dbdraw-data` → `/app/data`).

### `.env`

O `docker-compose.yml` usa `env_file: .env`. Mantenha esse arquivo **atualizado na VPS** — chave Resend, remetente e URL pública do site. Sem isso o login por e-mail quebra ou os magic links apontam para o host errado.

Variáveis relevantes (ver `.env.example`):

- `RESEND_API_KEY`, `MAIL_FROM` — envio do token
- `SITE_URL` — base dos links mágicos (ex. `https://www.dbdraw.io`)
- `COOKIE_SECURE` — opcional; força `Secure` no cookie de sessão (`true`/`false`). Sem a variável, o flag segue HTTPS (`trust proxy`)
- `PORT` / `HOST` — no bare-metal use `HOST=127.0.0.1`; no Compose o `HOST` é sobrescrito para `0.0.0.0`

Depois de editar só o `.env` (sem mudança de código), recrie o container para aplicar:

```bash
docker compose up -d --force-recreate
```

### Primeiro deploy

Na pasta do projeto (com `.env` pronto):

```bash
docker compose up -d --build
```

### Redeploy (código atualizado)

Quando o fonte na VPS mudou (`git pull`, etc.) e é preciso **rebuild da imagem** e **substituir o container** em execução:

```bash
docker compose up -d --build
```

O `--build` recompila a imagem se o contexto/Dockerfile mudou; o `up -d` recria o container com a imagem nova e sobe em detached. O volume de dados permanece (modelos/usuários não se perdem no rebuild).

Conferir:

```bash
docker compose ps
docker compose logs -f --tail=100
```

## Configuração Cloudfare

https://dash.cloudflare.com/


- SSL/TLS → Origin Server > Create Certificate
    - Private key type: RSA (2048)
    - Hostnames: dbdraw.io e *.dbdraw.io
    - Validity: 15 years (o padrão)

São gerados dois blocos de texto:
- origin.pem
- origin.key

Configurar no Caddy

```
sudo mkdir -p /etc/caddy/certs
sudo nano /etc/caddy/certs/origin.pem   # cola o certificado
sudo nano /etc/caddy/certs/origin.key   # cola a private key

sudo chown root:caddy /etc/caddy/certs/origin.pem /etc/caddy/certs/origin.key
sudo chmod 644 /etc/caddy/certs/origin.pem
sudo chmod 640 /etc/caddy/certs/origin.key

sudo chown root:caddy /etc/caddy/certs
sudo chmod 750 /etc/caddy/certs
```

Configurar o Caddyfile (conteudo no `Caddyfile` do projeto)

```
nano /etc/caddy/Caddyfile 
```

Conferir e recarregar

```
sudo caddy validate --config /etc/caddy/Caddyfile

sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

## SEO

Quando o site estiver no ar, envie `https://www.dbdraw.io/sitemap.xml` no [Google Search Console](https://search.google.com/search-console) e no Bing Webmaster. Como é um SPA, o que os buscadores catalogam de imediato são as meta tags e o HTML estático — não o canvas depois do login.


## Resend

Serviço de envio de email configurado no DNS do serviço da Cloudflare.

https://resend.com/emails