// Enhanced embedding setup script with better error handling and progress tracking
import fetch from "node-fetch"
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

// Jina Embeddings API configuration
const JINA_API_URL = "https://api.jina.ai/v1/embeddings"
const JINA_MODEL = "jina-embeddings-v2-base-en"

// 🔑 Direct API key injection
const jinaApiKey = "jina_bd56500a87dd489b9991cdccec4b78a3FZa9ymYyqx0rbaZ5dl7lqUIl7S8Z"

async function createEmbeddings() {
  console.log("[news-bot] Starting enhanced embedding creation process...")

  // Read the article chunks
  let chunks
  try {
    const chunksData = readFileSync(join("data", "article_chunks.json"), "utf8")
    chunks = JSON.parse(chunksData)
    console.log(`[news-bot] Loaded ${chunks.length} chunks for embedding`)
  } catch (error) {
    console.error("[news-bot] Error reading article chunks:", error.message)
    console.log("[news-bot] Please run news-ingestion.js first")
    return
  }

  if (!jinaApiKey || jinaApiKey === "placeholder-key") {
    console.log("[news-bot] JINA_API_KEY not found")
    console.log("[news-bot] Creating enhanced mock embeddings for development...")

    const embeddedChunks = chunks.map((chunk, index) => {
      console.log(`[news-bot] Creating mock embedding ${index + 1}/${chunks.length}`)

      const words = chunk.text.toLowerCase().split(/\s+/)
      const embedding = new Array(768).fill(0)

      words.forEach((word, wordIndex) => {
        const wordHash = hashString(word)
        for (let i = 0; i < 768; i++) {
          const position = (wordHash + i + wordIndex) % 768
          embedding[position] += Math.sin(wordHash + i) * 0.1
        }
      })

      const sourceHash = hashString(chunk.metadata.source)
      const titleHash = hashString(chunk.metadata.title)

      for (let i = 0; i < 100; i++) {
        embedding[i] += Math.sin(sourceHash + i) * 0.05
        embedding[i + 100] += Math.sin(titleHash + i) * 0.05
      }

      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
      const normalizedEmbedding = embedding.map((val) => val / magnitude)

      return {
        ...chunk,
        embedding: normalizedEmbedding,
        embeddingModel: "enhanced-mock-jina-embeddings-v2-base-en",
        createdAt: new Date().toISOString(),
      }
    })

    const embeddingsPath = join("data", "embedded_chunks.json")
    writeFileSync(embeddingsPath, JSON.stringify(embeddedChunks, null, 2))

    console.log(`[news-bot] Enhanced mock embeddings created and saved to: ${embeddingsPath}`)
    return embeddedChunks
  }

  // Real Jina API implementation with enhanced error handling
  console.log("[news-bot] Using Jina API for embeddings...")
  const embeddedChunks = []
  const batchSize = 8
  const maxRetries = 3

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const batchNumber = Math.floor(i / batchSize) + 1
    const totalBatches = Math.ceil(chunks.length / batchSize)

    console.log(`[news-bot] Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`)

    let retries = 0
    let success = false

    while (retries < maxRetries && !success) {
      try {
        const response = await fetch(JINA_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jinaApiKey}`,
          },
          body: JSON.stringify({
            model: JINA_MODEL,
            input: batch.map((chunk) => chunk.text),
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Jina API error: ${response.status} ${response.statusText} - ${errorText}`)
        }

        const result = await response.json()

        if (!result.data || result.data.length !== batch.length) {
          throw new Error(`Invalid response: expected ${batch.length} embeddings, got ${result.data?.length || 0}`)
        }

        batch.forEach((chunk, batchIndex) => {
          embeddedChunks.push({
            ...chunk,
            embedding: result.data[batchIndex].embedding,
            embeddingModel: JINA_MODEL,
            createdAt: new Date().toISOString(),
            apiUsage: {
              totalTokens: result.usage?.total_tokens || 0,
              promptTokens: result.usage?.prompt_tokens || 0,
            },
          })
        })

        success = true
        console.log(`[news-bot] Batch ${batchNumber} completed successfully`)

        await new Promise((resolve) => setTimeout(resolve, 1500))
      } catch (error) {
        retries++
        console.error(`[news-bot] Error in batch ${batchNumber}, attempt ${retries}:`, error.message)

        if (retries < maxRetries) {
          const delay = Math.pow(2, retries) * 1000
          console.log(`[news-bot] Retrying in ${delay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
        } else {
          console.log(`[news-bot] Max retries reached for batch ${batchNumber}, using mock embeddings`)
          batch.forEach((chunk) => {
            embeddedChunks.push({
              ...chunk,
              embedding: createMockEmbedding(chunk.text),
              embeddingModel: "mock-fallback-jina",
              createdAt: new Date().toISOString(),
              error: "API_FAILED",
            })
          })
        }
      }
    }
  }

  const embeddingsPath = join("data", "embedded_chunks.json")
  writeFileSync(embeddingsPath, JSON.stringify(embeddedChunks, null, 2))

  const successCount = embeddedChunks.filter((chunk) => !chunk.error).length
  const failureCount = embeddedChunks.length - successCount

  console.log(`[news-bot] Embeddings completed: ${successCount} successful, ${failureCount} fallback`)
  console.log(`[news-bot] Embeddings saved to: ${embeddingsPath}`)

  return embeddedChunks
}

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

function createMockEmbedding(text) {
  const words = text.toLowerCase().split(/\s+/)
  const embedding = new Array(768).fill(0)

  words.forEach((word, wordIndex) => {
    const wordHash = hashString(word)
    for (let i = 0; i < 768; i++) {
      const position = (wordHash + i + wordIndex) % 768
      embedding[position] += Math.sin(wordHash + i) * 0.1
    }
  })

  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
  return embedding.map((val) => val / magnitude)
}

function testEnhancedSimilaritySearch(embeddedChunks) {
  console.log("[news-bot] Testing enhanced similarity search...")

  const testQueries = ["latest technology news", "political developments", "economic updates", "breaking news today"]

  testQueries.forEach((query) => {
    console.log(`\n[news-bot] Testing query: "${query}"`)

    const queryEmbedding = createMockEmbedding(query)

    const similarities = embeddedChunks.map((chunk) => ({
      title: chunk.metadata.title,
      source: chunk.metadata.source,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
      relevance: calculateRelevance(chunk, query),
    }))

    const topResults = similarities
      .sort((a, b) => b.similarity + b.relevance - (a.similarity + a.relevance))
      .slice(0, 3)

    topResults.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.title} (${result.source})`)
      console.log(`     Similarity: ${result.similarity.toFixed(4)}, Relevance: ${result.relevance.toFixed(4)}`)
    })
  })
}

function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0)
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0))
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0))
  return dotProduct / (magnitudeA * magnitudeB)
}

function calculateRelevance(chunk, query) {
  const queryWords = query.toLowerCase().split(/\s+/)
  const titleWords = chunk.metadata.title.toLowerCase().split(/\s+/)
  const textWords = chunk.text.toLowerCase().split(/\s+/)

  const titleMatches = queryWords.filter((word) => titleWords.some((titleWord) => titleWord.includes(word))).length
  const textMatches = queryWords.filter((word) => textWords.some((textWord) => textWord.includes(word))).length

  return (titleMatches * 0.7 + textMatches * 0.3) / queryWords.length
}

// Run the enhanced embedding process
createEmbeddings()
  .then((embeddedChunks) => {
    if (embeddedChunks) {
      console.log("[news-bot] Enhanced embedding creation completed!")
      testEnhancedSimilaritySearch(embeddedChunks)

      console.log("\n[news-bot] Next steps:")
      console.log("1. Start the development server: npm run dev")
      console.log("2. Test the RAG system with real queries")
      console.log("3. Monitor performance and adjust parameters")
    }
  })
  .catch((error) => {
    console.error("[news-bot] Enhanced embedding creation failed:", error)
  })