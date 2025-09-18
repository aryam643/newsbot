// Comprehensive system testing script
import fetch from "node-fetch"

const BASE_URL = process.env.TEST_URL || "http://localhost:3000"

class SystemTester {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      tests: [],
    }
  }

  async test(name, testFn) {
    console.log(`[news-bot] Testing: ${name}`)
    try {
      await testFn()
      this.results.passed++
      this.results.tests.push({ name, status: "PASS" })
      console.log(`✅ ${name}`)
    } catch (error) {
      this.results.failed++
      this.results.tests.push({ name, status: "FAIL", error: error.message })
      console.log(`❌ ${name}: ${error.message}`)
    }
  }

  async testHealthEndpoint() {
    const response = await fetch(`${BASE_URL}/api/health`)
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`)
    }

    const data = await response.json()
    if (data.status !== "healthy" && data.status !== "degraded") {
      throw new Error(`Unexpected health status: ${data.status}`)
    }

    console.log(`[news-bot] Health status: ${data.status}`)
    console.log(`[news-bot] Services: ${JSON.stringify(data.services)}`)
  }

  async testChatEndpoint() {
    const testMessage = "What's the latest technology news?"
    const sessionId = `test_session_${Date.now()}`

    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: testMessage,
        sessionId,
        history: [],
      }),
    })

    if (!response.ok) {
      throw new Error(`Chat API failed: ${response.status}`)
    }

    const data = await response.json()
    if (!data.response) {
      throw new Error("No response received from chat API")
    }

    console.log(`[news-bot] Chat response length: ${data.response.length} characters`)
    console.log(`[news-bot] Sources provided: ${data.sources?.length || 0}`)
    console.log(`[news-bot] Cached: ${data.cached || false}`)

    return { sessionId, response: data }
  }

  async testSessionManagement() {
    // Create a test session
    const { sessionId } = await this.testChatEndpoint()

    // Test session retrieval
    const getResponse = await fetch(`${BASE_URL}/api/session/${sessionId}`)
    if (!getResponse.ok) {
      throw new Error(`Session retrieval failed: ${getResponse.status}`)
    }

    const sessionData = await getResponse.json()
    if (!sessionData.history || !Array.isArray(sessionData.history)) {
      throw new Error("Invalid session history format")
    }

    console.log(`[news-bot] Session history length: ${sessionData.history.length}`)

    // Test session deletion
    const deleteResponse = await fetch(`${BASE_URL}/api/session/${sessionId}`, {
      method: "DELETE",
    })

    if (!deleteResponse.ok) {
      throw new Error(`Session deletion failed: ${deleteResponse.status}`)
    }

    console.log(`[news-bot] Session ${sessionId} deleted successfully`)
  }

  async testAnalyticsEndpoint() {
    const response = await fetch(`${BASE_URL}/api/session/analytics`)
    if (!response.ok) {
      throw new Error(`Analytics endpoint failed: ${response.status}`)
    }

    const data = await response.json()
    const requiredFields = ["totalSessions", "totalMessages", "averageSessionLength", "topQueries", "dailyStats"]

    for (const field of requiredFields) {
      if (!(field in data)) {
        throw new Error(`Missing analytics field: ${field}`)
      }
    }

    console.log(`[news-bot] Analytics: ${data.totalSessions} sessions, ${data.totalMessages} messages`)
  }

  async testLoadTesting() {
    console.log("[news-bot] Running basic load test...")
    const concurrentRequests = 5
    const promises = []

    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(
        fetch(`${BASE_URL}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: `Load test message ${i}`,
            sessionId: `load_test_${i}_${Date.now()}`,
            history: [],
          }),
        }),
      )
    }

    const responses = await Promise.all(promises)
    const successCount = responses.filter((r) => r.ok).length

    if (successCount < concurrentRequests * 0.8) {
      // Allow 20% failure rate
      throw new Error(`Load test failed: only ${successCount}/${concurrentRequests} requests succeeded`)
    }

    console.log(`[news-bot] Load test: ${successCount}/${concurrentRequests} requests succeeded`)
  }

  async testNewsDataAvailability() {
    // Test if news data is available by making a specific query
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Tell me about recent news",
        sessionId: `data_test_${Date.now()}`,
        history: [],
      }),
    })

    if (!response.ok) {
      throw new Error(`News data test failed: ${response.status}`)
    }

    const data = await response.json()
    if (!data.sources || data.sources.length === 0) {
      console.log("[news-bot] Warning: No news sources found - check data ingestion")
    } else {
      console.log(`[news-bot] News data available: ${data.sources.length} sources`)
    }
  }

  async runAllTests() {
    console.log(`[news-bot] Starting system tests for ${BASE_URL}`)
    console.log("=" * 50)

    await this.test("Health Endpoint", () => this.testHealthEndpoint())
    await this.test("Chat Endpoint", () => this.testChatEndpoint())
    await this.test("Session Management", () => this.testSessionManagement())
    await this.test("Analytics Endpoint", () => this.testAnalyticsEndpoint())
    await this.test("News Data Availability", () => this.testNewsDataAvailability())
    await this.test("Basic Load Testing", () => this.testLoadTesting())

    console.log("\n" + "=" * 50)
    console.log(`[news-bot] Test Results: ${this.results.passed} passed, ${this.results.failed} failed`)

    if (this.results.failed > 0) {
      console.log("\n[news-bot] Failed tests:")
      this.results.tests
        .filter((t) => t.status === "FAIL")
        .forEach((t) => {
          console.log(`  ❌ ${t.name}: ${t.error}`)
        })
    }

    return this.results.failed === 0
  }
}

// Run tests
const tester = new SystemTester()
tester
  .runAllTests()
  .then((success) => {
    process.exit(success ? 0 : 1)
  })
  .catch((error) => {
    console.error("[news-bot] Test runner error:", error)
    process.exit(1)
  })
