import { Redis } from "@upstash/redis"

let redisClient: Redis | null = null
let readOnlyRedisClient: Redis | null = null
let redisDisabled = process.env.DISABLE_REDIS === "true"
let redisErrorLogged = false

/* ---------- Clients ---------- */
export async function getRedisClient() {
  if (redisDisabled) return null
  if (!redisClient) {
    try {
      const url = process.env.KV_REST_API_URL
      const token = process.env.KV_REST_API_TOKEN

      if (!url || !token) {
        console.error("[news-bot] Missing Redis env vars for write client")
        return null
      }

      redisClient = new Redis({ url, token })

      // Test connection
      try {
        await redisClient.set("healthcheck", "ok")
        console.log("[news-bot] Redis write client connected")
      } catch (err) {
        console.error("[news-bot] Redis connection test failed, disabling", err)
        redisClient = null
        redisDisabled = true
        return null
      }
    } catch (err) {
      console.error("[news-bot] Failed to init Redis client", err)
      redisClient = null
      redisDisabled = true
    }
  }
  return redisClient
}

export async function getReadOnlyRedisClient() {
  if (redisDisabled) return null
  if (!readOnlyRedisClient) {
    try {
      const url = process.env.KV_REST_API_URL
      const token =
        process.env.KV_REST_API_READ_ONLY_TOKEN ||
        process.env.KV_REST_API_TOKEN

      if (!url || !token) {
        console.error("[news-bot] Missing Redis env vars for read-only client")
        return null
      }

      readOnlyRedisClient = new Redis({ url, token })
    } catch (err) {
      console.error("[news-bot] Failed to init read-only Redis client", err)
      readOnlyRedisClient = null
      redisDisabled = true
    }
  }
  return readOnlyRedisClient
}

/* ---------- Helpers ---------- */
async function setJson(client: Redis, key: string, value: any, ttl?: number) {
  const json = JSON.stringify(value)
  if (ttl) {
    await client.setex(key, ttl, json)
  } else {
    await client.set(key, json)
  }
}

async function getJson<T = any>(client: Redis, key: string): Promise<T | null> {
  const value = await client.get(key)
  if (!value) return null
  try {
    return JSON.parse(value as string) as T
  } catch {
    return null
  }
}

async function pushJson(client: Redis, key: string, value: any) {
  const json = JSON.stringify(value)
  await client.rpush(key, json)
}

/* ---------- Session Management ---------- */
export async function getSessionHistory(sessionId: string) {
  try {
    const client = await getReadOnlyRedisClient()
    if (!client) return []

    const historyKey = `session:${sessionId}:history`
    const history = await client.lrange(historyKey, 0, -1)

    return history
      .map((item) => {
        try {
          return JSON.parse(item as string)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch (err) {
    console.error("[news-bot] Error getting session history", err)
    return []
  }
}

export async function addMessageToSession(sessionId: string, message: any) {
  try {
    const client = await getRedisClient()
    if (!client) return

    const historyKey = `session:${sessionId}:history`
    await pushJson(client, historyKey, message)

    await client.expire(historyKey, 24 * 60 * 60) // TTL = 24h
    await client.ltrim(historyKey, -50, -1) // keep last 50 messages
  } catch (err) {
    console.error("[news-bot] Error adding message to session", err)
  }
}

export async function clearSession(sessionId: string) {
  try {
    const client = await getRedisClient()
    if (!client) return true

    const historyKey = `session:${sessionId}:history`
    try {
      const result = await client.del(historyKey)
      console.log(`[news-bot] Cleared session ${sessionId}, deleted ${result}`)
    } catch (err) {
      console.error("[news-bot] Redis DEL failed, continuing", err)
    }
    return true
  } catch (err) {
    console.error("[news-bot] Error clearing session", err)
    return true
  }
}

/* ---------- Caching ---------- */
export async function cacheSearchResults(
  query: string,
  results: any[],
  ttl = 300,
) {
  try {
    const client = await getRedisClient()
    if (!client) return

    const cacheKey = `search:${Buffer.from(query).toString("base64")}`
    await setJson(client, cacheKey, results, ttl)
  } catch (err: any) {
    const msg = err?.message || String(err)
    if (msg.includes("WRONGPASS") || msg.includes("Unauthorized")) {
      redisDisabled = true
      redisClient = null
      if (!redisErrorLogged) {
        console.warn("[news-bot] Redis auth error, disabling for this run")
        redisErrorLogged = true
      }
      return
    }
    console.error("[news-bot] Error caching search results", err)
  }
}

export async function getCachedSearchResults(query: string) {
  try {
    const client = await getReadOnlyRedisClient()
    if (!client) return null

    const cacheKey = `search:${Buffer.from(query).toString("base64")}`
    return await getJson(client, cacheKey)
  } catch (err: any) {
    const msg = err?.message || String(err)
    if (msg.includes("WRONGPASS") || msg.includes("Unauthorized")) {
      redisDisabled = true
      readOnlyRedisClient = null
      if (!redisErrorLogged) {
        console.warn("[news-bot] Redis read auth error, disabling for this run")
        redisErrorLogged = true
      }
      return null
    }
    console.error("[news-bot] Error getting cached results", err)
    return null
  }
}