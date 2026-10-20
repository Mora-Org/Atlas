/**
 * Runtime do site público (1.3) — abas, filtro por coluna, paginação e Excel.
 * 1.4 — ficha do registro, relacionados e nomes de tela.
 *
 * É **JS puro numa string**, e não um componente React, de propósito: o
 * `PublicSite` precisa renderizar em 3 contextos (Studio, rota pública RSC e
 * `renderToStaticMarkup` do export estático). Um componente `'use client'`
 * quebraria o export; um script atacado por cima do mesmo HTML funciona nos
 * três, e é a MESMA implementação no site e dentro do ZIP — o Diretor pediu a
 * interatividade nos dois, e duas implementações divergiriam no primeiro fix.
 * Na rota pública ele roda DEPOIS da hidratação (`next/script`
 * `afterInteractive`, B21); no ZIP, inline.
 *
 * Contrato com o markup (montado em `PublicSite`):
 *   [data-atlas-tab="<id>"]        botão de aba
 *   [data-atlas-panel="<id>"]      painel correspondente
 *   [data-atlas-table="<nome>"]    raiz da tabela interativa
 *     script[type="application/json"][data-atlas-data]   a tabela (ver abaixo)
 *     [data-atlas-filter="<coluna>"]                     input de filtro
 *     [data-atlas-body]                                  tbody a repopular
 *     [data-atlas-count]                                 "N de M registros"
 *     [data-atlas-pagesize]                              select 25/50/100
 *     [data-atlas-pager]                                 container dos botões
 *     [data-atlas-export]                                botão do Excel
 *   [data-atlas-acervo] (1.4, oculto)
 *     script[data-atlas-data]       tabelas que nenhuma grade embute (`ficha`,
 *                                   layouts editoriais) — a ficha precisa de todas
 *     script[data-atlas-relations]  [{from, from_column, to, to_column}]
 *
 * Cada `data-atlas-data` é `{id, name, label, key, title, partial, columns,
 * rows}`; colunas com `label` e `placement` (`grade`|`ficha`). Ausente vale o
 * comportamento da 1.3 (sem link, nome interno, toda coluna na grade).
 *
 * As regras de "o que uma célula mostra" (FK vira o título do registro
 * apontado; título da linha vira link) existem DUAS vezes: aqui e em
 * `lib/fichaIndice.ts`, que o SSR usa. `fichaRuntime.test.tsx` exige o mesmo
 * texto nos dois.
 *
 * Sem JS a página degrada pro empilhado com a primeira página de cada tabela
 * já renderizada em HTML — ninguém fica sem o dado.
 */
