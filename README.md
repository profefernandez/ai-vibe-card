# 60 Watts of Clarity — AI Vibe Card

An AI-powered digital business card and personal website.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Framer Motion
- **Backend:** Express API + PostgreSQL (Scala Hosting VPS)
- **AI:** OpenAI-compatible chat, site scraping via Firecrawl

## Getting Started

**Prerequisites:** Node.js & npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

```sh
# Clone the repo
git clone <YOUR_GIT_URL>
cd ai-vibe-card

# Install frontend dependencies
npm install

# Install API dependencies
cd api && npm install && cd ..

# Copy and configure environment variables
cp api/.env.example api/.env

# Start the API server (port 3001)
cd api && npm run dev &

# Start the frontend dev server (port 8080)
npm run dev
```

## Project Structure

```
src/           → React frontend (pages, components, hooks, lib)
api/           → Express backend (routes, middleware, DB)
database/      → SQL schema and setup
public/        → Static assets
```

## Deployment

Build the frontend and deploy the Express API to your VPS:

```sh
npm run build          # outputs to dist/
cd api && npm run build && npm start
```
