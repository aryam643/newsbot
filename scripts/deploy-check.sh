#!/bin/bash

# Deployment Health Check Script
# This script verifies that all components are working after deployment

echo "🚀 Starting deployment health check..."

# Check if required environment variables are set
echo "📋 Checking environment variables..."

required_vars=("GEMINI_API_KEY" "REDIS_URL")
optional_vars=("JINA_API_KEY" "TEST_URL")

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Required environment variable $var is not set"
        exit 1
    else
        echo "✅ $var is set"
    fi
done

for var in "${optional_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "⚠️  Optional environment variable $var is not set"
    else
        echo "✅ $var is set"
    fi
done

# Set default TEST_URL if not provided
if [ -z "$TEST_URL" ]; then
    TEST_URL="http://localhost:3000"
    echo "🔧 Using default TEST_URL: $TEST_URL"
fi

echo ""
echo "🏥 Running health checks..."

# Check if the application is running
echo "📡 Checking application health..."
health_response=$(curl -s -o /dev/null -w "%{http_code}" "$TEST_URL/api/health")

if [ "$health_response" = "200" ]; then
    echo "✅ Application is healthy"
else
    echo "❌ Application health check failed (HTTP $health_response)"
    exit 1
fi

# Check Redis connectivity
echo "🔴 Checking Redis connectivity..."
redis_response=$(curl -s "$TEST_URL/api/health" | grep -o '"redis":"connected"')

if [ "$redis_response" = '"redis":"connected"' ]; then
    echo "✅ Redis is connected"
else
    echo "❌ Redis connection failed"
    exit 1
fi

# Check if news data exists
echo "📰 Checking news data..."
if [ -f "data/news_articles.json" ]; then
    article_count=$(cat data/news_articles.json | grep -o '"title"' | wc -l)
    echo "✅ Found $article_count news articles"
else
    echo "⚠️  No news data found. Run 'npm run ingest-news' to fetch articles"
fi

# Check if embeddings exist
echo "🧠 Checking embeddings..."
if [ -f "data/embeddings.json" ]; then
    embedding_count=$(cat data/embeddings.json | grep -o '"embedding"' | wc -l)
    echo "✅ Found $embedding_count embeddings"
else
    echo "⚠️  No embeddings found. Run 'npm run setup-embeddings' to create embeddings"
fi

# Test chat functionality
echo "💬 Testing chat functionality..."
chat_response=$(curl -s -X POST "$TEST_URL/api/chat" \
    -H "Content-Type: application/json" \
    -d '{"message":"Hello, can you tell me about recent news?","sessionId":"test-session"}')

if echo "$chat_response" | grep -q '"response"'; then
    echo "✅ Chat functionality is working"
else
    echo "❌ Chat functionality test failed"
    echo "Response: $chat_response"
    exit 1
fi

echo ""
echo "🎉 All health checks passed! Deployment is successful."
echo ""
echo "📊 Deployment Summary:"
echo "- Application: ✅ Running"
echo "- Redis: ✅ Connected"
echo "- Chat API: ✅ Working"
echo "- News Data: $([ -f "data/news_articles.json" ] && echo "✅ Available" || echo "⚠️  Missing")"
echo "- Embeddings: $([ -f "data/embeddings.json" ] && echo "✅ Available" || echo "⚠️  Missing")"
echo ""
echo "🔗 Access your chatbot at: $TEST_URL"
