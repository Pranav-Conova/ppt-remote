# Signify: gesture-controlled presentations

Present PDF or PowerPoint slides and control them with **hand gestures** from your webcam. You can also scan a QR code to turn **your phone into a clicker and motion laser pointer**.

- 📤 Open a **PDF** (rendered in your browser, never uploaded) or **PPT/PPTX** (converted to PDF on the server)
- 🖐️ Hand gestures (MediaPipe, running in your browser): next, previous, point, draw, undo, show text. Each gesture is a customizable five-finger pattern.
- 📱 Phone remote: Next/Prev, hold-to-point with the gyroscope, hold-to-draw, undo, clear, blank screen
- 🎥 Optional camera picture-in-picture in any corner
- ⌨️ Keyboard: `→`/`←` slides, `B` blank, `Z` undo, `C` clear, `T` text, `F` fullscreen, `P` phone pairing

Demo of the original version: https://youtu.be/TeOxVTLrOes

## Architecture

```
 ┌──────────── laptop browser (React) ────────────┐        ┌──── phone browser ────┐
 │ pdf.js slides · canvas annotations · laser dot  │        │ buttons · gyro → 1€   │
 │ MediaPipe hand tracking (Web Worker)            │        │ filter → x,y          │
 └───────┬───────────────────────────▲────────────┘        └──────┬────────────────┘
         │  WebRTC DataChannels (P2P on the same Wi-Fi)            │
         │  pointer: unordered, no retransmits · control: reliable │
         └─────────────────────────────────────────────────────────┘
         │ signaling + fallback relay (WebSocket)                  │
         ▼                                                         ▼
      ┌───────────────────────── Go server ─────────────────────────┐
      │ serves the app · QR pairing sessions · WebRTC signaling      │
      │ relay fallback (latest-wins pointer) · PPTX → PDF (LibreOffice) │
      └──────────────────────────────────────────────────────────────┘
```

- **Frontend** (`frontend/`): Vite + React + TypeScript. Slide rendering, hand tracking, annotations and the pointer all run in the browser, so the server never processes video.
- **Backend** (`backend/`): Go standard library plus `coder/websocket`. It is a single binary with the built frontend embedded. Sessions are kept in memory, with no database.

### Why the pointer is fast

The pointer path (phone → laptop) never goes through the server when it doesn't have to:

| | Relay via a cloud server | Direct WebRTC on the same Wi-Fi |
|---|---|---|
| Network latency | 2× internet round trip (~60–150 ms from India to Singapore) | ~2–10 ms |
| A lost packet | TCP stalls every later update (100 ms+ spikes) | That frame is skipped and the next one replaces it |

- Pointer frames are 8 bytes long (`type, flags, seq, x, y`). They carry an **absolute** position, so a dropped frame never causes drift, and late frames are discarded by sequence number.
- The phone integrates gyroscope angular velocity, measuring yaw around gravity so it works at any holding angle. It smooths the result with a **One Euro filter**, which removes tremor without adding lag on fast moves. The pointer re-centres each time you press *Pointer*, so there is nothing to calibrate.
- The laptop applies pointer updates in one `requestAnimationFrame` with a GPU transform. Updates bypass React.
- Hand tracking runs in a **Web Worker**, so model inference never blocks pointer or button messages.
- If a direct connection can't be made (different networks, strict NAT), the server relays automatically. The relay keeps only the newest pointer frame per client, so it can't build a backlog. The badge shows **Direct** or **Via server**, plus the measured round-trip time.

## Development

Requirements: Go 1.25+, Node 22+. LibreOffice is optional, for PPTX.

```bash
# terminal 1: API + signaling on :8080
cd backend
go run ./cmd/server

# terminal 2: Vite dev server on :5173 (proxies /api and /ws to :8080)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

**Testing the phone remote.** Phones only allow motion sensors on **HTTPS** pages, and a phone can't reach `localhost`. Expose the dev server through a tunnel:

```bash
cloudflared tunnel --url http://localhost:5173   # or: ngrok http 5173
```

Open the tunnel URL **on the laptop too**, so the QR code points at it. Signaling goes through the tunnel, but once paired, the phone and laptop still talk directly over your Wi-Fi.

### Tests

```bash
cd backend && go test ./...      # sessions, relay coalescing, WebSocket end-to-end, convert
cd frontend && npm test          # pointer protocol, One Euro filter, finger/gesture logic
```

### Production build

```bash
cd frontend && npm run build     # writes into backend/internal/web/dist
cd backend && go build -o signify ./cmd/server
./signify                        # serves everything on $PORT (default 8080)
```

Or with Docker (includes LibreOffice for PPTX):

```bash
docker build -t signify .
docker run -p 8080:8080 signify
```

## Deploying to Render

`render.yaml` deploys the Dockerfile as one web service. Configuration lives in environment variables; see `.env.example`. The defaults work as they are.

Note that Render's free tier sleeps when idle, so the first visit can take 30–50 s to wake up. After pairing, the phone ↔ laptop data goes direct whenever possible, so the server's location and load barely affect pointer latency.
