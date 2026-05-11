# Ducks Unlimited — E-Commerce Website

## What This Is
E-commerce website + admin panel for Ducks Unlimited, a Filipino retail clothing brand (est. 1995). Affordable luxury positioning. Based in Greenhills, San Juan.

## Stack
- Frontend: Plain HTML, CSS, vanilla JavaScript (no frameworks)
- Database + Auth: Supabase
- Payments: PayMongo
- Hosting: Vercel
- No React, no Next.js, no TypeScript — keep it simple

## Project Structure
- /public → all website pages customers see
- /admin → password-protected admin panel for managers
- /api → serverless functions for payments and webhooks

## Brand
- Primary color: #1B4D2E (deep forest green)
- Accent: #C9A84C (muted gold)
- Background: #F5F0E8 (warm ivory)
- Text: #1A1A1A
- Fonts: Cormorant Garamond (headings), DM Sans (body)

## Key Rules
- Always write clear comments in code — the owner is a beginner coder
- Mobile-first design — most PH shoppers are on phones
- Keep it simple and maintainable over clever
- Every page must work without JavaScript where possible
- Admin panel is at /admin — protected by Supabase auth

## Database (Supabase)
Core tables: products, variants, inventory, orders, order_items, admin_users
Inventory tracks per-channel: 'online', 'greenhills_store' (more channels added later)

## Current Build Phase
Phase 1 — Get the site running:
1. Supabase schema
2. Admin panel (add products, manage inventory, view orders)
3. Storefront (catalog, product pages, cart, checkout)
4. PayMongo integration
5. Deploy to Vercel
