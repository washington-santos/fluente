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
  C1: [
    { key: 'job-interview',       labelPt: 'Entrevista de emprego',    promptEn: 'role-play a professional job interview for a position in your field, using structured answers and formal register' },
    { key: 'negotiation',         labelPt: 'Negociação',               promptEn: 'simulate a business negotiation: setting terms, making concessions, and reaching agreement professionally' },
    { key: 'ted-talk',            labelPt: 'Análise crítica',          promptEn: 'summarize and critically analyze the arguments from a talk, documentary, or article you have engaged with recently' },
    { key: 'abstract-concepts',   labelPt: 'Conceitos abstratos',      promptEn: 'discuss abstract concepts like justice, identity, or success with nuance, counterarguments, and concrete examples' },
    { key: 'idioms',              labelPt: 'Expressões idiomáticas',   promptEn: 'use and explain English idioms, fixed phrases, and collocations naturally in the flow of conversation' },
    { key: 'meeting-simulation',  labelPt: 'Reunião de trabalho',      promptEn: 'conduct a full work meeting simulation covering agenda, project updates, problem-solving, and action items' },
    { key: 'persuasion',          labelPt: 'Argumento persuasivo',     promptEn: 'construct and defend a persuasive argument on a controversial topic using evidence, concessions, and rhetoric' },
    { key: 'storytelling',        labelPt: 'Narrativa avançada',       promptEn: 'tell a personal story with full narrative structure: setup, tension, climax, resolution, and reflective closing' },
  ],
  C2: [
    { key: 'native-humor',         labelPt: 'Humor e ironia',           promptEn: 'discuss jokes, sarcasm, wordplay, and irony in American and British culture and why they resonate or fail across cultures' },
    { key: 'literature',           labelPt: 'Literatura em inglês',     promptEn: 'analyze a passage, theme, or character from an English-language novel, poem, or film with literary vocabulary' },
    { key: 'cultural-reference',   labelPt: 'Referências culturais',    promptEn: 'explore the pop culture references, historical allusions, and in-jokes that native speakers use without explanation' },
    { key: 'register-shift',       labelPt: 'Registro formal vs casual',promptEn: 'fluidly switch between formal prose, casual conversation, and colloquial slang within a single exchange' },
    { key: 'accents-dialects',     labelPt: 'Sotaques e dialetos',      promptEn: 'discuss regional accents, dialects, and sociolects in English and what they reveal about identity and class' },
    { key: 'philosophy',           labelPt: 'Filosofia e pensamento',   promptEn: 'engage in a Socratic dialogue on a philosophical question without simplifying — push definitions, explore contradictions' },
    { key: 'spontaneous-debate',   labelPt: 'Debate espontâneo',        promptEn: 'defend an assigned position (agree or disagree) without preparation, pivoting dynamically as arguments evolve' },
    { key: 'advanced-vocabulary',  labelPt: 'Vocabulário sofisticado',  promptEn: 'use advanced vocabulary precisely: choose the mot juste, distinguish near-synonyms, explain connotations and register' },
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
