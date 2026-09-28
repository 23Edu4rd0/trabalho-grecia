# Companhia das Máscaras Gregas — O Nascimento do Teatro Grego

Site estático do trabalho "O Nascimento do Teatro Grego e Como Isso Influencia o Mundo até Hoje", produzido pela Companhia das Máscaras Gregas (2º Ano A — Artes e História da Cultura Ocidental).

## Conteúdo do site

- `index.html` — página inicial com a apresentação do tema, o vídeo e a versão em podcast (áudio) da explicação, e acesso ao agente de IA.
- `teoria.html` — trabalho teórico completo (13 capítulos + referências bibliográficas).
- `slides.html` — a apresentação em slides usada no vídeo, com a fala dividida entre os apresentadores Gabriel Morato e Maria Luíza.
- `assets/media/apresentacao.mp4` — vídeo da apresentação (a mesma faixa de áudio é oferecida como "podcast" em um player de áudio separado).
- `assets/css/style.css` — estilos do site.
- `assets/js/ai-agent.js` — lógica do agente de IA.
- `data/knowledge.json` — banco de conhecimento (base de dados) usado como contexto do agente de IA, construído a partir do trabalho teórico e dos slides.
- `api/chat.js` — função serverless que conversa com o Gemini usando esse banco de dados como contexto, sem expor a chave de API no navegador.

## Como o agente de IA funciona

O agente usa o **Gemini** (`gemini-2.0-flash`) como modelo de linguagem, com o trabalho da equipe como contexto — e tem uma busca local como reserva caso o Gemini não esteja configurado.

1. O navegador manda a pergunta do usuário para `/api/chat` (uma função serverless, não uma chamada direta ao Google).
2. Essa função lê `data/knowledge.json`, monta um prompt de sistema com todo o material do trabalho e do slide, e só então chama a API do Gemini — usando uma chave (`GEMINI_API_KEY`) guardada em uma variável de ambiente no servidor, nunca no código do site.
3. A resposta do Gemini volta para o navegador e aparece no chat, marcada com "✨ Gemini".
4. **Se a função não estiver disponível** (por exemplo, se o site for publicado só como arquivos estáticos, sem backend, como no GitHub Pages puro), o agente cai automaticamente para uma busca local por palavras-chave dentro de `data/knowledge.json`, sem precisar de internet nem de chave — marcada com "🔎 Busca local no trabalho". Ou seja: o site nunca fica sem o agente de IA, mesmo sem o Gemini configurado.

Para expandir o contexto do agente (as duas formas), basta editar `data/knowledge.json` e adicionar novos objetos `{ "id", "title", "tags", "text" }`.

## Como publicar com o Gemini ativo (Vercel)

O GitHub Pages não roda backend, então para o Gemini funcionar de verdade é preciso um host com funções serverless. O projeto já vem pronto para a **Vercel** (tem plano gratuito):

1. Gere uma chave gratuita do Gemini em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Crie uma conta na [vercel.com](https://vercel.com) e importe este repositório GitHub como um novo projeto (a Vercel detecta sozinha que é um site estático + funções em `api/`).
3. Em **Project Settings → Environment Variables**, adicione `GEMINI_API_KEY` com o valor da sua chave.
4. Faça o deploy (a Vercel já faz isso automaticamente a cada push). Pronto: o chat vai responder com o Gemini.

Se você preferir continuar só no GitHub Pages (sem backend), não precisa fazer nada: o site funciona normalmente e o agente usa a busca local.

## Como visualizar localmente

Como o site usa `fetch()` para carregar o banco de dados, é preciso servir os arquivos por HTTP (não abrir o `index.html` direto pelo `file://`). Para testar só o front-end (sem o Gemini, usando a busca local):

```bash
python3 -m http.server 8080
```

Depois acesse `http://localhost:8080`.

Para testar com o Gemini de verdade localmente, use a CLI da Vercel:

```bash
npm i -g vercel
vercel dev
```

(peça para a CLI configurar a variável `GEMINI_API_KEY` quando solicitado, ou crie um arquivo `.env.local` com `GEMINI_API_KEY=sua-chave-aqui`).
