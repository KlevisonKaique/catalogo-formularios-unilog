/* =========================================================
   CENTRAL DE FORMULÁRIOS - UNILOG EXPRESS

   Fontes de dados, em paralelo:
   1. forms.json no próprio GitHub Pages (rápido e confiável;
      atualizado pelo GitHub Actions como cópia de segurança).
   2. Planilha via Apps Script (CONFIG.API_URL), em tempo real.
      Se responder com dados válidos, substitui a lista exibida.
      Se falhar (bloqueio, login, timeout), é ignorada sem erro.

   Estados distintos: carregando, erro técnico (com "Tentar
   novamente"), catálogo vazio e pesquisa sem resultados.
   ========================================================= */

(function () {
  "use strict";

  var Core = window.CatalogoCore;
  var CONFIG = window.CONFIG || {};

  var TIMEOUT_LOCAL_MS = 12000;
  var TIMEOUT_PLANILHA_MS = 8000;

  var formularios = [];
  var geracao = 0;

  var catalogo, searchInput, clearSearch, statusBusca;

  /* ---------- Requisição JSON com timeout (XHR: compatível com Safari antigo) ---------- */

  function requisitarJSON(url, timeoutMs, callback) {
    var xhr = new XMLHttpRequest();
    var concluido = false;

    function fim(erro, dados) {
      if (concluido) return;
      concluido = true;
      callback(erro, dados);
    }

    try {
      xhr.open("GET", url, true);
    } catch (e) {
      fim({ tipo: "rede", detalhe: e.message });
      return;
    }
    xhr.timeout = timeoutMs;

    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) {
        fim({ tipo: "http", detalhe: "HTTP " + xhr.status });
        return;
      }
      try {
        fim(null, Core.validarCatalogo(JSON.parse(xhr.responseText)));
      } catch (e) {
        fim({ tipo: "dados", detalhe: e.message });
      }
    };
    xhr.onerror = function () { fim({ tipo: "rede", detalhe: "Falha de rede" }); };
    xhr.ontimeout = function () { fim({ tipo: "timeout", detalhe: "Tempo limite excedido" }); };

    xhr.send();
  }

  function comAntiCache(url) {
    return url + (url.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now();
  }

  /* ---------- Estados da interface ---------- */

  function blocoEstado(icone, titulo, descricao, botao) {
    return (
      '<div class="estado-vazio"' + (botao && botao.alerta ? ' role="alert"' : "") + ">" +
        '<div class="icone-vazio"><span class="material-symbols-outlined" aria-hidden="true">' +
          Core.escaparHTML(icone) + "</span></div>" +
        "<strong>" + Core.escaparHTML(titulo) + "</strong>" +
        "<p>" + Core.escaparHTML(descricao) + "</p>" +
        (botao
          ? '<button type="button" class="botao-estado" id="' + botao.id + '">' +
              Core.escaparHTML(botao.texto) + "</button>"
          : "") +
      "</div>"
    );
  }

  function mostrarCarregando() {
    catalogo.setAttribute("aria-busy", "true");
    catalogo.innerHTML = '<div class="estado">Carregando formulários...</div>';
  }

  function mostrarErro() {
    catalogo.removeAttribute("aria-busy");
    catalogo.innerHTML = blocoEstado(
      "cloud_off",
      "Não foi possível carregar os formulários",
      "Verifique sua conexão com a internet e tente novamente.",
      { id: "botaoTentarNovamente", texto: "Tentar novamente", alerta: true }
    );
    document.getElementById("botaoTentarNovamente").addEventListener("click", carregar);
    anunciar("Falha ao carregar os formulários.");
  }

  function mostrarCatalogoVazio() {
    catalogo.removeAttribute("aria-busy");
    catalogo.innerHTML = blocoEstado(
      "description",
      "Nenhum formulário disponível",
      "No momento não há formulários ativos no catálogo."
    );
    anunciar("Nenhum formulário disponível.");
  }

  function mostrarSemResultados(termo) {
    catalogo.innerHTML = blocoEstado(
      "search_off",
      "Nenhum formulário encontrado",
      "Nenhum resultado para “" + termo + "”. Tente outro termo.",
      { id: "botaoLimparResultados", texto: "Limpar pesquisa" }
    );
    document.getElementById("botaoLimparResultados").addEventListener("click", limparPesquisa);
    anunciar("Nenhum formulário encontrado.");
  }

  function anunciar(texto) {
    if (statusBusca) statusBusca.textContent = texto;
  }

  /* ---------- Renderização ---------- */

  function criarCard(f) {
    var nome = Core.escaparHTML(f.nome || "Formulário");
    var descricao = Core.escaparHTML(f.descricao || "");
    var icone = Core.escaparHTML(f.icone || "description");
    var url = String(f.url || "").trim();

    var miolo =
      '<div class="card-icon"><span class="material-symbols-outlined" aria-hidden="true">' + icone + "</span></div>" +
      '<div class="card-content"><h3>' + nome + "</h3>" +
        (descricao ? "<p>" + descricao + "</p>" : "") + "</div>";

    if (!Core.urlValida(url)) {
      return (
        '<div class="card card-indisponivel" aria-disabled="true">' + miolo +
          '<span class="card-aviso">Link indisponível</span></div>'
      );
    }

    return (
      '<a class="card" href="' + Core.escaparHTML(url) + '" rel="noopener noreferrer">' + miolo +
        '<div class="card-arrow"><span class="material-symbols-outlined" aria-hidden="true">chevron_right</span></div>' +
      "</a>"
    );
  }

  function renderizar(lista) {
    var grupos = Core.agruparPorCategoria(lista);
    var categorias = Object.keys(grupos).sort(function (a, b) {
      return a.localeCompare(b, "pt-BR");
    });

    catalogo.innerHTML = categorias.map(function (c) {
      return (
        '<section class="categoria" aria-label="' + Core.escaparHTML(c) + '">' +
          '<h2 class="categoria-titulo">' + Core.escaparHTML(c) + "</h2>" +
          '<div class="cards">' + Core.ordenar(grupos[c]).map(criarCard).join("") + "</div>" +
        "</section>"
      );
    }).join("");
  }

  function atualizarTela() {
    catalogo.removeAttribute("aria-busy");

    if (formularios.length === 0) {
      mostrarCatalogoVazio();
      return;
    }

    var termo = searchInput.value;
    var lista = Core.filtrar(formularios, termo);
    clearSearch.classList.toggle("visible", Core.normalizarTexto(termo).length > 0);

    if (lista.length === 0) {
      mostrarSemResultados(termo.trim());
      return;
    }

    renderizar(lista);
    anunciar(
      Core.normalizarTexto(termo)
        ? lista.length + (lista.length === 1 ? " formulário encontrado." : " formulários encontrados.")
        : ""
    );
  }

  /* ---------- Carregamento ---------- */

  function carregar() {
    var minhaGeracao = ++geracao;
    var local = { pronto: false, dados: null };
    var planilha = { pronto: false, aplicada: false };
    var temPlanilha = Core.urlValida(CONFIG.API_URL);

    formularios = [];
    mostrarCarregando();

    function decidir() {
      if (minhaGeracao !== geracao) return; /* resposta antiga, ignorada */
      if (planilha.aplicada) return;

      if (local.dados) {
        formularios = Core.ativos(local.dados);
        document.body.setAttribute("data-fonte", "forms.json");
        atualizarTela();
        return;
      }

      /* forms.json falhou: só mostra erro quando a planilha também tiver terminado. */
      if (local.pronto && (!temPlanilha || planilha.pronto)) {
        mostrarErro();
      }
    }

    requisitarJSON(comAntiCache("forms.json"), TIMEOUT_LOCAL_MS, function (erro, dados) {
      local.pronto = true;
      if (erro) {
        console.error("forms.json:", erro.tipo, erro.detalhe);
      } else {
        local.dados = dados;
      }
      decidir();
    });

    if (!temPlanilha) return;

    requisitarJSON(comAntiCache(CONFIG.API_URL), TIMEOUT_PLANILHA_MS, function (erro, dados) {
      planilha.pronto = true;
      if (minhaGeracao !== geracao) return;

      var ativosPlanilha = erro ? [] : Core.ativos(dados);

      /* Só substitui se a planilha trouxe ao menos um formulário ativo:
         uma resposta vazia por falha momentânea não apaga o catálogo. */
      if (!erro && ativosPlanilha.length > 0) {
        planilha.aplicada = true;
        formularios = ativosPlanilha;
        document.body.setAttribute("data-fonte", "planilha");
        atualizarTela();
        return;
      }

      if (erro) console.warn("Planilha indisponível, usando forms.json:", erro.tipo, erro.detalhe);
      decidir();
    });
  }

  /* ---------- Pesquisa ---------- */

  function limparPesquisa() {
    searchInput.value = "";
    atualizarTela();
    searchInput.focus();
  }

  function iniciar() {
    catalogo = document.getElementById("catalogo");
    searchInput = document.getElementById("searchInput");
    clearSearch = document.getElementById("clearSearch");
    statusBusca = document.getElementById("statusBusca");

    searchInput.addEventListener("input", function () {
      if (formularios.length) atualizarTela();
    });

    searchInput.addEventListener("keydown", function (e) {
      if ((e.key === "Escape" || e.key === "Esc") && searchInput.value) {
        e.preventDefault();
        limparPesquisa();
      }
    });

    clearSearch.addEventListener("click", limparPesquisa);

    carregar();
  }

  /* Exposto para os testes automatizados. */
  window.CentralFormularios = { carregar: carregar, iniciar: iniciar };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
