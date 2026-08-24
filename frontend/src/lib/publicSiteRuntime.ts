/**
 * Runtime do site público (1.3) — abas, filtro por coluna, paginação e Excel.
 *
 * É **JS puro numa string**, e não um componente React, de propósito: o
 * `PublicSite` precisa renderizar em 3 contextos (Studio, rota pública RSC e
 * `renderToStaticMarkup` do export estático). Um componente `'use client'`
 * quebraria o export; um script atacado por cima do mesmo HTML funciona nos
 * três, e é a MESMA implementação no site e dentro do ZIP — o Diretor pediu a
 * interatividade nos dois, e duas implementações divergiriam no primeiro fix.
 *
 * Contrato com o markup (montado em `PublicSite`):
 *   [data-atlas-tab="<id>"]        botão de aba
 *   [data-atlas-panel="<id>"]      painel correspondente
 *   [data-atlas-table="<nome>"]    raiz da tabela interativa
 *     script[type="application/json"][data-atlas-data]   linhas + colunas
 *     [data-atlas-filter="<coluna>"]                     input de filtro
 *     [data-atlas-body]                                  tbody a repopular
 *     [data-atlas-count]                                 "N de M registros"
 *     [data-atlas-pagesize]                              select 25/50/100
 *     [data-atlas-pager]                                 container dos botões
 *     [data-atlas-export]                                botão do Excel
 *
 * Sem JS a página degrada pro empilhado com a primeira página de cada tabela
 * já renderizada em HTML — ninguém fica sem o dado.
 */
