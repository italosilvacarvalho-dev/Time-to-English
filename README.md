# Time to English

App web (PWA) para aprender **inglês do dia a dia** e usar **offline** no celular.

**Módulo atual: Traduzir (inglês ⇄ português)**
- Dicionário com 220+ expressões informais (conversa, internet e vídeos, gírias, phrasal verbs, restaurante, transporte, compras, trabalho), com tradução, contexto, exemplo e "também se diz". Funciona offline desde o primeiro acesso.
- Banco de frases reais (Tatoeba): dezenas de milhares de pares português ⇄ inglês traduzidos por pessoas, com busca por frases parecidas, offline.
- Tradutor offline para qualquer frase, nas duas direções: modelos de IA ([opus-mt-en-ROMANCE](https://huggingface.co/Helsinki-NLP/opus-mt-en-ROMANCE) e [opus-mt-ROMANCE-en](https://huggingface.co/Helsinki-NLP/opus-mt-ROMANCE-en)) rodam dentro do navegador. Cerca de 115 MB por direção, baixados uma vez.
- Em português → inglês, o app também mostra "como falam na rua" quando reconhece uma expressão do dicionário.
- Pronúncia com a voz do próprio celular.
- Frases salvas, modo claro e escuro.

Próximo módulo: **Falar** (português falado → inglês).

## Como funciona

| Onde | O que fica lá |
|---|---|
| GitHub (este repositório) | Código do app. Cada push na `main` publica automaticamente. |
| Cloudflare Workers | Serve o app (`public/`) e repassa `/models/*` para o R2 (`src/worker.js`). |
| Cloudflare R2 | Modelos de IA e banco de frases (arquivos grandes, enviados pelos workflows). |
| Celular | Guarda o app (service worker) e o modelo (Cache Storage) para usar sem internet. |

Se o R2 ainda não tiver os modelos, o app baixa direto do Hugging Face. Assim ele funciona desde o primeiro dia.

## Configuração (uma vez)

### 1. Criar o bucket R2
Painel da Cloudflare → **R2 Object Storage** → **Create bucket** → nome: `time-to-english-modelos`.
(A Cloudflare pode pedir um cartão para ativar o R2. O uso deste app cabe no plano gratuito.)

### 2. Conectar o repositório ao Workers
Painel → **Workers & Pages** → **Create** → **Import a repository** → escolha `Time-to-English`.
- Build command: *(deixe vazio)*
- Deploy command: `npx wrangler deploy`

A cada push na `main`, a Cloudflare publica a nova versão. O endereço fica parecido com `https://time-to-english.<sua-conta>.workers.dev`.

### 3. Enviar os modelos para o R2
**Opção A, pelo GitHub (sem instalar nada):**
1. Cloudflare → **My Profile → API Tokens → Create Token** → modelo *"Edit Cloudflare Workers"*. Confira se a permissão **R2 Storage: Edit** está incluída.
2. Copie também o **Account ID**, que aparece na página inicial dos Workers.
3. GitHub → este repositório → **Settings → Secrets and variables → Actions** → crie os segredos `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.
4. GitHub → **Actions** → **Enviar modelos para o R2** → **Run workflow**.

**Opção B, pelo computador:**
```bash
npm install
npx wrangler login
npm run modelos
```

### 4. Enviar o banco de frases para o R2
GitHub → **Actions** → **Enviar banco de frases para o R2** → **Run workflow**. Ele baixa as frases do Tatoeba, fica com as mais curtas (as mais úteis no dia a dia) e envia para o R2. Pode rodar de novo quando quiser atualizar.

### 5. Instalar no celular
Abra o endereço no **Chrome** → menu ⋮ → **Adicionar à tela inicial**. Abra o app, toque em **Baixar tradutor** (de preferência no Wi-Fi) e pronto: funciona offline.

## Desenvolvimento local
```bash
npm install
npm run dev        # http://localhost:8787
```

## Atualizações
Ao mudar arquivos do app, aumente `VERSAO` em `public/sw.js`. Assim o celular pega a versão nova na próxima vez que abrir com internet.

## Créditos
- Frases: [Tatoeba](https://tatoeba.org), licença CC BY 2.0 FR.
- Tradução: modelo OPUS-MT (Helsinki-NLP), licença CC-BY 4.0, convertido por Xenova. Roda com [Transformers.js](https://github.com/huggingface/transformers.js).
