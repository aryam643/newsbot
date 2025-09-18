// Health check endpoint for monitoring
import { NextResponse } from "next/server"
import { getRedisClient } from "@/lib/redis"
import { loadEmbeddedChunks } from "@/lib/vector-store"

export async function GET() {
  try {
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        redis: "unknown",
        vectorStore: "unknown",
        gemini: "unknown",
      },
    }

    // Check Redis availability without extra ping (init already pings)
    const redis = await getRedisClient()
    health.services.redis = redis ? "connected" : "fallback"

    // Check vector store
    try {
      const chunks = loadEmbeddedChunks()
      health.services.vectorStore = chunks.length > 0 ? "loaded" : "empty"
    } catch (error) {
      health.services.vectorStore = "error"
    }

    // Check Gemini API
    health.services.gemini = process.env.GEMINI_API_KEY ? "configured" : "mock"

    // Determine overall status
    const hasErrors = Object.values(health.services).some((status) => status === "error")
    if (hasErrors) {
      health.status = "degraded"
    }

    return NextResponse.json(health)
  } catch (error) {
    console.error("[news-bot] Health check error:", error)
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Health check failed",
      },
      { status: 500 },
    )
  }
}
