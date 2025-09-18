... existing code ...

## 🍎 macOS Setup (Quick Start)

For macOS users, we've created an automated setup script:

\`\`\`bash
# Download and run the setup script
curl -sSL https://raw.githubusercontent.com/your-username/rag-news-chatbot/main/scripts/setup-macos.sh | bash

# Or clone first and run locally
git clone https://github.com/your-username/rag-news-chatbot.git
cd rag-news-chatbot
chmod +x scripts/setup-macos.sh
./scripts/setup-macos.sh
\`\`\`

### Manual macOS Setup

If you prefer manual setup:

\`\`\`bash
# 1. Install Node.js (if not already installed)
brew install node

# 2. Clone and install dependencies
git clone https://github.com/your-username/rag-news-chatbot.git
cd rag-news-chatbot
npm install

# 3. Create environment file
cp .env.example .env.local
# Edit .env.local with your API keys

# 4. Initialize data and start
npm run deploy:setup
npm run dev
\`\`\`

### Required API Keys

1. **Gemini API Key** (Required)
   - Visit: https://makersuite.google.com/app/apikey
   - Create a new API key
   - Add to `.env.local` as `GEMINI_API_KEY=your_key_here`

2. **Upstash Redis** (Optional - for caching)
   - Visit: https://upstash.com/
   - Create a Redis database
   - Add connection details to `.env.local`

3. **Jina AI** (Optional - for embeddings)
   - Visit: https://jina.ai/
   - Get API key for embeddings
   - Add to `.env.local` as `JINA_API_KEY=your_key_here`

### Troubleshooting macOS

**Node.js Issues:**
\`\`\`bash
# Check Node.js version (requires 18+)
node --version

# Update Node.js via Homebrew
brew upgrade node
\`\`\`

**Permission Issues:**
\`\`\`bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
\`\`\`

**Port Already in Use:**
\`\`\`bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
npm run dev -- -p 3001
\`\`\`

... existing code ...
\`\`\`

```env file="" isHidden
