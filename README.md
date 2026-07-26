# Restaurant Reservation Management System - Backend

## Overview
This is the backend repository for the Restaurant Reservation Management System. It serves as the foundational architecture for Sprint 0.

## Tech Stack
- **Framework:** NestJS
- **Language:** TypeScript
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Containerization:** Docker

## Folder Structure
```
src/
├── common/
│   ├── constants/
│   ├── decorators/
│   ├── exceptions/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── pipes/
│   └── utils/
├── config/
├── modules/
│   ├── auth/
│   ├── menus/
│   ├── payments/
│   ├── reservations/
│   ├── restaurants/
│   ├── reviews/
│   ├── tables/
│   └── users/
├── prisma/
├── app.module.ts
└── main.ts
```

## Getting Started
1. Clone the repository.
2. Copy `.env.example` to `.env` and fill in the values.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the application:
   ```bash
   npm run start:dev
   ```

## Docker Commands
To start the services using Docker:
```bash
docker-compose up -d
```
To stop the services:
```bash
docker-compose down
```

## Development Roadmap
- **Sprint 0:** Project Initialization & Architecture Setup (Completed).
- **Sprint 1+:** Incremental implementation of business modules (Auth, Users, Restaurants, Reservations, etc.).