export const PUBLIC_SITE_RUNTIME = String.raw`
(function () {
  'use strict';

  // Casa sem diferenciar acento nem caixa: "Sao Paulo" acha "São Paulo".
  function normaliza(v) {
    return String(v == null ? '' : v)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  function texto(v) {
    if (v == null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  /* abas */
  function ligarAbas(raiz) {
    var botoes = [].slice.call(raiz.querySelectorAll('[data-atlas-tab]'));
    if (!botoes.length) return;
    var paineis = [].slice.call(raiz.querySelectorAll('[data-atlas-panel]'));

    function mostrar(id, push) {
      botoes.forEach(function (b) {
        var ativo = b.getAttribute('data-atlas-tab') === id;
        b.setAttribute('aria-selected', ativo ? 'true' : 'false');
        b.setAttribute('tabindex', ativo ? '0' : '-1');
        b.className = ativo ? 'atlas-tab atlas-tab-ativa' : 'atlas-tab';
      });
      paineis.forEach(function (p) {
        p.hidden = p.getAttribute('data-atlas-panel') !== id;
      });
      if (push && window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#' + id);
      }
    }

    botoes.forEach(function (b) {
      b.addEventListener('click', function () {
        mostrar(b.getAttribute('data-atlas-tab'), true);
      });
      // Teclado: setas navegam a barra de abas (padrão WAI-ARIA).
      b.addEventListener('keydown', function (e) {
        var i = botoes.indexOf(b);
        var alvo = null;
        if (e.key === 'ArrowRight') alvo = botoes[(i + 1) % botoes.length];
        if (e.key === 'ArrowLeft') alvo = botoes[(i - 1 + botoes.length) % botoes.length];
        if (!alvo) return;
        e.preventDefault();
        alvo.focus();
        mostrar(alvo.getAttribute('data-atlas-tab'), true);
      });
    });

    // Link direto pra uma aba (compartilhar /budismopuc#templo).
    var alvo = (window.location.hash || '').replace('#', '');
    var existe = botoes.some(function (b) { return b.getAttribute('data-atlas-tab') === alvo; });
    mostrar(existe ? alvo : botoes[0].getAttribute('data-atlas-tab'), false);
  }

  /* tabela interativa */
  function ligarTabela(raiz) {
    var script = raiz.querySelector('script[data-atlas-data]');
    if (!script) return;
    var dados;
    try { dados = JSON.parse(script.textContent || '{}'); } catch (e) { return; }
    var colunas = dados.columns || [];
    var todas = dados.rows || [];

    var corpo = raiz.querySelector('[data-atlas-body]');
    var contador = raiz.querySelector('[data-atlas-count]');
    var seletorTamanho = raiz.querySelector('[data-atlas-pagesize]');
    var pager = raiz.querySelector('[data-atlas-pager]');
    var botaoExport = raiz.querySelector('[data-atlas-export]');
    var filtros = [].slice.call(raiz.querySelectorAll('[data-atlas-filter]'));
    if (!corpo) return;

    var pagina = 1;
    var porPagina = seletorTamanho ? parseInt(seletorTamanho.value, 10) || 25 : 25;

    function filtradas() {
      var ativos = filtros
        .map(function (f) {
          return { col: f.getAttribute('data-atlas-filter'), termo: normaliza(f.value).trim() };
        })
        .filter(function (f) { return f.termo !== ''; });
      if (!ativos.length) return todas;
      // Colunas combinam com E: cada caixa estreita o resultado da anterior.
      return todas.filter(function (linha) {
        return ativos.every(function (f) {
          return normaliza(texto(linha[f.col])).indexOf(f.termo) !== -1;
        });
      });
    }

    function desenhar() {
      var linhas = filtradas();
      var totalPaginas = Math.max(1, Math.ceil(linhas.length / porPagina));
      if (pagina > totalPaginas) pagina = totalPaginas;
      var inicio = (pagina - 1) * porPagina;
      var visiveis = linhas.slice(inicio, inicio + porPagina);

      // textContent (nunca innerHTML) — o dado é do tenant e pode conter markup.
      corpo.textContent = '';
      visiveis.forEach(function (linha) {
        var tr = document.createElement('tr');
        colunas.forEach(function (c) {
          var td = document.createElement('td');
          td.className = 'atlas-td';
          td.textContent = texto(linha[c.name]);
          tr.appendChild(td);
        });
        corpo.appendChild(tr);
      });

      if (contador) {
        contador.textContent = linhas.length === todas.length
          ? String(todas.length) + (todas.length === 1 ? ' registro' : ' registros')
          : String(linhas.length) + ' de ' + todas.length + ' registros';
      }

      if (pager) {
        pager.textContent = '';
        if (totalPaginas > 1) {
          var mk = function (rotulo, destino, ativo, desabilitado) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = ativo ? 'atlas-pagina atlas-pagina-ativa' : 'atlas-pagina';
            b.textContent = rotulo;
            if (desabilitado) { b.disabled = true; }
            else {
              b.addEventListener('click', function () { pagina = destino; desenhar(); });
            }
            return b;
          };
          pager.appendChild(mk('‹', pagina - 1, false, pagina === 1));
          // Janela de 5 páginas em volta da atual — 400 botões não ajudam ninguém.
          var ini = Math.max(1, pagina - 2);
          var fim = Math.min(totalPaginas, ini + 4);
          ini = Math.max(1, fim - 4);
          for (var p = ini; p <= fim; p++) pager.appendChild(mk(String(p), p, p === pagina, false));
          pager.appendChild(mk('›', pagina + 1, false, pagina === totalPaginas));
          var info = document.createElement('span');
          info.className = 'atlas-pagina-info';
          info.textContent = 'página ' + pagina + ' de ' + totalPaginas;
          pager.appendChild(info);
        }
      }
    }

    filtros.forEach(function (f) {
      f.addEventListener('input', function () { pagina = 1; desenhar(); });
    });
    if (seletorTamanho) {
      seletorTamanho.addEventListener('change', function () {
        porPagina = parseInt(seletorTamanho.value, 10) || 25;
        pagina = 1;
        desenhar();
      });
    }

    if (botaoExport) {
      botaoExport.addEventListener('click', function () {
        if (!window.XLSX) { alert('Componente de planilha não carregou.'); return; }
        // O Diretor foi explícito: o xlsx leva TODAS as linhas que casam com o
        // filtro, nunca só a página visível.
        var linhas = filtradas();
        var cabecalho = colunas.map(function (c) { return c.name; });
        var matriz = [cabecalho].concat(linhas.map(function (l) {
          return colunas.map(function (c) { return texto(l[c.name]); });
        }));
        var ws = window.XLSX.utils.aoa_to_sheet(matriz);
        var wb = window.XLSX.utils.book_new();
        // Excel recusa nome de aba > 31 chars ou com : \ / ? * [ ]
        var aba = String(dados.name || 'dados').replace(/[:\\\/?*\[\]]/g, '_').slice(0, 31);
        window.XLSX.utils.book_append_sheet(wb, ws, aba);
        window.XLSX.writeFile(wb, (dados.name || 'dados') + '.xlsx');
      });
    }

    desenhar();
  }

  function iniciar() {
    ligarAbas(document);
    [].slice.call(document.querySelectorAll('[data-atlas-table]')).forEach(ligarTabela);
    document.documentElement.setAttribute('data-atlas-ready', '1');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
`;

/**
 * Serializa dados do tenant pra dentro de `<script type="application/json">`.
 *
 * O React escapa tudo por nós no JSX; aqui o markup é montado à mão, e essa
 * proteção some. Um valor de célula contendo `</script>` fecharia o bloco e o
 * resto viraria HTML executável.
 *
 * Escapa como `\uXXXX`: o JSON continua válido (`JSON.parse` desfaz) e fica
 * inerte pro parser de HTML. Além de `<`, `>` e `&`, cobre U+2028/U+2029 —
 * eles são quebra de linha pro parser de JS mas não pro de JSON, e literais
 * deles dentro da string partiriam o script no browser.
 */
export function jsonParaScript(data: unknown): string {
  return JSON.stringify(data).replace(
    /[<>&\u2028\u2029]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

