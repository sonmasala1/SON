# 🌿 SON MASALA

**हर स्वाद में अपनापन**

SON MASALA is a modern e-commerce website for authentic Indian spices and masala products. It provides a simple and convenient shopping experience for customers to explore, select, and order their favourite spices online.

## Features

- Whole spices, ground spices, and blended masalas
- Product categories, search, and detailed product pages
- Shopping cart and wishlist
- Customer login and authentication
- Hindi and English language support
- Order management and checkout
- Customer reviews and ratings
- Admin and owner dashboards
- Product and inventory management
- Responsive design for desktop and mobile

## Tech Stack

| Frontend | Backend | Database |
|---|---|---|
| Next.js, React, JavaScript (JSX) | Node.js, Express.js | MongoDB Atlas, Mongoose |

## Project Structure

```text
SON/
├── frontend/          # Next.js frontend
├── backend/           # Express.js backend
├── .gitignore
└── README.md
```

## Getting Started

**1. Start the backend**

```bash
cd backend
npm install
npm run dev
```

**2. Start the frontend**

```bash
cd frontend
npm install
npm run dev
```

Configure the required environment variables before starting the application.

Local frontend settings belong in `frontend/.env`; local backend origin/cookie settings belong in `backend/.env`. Existing database credentials stay in the backend environment. Production variables belong in Vercel and Render. See [the environment and logging report](backend/docs/LOCAL_PRODUCTION_LOGGING_REPORT.md) for exact settings, request ID troubleshooting, changes and verification results.

## Local URLs

- **Website:** http://localhost:3000
- **Backend API:** http://localhost:5000/api/v1

## Product Categories

- **Whole Spices:** Jeera, Elaichi, Laung, Kali Mirch, Dalchini, Jaiphal, Javitri and more.
- **Ground Spices:** Haldi Powder, Dhaniya Powder, Lal Mirch Powder, Jeera Powder and more.
- **Blended Masalas:** Garam Masala, Biryani Masala, Chole Masala, Rajma Masala and more.

---

**SON MASALA — हर स्वाद में अपनापन**

See [the authentication implementation and deployment report](backend/docs/IMPLEMENTATION_REPORT.md) for verified fixes, isolated test commands, required Vercel/Render/Google settings, and release acceptance checks.
