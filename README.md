# Gaming Time Tracker

Hey! This is a tool I built to help manage gaming time in a way that's actually sustainable and doesn't feel punitive. The idea came from wanting to balance gaming (especially staying connected with friends) while still encouraging productive habits.

Instead of just setting hard limits, this app rewards you for doing learning activities by giving you extra gaming time. It's all about positive reinforcement rather than just cutting yourself off.

## Features



### 📊 Track Everything Without Being Overwhelming
- See all your gaming sessions with start and end times
- Get weekly summaries to spot patterns
- Mark sessions as "social" when you're playing with friends
- Track time per individual game

## How It's Built

I went with Tauri (Rust + React) because I wanted something fast and native-feeling:

- **Frontend**: React + TypeScript (because I like having types)
- **Styling**: Tailwind CSS (fast styling) + Lucide icons
- **Backend**: Rust with Tauri (cross-platform and performant)
- **Database**: SQLite (simple, local, no cloud nonsense)
- **Monitoring**: Cross-platform process detection
- **Testing**: Vitest + React Testing Library (comprehensive test coverage)

## Project Structure

```
gaming-time-tracker/
├── src-tauri/                 # Rust backend
│   ├── src/
│   │   ├── main.rs           # Application entry point & Tauri commands
│   │   ├── models.rs         # Data structures & types
│   │   ├── game_monitor.rs   # Game detection & session tracking
│   │   └── database.rs       # SQLite database operations
│   └── Cargo.toml           # Rust dependencies
├── src/                      # React frontend
│   ├── components/
│   │   ├── Dashboard.tsx     # Main dashboard with budget & sessions
│   │   ├── LearningTracker.tsx (planned)
│   │   ├── SessionHistory.tsx # History tab with analytics (more coming soon!)
│   │   └── SettingsPanel.tsx (planned)
│   ├── App.tsx              # Root React component
│   └── main.tsx             # React entry point
├── tests/                   # Testing suite
│   ├── mocks/
│   │   └── tauri.ts         # Tauri API mocks for testing
│   ├── components/
│   │   ├── Dashboard.test.tsx # Dashboard component unit tests
|   |   ├── LearningTracker.test.tsx (planned)
│   │   ├── SessionHistory.test.tsx # Session History component unit tests
│   │   └── SettingsPanel.test.tsx (planned)
│   ├── integration/
│   │   ├── App.test.tsx     # App integration tests
│   │   ├── utils.test.ts    # Utility function tests
│   │   ├── integration.test.tsx # Full integration tests
│   │   └── e2e.test.tsx     # End-to-end tests
│   └── setup.ts             # Test configuration
├── package.json             # Node.js dependencies
└── vite.config.ts          # Vite configuration
```

## Key Features Explained

### Concurrent Session Handling
The app intelligently handles when multiple games are running simultaneously:
- Tracks each game session individually
- Calculates budget usage based on unique time periods (no double-counting)
- Shows both "actual playtime" and "budget usage" metrics
- Visual indicators for concurrent sessions

### Learning Activity Integration
Encourages productive habits by offering gaming time rewards:
- Different activity types have different earning rates
- Activities are logged with timestamps and descriptions
- Earned minutes are added to daily budget automatically
- Motivates balancing gaming with learning/exercise

### Smart Budget Management
- Base daily allowance (default: 2 hours)
- Earned minutes from learning activities
- Rollover minutes from previous days (expire after configurable period)
- Real-time calculations and updates
- Manual adjustments for special circumstances

## What's Working vs What's Coming

### ✅ Already Built
- Game monitoring and session tracking (the core stuff)
- SQLite database that handles all the data
- Budget calculations with the rollover logic
- Learning activity tracking and rewards
- React dashboard that updates in real-time
- Smart handling of multiple games running at once
- Comprehensive test suite with unit, integration, and e2e tests
- Detailed session history view (but going to add graphs soon!)

### 🚧 Still Working On
- Graphs for session history
- Learning activity tracking and rewards
- Better interface for logging learning activities
- Settings panel so you can customize everything
- System tray integration (so it's less in your face)
- Per-game configuration options
- Export your data if you want it
- And more!

## Getting It Running

### What You Need
- Node.js (v16 or newer)
- Rust (get the latest stable version)
- Whatever build tools your OS needs

### To Develop
```bash
# Get the code
git clone https://github.com/HalleyB/gaming-time-tracker
cd gaming-time-tracker

# Install frontend stuff
npm install

# Build the Rust backend
cd src-tauri && cargo build

# Run it in dev mode
npm run tauri dev
```

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test files
npm test Dashboard.test.tsx

# Run integration tests
npm test integration/

# Run e2e tests
npm test e2e.test.tsx
```

### To Build for Real
```bash
npm run tauri build
```

## The Philosophy

This tool exists because I think most time management apps are too harsh. Gaming isn't inherently bad - it's fun, it's social, and sometimes you need to unwind. But it's also easy to lose track of time.

The goal here is to:
- Make you aware of your gaming time without being judgmental
- Reward productive activities instead of just punishing gaming
- Be flexible enough for real life (some days you want to game more, some days less)
- Help maintain social connections through gaming while encouraging other habits

Everything stays on your computer. No accounts, no cloud sync, no tracking you. It's just a tool to help you be more intentional with your time.