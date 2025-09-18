// Session analytics API endpoint
import { NextResponse } from "next/server"
import { getRedisClient } from "@/lib/redis"

export async function GET() {
  try {
    const redis = await getRedisClient()

    if (!redis) {
      return NextResponse.json({
        totalSessions: 0,
        totalMessages: 0,
        averageSessionLength: 0,
        topQueries: [],
        dailyStats: [],
        error: "Redis not available",
      })
    }

    // Get all session keys
    const sessionKeys = await redis.keys("session:*:history")

    let totalMessages = 0
    const sessionLengths: number[] = []
    const queries: string[] = []
    const dailyActivity = new Map<string, number>()

    // Analyze each session
    for (const key of sessionKeys) {
      try {
        const messages = await redis.lRange(key, 0, -1)
        const sessionLength = messages.length
        sessionLengths.push(sessionLength)
        totalMessages += sessionLength

        // Extract user queries and daily activity
        messages.forEach((messageJson) => {
          try {
            const message = JSON.parse(messageJson)
            if (message.role === "user") {
              queries.push(message.content.toLowerCase())
            }

            // Track daily activity
            const date = new Date(message.timestamp).toDateString()
            dailyActivity.set(date, (dailyActivity.get(date) || 0) + 1)
          } catch (error) {
            // Skip invalid message JSON
          }
        })
      } catch (error) {
        console.error("[news-bot] Error analyzing session:", key, error)
      }
    }

    // Calculate average session length
    const averageSessionLength =
      sessionLengths.length > 0 ? sessionLengths.reduce((sum, len) => sum + len, 0) / sessionLengths.length : 0

    // Find top queries (simple word frequency)
    const queryWords = queries.join(" ").split(/\s+/)
    const wordFreq = new Map<string, number>()

    queryWords.forEach((word) => {
      if (word.length > 3) {
        // Filter out short words
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
      }
    })

    const topQueries = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ query: word, count }))

    // Convert daily activity to array
    const dailyStats = Array.from(dailyActivity.entries())
      .map(([date, count]) => ({ date, messages: count }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-7) // Last 7 days

    return NextResponse.json({
      totalSessions: sessionKeys.length,
      totalMessages,
      averageSessionLength: Math.round(averageSessionLength * 10) / 10,
      topQueries,
      dailyStats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[news-bot] Session analytics error:", error)
    return NextResponse.json({ error: "Failed to generate analytics" }, { status: 500 })
  }
}
