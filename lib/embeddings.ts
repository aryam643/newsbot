// Enhanced embedding service with real Jina API integration
interface EmbeddingResponse {
  data: Array<{
    object: string
    embedding: number[]
    index: number
  }>
  model: string
  usage: {
    total_tokens: number
    prompt_tokens: number
  }
}

const JINA_API_URL = "https://api.jina.ai/v1/embeddings"
const JINA_MODEL = "jina-embeddings-v2-base-en"

// Cache for embeddings to avoid repeated API calls
const embeddingCache = new Map<string, number[]>()

export async function createEmbedding(text: string): Promise<number[]> {
  // Check cache first
  const cacheKey = `embedding:${Buffer.from(text).toString("base64").substring(0, 50)}`
  if (embeddingCache.has(cacheKey)) {
    console.log("[news-bot] Using cached embedding")
    return embeddingCache.get(cacheKey)!
  }

  const jinaApiKey = process.env.JINA_API_KEY

  if (!jinaApiKey) {
    console.log("[news-bot] JINA_API_KEY not found, using deterministic mock embedding")
    return createDeterministicEmbedding(text)
  }

  try {
    console.log("[news-bot] Creating embedding with Jina API")
    const response = await fetch(JINA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jinaApiKey}`,
      },
      body: JSON.stringify({
        model: JINA_MODEL,
        input: [text],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[news-bot] Jina API error:", response.status, errorText)
      throw new Error(`Jina API error: ${response.status}`)
    }

    const data: EmbeddingResponse = await response.json()

    if (data.data && data.data.length > 0) {
      const embedding = data.data[0].embedding
      embeddingCache.set(cacheKey, embedding)
      console.log(`[news-bot] Created embedding with ${embedding.length} dimensions`)
      return embedding
    } else {
      throw new Error("No embedding data received")
    }
  } catch (error) {
    console.error("[news-bot] Error creating embedding:", error)
    console.log("[news-bot] Falling back to deterministic mock embedding")
    return createDeterministicEmbedding(text)
  }
}

// Create deterministic mock embedding based on text content
function createDeterministicEmbedding(text: string): number[] {
  const words = text.toLowerCase().split(/\s+/)
  const embedding = new Array(768).fill(0)

  // Create a more sophisticated mock embedding based on text features
  words.forEach((word, wordIndex) => {
    const wordHash = hashString(word)
    for (let i = 0; i < 768; i++) {
      const position = (wordHash + i + wordIndex) % 768
      embedding[position] += Math.sin(wordHash + i) * 0.1
    }
  })

  // Add text length and character diversity features
  const textLength = Math.min(text.length / 1000, 1) // Normalize to 0-1
  const uniqueChars = new Set(text.toLowerCase()).size / 26 // Normalize to 0-1

  for (let i = 0; i < 50; i++) {
    embedding[i] += textLength * 0.2
    embedding[i + 50] += uniqueChars * 0.2
  }

  // Normalize the embedding
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
  return embedding.map((val) => val / magnitude)
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}

// Batch embedding creation for multiple texts
export async function createBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const jinaApiKey = process.env.JINA_API_KEY

  if (!jinaApiKey) {
    console.log("[news-bot] Creating batch mock embeddings")
    return Promise.all(texts.map(createDeterministicEmbedding))
  }

  try {
    console.log(`[news-bot] Creating batch embeddings for ${texts.length} texts`)
    const response = await fetch(JINA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jinaApiKey}`,
      },
      body: JSON.stringify({
        model: JINA_MODEL,
        input: texts,
      }),
    })

    if (!response.ok) {
      throw new Error(`Jina API error: ${response.status}`)
    }

    const data: EmbeddingResponse = await response.json()
    return data.data.map((item) => item.embedding)
  } catch (error) {
    console.error("[news-bot] Error creating batch embeddings:", error)
    return Promise.all(texts.map(createDeterministicEmbedding))
  }
}
