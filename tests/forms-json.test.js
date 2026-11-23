const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../catalogo-core.js");

const dados = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "forms.json"), "utf8"));
const a = Core.auditar(dados);

test("forms.json é uma lista", () => assert.ok(Array.isArray(dados)));
test("forms.json sem IDs duplicados", () => assert.deepEqual(a.idsDuplicados, []));
test("forms.json sem registros incompletos", () => assert.deepEqual(a.incompletos, []));
test("forms.json com URLs bem formadas", () => assert.deepEqual(a.urlsInvalidas, []));

test("forms.json: links de edição (aviso, não falha)", () => {
  if (a.linksDeEdicao.length) {
    console.warn("ATENÇÃO: link de edição em vez de resposta: " + a.linksDeEdicao.join(", "));
  }
});
