'use client';

/**
 * M8.5 F3.2 — botão que dispara a impressão (decisão D1: Ctrl+P / window.print,
 * o browser vira o motor de PDF vetorial). `.no-print` esconde o botão na
 * própria impressão (o PDF não pode ter o botão). Também deixa o atalho Ctrl+P
 * nativo funcionar — este botão é só a affordance visível.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      className="no-print"
      onClick={() => window.print()}
      style={{
        position: 'fixed', top: 16, right: 16, zIndex: 10,
        padding: '10px 18px', border: '1px solid #1a1a1a', borderRadius: 6,
        background: '#1a1a1a', color: '#fff', fontSize: 14, cursor: 'pointer',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      Imprimir / Salvar PDF
    </button>
  );
}
