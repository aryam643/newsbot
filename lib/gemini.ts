// Enhanced Gemini API integration with better prompting and error handling
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai"

let genAI: GoogleGenerativeAI | null = null

function getGeminiClient() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required")
    }
    genAI = new GoogleGenerativeAI(apiKey)
  }
  return genAI
}

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
]

export async function generateRAGResponse(
  query: string,
  context: string,
  conversationHistory: any[] = [],
  summary?: string,
): Promise<string> {
  try {
    const client = getGeminiClient()
    const model = client.getGenerativeModel({
      model: "gemini-1.5-flash",
      safetySettings,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    })

    // Build conversation context (last 6 messages)
    const historyContext = conversationHistory
      .slice(-6)
      .map((msg) => `${msg.role === "user" ? "Human" : "NewsBot"}: ${msg.content}`)
      .join("\n")

    const systemPrompt = `You are NewsBot, an expert AI assistant specializing in news analysis and information retrieval. Your role is to provide accurate, well-sourced, and helpful responses about current events and news topics.

CORE CAPABILITIES:
- Analyze and synthesize information from multiple news sources
- Provide balanced, factual reporting without bias
- Cite sources clearly and accurately
- Explain complex topics in accessible language
- Maintain journalistic integrity and objectivity

RESPONSE GUIDELINES:
1. Base your response primarily on the provided news context
2. Be concise but comprehensive (aim for 2-4 paragraphs)
3. Always cite your sources when making specific claims
4. If information is limited, acknowledge this clearly
5. Maintain a professional, informative tone
6. Avoid speculation beyond what's supported by the sources
7. If asked about topics outside the news context, politely redirect to news-related queries

FORMATTING:
- Use clear, readable paragraphs
- Bold key points when appropriate
- Include source citations naturally in the text
- End with a brief summary if the topic is complex`

    const userPrompt = `${summary ? `Search Summary: ${summary}\n\n` : ""}News Context:
${context}

${historyContext ? `Previous Conversation:\n${historyContext}\n\n` : ""}Current Question: ${query}

Please provide a comprehensive answer based on the news context above:`

    console.log("[news-bot] Generating response with Gemini Pro")
    const result = await model.generateContent([systemPrompt, userPrompt])
    const response = result.response

    if (response.candidates && response.candidates[0]?.finishReason === "SAFETY") {
      return "I apologize, but I cannot provide a response to this query due to safety guidelines. Please try rephrasing your question or ask about a different news topic."
    }

    const text = response.text()
    console.log(`[news-bot] Generated response: ${text.length} characters`)
    return text
  } catch (error) {
    console.error("[news-bot] Gemini API error:", error)

    // Enhanced fallback response
    if (error instanceof Error && error.message.includes("API key")) {
      return generateEnhancedMockResponse(query, context, summary)
    }

    return `I apologize, but I'm experiencing technical difficulties with my AI processing capabilities. However, based on the news articles I found, here's what I can tell you:

${context ? context.substring(0, 600) + "..." : "I found some relevant news articles but cannot process them at the moment."}

Please try again in a few moments when my services are restored.`
  }
}

// Enhanced mock response for development
export function generateEnhancedMockResponse(query: string, context: string, summary?: string): string {
  const contextPreview = context ? context.substring(0, 500) : "No relevant context found."
  const queryWords = query.toLowerCase().split(/\s+/)

  // Extract key information from context
  const sources = context.match(/Source: ([^\n]+)/g) || []
  const titles = context.match(/Article: ([^\n]+)/g) || []

  let response = `Based on my analysis of recent news articles, here's what I found regarding "${query}":\n\n`

  if (summary) {
    response += `${summary}\n\n`
  }

  // Generate contextual response based on query type
  if (queryWords.some((word) => ["latest", "recent", "breaking", "news"].includes(word))) {
    response += `The most recent developments include information from ${sources.length} news sources. `
  }

  if (queryWords.some((word) => ["technology", "tech", "ai", "digital"].includes(word))) {
    response += `From a technology perspective, the coverage indicates ongoing developments in this sector. `
  }

  if (queryWords.some((word) => ["politics", "political", "government", "policy"].includes(word))) {
    response += `The political implications of this topic are being covered across multiple news outlets. `
  }

  response += `\n\n**Key Information:**\n${contextPreview}${context.length > 500 ? "..." : ""}\n\n`

  if (sources.length > 0) {
    response += `**Sources:** ${sources
      .slice(0, 3)
      .map((s) => s.replace("Source: ", ""))
      .join(", ")}\n\n`
  }

  response += `*Note: This is a development response. The full AI-powered system will provide more detailed analysis once the Gemini API is properly configured.*`

  return response
}

export const generateMockRAGResponse = generateEnhancedMockResponse

// Streaming response support (for future implementation)
export async function generateStreamingRAGResponse(
  query: string,
  context: string,
  conversationHistory: any[] = [],
): Promise<ReadableStream<string>> {
  // Placeholder for streaming implementation
  const response = await generateRAGResponse(query, context, conversationHistory)

  return new ReadableStream({
    start(controller) {
      const words = response.split(" ")
      let index = 0

      const interval = setInterval(() => {
        if (index < words.length) {
          controller.enqueue(words[index] + " ")
          index++
        } else {
          controller.close()
          clearInterval(interval)
        }
      }, 50) // 50ms delay between words
    },
  })
}
