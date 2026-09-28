// Função serverless (Vercel) que repassa perguntas para a API do Gemini,
// mantendo a chave (GEMINI_API_KEY) apenas no servidor, nunca no navegador.
const fs = require("fs");
const path = require("path");

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

let knowledgeCache = null;
function loadKnowledge() {
  if (knowledgeCache) return knowledgeCache;
  const file = path.join(process.cwd(), "data", "knowledge.json");
  const raw = fs.readFileSync(file, "utf8");
  const items = JSON.parse(raw);
  knowledgeCache = items
    .map((item) => `### ${item.title}\n${item.text}`)
    .join("\n\n");
  return knowledgeCache;
}

function buildSystemPrompt() {
  const context = loadKnowledge();
  return `Você é o agente de IA da "Companhia das Máscaras Gregas", um site escolar sobre o nascimento do teatro grego, criado por alunos do 2º ano A da disciplina de Artes e História da Cultura Ocidental (Divinópolis, MG).

Responda SEMPRE em português do Brasil, de forma clara e objetiva (no máximo ~120 palavras por resposta, salvo se o usuário pedir mais detalhes).

Use como base de conhecimento PRINCIPAL o material abaixo, extraído do trabalho teórico e dos slides da equipe. Priorize essas informações. Se a pergunta for sobre teatro grego e algo não estiver no material, você pode complementar com seu conhecimento geral sobre o assunto, deixando claro quando estiver indo além do trabalho da equipe (ex: "isso não está no trabalho da turma, mas..."). Se a pergunta não tiver relação nenhuma com teatro grego, gentilmente redirecione o usuário ao tema do site.

=== MATERIAL DA EQUIPE ===
${context}
=== FIM DO MATERIAL ===`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY não configurada no servidor." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const question = (body && body.question ? String(body.question) : "").slice(0, 800);
  const history = Array.isArray(body && body.history) ? body.history.slice(-8) : [];

  if (!question.trim()) {
    res.status(400).json({ error: "Pergunta vazia." });
    return;
  }

  const contents = [
    ...history.map((turn) => ({
      role: turn.role === "user" ? "user" : "model",
      parts: [{ text: String(turn.text || "").slice(0, 2000) }],
    })),
    { role: "user", parts: [{ text: question }] },
  ];

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: buildSystemPrompt() }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Erro Gemini:", geminiRes.status, errText);
      res.status(502).json({ error: "Falha ao consultar o Gemini." });
      return;
    }

    const data = await geminiRes.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      "Não consegui gerar uma resposta agora.";

    res.status(200).json({ text, model: GEMINI_MODEL });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno ao falar com o Gemini." });
  }
};
