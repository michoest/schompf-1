#!/bin/bash

# Schompf GitHub Pages Deployment Script
# This script builds the app and deploys it to the gh-pages branch

set -e  # Exit on error

echo "📦 Building the app..."
cd app
npm run build
cd ..

echo "🔄 Switching to gh-pages branch..."
# Check if there are uncommitted changes
if [[ -n $(git status -s) ]]; then
  echo "⚠️  You have uncommitted changes. Please commit or stash them first."
  exit 1
fi

# Create temporary orphan branch
git checkout --orphan gh-pages-temp

echo "🧹 Cleaning branch..."
# Remove all files from git
git rm -rf . > /dev/null 2>&1 || true

echo "📋 Copying dist files..."
# Copy only the dist folder contents
cp -r app/dist/* .
cp app/dist/.nojekyll .

echo "💾 Committing changes..."
git add -A
git commit -m "Deploy to GitHub Pages - $(date +'%Y-%m-%d %H:%M:%S')"

echo "🚀 Pushing to gh-pages..."
git push -f origin gh-pages-temp:gh-pages

echo "🔙 Returning to main branch..."
git checkout main
git branch -D gh-pages-temp

echo "✅ Deployment complete! Your site should be live at https://schompf.michoest.com"
echo "   (It may take a few minutes for GitHub Pages to update)"
