# Untrace Desktop

Private VPN client for Windows and macOS. One-click privacy — no configuration, no protocol names, no complexity.

## Architecture

```
┌─────────────────────────────────────────┐
│            Untrace Desktop              │
│  ┌───────────┐    ┌──────────────────┐  │
│  │ Web UI    │    │   Rust Core      │  │
│  │ (React +  │    │   (Tauri v2)     │  │
│  │  Tailwind)│◄──►│   - API client   │  │
│  │           │    │   - Tunnel mgmt  │  │
│  │           │    │   - Config parse │  │
│  │           │    │   - Kill switch  │  │
│  └───────────┘    │   - Encryption   │  │
│                   └──────┬───────────┘  │
│                          │              │
│              ┌───────────▼───────────┐  │
│              │ Tunnel Engine         │  │
│              │ (amneziawg-go /       │  │
│              │  wireguard-go)        │  │
│              │ Bundled sidecar       │  │
│              └───────────────────────┘  │
└──────────────────┬──────────────────────┘
                   │ HTTPS
         ┌─────────▼──────────┐
         │  Control Plane API │
         │  (untrace-api)     │
         │  :3022 on VPS      │
         └─────────┬──────────┘
                   │
         ┌─────────▼──────────┐
         │  Exit Nodes         │
         │  (AmneziaWG +       │
         │   wstunnel TLS-443) │
         └─────────────────────┘
```

## Stack Decision: Tauri v2

**Chosen over Electron for these reasons:**

| Factor | Tauri | Electron |
|--------|-------|----------|
| Installer size | ~5-15 MB | ~150+ MB |
| Runtime | System webview + Rust | Bundled Chromium + Node |
| System access | Native Rust, ideal for TUN/VPN | Node child_process |
| Security | No Node.js runtime in prod | Full Node exposure |
| Memory footprint | ~30 MB | ~200+ MB |

For a VPN client that needs tight OS integration (TUN interfaces, kill switches, firewall rules), Rust provides direct system access with zero overhead. The small installer size is also critical — users expect VPN apps to be lightweight downloads.

## Features (Phase 1)

### Authentication
- Device-pairing flow: no browser wallet needed in the desktop app
- User signs into the web dashboard (SIWE wallet auth), creates a device, copies the pairing token
- Desktop app consumes the token to authenticate against the control plane API
- Token stored encrypted locally (AES-256-GCM with device-derived key)

### Connection UI
- Big Connect / Disconnect button with visual state machine
- States: Disconnected → Connecting (animated spinner) → Connected (pulsing shield + timer) → Disconnecting
- Live stats when connected: bytes sent/received, elapsed time
- IP display: tunnel IP visible, real IP shown struck-through ("hidden")

### Location Picker
- Server list fetched from control plane (`/api/nodes`)
- Grouped by geographic region with flag indicators
- Load percentage per server
- "Fastest Server" auto-select option

### Settings
- Auto-connect on launch
- Launch on system start (via tauri-plugin-autostart)
- Kill switch toggle (blocks traffic if tunnel drops)
- Device info display
- Unpair device option

### Tunnel Engine
- Bundles userspace tunnel binary (amneziawg-go / wireguard-go) as Tauri sidecar
- Parses the obfuscated config from control plane (AmneziaWG params: Jc, Jmin, Jmax, S1, S2, H1-H4)
- Writes temporary config with restrictive file permissions (0600 on Unix)
- Platform-specific tunnel creation:
  - **Windows**: WinTUN driver via wireguard-go.exe, IPC pipe at `\\.\pipe\WireGuard\{name}`
  - **macOS**: utun interface via wireguard-go, UAPI socket at `/var/run/wireguard/{name}.sock`
- Config file deleted after tunnel establishment (secrets not persisted in plaintext)

