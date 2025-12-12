#!/bin/bash

# Schompf Frontend Deployment Script
# Deploys the frontend to GitHub Pages

set -e

echo "🍽️  Schompf Frontend Deployment"
echo "================================"
echo ""

# Check if we're in the right directory
if [ ! -d "app" ]; then
    echo "❌ Error: Must run from project root directory"
    exit 1
fi

# Navigate to app directory
cd app

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building production frontend..."
VITE_API_URL=https://schompf.server.michoest.com VITE_BASE_URL=/ npm run build

echo "🚀 Deploying to GitHub Pages..."
npm run deploy

echo ""
echo "✅ Deployment complete!"
echo "🌐 Your app will be live at: https://schompf.michoest.com"
echo "⏱️  It may take 1-2 minutes for changes to appear"
echo ""
