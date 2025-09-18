#!/bin/bash

# NewsBot macOS Setup Script
# This script automates the setup process for macOS users

set -e  # Exit on any error

echo "🚀 Setting up NewsBot on macOS..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
    echo "   Or install via Homebrew: brew install node"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "❌ Node.js version $NODE_VERSION is too old. Please upgrade to v18.0.0 or higher."
    exit 1
fi

echo "✅ Node.js version $NODE_VERSION detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm."
    exit 1
fi

echo "✅ npm version $(npm -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "⚙️  Creating .env.local file..."
    cat > .env.local << EOL
# Required: Google Gemini AI API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Upstash Redis (for caching and sessions)
KV_REST_API_URL=your_upstash_redis_url
KV_REST_API_TOKEN=your_upstash_redis_token
KV_REST_API_READ_ONLY_TOKEN=your_upstash_readonly_token

# Optional: Jina AI (for embeddings)
JINA_API_KEY=your_jina_api_key

# Development URL for testing
TEST_URL=http://localhost:3000
EOL
    echo "📝 Created .env.local file. Please add your API keys before running the app."
else
    echo "✅ .env.local file already exists"
fi

# Test environment variables
echo "🧪 Testing environment setup..."
npm run test:env || echo "⚠️  Some environment variables may be missing. Check .env.local"

# Ask user if they want to initialize data
read -p "🗞️  Do you want to fetch news articles and create embeddings now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📰 Initializing news data and embeddings..."
    npm run deploy:setup || echo "⚠️  Data initialization failed. You can run 'npm run deploy:setup' later."
fi

echo ""
echo "🎉 Setup complete! Here's what to do next:"
echo ""
echo "1. Add your API keys to .env.local:"
echo "   - Get Gemini API key from: https://makersuite.google.com/app/apikey"
echo "   - (Optional) Get Upstash Redis from: https://upstash.com/"
echo ""
echo "2. Start the development server:"
echo "   npm run dev"
echo ""
echo "3. Open http://localhost:3000 in your browser"
echo ""
echo "📚 For more help, see README.md or run 'npm run health-check'"
