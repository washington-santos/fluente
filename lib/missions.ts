import type { CefrLevel } from '@/types'

export interface Mission {
  key: string
  titlePt: string
  descriptionPt: string
  minUserTurns: number
}

const MISSIONS_BY_LEVEL: Partial<Record<CefrLevel, Mission[]>> = {
  A1: [
    { key: 'a1-intro',   titlePt: 'Apresentação completa', descriptionPt: 'Apresente-se em inglês: nome, de onde você é e quantos anos tem.', minUserTurns: 3 },
    { key: 'a1-family',  titlePt: 'Descreva sua família',  descriptionPt: 'Fale sobre dois membros da sua família em inglês.', minUserTurns: 3 },
    { key: 'a1-routine', titlePt: 'Rotina matinal',        descriptionPt: 'Conte sua rotina da manhã em inglês, passo a passo.', minUserTurns: 3 },
  ],
  A2: [
    { key: 'a2-weekend',    titlePt: 'Fim de semana passado', descriptionPt: 'Conte o que você fez no último fim de semana usando o passado simples.', minUserTurns: 4 },
    { key: 'a2-city',       titlePt: 'Minha cidade',          descriptionPt: 'Descreva seu bairro ou cidade usando pelo menos 5 adjetivos.', minUserTurns: 4 },
    { key: 'a2-directions', titlePt: 'Como chegar lá',        descriptionPt: 'Explique como chegar à sua casa ou trabalho a partir de um ponto de referência.', minUserTurns: 4 },
  ],
  B1: [
    { key: 'b1-movie',  titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme, série ou livro em inglês e explique por quê você gosta.', minUserTurns: 5 },
    { key: 'b1-plans',  titlePt: 'Planos futuros',        descriptionPt: 'Fale sobre seus planos para os próximos 6 meses em inglês.', minUserTurns: 5 },
    { key: 'b1-travel', titlePt: 'Destino dos sonhos',    descriptionPt: 'Descreva uma viagem que você fez ou gostaria de fazer.', minUserTurns: 5 },
  ],
  B2: [
    { key: 'b2-debate',       titlePt: 'Debate: redes sociais', descriptionPt: 'Dê sua opinião argumentada sobre o impacto das redes sociais na saúde mental.', minUserTurns: 6 },
    { key: 'b2-environment',  titlePt: 'Meio ambiente',          descriptionPt: 'Discuta os impactos das mudanças climáticas e possíveis soluções práticas.', minUserTurns: 6 },
    { key: 'b2-tech',         titlePt: 'Tecnologia e trabalho',  descriptionPt: 'Explique como a IA está mudando o mundo do trabalho e suas implicações.', minUserTurns: 6 },
  ],
  C1: [
    { key: 'c1-interview', titlePt: 'Entrevista simulada',    descriptionPt: 'Conduza uma simulação de entrevista de emprego em inglês com naturalidade e linguagem formal.', minUserTurns: 8 },
    { key: 'c1-meeting',   titlePt: 'Reunião de trabalho',    descriptionPt: 'Conduza uma reunião simulada com agenda, atualizações e encerramento com ação definida.', minUserTurns: 8 },
    { key: 'c1-persuade',  titlePt: 'Argumento persuasivo',   descriptionPt: 'Defenda uma posição sobre um tema polêmico com argumentos estruturados e exemplos concretos.', minUserTurns: 7 },
  ],
  C2: [
    { key: 'c2-story',   titlePt: 'Narrativa nativa',    descriptionPt: 'Conte uma história com estrutura narrativa completa usando expressões idiomáticas naturalmente.', minUserTurns: 8 },
    { key: 'c2-debate',  titlePt: 'Debate de alto nível', descriptionPt: 'Debata um tema filosófico ou cultural com profundidade e nuance por pelo menos 10 falas.', minUserTurns: 10 },
    { key: 'c2-register',titlePt: 'Mudança de registro',  descriptionPt: 'Demonstre fluência em pelo menos 3 registros diferentes (formal, casual, humor) numa única conversa.', minUserTurns: 8 },
  ],
}

export function getMissionForDate(cefrLevel: CefrLevel | null | undefined, dateStr: string): Mission {
  const missions = MISSIONS_BY_LEVEL[cefrLevel ?? 'A1'] ?? MISSIONS_BY_LEVEL['A1']!
  // Day of month (1-31) picks mission index, cycling every 3 days
  const day = parseInt(dateStr.slice(8, 10), 10)
  return missions[(day - 1) % missions.length]
}
