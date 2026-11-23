const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../catalogo-core.js");

const base = [
  { id: 1, nome: "Devolução Caffeine", categoria: "Devolução", descricao: "Formulário de devolução", url: "https://forms.gle/a", ativo: true, ordem: 2 },
  { id: 2, nome: "Cheio/Vazio – Com Auditoria – Mod 6", categoria: "Cheio/Vazio — Com Auditoria", url: "https://forms.gle/b", ativo: true, ordem: 1 },
  { id: 3, nome: "Inativo", categoria: "Inventário", url: "https://forms.gle/c", ativo: false }
];

test("pesquisa ignora acentos e maiúsculas", () => {
  assert.equal(Core.filtrar(base, "devolucao").length, 1);
  assert.equal(Core.filtrar(base, "DEVOLUÇÃO").length, 1);
});

test("pesquisa com caracteres especiais e traços", () => {
  assert.equal(Core.filtrar(base, "cheio/vazio").length, 1);
  assert.equal(Core.filtrar(base, "auditoria - mod 6").length, 1, "hífen comum encontra travessão");
  assert.equal(Core.filtrar(base, "<script>").length, 0);
  assert.equal(Core.filtrar(base, "(").length, 0);
  assert.equal(Core.filtrar(base, ".*").length, 0, "não é tratado como regex");
});

test("pesquisa com termo inexistente e vazia", () => {
  assert.equal(Core.filtrar(base, "xyzinexistente").length, 0);
  assert.equal(Core.filtrar(base, "   ").length, base.length);
});

test("ativos remove inativos e lixo", () => {
  const r = Core.ativos([...base, null, "texto", 5]);
  assert.deepEqual(r.map((f) => f.id), [1, 2]);
});

test("urlValida aceita só http/https", () => {
  assert.ok(Core.urlValida("https://forms.gle/x"));
  assert.ok(!Core.urlValida("javascript:alert(1)"));
  assert.ok(!Core.urlValida("ftp://x.com"));
  assert.ok(!Core.urlValida(""));
  assert.ok(!Core.urlValida("forms.gle/x"));
  assert.ok(!Core.urlValida(undefined));
});

test("detecta link de edição do Google Forms", () => {
  assert.ok(Core.ehLinkDeEdicao("https://docs.google.com/forms/d/ABC/edit?pli=1"));
  assert.ok(!Core.ehLinkDeEdicao("https://docs.google.com/forms/d/e/ABC/viewform"));
});

test("escaparHTML neutraliza HTML", () => {
  assert.equal(Core.escaparHTML('<img src=x onerror="a">'), "&lt;img src=x onerror=&quot;a&quot;&gt;");
});

test("validarCatalogo rejeita o que não é lista", () => {
  assert.throws(() => Core.validarCatalogo({}));
  assert.throws(() => Core.validarCatalogo(null));
  assert.deepEqual(Core.validarCatalogo([]), []);
});

test("auditar encontra duplicados, incompletos, URLs inválidas e links de edição", () => {
  const a = Core.auditar([
    { id: 1, nome: "A", categoria: "X", url: "https://a.com" },
    { id: 1, nome: "B", categoria: "X", url: "nao-e-url" },
    { id: 2, nome: "", categoria: "Y", url: "https://docs.google.com/forms/d/Z/edit" },
    { id: 3, nome: "D", categoria: "Y", url: "https://d.com", ativo: false }
  ]);
  assert.deepEqual(a.idsDuplicados, ["1"]);
  assert.deepEqual(a.urlsInvalidas, ["B"]);
  assert.equal(a.incompletos.length, 1);
  assert.deepEqual(a.incompletos[0].faltando, ["nome"]);
  assert.equal(a.linksDeEdicao.length, 1);
  assert.equal(a.ativos, 3);
  assert.equal(a.inativos, 1);
  assert.deepEqual(a.porCategoria, { X: 2, Y: 1 });
});

test("ordenar usa ordem e depois nome", () => {
  const r = Core.ordenar([{ nome: "B" }, { nome: "A" }, { nome: "Z", ordem: 1 }]);
  assert.deepEqual(r.map((f) => f.nome), ["Z", "A", "B"]);
});
