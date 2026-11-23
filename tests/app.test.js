/* Testes de interface com jsdom: carrega index.html com os scripts reais
   e simula as respostas de rede (forms.json e planilha). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const raiz = path.join(__dirname, "..");
const ler = (f) => fs.readFileSync(path.join(raiz, f), "utf8");
const HTML = ler("index.html");
const CORE = ler("catalogo-core.js");
const APP = ler("app.js");
const PLANILHA = "https://script.google.com/macros/s/EXEMPLO/exec";

const FORMS = [
  { id: 1, nome: "Devolução Caffeine", categoria: "Devolução", descricao: "Devolução", url: "https://forms.gle/a", ativo: true, ordem: 1 },
  { id: 2, nome: "Validação de Produtos", categoria: "Operacionais", url: "https://forms.gle/b", ativo: true, ordem: 1 },
  { id: 3, nome: "Inativo", categoria: "Operacionais", url: "https://forms.gle/c", ativo: false }
];

/* respostas: { "forms.json": {status, body} | "rede" | "timeout", planilha: ... } */
async function montar(respostas) {
  const dom = new JSDOM(HTML.replace(/<script[\s\S]*?<\/script>/g, ""), {
    url: "https://exemplo.github.io/catalogo/",
    runScripts: "outside-only"
  });
  const w = dom.window;
  const pendentes = [];

  class FakeXHR {
    open(_m, url) { this.url = url; }
    send() {
      const chave = this.url.startsWith(PLANILHA) ? "planilha" : this.url.split("?")[0];
      const r = respostas[chave];
      pendentes.push(() => {
        if (r === undefined || r === "rede") return this.onerror && this.onerror();
        if (r === "timeout") return this.ontimeout && this.ontimeout();
        this.status = r.status;
        this.responseText = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
        this.onload && this.onload();
      });
    }
  }
  w.XMLHttpRequest = FakeXHR;
  w.console.error = w.console.warn = () => {};
  w.eval("window.CONFIG = { API_URL: " + JSON.stringify(respostas.planilha === null ? "" : PLANILHA) + " };");
  w.eval(CORE);
  const pronto = new Promise((r) =>
    w.document.readyState === "loading" ? w.document.addEventListener("DOMContentLoaded", r) : r());
  w.eval(APP);
  await pronto;

  const $ = (s) => w.document.querySelector(s);
  const $$ = (s) => [...w.document.querySelectorAll(s)];
  const responder = (ordem) => {
    /* ordem: índices das requisições pendentes a resolver (padrão: todas, em ordem) */
    const lista = pendentes.slice();
    const escolhidos = ordem || lista.map((_, i) => i);
    escolhidos.forEach((i) => lista[i]());
    escolhidos.slice().sort((a, b) => b - a).forEach((i) => pendentes.splice(i, 1));
  };
  const digitar = (texto) => {
    const input = $("#searchInput");
    input.value = texto;
    input.dispatchEvent(new w.Event("input"));
  };
  return { w, $, $$, responder, digitar, pendentes };
}

const OK = { status: 200, body: FORMS };

test("JSON válido: renderiza cards ativos por categoria", async () => {
  const t = await montar({ "forms.json": OK, planilha: null });
  t.responder();
  assert.equal(t.$$("a.card").length, 2, "inativo não aparece");
  assert.deepEqual(t.$$(".categoria-titulo").map((e) => e.textContent), ["Devolução", "Operacionais"]);
  assert.equal(t.$("#catalogo").getAttribute("aria-busy"), null);
});

test("JSON inválido: estado de erro com Tentar novamente", async () => {
  const t = await montar({ "forms.json": { status: 200, body: "{quebrado" }, planilha: null });
  t.responder();
  assert.ok(t.$("#botaoTentarNovamente"));
  assert.match(t.$("#catalogo").textContent, /Não foi possível carregar/);
});

test("HTTP 500: estado de erro", async () => {
  const t = await montar({ "forms.json": { status: 500, body: "" }, planilha: null });
  t.responder();
  assert.ok(t.$("#botaoTentarNovamente"));
});

test("Timeout: estado de erro", async () => {
  const t = await montar({ "forms.json": "timeout", planilha: null });
  t.responder();
  assert.ok(t.$("#botaoTentarNovamente"));
});

test("Tentar novamente recarrega e exibe o catálogo", async () => {
  const respostas = { "forms.json": "rede", planilha: null };
  const t = await montar(respostas);
  t.responder();
  respostas["forms.json"] = OK;
  t.$("#botaoTentarNovamente").click();
  assert.match(t.$("#catalogo").textContent, /Carregando/);
  t.responder();
  assert.equal(t.$$("a.card").length, 2);
});

test("Catálogo vazio é diferente de erro", async () => {
  const t = await montar({ "forms.json": { status: 200, body: [] }, planilha: null });
  t.responder();
  assert.match(t.$("#catalogo").textContent, /Nenhum formulário disponível/);
  assert.equal(t.$("#botaoTentarNovamente"), null);
});

test("Só inativos = catálogo vazio", async () => {
  const t = await montar({ "forms.json": { status: 200, body: [FORMS[2]] }, planilha: null });
  t.responder();
  assert.match(t.$("#catalogo").textContent, /Nenhum formulário disponível/);
});

