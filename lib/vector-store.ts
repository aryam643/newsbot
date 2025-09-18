// Enhanced vector store implementation with improved search and ranking
import { readFileSync } from "fs"
import { join } from "path"
import { createEmbedding } from "./embeddings"

interface EmbeddedChunk {
  id: string
  text: string
  embedding: number[]
  metadata: {
    title: string
    source: string
    link: string
    pubDate: string
    chunkIndex: number
  }
}

interface SearchResult extends EmbeddedChunk {
  similarity: number
  relevanceScore: number
}

let embeddedChunks: EmbeddedChunk[] | null = null
let embeddedWarningLogged = false

// Load embedded chunks from file
export function loadEmbeddedChunks(): EmbeddedChunk[] {
  if (embeddedChunks) {
    return embeddedChunks
  }

  try {
    const embeddingsPath = join(process.cwd(), "data", "embedded_chunks.json")
    const data = readFileSync(embeddingsPath, "utf8")
    embeddedChunks = JSON.parse(data)
    console.log(`[news-bot] Loaded ${embeddedChunks?.length || 0} embedded chunks`)
    return embeddedChunks || []
  } catch (error) {
    if (!embeddedWarningLogged) {
      console.warn("[news-bot] No embeddings found. Run: npm run ingest-news && npm run setup-embeddings")
      embeddedWarningLogged = true
    }
    return []
  }
}

// Enhanced cosine similarity function
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    console.warn("[news-bot] Vector dimension mismatch")
    return 0
  }

  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0)
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0))
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0))

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0
  }

  return dotProduct / (magnitudeA * magnitudeB)
}

// Calculate relevance score based on multiple factors
function calculateRelevanceScore(chunk: EmbeddedChunk, query: string, similarity: number): number {
  let score = similarity * 0.7 // Base similarity score (70% weight)

  // Boost score for recent articles (30% weight)
  const pubDate = new Date(chunk.metadata.pubDate)
  const now = new Date()
  const daysDiff = (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24)
  const recencyScore = Math.max(0, 1 - daysDiff / 30) // Decay over 30 days
  score += recencyScore * 0.2

  // Boost score for title matches (10% weight)
  const queryWords = query.toLowerCase().split(/\s+/)
  const titleWords = chunk.metadata.title.toLowerCase().split(/\s+/)
  const titleMatches = queryWords.filter((word) => titleWords.some((titleWord) => titleWord.includes(word)))
  const titleScore = titleMatches.length / queryWords.length
  score += titleScore * 0.1

  return Math.min(score, 1) // Cap at 1.0
}

// Enhanced search with re-ranking
export async function searchSimilarChunks(query: string, topK = 5): Promise<SearchResult[]> {
  const chunks = loadEmbeddedChunks()

  if (chunks.length === 0) {
    console.warn("[news-bot] No embedded chunks available")
    return []
  }

  console.log(`[news-bot] Searching ${chunks.length} chunks for query: "${query.substring(0, 50)}..."`)

  // Create query embedding
  const queryEmbedding = await createEmbedding(query)

  // Calculate similarities and relevance scores
  const results: SearchResult[] = chunks.map((chunk) => {
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding)
    const relevanceScore = calculateRelevanceScore(chunk, query, similarity)

    return {
      ...chunk,
      similarity,
      relevanceScore,
    }
  })

  // Sort by relevance score and return top K
  const topResults = results
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topK)
    .filter((result) => result.similarity > 0.1) // Filter out very low similarity results

  console.log(
    `[news-bot] Found ${topResults.length} relevant chunks with similarities:`,
    topResults.map((r) => r.similarity.toFixed(3)),
  )

  return topResults
}

// Enhanced RAG context generation
export async function getRAGContext(
  query: string,
  topK = 5,
): Promise<{
  context: string
  sources: string[]
  chunks: SearchResult[]
  summary: string
}> {
  const similarChunks = await searchSimilarChunks(query, topK)

  if (similarChunks.length === 0) {
    return {
      context: "No relevant news articles found for this query.",
      sources: [],
      chunks: [],
      summary: "No relevant information available.",
    }
  }

  // Group chunks by article to avoid redundancy
  const articleGroups = new Map<string, SearchResult[]>()
  similarChunks.forEach((chunk) => {
    const articleKey = `${chunk.metadata.source}-${chunk.metadata.title}`
    if (!articleGroups.has(articleKey)) {
      articleGroups.set(articleKey, [])
    }
    articleGroups.get(articleKey)!.push(chunk)
  })

  // Build context from grouped articles
  const contextParts: string[] = []
  const sources: string[] = []

  articleGroups.forEach((chunks, articleKey) => {
    const primaryChunk = chunks[0] // Highest relevance chunk from this article
    const articleText = chunks.map((c) => c.text).join(" ")

    contextParts.push(
      `Article: ${primaryChunk.metadata.title}
Source: ${primaryChunk.metadata.source}
Published: ${new Date(primaryChunk.metadata.pubDate).toLocaleDateString()}
Content: ${articleText}
Relevance: ${(primaryChunk.relevanceScore * 100).toFixed(1)}%`,
    )

    sources.push(`${primaryChunk.metadata.source} - ${primaryChunk.metadata.title}`)
  })

  const context = contextParts.join("\n\n---\n\n")

  // Generate summary
  const avgRelevance = similarChunks.reduce((sum, chunk) => sum + chunk.relevanceScore, 0) / similarChunks.length
  const summary = `Found ${similarChunks.length} relevant passages from ${articleGroups.size} news articles with average relevance of ${(avgRelevance * 100).toFixed(1)}%.`

  return {
    context,
    sources: Array.from(new Set(sources)), // Remove duplicates
    chunks: similarChunks,
    summary,
  }
}

// Query expansion for better search results
export function expandQuery(query: string): string[] {
  const baseQuery = query.toLowerCase()
  const expansions = [baseQuery]

  // Add synonyms and related terms
  const synonymMap: Record<string, string[]> = {
    technology: ["tech", "digital", "innovation", "software", "hardware"],
    politics: ["political", "government", "policy", "election", "congress"],
    economy: ["economic", "financial", "market", "business", "trade"],
    health: ["medical", "healthcare", "disease", "treatment", "medicine"],
    climate: ["environment", "weather", "global warming", "sustainability"],
  }

  Object.entries(synonymMap).forEach(([key, synonyms]) => {
    if (baseQuery.includes(key)) {
      expansions.push(...synonyms.map((syn) => baseQuery.replace(key, syn)))
    }
  })

  return expansions.slice(0, 3) // Limit to 3 variations
}
