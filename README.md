# 60 Watts of Clarity

An AI-powered clarity concierge, digital business card, and personal website.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Framer Motion
- **Backend:** Express API + PostgreSQL (Scala Hosting VPS)
- **AI:** OpenAI-compatible chat, site scraping via Firecrawl

## Getting Started

**Prerequisites:** Node.js & npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

```sh
# Clone the repo
git clone <YOUR_GIT_URL> clarity-60-watts
cd clarity-60-watts

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

## Pre-commit hooks

This repo uses [pre-commit](https://pre-commit.com/) to run `gitleaks` on every commit so that secrets cannot be pushed accidentally. To enable it in your local clone:

```sh
pip install pre-commit && pre-commit install
```

After that, `git commit` will automatically scan staged files; the config lives in `.pre-commit-config.yaml`.

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
