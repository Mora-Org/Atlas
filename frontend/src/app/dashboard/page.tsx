import { redirect } from 'next/navigation'

/**
 * /dashboard era uma "capa" órfã fora do shell, com blocos fake marcados
 * TODO(M6). A capa real agora é /admin (M6.5). Decisão do Diretor
 * (rebate 2026-06-11): redirect — a rota fica guardada pra uma futura
 * tela real, em vez de servir dado mentiroso.
 */
export default function DashboardRedirect() {
  redirect('/admin')
}
