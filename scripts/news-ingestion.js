// News Ingestion Script for RAG Pipeline
// Fetches ~25 BBC news articles and prepares them for embedding

import Parser from "rss-parser"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"

const parser = new Parser()

// Use BBC World News RSS feed
const NEWS_SOURCES = [
  { name: "BBC", rssUrl: "http://feeds.bbci.co.uk/news/world/rss.xml" },
]

async function fetchRSSFeed(url, sourceName) {
  try {
    console.log(`[news-bot] Fetching RSS feed: ${url}`)
    const feed = await parser.parseURL(url)

    const items = feed.items.slice(0, 25).map((item) => ({
      title: item.title || "",
      description: item.contentSnippet || "",
      link: item.link || "",
      pubDate: item.pubDate || "",
      source: sourceName,
    }))

    console.log(`[news-bot] Extracted ${items.length} articles from ${sourceName}`)
    return items
  } catch (error) {
    console.error(`[news-bot] Error fetching RSS feed ${url}:`, error.message)
    return []
  }
}

async function ingestNewsArticles() {
  console.log("[news-bot] Starting news ingestion process...")

  const allArticles = []
  for (const source of NEWS_SOURCES) {
    const articles = await fetchRSSFeed(source.rssUrl, source.name)
    allArticles.push(...articles)
  }

  console.log(`[news-bot] Total articles collected: ${allArticles.length}`)

  mkdirSync("data", { recursive: true })

  const outputPath = join("data", "news_articles.json")
  writeFileSync(outputPath, JSON.stringify(allArticles, null, 2))
  console.log(`[news-bot] Articles saved to: ${outputPath}`)

  // Create embedding chunks
  const articleChunks = []
  const maxChunkSize = 500

  allArticles.forEach((article, index) => {
    const fullText = `${article.title}\n\n${article.description}`
    if (fullText.length <= maxChunkSize) {
      articleChunks.push({
        id: `article_${index}`,
        text: fullText,
        metadata: { ...article, chunkIndex: 0 },
      })
    } else {
      let chunkIndex = 0
      for (let i = 0; i < fullText.length; i += maxChunkSize) {
        articleChunks.push({
          id: `article_${index}_chunk_${chunkIndex}`,
          text: fullText.slice(i, i + maxChunkSize),
          metadata: { ...article, chunkIndex },
        })
        chunkIndex++
      }
    }
  })

  const chunksPath = join("data", "article_chunks.json")
  writeFileSync(chunksPath, JSON.stringify(articleChunks, null, 2))

  console.log(`[news-bot] Created ${articleChunks.length} text chunks for embedding`)
  console.log(`[news-bot] Chunks saved to: ${chunksPath}`)

  return { articles: allArticles, chunks: articleChunks }
}

// Run ingestion
ingestNewsArticles()
  .then((result) => {
    console.log("[news-bot] News ingestion completed successfully!")
    console.log(`[news-bot] Summary: ${result.articles.length} articles, ${result.chunks.length} chunks`)
  })
  .catch((error) => {
    console.error("[news-bot] News ingestion failed:", error)
  })