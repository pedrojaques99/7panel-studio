/**
 * Cliente do banco de samples (`/api/samples/*`).
 *
 * Nada de novo no backend: `strudel-map` já devolve slug → caminhos absolutos
 * em ordem alfabética, que é EXATAMENTE a ordem do `.n()` no superdough. A
 * mesma rota que o player usa pra carregar som é a que o seletor usa pra
 * listar — se as duas divergissem, o seletor mostraria um nome e tocaria outro.
 *
 * O mapa é grande (milhares de caminhos, ainda mais depois do Dirt-Samples) e
 * não muda durante a sessão: busca uma vez, e todo mundo espera a MESMA
 * promessa. Sem isto, quatro camadas selecionadas em sequência disparavam
 * quatro downloads do mapa inteiro.
 */
import { API } from './api'

export type Banco = { slug: string; arquivos: string[]; caminhos: string[] }

/**
 * Nome do arquivo a partir do caminho absoluto.
 *
 * Separa nos DOIS separadores. O backend roda no Windows e devolve caminho com
 * contrabarra; o mesmo mapa vindo de outra máquina traz barra. A primeira
 * versão quebrava só em "/" e, no Windows, a lista mostrava o caminho inteiro
 * em vez do nome — 52 linhas de texto idêntico, um seletor que não seleciona.
 */
function nomeDoArquivo(caminho: string): string {
  const porBarra = caminho.split('/')
  const ultimo = porBarra[porBarra.length - 1]
  const porContra = ultimo.split(String.fromCharCode(92))
  return porContra[porContra.length - 1] || caminho
}

let promessa: Promise<Map<string, Banco>> | null = null

export function bancos(): Promise<Map<string, Banco>> {
  if (!promessa) {
    promessa = fetch(`${API}/api/samples/strudel-map`, { signal: AbortSignal.timeout(15000) })
      .then(r => r.json())
      .then((mapa: Record<string, string[]>) => {
        const out = new Map<string, Banco>()
        for (const [slug, caminhos] of Object.entries(mapa)) {
          out.set(slug, { slug, caminhos, arquivos: caminhos.map(nomeDoArquivo) })
        }
        return out
      })
      .catch(() => {
        // Falha não vira cache: a próxima seleção tenta de novo. Cachear o erro
        // deixaria o seletor morto pelo resto da sessão por causa de um timeout.
        promessa = null
        return new Map<string, Banco>()
      })
  }
  return promessa
}

/** URL pra ouvir um arquivo solto, sem passar pelo agendador do Strudel. */
export function urlDaAmostra(caminho: string): string {
  return `${API}/api/samples/file?path=${encodeURIComponent(caminho)}`
}