test("Pesquisa sem resultados é diferente de erro e de vazio", async () => {
  const t = await montar({ "forms.json": OK, planilha: null });
  t.responder();
  t.digitar("xyz");
  assert.match(t.$("#catalogo").textContent, /Nenhum formulário encontrado/);
  assert.ok(t.$("#botaoLimparResultados"));
  t.$("#botaoLimparResultados").click();
  assert.equal(t.$$("a.card").length, 2);
  assert.equal(t.$("#searchInput").value, "");
});

test("Pesquisa sem acento encontra com acento e anuncia resultado", async () => {
  const t = await montar({ "forms.json": OK, planilha: null });
  t.responder();
  t.digitar("validacao");
  assert.equal(t.$$("a.card").length, 1);
  assert.match(t.$("#statusBusca").textContent, /1 formulário encontrado/);
});

test("Teclado: Escape limpa a pesquisa; botão limpar só aparece com texto", async () => {
  const t = await montar({ "forms.json": OK, planilha: null });
  t.responder();
  assert.ok(!t.$("#clearSearch").classList.contains("visible"));
  t.digitar("caffeine");
  assert.ok(t.$("#clearSearch").classList.contains("visible"));
  t.$("#searchInput").dispatchEvent(new t.w.KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(t.$("#searchInput").value, "");
  assert.equal(t.$$("a.card").length, 2);
});

test("Teclado: cards são links com href (focáveis); URL inválida não vira link", async () => {
  const dados = [...FORMS, { id: 9, nome: "Ruim", categoria: "X", url: "javascript:alert(1)", ativo: true }];
  const t = await montar({ "forms.json": { status: 200, body: dados }, planilha: null });
  t.responder();
  t.$$("a.card").forEach((a) => assert.match(a.getAttribute("href"), /^https:/));
  const ruim = t.$(".card-indisponivel");
  assert.ok(ruim && ruim.tagName === "DIV");
  assert.match(ruim.textContent, /Link indisponível/);
});

test("Conteúdo com HTML é escapado nos cards", async () => {
  const dados = [{ id: 1, nome: "<img src=x onerror=alert(1)>", categoria: "<b>C</b>", url: "https://a.com", ativo: true }];
  const t = await montar({ "forms.json": { status: 200, body: dados }, planilha: null });
  t.responder();
  assert.equal(t.$$("#catalogo img").length, 0);
  assert.equal(t.$$("#catalogo b").length, 0);
});

test("Planilha com dados substitui o forms.json (mesmo chegando depois)", async () => {
  const novo = [{ id: 20, nome: "Novo na planilha", categoria: "Nova", url: "https://forms.gle/z", ativo: true }];
  const t = await montar({ "forms.json": OK, planilha: { status: 200, body: novo } });
  t.responder([0, 1]);
  assert.deepEqual(t.$$("a.card h3").map((e) => e.textContent), ["Novo na planilha"]);
  assert.equal(t.w.document.body.getAttribute("data-fonte"), "planilha");
});

test("forms.json atrasado não sobrescreve a planilha", async () => {
  const novo = [{ id: 20, nome: "Novo na planilha", categoria: "Nova", url: "https://forms.gle/z", ativo: true }];
  const t = await montar({ "forms.json": OK, planilha: { status: 200, body: novo } });
  t.responder([1, 0]);
  assert.deepEqual(t.$$("a.card h3").map((e) => e.textContent), ["Novo na planilha"]);
});

test("Planilha bloqueada/fora: usa forms.json sem mostrar erro", async () => {
  const t = await montar({ "forms.json": OK, planilha: "rede" });
  t.responder();
  assert.equal(t.$$("a.card").length, 2);
  assert.equal(t.w.document.body.getAttribute("data-fonte"), "forms.json");
});

test("Planilha devolvendo página de login (HTML) é ignorada", async () => {
  const t = await montar({ "forms.json": OK, planilha: { status: 200, body: "<html>accounts.google.com</html>" } });
  t.responder();
  assert.equal(t.$$("a.card").length, 2);
});

test("Planilha vazia não apaga o catálogo", async () => {
  const t = await montar({ "forms.json": OK, planilha: { status: 200, body: [] } });
  t.responder();
  assert.equal(t.$$("a.card").length, 2);
});

test("forms.json fora mas planilha ok: exibe planilha", async () => {
  const t = await montar({ "forms.json": "rede", planilha: OK });
  t.responder();
  assert.equal(t.$$("a.card").length, 2);
});

test("Ambos fora: erro só depois que os dois terminarem", async () => {
  const t = await montar({ "forms.json": "rede", planilha: "timeout" });
  t.responder([0]);
  assert.match(t.$("#catalogo").textContent, /Carregando/, "aguarda a planilha");
  t.responder([0]);
  assert.ok(t.$("#botaoTentarNovamente"));
});

test("Responsividade: viewport e media queries presentes (verificação estática)", async () => {
  assert.match(HTML, /name="viewport"[\s\S]*width=device-width/);
  const css = ler("style.css");
  for (const q of ["max-width: 600px", "max-width: 420px", "max-width: 350px"]) assert.ok(css.includes(q), q);
  assert.ok(css.includes(":focus-visible"));
});
