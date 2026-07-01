// lib/topics.ts
import type { CefrLevel } from '@/types'

export interface Topic {
  key: string
  labelPt: string
  promptEn: string
}

const TOPICS_BY_LEVEL: Partial<Record<CefrLevel, Topic[]>> = {
  A1: [
    { key: 'introductions',  labelPt: 'Apresentações pessoais', promptEn: 'personal introductions: name, age, nationality, and what you do' },
    { key: 'family',         labelPt: 'Família',                promptEn: 'describing family members: who they are and what they do' },
    { key: 'numbers-dates',  labelPt: 'Números e datas',        promptEn: 'numbers, dates, and days of the week' },
    { key: 'colors',         labelPt: 'Cores e adjetivos',      promptEn: 'colors, shapes, and basic descriptive adjectives' },
    { key: 'daily-routine',  labelPt: 'Rotina diária',          promptEn: 'describing your daily routine from morning to night' },
    { key: 'food',           labelPt: 'Comida e bebida',        promptEn: 'food and drinks: what you like and what you eat for each meal' },
    { key: 'greetings',      labelPt: 'Cumprimentos',           promptEn: 'greetings, farewells, and polite expressions' },
    { key: 'home',           labelPt: 'Minha casa',             promptEn: 'describing your home: rooms, furniture, and where things are' },
  ],
  A2: [
    { key: 'past-weekend', labelPt: 'Fim de semana',     promptEn: 'what you did last weekend using past simple tense' },
    { key: 'city',         labelPt: 'Minha cidade',      promptEn: 'describing your city or neighborhood: places, transport, and atmosphere' },
    { key: 'shopping',     labelPt: 'Compras',           promptEn: 'shopping: prices, sizes, preferences, and asking for help in stores' },
    { key: 'weather',      labelPt: 'Clima e estações',  promptEn: 'talking about weather, seasons, and how they affect daily life' },
    { key: 'hobbies',      labelPt: 'Hobbies',           promptEn: 'hobbies and free-time activities: what you enjoy doing and why' },
    { key: 'transport',    labelPt: 'Transporte',        promptEn: 'transportation and asking for directions around the city' },
    { key: 'work',         labelPt: 'Trabalho',          promptEn: 'talking about jobs, workplaces, and daily work activities' },
    { key: 'health',       labelPt: 'Saúde',             promptEn: 'health: describing symptoms, visiting the doctor, and getting better' },
  ],
  B1: [
    { key: 'travel',         labelPt: 'Viagens',              promptEn: 'travel experiences: places visited, adventures, and future travel plans' },
    { key: 'news',           labelPt: 'Notícias e opinião',   promptEn: 'sharing opinions about news and current events in the world' },
    { key: 'future',         labelPt: 'Planos futuros',       promptEn: 'future plans: goals, dreams, and what you are planning to do' },
    { key: 'problems',       labelPt: 'Problemas e soluções', promptEn: 'describing real-life problems and brainstorming practical solutions' },
    { key: 'entertainment',  labelPt: 'Filmes e séries',      promptEn: 'movies, TV series, and books: recommendations and personal reviews' },
    { key: 'culture',        labelPt: 'Diferenças culturais', promptEn: 'cultural differences between Brazil and English-speaking countries' },
    { key: 'career',         labelPt: 'Carreira',             promptEn: 'career goals, job ambitions, and professional development' },
    { key: 'restaurants',    labelPt: 'Restaurantes',         promptEn: 'restaurants, food preferences, and dining-out etiquette' },
  ],
  B2: [
    { key: 'social-media', labelPt: 'Redes sociais',    promptEn: 'debating the impact of social media on mental health and society' },
    { key: 'environment',  labelPt: 'Meio ambiente',    promptEn: 'environmental issues: climate change, sustainability, and solutions' },
    { key: 'technology',   labelPt: 'Tecnologia e IA',  promptEn: 'technology and artificial intelligence: opportunities and risks for society' },
    { key: 'education',    labelPt: 'Educação',         promptEn: 'education systems: comparing approaches, challenges, and reforms' },
    { key: 'finance',      labelPt: 'Finanças',         promptEn: 'personal finance: budgeting, investing, and financial planning' },
    { key: 'relationships',labelPt: 'Relacionamentos',  promptEn: 'relationships and communication: what makes them work and what causes problems' },
    { key: 'leadership',   labelPt: 'Liderança',        promptEn: 'leadership and teamwork: qualities, challenges, and different styles' },
    { key: 'ethics',       labelPt: 'Ética',            promptEn: 'ethics and moral dilemmas: discussing complex right-versus-wrong scenarios' },
  ],
}

export function pickTopic(cefrLevel: CefrLevel | null | undefined, completedSessionCount: number): Topic | null {
  const topics = TOPICS_BY_LEVEL[cefrLevel ?? 'A1'] ?? TOPICS_BY_LEVEL['A1']!
  return topics[completedSessionCount % topics.length] ?? null
}

export function getTopicByKey(key: string | null | undefined): Topic | null {
  if (!key) return null
  for (const topics of Object.values(TOPICS_BY_LEVEL)) {
    const found = topics?.find((t) => t.key === key)
    if (found) return found
  }
  return null
}
