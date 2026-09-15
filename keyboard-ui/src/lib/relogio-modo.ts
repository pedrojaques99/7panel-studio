/**
 * Qual agendador o Strudel usa — a chave, e só a chave.
 *
 * ## Por que é um módulo e não uma função no `strudel-service`
 *
 * Isto é preferência guardada, não motor de áudio: quem lê são DOIS lugares (o
 * serviço, na hora de construir o repl, e a rota, pra desenhar o botão de
 * volta). Morando dentro do serviço, a rota só alcançava a chave importando o
 * módulo inteiro — e aí todo teste que substitui o serviço por um dublê passa a
 * ter que dublar também a chave, que não tem nada a ver com o que ele testa.
 * Foi assim que `Musica.troca.test.tsx` quebrou.
 *
 * ## O que a chave decide
 *
 * `true` → `repl({ sync: true })` → **NeoCyclist**, que roda num SharedWorker e
 * é o único dos dois agendadores com `setCycle`. É o que torna a agulha da
 * linha do tempo clicável.
 *
 * `false` → **Cyclist**, o que a rota usou até 2026-09-10. A agulha volta a ser
 * só leitura.
 *
 * Lida UMA vez, na construção do repl. Trocar ao vivo significaria reconstruir
 * o agendador embaixo do som que está tocando, então quem troca recarrega.
 *
 * Navegador sem `SharedWorker` cai no Cyclist sozinho, dentro do próprio
 * `repl()` — por isso quem precisa saber a verdade pergunta ao scheduler
 * (`podeMoverAgulha`) em vez de confiar nesta chave.
 */
const LS_RELOGIO = 'musica-relogio-posicionavel'

/** Ligado por padrão: é o que faz a agulha ser clicável. */
export function relogioPosicionavel(): boolean {
  try { return localStorage.getItem(LS_RELOGIO) !== '0' } catch { return true }
}

export function definirRelogioPosicionavel(v: boolean): void {
  try { localStorage.setItem(LS_RELOGIO, v ? '1' : '0') } catch { /* modo privado */ }
}
