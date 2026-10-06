# RunRoute: 18th Kathmandu Marathon

A minimal, distraction-free, and offline-first Progressive Web App (PWA) built for navigating the 18th Kathmandu Marathon. 

Designed to function flawlessly on race day, it caches map tiles, route data, and application assets directly to your device so you never need an internet connection while running.

## Features
- **Fully Offline:** Aggressively caches OpenStreetMap tiles and GPX data to IndexedDB.
- **Live Navigation:** Real-time GPS tracking using the browser Geolocation API.
- **Distraction-Free UI:** High-contrast dark mode, minimal metrics, and a focus on the map.
- **Off-Route Warnings:** Alerts you instantly if you deviate from the official race path.
- **Screen Wake Lock:** Keeps your screen alive automatically during the run.

## Tech Stack
- React + TypeScript
- Vite + vite-plugin-pwa (Workbox)
- Tailwind CSS
- Leaflet + OpenStreetMap

## Local Development

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Build for production
npm run build
```
