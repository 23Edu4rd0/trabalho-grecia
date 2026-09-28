/*
 * Agente de IA da Companhia das Máscaras Gregas.
 * Busca extrativa (sem chamadas externas) sobre a base de conhecimento
 * construída a partir do trabalho teórico e da apresentação em slides.
 */
(function () {
  const STOPWORDS = new Set([
    "a","o","as","os","de","da","do","das","dos","e","em","um","uma","uns","umas",
    "que","qual","quais","como","por","para","com","sem","sobre","sua","seu","suas","seus",
    "é","foi","era","são","ser","no","na","nos","nas","se","ao","aos","à","às","isso","isso?",
    "porque","quem","quando","onde","me","fale","diga","explique","explica","gostaria","saber",
    "pode","poderia","voce","você","teatro"
  ]);

  function normalize(str) {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ");
  }

  function tokenize(str) {
    return normalize(str)
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  }

  let KB = [];
  let KB_TOKENS = [];

  async function loadKB() {
    try {
      const res = await fetch("data/knowledge.json");
      KB = await res.json();
    } catch (e) {
      try {
        const res = await fetch("/data/knowledge.json");
        KB = await res.json();
      } catch (e2) {
        console.error("Não foi possível carregar a base de conhecimento", e2);
        KB = [];
      }
    }
    KB_TOKENS = KB.map((item) => {
      const bag = tokenize(item.title + " " + item.tags.join(" ") + " " + item.text);
      return bag;
    });
  }

  function scoreEntry(queryTokens, index) {
    const bag = KB_TOKENS[index];
    if (!bag.length) return 0;
    const freq = {};
    bag.forEach((t) => (freq[t] = (freq[t] || 0) + 1));
    let score = 0;
    const item = KB[index];
    const tagSet = new Set(item.tags.map((t) => normalize(t)));
    queryTokens.forEach((qt) => {
      if (freq[qt]) score += freq[qt];
      tagSet.forEach((tag) => {
        if (tag.includes(qt) || qt.includes(tag)) score += 2;
      });
      if (normalize(item.title).includes(qt)) score += 3;
    });
    return score;
  }

  function localAnswer(question) {
    const qTokens = tokenize(question);
    if (!qTokens.length || !KB.length) {
      return {
        text: "Pode reformular a pergunta? Posso falar sobre a origem do teatro grego, Dionísio, máscaras, tragédia, comédia, os dramaturgos, o espaço teatral, a música ou o legado do teatro até hoje.",
        sources: [],
      };
    }
    const scored = KB.map((item, i) => ({ item, score: scoreEntry(qTokens, i) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!scored.length) {
      return {
        text: "Não encontrei isso diretamente no trabalho teórico ou nos slides da Companhia das Máscaras Gregas. Tente perguntar sobre Dionísio, máscaras, tragédia, comédia, arquitetura do teatro, os dramaturgos (Ésquilo, Sófocles, Eurípides, Aristófanes), Aristóteles, música ou o legado do teatro grego hoje.",
        sources: [],
      };
    }

    const top = scored.slice(0, 2);
    const text = top.map((s) => s.item.text).join("\n\n");
    return {
      text,
      sources: top.map((s) => s.item.title),
    };
  }

  // Tenta responder com o Gemini (via função serverless em /api/chat, que
  // guarda a chave no servidor). Se a rota não existir (ex.: site hospedado
  // em GitHub Pages puro, sem backend), cai automaticamente na busca local.
  let backendAvailable = true;
  async function askBackend(question, history) {
    if (!backendAvailable) return null;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      if (res.status === 404) {
        backendAvailable = false; // sem função serverless disponível
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.text) return null;
      return { text: data.text, sources: [], model: data.model || "Gemini" };
    } catch {
      return null;
    }
  }

  // ---- UI wiring ----
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function addMessage(container, role, text, sources, engine) {
    const msg = el("div", "msg " + role, text.replace(/\n/g, "<br><br>"));
    if (sources && sources.length) {
      const src = el("span", "src", "📖 Fonte: " + sources.join(" · "));
      msg.appendChild(src);
    } else if (role === "bot" && engine) {
      const src = el("span", "src", engine === "local" ? "🔎 Busca local no trabalho" : "✨ Gemini");
      msg.appendChild(src);
    }
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function initWidget() {
    const toggle = document.createElement("button");
    toggle.id = "ai-toggle";
    toggle.setAttribute("aria-label", "Abrir agente de IA");
    toggle.textContent = "🎭";
    document.body.appendChild(toggle);

    const panel = el(
      "div",
      "",
      `
      <div class="ai-head">
        <span class="dot"></span>
        <div>
          <strong>Agente da Companhia</strong>
          <span class="sub">Gemini + contexto do trabalho (com busca local como reserva)</span>
        </div>
        <button class="close" aria-label="Fechar">✕</button>
      </div>
      <div class="ai-messages" id="ai-messages"></div>
      <div class="ai-suggestions" id="ai-suggestions"></div>
      <div class="ai-input">
        <input id="ai-input-field" type="text" placeholder="Pergunte sobre o teatro grego..." autocomplete="off" />
        <button id="ai-send">Enviar</button>
      </div>
    `
    );
    panel.id = "ai-panel";
    panel.hidden = true;
    document.body.appendChild(panel);

    const messages = panel.querySelector("#ai-messages");
    const suggestionsBox = panel.querySelector("#ai-suggestions");
    const input = panel.querySelector("#ai-input-field");
    const sendBtn = panel.querySelector("#ai-send");
    const closeBtn = panel.querySelector(".close");

    const suggestions = [
      "Quem foi Téspis?",
      "O que era a Grande Dionísia?",
      "Para que servia a máscara?",
      "Qual a diferença entre tragédia e comédia?",
      "O que é catarse?",
      "Como era o espaço do teatro grego?",
    ];
    suggestions.forEach((s) => {
      const chip = el("button", "chip", s);
      chip.addEventListener("click", () => {
        input.value = s;
        handleAsk();
      });
      suggestionsBox.appendChild(chip);
    });

    let greeted = false;
    const chatHistory = [];
    toggle.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden && !greeted) {
        greeted = true;
        addMessage(
          messages,
          "bot",
          "Salve! 🎭 Sou o agente de IA da Companhia das Máscaras Gregas, com o Gemini como cérebro (quando disponível) e o material da equipe como contexto. Posso responder perguntas sobre o nascimento do teatro grego, Dionísio, as máscaras, a tragédia, a comédia, os dramaturgos, a arquitetura do teatro e sua influência até hoje. O que você quer saber?"
        );
      }
      if (!panel.hidden) input.focus();
    });
    closeBtn.addEventListener("click", () => (panel.hidden = true));

    async function handleAsk() {
      const q = input.value.trim();
      if (!q) return;
      addMessage(messages, "user", q);
      input.value = "";
      sendBtn.disabled = true;
      const thinking = el("div", "msg bot", "Pensando…");
      messages.appendChild(thinking);
      messages.scrollTop = messages.scrollHeight;

      const remote = await askBackend(q, chatHistory);
      thinking.remove();
      if (remote) {
        addMessage(messages, "bot", remote.text, remote.sources, "gemini");
        chatHistory.push({ role: "user", text: q }, { role: "model", text: remote.text });
      } else {
        const local = localAnswer(q);
        addMessage(messages, "bot", local.text, local.sources, "local");
      }
      sendBtn.disabled = false;
    }

    sendBtn.addEventListener("click", handleAsk);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAsk();
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await loadKB();
    initWidget();
  });
})();