export const PUBLIC_SITE_RUNTIME = String.raw`
(function () {
  'use strict';

  // 1.4 — reentrada: rodar de novo (o mesmo documento carregando o runtime
  // outra vez, ou um teste) desmonta os ouvintes globais da instância anterior.
  if (window.__atlas && typeof window.__atlas.desmontar === 'function') {
    try { window.__atlas.desmontar(); } catch (e) { /* segue */ }
  }
  var globais = [];
  function ouvir(alvo, tipo, fn) {
    alvo.addEventListener(tipo, fn);
    globais.push([alvo, tipo, fn]);
  }
  window.__atlas = {
    desmontar: function () {
      globais.forEach(function (g) { g[0].removeEventListener(g[1], g[2]); });
      globais = [];
      var velha = document.querySelector('[data-atlas-ficha-raiz]');
      if (velha && velha.parentNode) velha.parentNode.removeChild(velha);
    },
  };

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

  /* acervo (1.4): todas as tabelas publicadas e as ligações entre elas */
  var registro = new Map();   // nome -> tabela
  var porId = new Map();      // id da aba -> tabela (Map: '__proto__' é só uma chave)
  var relacoes = [];
  var indices = new Map();    // 'tabela\0coluna' -> Map(valor como texto -> [linhas])

  function lerJson(el) {
    try { return JSON.parse(el.textContent || 'null'); } catch (e) { return null; }
  }

  function carregarAcervo() {
    [].slice.call(document.querySelectorAll('script[data-atlas-data]')).forEach(function (s) {
      var d = lerJson(s);
      if (!d || typeof d.name !== 'string') return;
      d.columns = Array.isArray(d.columns) ? d.columns : [];
      d.rows = Array.isArray(d.rows) ? d.rows : [];
      s.__atlasDados = d; // um parse só: a grade reaproveita
      if (registro.has(d.name)) return;
      registro.set(d.name, d);
      if (typeof d.id === 'string' && d.id) porId.set(d.id, d);
    });
    var el = document.querySelector('script[data-atlas-relations]');
    var lidas = el ? lerJson(el) : null;
    relacoes = Array.isArray(lidas) ? lidas.filter(function (r) {
      return r && registro.has(r.from) && registro.has(r.to) && r.from_column && r.to_column;
    }) : [];
  }

  // Chave comparada como TEXTO: o import .sql pode trazer FK TEXT apontando
  // pra chave INTEGER.
  function indice(tabela, coluna) {
    var k = tabela + '\u0000' + coluna;
    var m = indices.get(k);
    if (!m) {
      m = new Map();
      var t = registro.get(tabela);
      (t ? t.rows : []).forEach(function (linha) {
        var v = linha[coluna];
        if (v === null || v === undefined) return;
        var s = String(v);
        var l = m.get(s);
        if (l) l.push(linha); else m.set(s, [linha]);
      });
      indices.set(k, m);
    }
    return m;
  }

  // 1.5 — mesma regra de lib/fichaIndice.ts (ehData/dataExibida): dd/mm/aaaa
  // fatiando o ISO, sem Intl (SSR e navegador têm de dar o mesmo texto).
  function ehData(tipo) {
    var t = String(tipo || '').toUpperCase();
    return t.indexOf('DATE') !== -1 || t.indexOf('TIMESTAMP') !== -1;
  }
  function dataExibida(v) {
    var s = texto(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : s;
  }
  function colunaDe(t, nome) {
    for (var i = 0; i < t.columns.length; i++) if (t.columns[i].name === nome) return t.columns[i];
    return null;
  }
  function textoDaColuna(t, coluna, v) {
    var c = colunaDe(t, coluna);
    return c && ehData(c.data_type) ? dataExibida(v) : texto(v);
  }

  function fkDe(tabela, coluna) {
    for (var i = 0; i < relacoes.length; i++) {
      var r = relacoes[i];
      if (r.from === tabela && r.from_column === coluna) return r;
    }
    return null;
  }

  function alvoDe(r, valor) {
    if (valor === null || valor === undefined) return null;
    var l = indice(r.to, r.to_column).get(String(valor));
    return l ? l[0] : null;
  }

  // ↓ mesmas regras de lib/fichaIndice.ts (titulo/href/celula)
  function tituloDe(t, linha) {
    var col = t.title || t.key;
    var v = col ? linha[col] : undefined;
    if (col && v !== null && v !== undefined && v !== '') return textoDaColuna(t, col, v);
    return t.key && linha[t.key] != null ? textoDaColuna(t, t.key, linha[t.key]) : '';
  }

  function hrefDe(t, linha) {
    if (!t.id || !t.key || linha[t.key] === null || linha[t.key] === undefined) return null;
    return '#' + t.id + '/' + encodeURIComponent(String(linha[t.key]));
  }

  // O que a célula MOSTRA (filtro e Excel usam isto: casa com o que se vê).
  // FK = título do registro apontado; alvo fora do recorte = valor cru.
  function exibido(t, coluna, linha) {
    var r = fkDe(t.name, coluna);
    if (r) {
      var a = alvoDe(r, linha[coluna]);
      var ta = registro.get(r.to);
      if (a && ta) return tituloDe(ta, a);
    }
    return textoDaColuna(t, coluna, linha[coluna]);
  }

  // Nó da célula: link pra ficha (alvo da FK, ou a própria linha na coluna-
  // título) ou texto. Sempre textContent — o dado é do tenant.
  function celula(t, coluna, linha) {
    var r = fkDe(t.name, coluna);
    if (r) {
      var a = alvoDe(r, linha[coluna]);
      var ta = registro.get(r.to);
      if (a && ta) return conteudo(tituloDe(ta, a), hrefDe(ta, a));
    }
    if (coluna === t.title) return conteudo(textoDaColuna(t, coluna, linha[coluna]), hrefDe(t, linha));
    return conteudo(textoDaColuna(t, coluna, linha[coluna]), null);
  }

  function conteudo(txt, href) {
    if (!href) return document.createTextNode(txt);
    var a = document.createElement('a');
    a.className = 'atlas-link';
    a.setAttribute('href', href); // montado do registro em memória, nunca do hash
    a.textContent = txt;
    return a;
  }

  function naGrade(c) { return (c.placement || 'grade') === 'grade'; }
  function visivel(c) { return (c.placement || 'grade') !== 'oculta'; }
  function rotulo(c) { return c.label || c.name; }

  function el(tag, classe, txt) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (txt != null) e.textContent = txt;
    return e;
  }

  /* abas */
  function parteDaAba(h) {
    var i = h.indexOf('/');
    return i < 0 ? h : h.slice(0, i);
  }

  function ligarAbas(raiz) {
    var botoes = [].slice.call(raiz.querySelectorAll('[data-atlas-tab]'));
    if (!botoes.length) return null;
    var paineis = [].slice.call(raiz.querySelectorAll('[data-atlas-panel]'));

    function existe(id) {
      return botoes.some(function (b) { return b.getAttribute('data-atlas-tab') === id; });
    }

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

    // Link direto pra uma aba (/budismopuc#templo) ou pra uma ficha
    // (/budismopuc#templo/12): a parte antes da barra é a aba.
    var alvo = parteDaAba((window.location.hash || '').replace('#', ''));
    mostrar(existe(alvo) ? alvo : botoes[0].getAttribute('data-atlas-tab'), false);

    return { existe: existe, mostrar: function (id) { mostrar(id, false); } };
  }

  /* tabela interativa */
  function ligarTabela(raiz) {
    var script = raiz.querySelector('script[data-atlas-data]');
    if (!script) return;
    var t = script.__atlasDados || lerJson(script);
    if (!t) return;
    t.columns = Array.isArray(t.columns) ? t.columns : [];
    t.rows = Array.isArray(t.rows) ? t.rows : [];
    var colunas = t.columns.filter(naGrade); // as 'ficha' viajam mas não viram coluna
    var todas = t.rows;

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
          var modo = f.getAttribute('data-atlas-filtro') || 'texto';
          // de/até comparam o ISO cru (AAAA-MM-DD) que o input type=date dá
          var termo = modo === 'de' || modo === 'ate' ? String(f.value || '').trim() : normaliza(f.value).trim();
          return { col: f.getAttribute('data-atlas-filter'), modo: modo, termo: termo };
        })
        .filter(function (f) { return f.termo !== ''; });
      if (!ativos.length) return todas;
      // Filtros combinam com E: cada um estreita o resultado do anterior.
      return todas.filter(function (linha) {
        return ativos.every(function (f) {
          if (f.modo === 'lista') return normaliza(exibido(t, f.col, linha)).trim() === f.termo;
          if (f.modo === 'de' || f.modo === 'ate') {
            // sem data, não dá pra dizer que está no intervalo: sai enquanto o
            // filtro estiver ativo (o antigo fazia igual, só que calado)
            var v = linha[f.col];
            if (v === null || v === undefined || v === '') return false;
            var iso = String(v).slice(0, 10);
            return f.modo === 'de' ? iso >= f.termo : iso <= f.termo;
          }
          return normaliza(exibido(t, f.col, linha)).indexOf(f.termo) !== -1;
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
      if (!linhas.length) {
        // 1.5: sem isto a tabela só sumia e sobrava "0 de N registros".
        var trv = document.createElement('tr');
        var tdv = document.createElement('td');
        tdv.className = 'atlas-vazio';
        tdv.colSpan = Math.max(1, colunas.length);
        tdv.textContent = todas.length
          ? 'Nenhum registro encontrado com esses filtros.'
          : (t.partial ? 'Registros fora desta versão publicada pelo teto de tamanho.' : 'Nenhum registro.');
        trv.appendChild(tdv);
        corpo.appendChild(trv);
      }
      visiveis.forEach(function (linha) {
        var tr = document.createElement('tr');
        colunas.forEach(function (c) {
          var td = document.createElement('td');
          td.className = 'atlas-td';
          td.appendChild(celula(t, c.name, linha));
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
          var mk = function (rotuloBotao, destino, ativo, desabilitado) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = ativo ? 'atlas-pagina atlas-pagina-ativa' : 'atlas-pagina';
            b.textContent = rotuloBotao;
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

    // 1.5 (revisão P1): select e input type=date avisam por 'change', mas a
    // caixa de texto TAMBÉM dispara 'change' no blur — que acontece no mousedown
    // do clique seguinte. Redesenhar ali tira do DOM o botão do paginador (ou o
    // link da ficha) que ia receber o clique, e o 1º clique se perdia. Então:
    // só redesenha quando algum valor de filtro mudou de fato.
    var chaveDosFiltros = filtros.map(function (x) { return x.value; }).join(' ');
    function aoFiltrar() {
      var k = filtros.map(function (x) { return x.value; }).join(' ');
      if (k === chaveDosFiltros) return;
      chaveDosFiltros = k;
      pagina = 1;
      desenhar();
    }
    filtros.forEach(function (f) {
      f.addEventListener('input', aoFiltrar);
      f.addEventListener('change', aoFiltrar);
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
        // filtro, nunca só a página visível. 1.4: colunas da grade E da ficha,
        // cabeçalho com o nome de tela, FK como o nome do registro apontado.
        var linhas = filtradas();
        var cols = t.columns.filter(visivel);
        var cabecalho = cols.map(rotulo);
        var matriz = [cabecalho].concat(linhas.map(function (l) {
          return cols.map(function (c) {
            // 1.5: data vai em ISO (ordena na planilha); o resto como se vê.
            // FK resolvida vem antes: a célula mostra o nome do alvo, não a data.
            var rx = fkDe(t.name, c.name);
            if (ehData(c.data_type) && !(rx && alvoDe(rx, l[c.name]) && registro.get(rx.to))) {
              var v = l[c.name];
              return v === null || v === undefined ? '' : String(v).slice(0, 10);
            }
            return exibido(t, c.name, l);
          });
        }));
        var ws = window.XLSX.utils.aoa_to_sheet(matriz);
        var wb = window.XLSX.utils.book_new();
        // Excel recusa nome de aba > 31 chars ou com : \ / ? * [ ]
        var aba = String(t.label || t.name || 'dados').replace(/[:\\\/?*\[\]]/g, '_').slice(0, 31);
        window.XLSX.utils.book_append_sheet(wb, ws, aba);
        // 1.5: o arquivo leva o nome de tela ("Templos.xlsx"), sem caractere
        // que o sistema de arquivos recuse
        var arquivo = String(t.label || t.name || 'dados').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 80);
        window.XLSX.writeFile(wb, arquivo + '.xlsx');
      });
    }

    desenhar();
  }

  /* ficha do registro (1.4) */
  var ficha = { raiz: null, painel: null, tabela: null, chave: null, origemFoco: null };
  // Quantas fichas esta visita empilhou no histórico desde a última vez que a
  // ficha fechou: o × volta tudo de uma vez (history.go), e não só uma.
  var empilhadas = 0;
  var abasCtl = null;
  var ultimoHash = null;

  // FK de saída com o alvo achado: vai pra Relacionados. Sem alvo (fora do
  // recorte), fica entre os campos com o valor cru.
  function fksAchadas(t, linha) {
    var achadas = {};
    relacoes.forEach(function (r) {
      if (r.from === t.name && alvoDe(r, linha[r.from_column])) achadas[r.from_column] = r;
    });
    return achadas;
  }

  function camposDe(t, linha, fks) {
    return t.columns.filter(function (c) {
      var v = linha[c.name];
      return visivel(c) && !fks[c.name] && c.name !== t.title && v !== null && v !== undefined && v !== '';
    }).map(function (c) {
      var v = textoDaColuna(t, c.name, linha[c.name]);
      return { rotulo: rotulo(c), valor: v, longo: v.length > 90 || v.indexOf('\n') >= 0 };
    });
  }

  function relacionadosDe(t, linha, fks) {
    var secoes = [];
    var parcial = !!t.partial;
    // FK de saída: "Rótulo da coluna: Nome"
    Object.keys(fks).forEach(function (col) {
      var r = fks[col];
      var ta = registro.get(r.to);
      var a = alvoDe(r, linha[col]);
      var c = null;
      t.columns.forEach(function (x) { if (x.name === col) c = x; });
      if (ta.partial) parcial = true;
      secoes.push({ titulo: c ? rotulo(c) : (ta.label || ta.name),
                    itens: [{ texto: tituloDe(ta, a), href: hrefDe(ta, a), detalhe: '' }] });
    });
    // Entrada: quem aponta pra cá.
    relacoes.forEach(function (r) {
      if (r.to !== t.name) return;
      var valor = linha[r.to_column];
      if (valor === null || valor === undefined) return;
      var J = registro.get(r.from);
      if (J.partial) parcial = true;
      var filhas = indice(J.name, r.from_column).get(String(valor)) || [];
      var outras = relacoes.filter(function (r2) { return r2.from === J.name && r2 !== r; });
      if (outras.length) {
        // J é junção (2+ FKs, uma pra cá): uma seção por outra FK de J, com as
        // colunas visíveis de J que não são ligação como detalhe ("Fundadora").
        var ligacoesJ = {};
        relacoes.forEach(function (r3) { if (r3.from === J.name) ligacoesJ[r3.from_column] = true; });
        outras.forEach(function (r2) {
          var X = registro.get(r2.to);
          if (X.partial) parcial = true;
          var itens = [];
          filhas.forEach(function (jl) {
            var a = alvoDe(r2, jl[r2.from_column]);
            if (!a) return;
            var det = J.columns.filter(function (c) {
              var v = jl[c.name];
              return visivel(c) && !ligacoesJ[c.name] && c.name !== J.key && v !== null && v !== undefined && v !== '';
            }).map(function (c) { return textoDaColuna(J, c.name, jl[c.name]); }).join(' · ');
            itens.push({ texto: tituloDe(X, a), href: hrefDe(X, a), detalhe: det });
          });
          if (itens.length) secoes.push({ titulo: X.label || X.name, itens: itens });
        });
      } else if (filhas.length) {
        // Tabela comum que aponta pra cá: lista as linhas dela.
        secoes.push({ titulo: J.label || J.name, itens: filhas.map(function (jl) {
          return { texto: tituloDe(J, jl), href: hrefDe(J, jl), detalhe: '' };
        }) });
      }
    });
    return { secoes: secoes, parcial: parcial };
  }

  function montarFicha(t, linha) {
    var chave = t.key ? String(linha[t.key]) : '';
    if (ficha.raiz && ficha.tabela === t.name && ficha.chave === chave) return;
    if (!ficha.raiz) {
      ficha.origemFoco = document.activeElement;
      // Montada no <body>, fora da raiz do site: nada que o React reconcilia.
      var raiz = el('div', 'atlas-ficha-raiz');
      raiz.setAttribute('data-atlas-ficha-raiz', '');
      var fundo = el('div', 'atlas-ficha-fundo');
      fundo.addEventListener('click', pedirFechar);
      var painel = el('aside', 'atlas-ficha');
      painel.setAttribute('role', 'dialog');
      painel.setAttribute('aria-modal', 'true');
      painel.setAttribute('aria-labelledby', 'atlas-ficha-titulo');
      painel.setAttribute('tabindex', '-1');
      painel.setAttribute('data-atlas-ficha', '');
      raiz.appendChild(fundo);
      raiz.appendChild(painel);
      document.body.appendChild(raiz);
      ficha.raiz = raiz;
      ficha.painel = painel;
    }
    var p = ficha.painel;
    p.textContent = '';

    var topo = el('div', 'atlas-ficha-topo');
    topo.appendChild(el('span', 'atlas-ficha-eyebrow', t.label || t.name));
    var x = el('button', 'atlas-ficha-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Fechar ficha');
    x.setAttribute('data-atlas-ficha-fechar', '');
    x.addEventListener('click', pedirFechar);
    topo.appendChild(x);
    p.appendChild(topo);

    var h = el('h2', 'atlas-ficha-titulo', tituloDe(t, linha));
    h.id = 'atlas-ficha-titulo';
    p.appendChild(h);

    var fks = fksAchadas(t, linha);
    var campos = camposDe(t, linha, fks);
    if (campos.length) {
      var dl = el('dl', 'atlas-ficha-campos');
      campos.forEach(function (c) {
        var item = el('div', 'atlas-ficha-campo' + (c.longo ? ' atlas-ficha-longo' : ''));
        item.appendChild(el('dt', null, c.rotulo));
        item.appendChild(el('dd', null, c.valor));
        dl.appendChild(item);
      });
      p.appendChild(dl);
    }

    var rel = relacionadosDe(t, linha, fks);
    rel.secoes.forEach(function (s) {
      var sec = el('section', 'atlas-ficha-rel');
      sec.appendChild(el('h3', null, s.titulo));
      var ul = el('ul');
      s.itens.forEach(function (it) {
        var li = el('li');
        li.appendChild(conteudo(it.texto || '—', it.href));
        if (it.detalhe) li.appendChild(el('span', 'atlas-ficha-det', it.detalhe));
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      p.appendChild(sec);
    });
    if (rel.parcial) {
      p.appendChild(el('p', 'atlas-ficha-parcial',
        'Lista parcial: parte do acervo ficou fora desta versão publicada pelo teto de tamanho.'));
    }

    ficha.tabela = t.name;
    ficha.chave = chave;
    p.scrollTop = 0;
    try { p.focus(); } catch (e) { /* sem foco */ }
  }

  function fecharFicha() {
    if (!ficha.raiz) return;
    if (ficha.raiz.parentNode) ficha.raiz.parentNode.removeChild(ficha.raiz);
    ficha.raiz = null;
    ficha.painel = null;
    ficha.tabela = null;
    ficha.chave = null;
    var o = ficha.origemFoco;
    ficha.origemFoco = null;
    if (o && typeof o.focus === 'function' && document.contains(o)) {
      try { o.focus(); } catch (e) { /* sem foco */ }
    }
  }

  // ×, Esc e o fundo. Ficha aberta por clique nesta visita: volta o histórico
  // (o Voltar do navegador não a reabre). Por link direto: troca o endereço
  // pela aba e fecha — voltar sairia do site.
  function pedirFechar() {
    if (!ficha.raiz) return;
    if (empilhadas > 0 && window.history && window.history.go) {
      var n = empilhadas;
      empilhadas = 0;
      window.history.go(-n);
      return;
    }
    var aba = parteDaAba((window.location.hash || '').replace('#', ''));
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', aba ? '#' + aba : window.location.pathname + window.location.search);
    }
    ultimoHash = window.location.hash;
    fecharFicha();
  }

  // O hash é entrada de terceiro (link compartilhado): só serve de chave de
  // busca num Map, decodificado dentro de try, nunca vira seletor nem texto.
  function rotear(inicial) {
    ultimoHash = window.location.hash;
    var h = (window.location.hash || '').replace('#', '');
    var i = h.indexOf('/');
    var aba = i < 0 ? h : h.slice(0, i);
    var chave = null;
    if (i >= 0) {
      try { chave = decodeURIComponent(h.slice(i + 1)); } catch (e) { chave = null; }
    }
    var t = porId.get(aba) || null;
    if (chave !== null && t && t.key) {
      var achadas = indice(t.name, t.key).get(chave);
      if (achadas && achadas[0]) {
        if (abasCtl && abasCtl.existe(aba)) abasCtl.mostrar(aba);
        montarFicha(t, achadas[0]);
        return;
      }
    }
    fecharFicha();
    if (!inicial && abasCtl && abasCtl.existe(aba)) abasCtl.mostrar(aba);
  }

  function aoNavegar() {
    // popstate e hashchange chegam juntos na mesma travessia: só uma vez.
    if (window.location.hash === ultimoHash) return;
    var tinhaFicha = !!ficha.raiz;
    rotear(false);
    if (!ficha.raiz) empilhadas = 0;
    else if (tinhaFicha && empilhadas > 0) empilhadas--;
  }

  function aoClicar(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a.atlas-link') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.charAt(0) !== '#') return;
    e.preventDefault();
    if (href === window.location.hash) return;
    if (window.history && window.history.pushState) {
      window.history.pushState(null, '', href);
      empilhadas++;
      rotear(false);
    } else {
      window.location.hash = href;
    }
  }

  function iniciar() {
    carregarAcervo();
    abasCtl = ligarAbas(document);
    [].slice.call(document.querySelectorAll('[data-atlas-table]')).forEach(ligarTabela);
    ouvir(document, 'click', aoClicar);
    ouvir(document, 'keydown', function (e) {
      if (e.key === 'Escape' && ficha.raiz) { e.preventDefault(); pedirFechar(); }
    });
    ouvir(window, 'popstate', aoNavegar);
    ouvir(window, 'hashchange', aoNavegar);
    rotear(true);
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

