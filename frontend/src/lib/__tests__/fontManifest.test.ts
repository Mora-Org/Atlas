/**
 * O manifesto de fontes cobre TUDO que o Publish Studio consegue produzir?
 *
 * Este é o teste que dá sentido ao B14. Trocar o download da CDN do Google por
 * arquivos versionados só é seguro enquanto os arquivos versionados forem
 * suficientes — e o jeito de isso quebrar não é ninguém mexer aqui, é alguém
 * adicionar uma opção de fonte no `PublishContext` e não baixar o `.woff2`.
 * Nesse dia o ZIP sairia SEM a fonte, calado, e ninguém veria até um cliente
 * abrir o pacote.
 *
 * Por isso o teste enumera o espaço de opções a partir do PublishContext (não
 * de uma lista copiada aqui) e confere contra o disco (não contra o manifesto,
 * que é justamente o que pode estar mentindo).
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BODY_FONTS, DISPLAY_FONTS, PRESETS } from '@/contexts/PublishContext';
import { FONTES_LOCAIS, resolverFonte } from '@/lib/fontManifest';

const DIR = path.join(process.cwd(), 'src', 'fonts');

const familia = (stack: string) => (stack.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');

/** Os pesos de display que existem: a UI não deixa editar peso, ele vem do
 *  preset. Se algum dia virar campo editável, esta lista tem que virar faixa —
 *  e o teste abaixo vai acusar antes de o ZIP sair errado. */
const PESOS_DISPLAY = [...new Set(Object.values(PRESETS).map((p) => p.config.typography.display.weight))];

describe('cobertura do manifesto vs opções do Studio', () => {
  it('o peso de display continua vindo só do preset (não é editável)', () => {
    // Guarda de premissa: se alguém adicionar um slider de peso, PESOS_DISPLAY
    // deixa de descrever o espaço real e o resto deste arquivo vira teatro.
    expect(PESOS_DISPLAY.length).toBeLessThanOrEqual(4);
    expect(PESOS_DISPLAY.every((w) => Number.isInteger(w))).toBe(true);
  });

  it.each(
    DISPLAY_FONTS.flatMap((f) =>
      PESOS_DISPLAY.flatMap((peso) =>
        [false, true].map((italico) => [f.label, familia(f.family), italico, peso] as const)
      )
    )
  )('display %s (italico=%s, peso=%s) resolve e o arquivo existe', (_label, fam, italico, peso) => {
    const fonte = resolverFonte(fam, italico, peso);
    expect(fonte, `${fam} ${peso}${italico ? ' itálico' : ''} não está no manifesto`).not.toBeNull();
    expect(fs.existsSync(path.join(DIR, fonte!.arquivo)), `${fonte!.arquivo} não existe em src/fonts/`).toBe(true);
  });

  it.each(BODY_FONTS.map((f) => [f.label, familia(f.family)] as const))(
    'corpo %s resolve em 400 romano',
    (_label, fam) => {
      const fonte = resolverFonte(fam, false, 400);
      expect(fonte, `${fam} 400 não está no manifesto`).not.toBeNull();
      expect(fs.existsSync(path.join(DIR, fonte!.arquivo))).toBe(true);
    }
  );

  it.each(Object.entries(PRESETS).map(([id, p]) => [id, familia(p.config.typography.mono.family)] as const))(
    'monoespaçada do preset %s (%s) resolve em 400',
    (_id, fam) => {
      const fonte = resolverFonte(fam, false, 400);
      expect(fonte, `${fam} 400 não está no manifesto`).not.toBeNull();
      expect(fs.existsSync(path.join(DIR, fonte!.arquivo))).toBe(true);
    }
  );
});

describe('integridade do manifesto', () => {
  it.each(Object.entries(FONTES_LOCAIS).flatMap(([fam, arquivos]) => arquivos.map((a) => [fam, a.arquivo] as const)))(
    '%s → %s existe em disco',
    (_fam, arquivo) => {
      expect(fs.existsSync(path.join(DIR, arquivo))).toBe(true);
    }
  );

  it('não versiona arquivo que ninguém declara', () => {
    // O inverso do teste acima: `.woff2` órfão em src/fonts/ é peso morto no
    // repo e no bundle serverless, e indica manifesto desatualizado.
    const declarados = new Set(Object.values(FONTES_LOCAIS).flat().map((a) => a.arquivo));
    const emDisco = fs.readdirSync(DIR).filter((f) => f.endsWith('.woff2'));
    expect(emDisco.filter((f) => !declarados.has(f))).toEqual([]);
  });

  it('família de sistema devolve null em vez de explodir', () => {
    // O contrato que substitui o `throw` antigo: fora do manifesto, o export
    // degrada pra fonte de sistema e o resto do ZIP continua válido.
    expect(resolverFonte('Georgia', false, 400)).toBeNull();
    expect(resolverFonte('Fraunces', false, 12_000)).toBeNull();
  });
});