### Branding
- "Untrace" everywhere — no protocol names in UI, logs, or file names
- Matches web app palette: dark graphite (#0a0a0f), accent teal (#00d4aa), Inter font
- Shield icon throughout
- Config files download as `untrace-{name}.conf` (not wireguard/wg)

## Development

### Prerequisites
- Rust 1.77+
- Node.js 20+
- System dependencies (Ubuntu): `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`

### Commands
```bash
# Install dependencies
npm install

# Frontend dev server
npm run dev

# Frontend build
npm run build

# TypeScript check
npx tsc --noEmit

# Rust build
cd src-tauri && cargo build

# Rust tests
cd src-tauri && cargo test

# Full Tauri dev (opens app window — needs display)
npm run tauri dev

# Build installers
npm run tauri build
```

### QA Screenshots
```bash
node scripts/screenshots.mjs
```
Outputs to `qa/` directory.

## Build Targets

| Platform | Installer | Status |
|----------|-----------|--------|
| Windows | NSIS (.exe) / MSI | IMPLEMENTED — pending device test |
| macOS | DMG / .app | IMPLEMENTED — pending code signing + device test |
| Linux | AppImage / .deb | BUILD VERIFIED (CI environment) |

### Windows Build Notes
- Requires WinTUN driver (`wintun.dll`) bundled in `resources/`
- NSIS installer configured in `tauri.conf.json` (currentUser install, no admin required for userspace tunnel)
- WinTUN is MIT-licensed, redistributable

### macOS Build Notes
- Requires Apple code signing certificate for distribution
- Entitlements.plist requests `packet-tunnel-provider` capability
- Notarization needed for Gatekeeper bypass
- Available signing infrastructure: SOLCEX LTD team (93SW34CKBW) from Solcial iOS project
- utun creation requires elevated privileges (app prompts for permission)

## Security

- Device tokens encrypted at rest (AES-256-GCM)
- Tunnel config files written with 0600 permissions, deleted after use
- No protocol names in user-facing surfaces
- Kill switch blocks all non-tunnel traffic when enabled
- CSP configured to restrict API connections to control plane only
- No secrets committed to repository

## Project Structure

```
untrace-desktop/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── PairScreen.tsx  # Device pairing
│   │   ├── MainScreen.tsx  # Connection + stats
│   │   ├── LocationPicker.tsx # Server selection
│   │   └── SettingsPanel.tsx  # Settings + device info
│   ├── lib/
│   │   ├── commands.ts     # Tauri command bindings + browser mocks
│   │   ├── types.ts        # TypeScript types (matches Rust enums)
│   │   └── utils.ts        # Formatting helpers
│   ├── App.tsx             # Main app (routing, polling)
│   ├── main.tsx            # Entry point
│   └── styles.css          # Tailwind + animations
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # App setup, command registration
│   │   ├── main.rs         # Entry point
│   │   ├── api.rs          # Control plane API, pairing, config parsing
│   │   ├── tunnel.rs       # Tunnel engine management, kill switch
│   │   ├── crypto.rs       # AES-256-GCM encryption, key derivation
│   │   └── state.rs        # App state, types, enums
│   ├── icons/              # App icons (PNG, ICO, ICNS)
│   ├── resources/          # Bundled binaries (tunnel engine)
│   ├── Cargo.toml          # Rust dependencies
│   ├── tauri.conf.json     # Tauri config (window, bundle, plugins)
│   └── Entitlements.plist  # macOS entitlements
├── scripts/
│   └── screenshots.mjs     # Automated QA screenshots
├── qa/                     # Screenshot evidence
├── package.json
├── tailwind.config.js
├── vite.config.ts
└── README.md
```

## Evidence Ladder

| Component | Status | Evidence |
|-----------|--------|----------|
| Frontend TypeScript | BUILD VERIFIED | `tsc --noEmit` passes, zero errors |
| Frontend Vite build | BUILD VERIFIED | `vite build` produces dist/ (220KB gzip) |
| Rust compilation | BUILD VERIFIED | `cargo build` succeeds (Linux x86_64) |
| Rust unit tests | RUNTIME VERIFIED | 7/7 tests pass (crypto, config parsing, tunnel config) |
| UI rendering | RUNTIME VERIFIED | 6 screenshots captured via headless Chromium |
| Mock connection flow | RUNTIME VERIFIED | Full pair → connect → disconnect cycle works in browser |
| Tunnel on Windows | IMPLEMENTED | Code paths exist; PENDING DEVICE TEST |
| Tunnel on macOS | IMPLEMENTED | Code paths exist; PENDING DEVICE TEST |
| Windows installer (NSIS) | IMPLEMENTED | Config in tauri.conf.json; PENDING CROSS-COMPILE |
| macOS installer (DMG) | IMPLEMENTED | Config in tauri.conf.json; PENDING CODE SIGNING |
| Kill switch | IMPLEMENTED | Logic scaffolded; PENDING DEVICE TEST |
| Auto-start | IMPLEMENTED | via tauri-plugin-autostart; PENDING DEVICE TEST |
