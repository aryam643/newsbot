// Session management API endpoints
import { type NextRequest, NextResponse } from "next/server"
import { getSessionHistory, clearSession } from "@/lib/redis"

// Get session history
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 })
    }

    const history = await getSessionHistory(sessionId)

    return NextResponse.json({
      sessionId,
      history,
      count: history.length,
    })
  } catch (error) {
    console.error("[news-bot] Session history API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Clear session history
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 })
    }

    const success = await clearSession(sessionId)

    if (success) {
      return NextResponse.json({
        message: "Session cleared successfully",
        sessionId,
      })
    } else {
      return NextResponse.json({ error: "Failed to clear session" }, { status: 500 })
    }
  } catch (error) {
    console.error("[news-bot] Session clear API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
