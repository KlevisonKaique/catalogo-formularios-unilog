/* =========================================================
   CENTRAL DE FORMULÁRIOS - UNILOG EXPRESS
   Núcleo: funções puras, sem DOM. Usadas pelo app,
   pelo diagnóstico e pelos testes automatizados.
   ========================================================= */

(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    raiz.CatalogoCore = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CAMPOS_OBRIGATORIOS = ["id", "nome", "categoria", "url"];

  function escaparHTML(valor) {
    if (valor === null || valor === undefined) return "";
    return String(valor)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function urlValida(url) {
    try {
      var endereco = new URL(String(url || "").trim());
      return endereco.protocol === "https:" || endereco.protocol === "http:";
    } catch (erro) {
      return false;
    }
  }

  /* Link de edição do Google Forms: abre o editor, não o formulário de resposta. */
  function ehLinkDeEdicao(url) {
    return /docs\.google\.com\/forms\/d\/[^/]+\/edit/i.test(String(url || ""));
  }

  function normalizarTexto(valor) {
    var texto = String(valor || "").toLowerCase().trim();
    if (texto.normalize) {
      texto = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }
    /* Traços (–, —) e espaços repetidos viram um espaço simples. */
    return texto.replace(/[\u2013\u2014-]/g, " ").replace(/\s+/g, " ");
  }

  function ativos(lista) {
    return (lista || []).filter(function (item) {
      return item && typeof item === "object" && item.ativo !== false;
    });
  }

  /* Valida a estrutura recebida. Lança erro se não for utilizável. */
  function validarCatalogo(dados) {
    if (!Array.isArray(dados)) {
      throw new Error("O catálogo não é uma lista.");
    }
    return dados;
  }

  function filtrar(lista, termo) {
    var t = normalizarTexto(termo);
    if (!t) return lista.slice();
    return lista.filter(function (f) {
      return (
        normalizarTexto(f.nome).indexOf(t) !== -1 ||
        normalizarTexto(f.categoria).indexOf(t) !== -1 ||
        normalizarTexto(f.descricao).indexOf(t) !== -1
      );
    });
  }

  function nomeCategoria(f) {
    return String((f && f.categoria) || "Outros").trim() || "Outros";
  }

  function agruparPorCategoria(lista) {
    var grupos = {};
    lista.forEach(function (f) {
      var c = nomeCategoria(f);
      (grupos[c] = grupos[c] || []).push(f);
    });
    return grupos;
  }

  function ordenar(lista) {
    return lista.slice().sort(function (a, b) {
      var oa = Number(a.ordem) || 999999;
      var ob = Number(b.ordem) || 999999;
      if (oa !== ob) return oa - ob;
      return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
    });
  }

  /* Auditoria completa: usada no diagnóstico e nos testes de CI. */
  function auditar(dados) {
    var r = {
      total: 0, ativos: 0, inativos: 0,
      idsDuplicados: [], incompletos: [], urlsInvalidas: [],
      linksDeEdicao: [], porCategoria: {}
    };
    if (!Array.isArray(dados)) return r;

    var vistos = {};
    r.total = dados.length;

    dados.forEach(function (item, i) {
      var rotulo = (item && (item.nome || item.id)) || ("registro " + (i + 1));
      if (!item || typeof item !== "object") {
        r.incompletos.push({ rotulo: rotulo, faltando: CAMPOS_OBRIGATORIOS.slice() });
        return;
      }

      if (item.ativo === false) r.inativos++; else r.ativos++;

      if (item.id !== undefined && item.id !== null && item.id !== "") {
        var chave = String(item.id);
        if (vistos[chave] && r.idsDuplicados.indexOf(chave) === -1) r.idsDuplicados.push(chave);
        vistos[chave] = true;
      }

      var faltando = CAMPOS_OBRIGATORIOS.filter(function (c) {
        return item[c] === undefined || item[c] === null || String(item[c]).trim() === "";
      });
      if (faltando.length) r.incompletos.push({ rotulo: rotulo, faltando: faltando });

      if (item.url && !urlValida(item.url)) r.urlsInvalidas.push(rotulo);
      if (ehLinkDeEdicao(item.url)) r.linksDeEdicao.push(rotulo);

      if (item.ativo !== false) {
        var c = nomeCategoria(item);
        r.porCategoria[c] = (r.porCategoria[c] || 0) + 1;
      }
    });

    return r;
  }

  return {
    escaparHTML: escaparHTML,
    urlValida: urlValida,
    ehLinkDeEdicao: ehLinkDeEdicao,
    normalizarTexto: normalizarTexto,
    ativos: ativos,
    validarCatalogo: validarCatalogo,
    filtrar: filtrar,
    agruparPorCategoria: agruparPorCategoria,
    ordenar: ordenar,
    auditar: auditar
  };
});
