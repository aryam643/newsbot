import { type NextRequest, NextResponse } from "next/server"
import { getSessionHistory, addMessageToSession } from "@/lib/redis"
import { getRAGContext } from "@/lib/vector-store"
import { generateRAGResponse, generateMockRAGResponse } from "@/lib/gemini"
import { getCachedSearchResults, cacheSearchResults } from "@/lib/redis"

export async function POST(request: NextRequest) {
  try {
    const { message, sessionId, history } = await request.json()

    if (!message || !sessionId) {
      return NextResponse.json({ error: "Message and sessionId are required" }, { status: 400 })
    }

    console.log("[news-bot] Chat request received:", {
      message: message.substring(0, 100),
      sessionId,
      historyLength: history?.length || 0,
    })

    // Check cache first
    const cachedResults = await getCachedSearchResults(message)
    let ragContext, sources, response

    if (cachedResults) {
      console.log("[news-bot] Using cached search results")
      ragContext = cachedResults.context
      sources = cachedResults.sources
    } else {
      // Get RAG context from vector store
      const ragData = await getRAGContext(message, 5)
      ragContext = ragData.context
      sources = ragData.sources

      // Cache the results
      await cacheSearchResults(
        message,
        {
          context: ragContext,
          sources: sources,
        },
        300,
      ) // 5 minutes TTL
    }

    // Get conversation history from Redis
    const sessionHistory = await getSessionHistory(sessionId)

    // Generate response using Gemini API or mock
    try {
      if (process.env.GEMINI_API_KEY) {
        response = await generateRAGResponse(message, ragContext, sessionHistory)
      } else {
        console.log("[news-bot] GEMINI_API_KEY not found, using mock response")
        response = generateMockRAGResponse(message, ragContext, sources)
      }
    } catch (error) {
      console.error("[news-bot] Error generating response:", error)
      response = generateMockRAGResponse(message, ragContext, sources)
    }

    // Create message objects for storage
    const userMessage = {
      id: `msg_${Date.now()}_user`,
      content: message,
      role: "user",
      timestamp: new Date().toISOString(),
      sessionId,
    }

    const assistantMessage = {
      id: `msg_${Date.now()}_assistant`,
      content: response,
      role: "assistant",
      timestamp: new Date().toISOString(),
      sessionId,
      sources,
    }

    // Store messages in Redis session
    await addMessageToSession(sessionId, userMessage)
    await addMessageToSession(sessionId, assistantMessage)

    console.log("[news-bot] Response generated successfully")

    return NextResponse.json({
      response,
      sources,
      sessionId,
      cached: !!cachedResults,
    })
  } catch (error) {
    console.error("[news-bot] Chat API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
