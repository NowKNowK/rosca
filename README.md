# On-Chain ROSCA — Rotating Savings and Credit Association on Solana

A trustless, permissionless implementation of a *kassa vzaimopomoshchi* (rotating savings fund) as an Anchor program on Solana. N participants contribute a fixed SPL-token amount each round; the full pot goes to one predetermined participant per round, cycling through all members.

**Program ID (devnet):** `A2V2rfqjFiXAGiqBSX9BGUUyxRaaAQUtHs4amk5sHnyj`

[View on Solana Explorer →](https://explorer.solana.com/address/A2V2rfqjFiXAGiqBSX9BGUUyxRaaAQUtHs4amk5sHnyj?cluster=devnet) · **[Live demo (https://roscanowk.vercel.app/)**

> **Devnet USDC:** get test tokens at [faucet.circle.com](https://faucet.circle.com) — mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

---

## What is a ROSCA?

ROSCAs (known as *tandas* in Mexico, *chit funds* in India, *hui* in China, *kassa vzaimopomoshchi* in Central Asia) are one of the world's most widespread informal savings mechanisms — used by an estimated 1 billion people. The model is simple: a group of N people each contribute a fixed amount per period; each period one member receives the entire pool, rotating until every member has received it once.

**Traditional frictions this program eliminates:**

| Problem | Solution |
|---|---|
| Custodial risk — organizer holds all funds | Vault = PDA; no human has withdrawal authority |
| Default risk — especially for early recipients | Position-scaled collateral + permissionless slash |
| Opaque accounting | On-chain state; contribution matrix readable by anyone |
| Liveness risk — organizer must trigger payouts | All payout/cancel/slash ops are permissionless |

---

## How It Works On-Chain

```
              join() × N
  [Filling] ──────────────► [Active] ──► [Completed]
      │                        │               │
      │  cancel_circle()       │               │
      └───────────────────► [Cancelled]        │
                                               ▼
                                         close_member() × N
                                         close_circle()
```

1. **Creator** calls `create_circle` — specifies token mint, amount, round duration, max members, collateral parameters.
2. **Members** call `join` — collateral is transferred to the PDA-owned vault; when the last slot fills, the circle auto-starts.
3. Each round: every active member calls `contribute`; the round's recipient calls `claim_payout` (or anyone can trigger it permissionlessly).
4. Liveness is enforced by `slash` (permissionless): a member who misses the grace window has their collateral redistributed to the current round's pot.
5. After all rounds complete, members call `close_member` (permissionless) to recover collateral; creator calls `close_circle` to sweep vault dust.

---

## Architecture

### Accounts

| Account | Seeds | Size | Purpose |
|---|---|---|---|
| `Circle` | `["circle", creator, circle_id_le8]` | 338 B | All circle state: schedule, bitmaps, accounting |
| `Member` | `["member", circle, user]` | 102 B | Per-member: position, contributions bitmap, collateral, status |
| `MemberHistory` | `["history", user]` | 45 B | Global reputation: `defaults`, `completed` — **never closed** |
| Vault | ATA(circle PDA, mint) | SPL token | Holds collateral + unclaimed pots + refund reserve |

### Instructions (10)

| Instruction | Who can call | Purpose |
|---|---|---|
| `create_circle` | Anyone | Create circle, initialize vault ATA |
| `join` | New member (signer) | Transfer collateral; auto-start when full |
| `leave` | Member (signer) | Full collateral refund while still Filling |
| `contribute` | Member (signer) | Pay round amount + any outstanding surcharge |
| `claim_payout` | **Anyone** | Transfer pot to scheduled recipient |
| `slash` | **Anyone** | Slash defaulter, redistribute collateral |
| `exit_early` | Member (signer) | Exit Active circle; refund deferred to close |
| `cancel_circle` | **Anyone** | Cancel Filling circle past start deadline |
| `close_member` | **Anyone** | Close member PDA, pay collateral/refund |
| `close_circle` | **Anyone** | Close circle PDA + vault after all members closed |

### Position-Scaled Collateral

```
collateral(p) = contribution_amount × (max_members − p) × collateral_bps / 10_000
```

Position 1 (earliest payout) posts maximum collateral = `(N−1) × amount × bps / 10_000`; position N (latest) posts zero. This scales the security deposit to the member's residual obligation after they receive their payout.

**Residual risk table (N=5, amount=100, collateral_bps=5000):**

| Pos | Collateral | Max residual | Coverage |
|---|---|---|---|
| 1 | 200 | 400 | 50% |
| 2 | 150 | 300 | 50% |
| 3 | 100 | 200 | 50% |
| 4 | 50 | 100 | 50% |
| 5 | 0 | 0 | — |

If pos-1 receives 500 and defaults: slash yields 200, uncovered 200 is distributed as reduced future pots.

### Vault Invariant

At all times:
```
vault.amount == total_collateral
             + Σ(unclaimed rounds: contribution_amount × counts[r] + pot_bonus[r])
             + refund_reserve
```

Verified by a test helper after every single transaction across all 10 test scenarios.

### Time Model (Lazy — No Crank)

```
current_round(now) = (now − started_at) / round_duration + 1
round_window(r)    = [started_at + (r−1)×D,  started_at + r×D + grace)
```

No cron job or off-chain bot needed. Each instruction checks `Clock::get()` inline. Missed rounds create a **permanently slashable** state — there is no retroactive contribution.

### Exit Paths

| Path | Mechanism |
|---|---|
| **A — leave** | Before circle starts; full collateral refund. |
| **B — exit_early** | After circle starts, before own payout round; refund from surcharge model (see below). |
| **C — post-payout default** | Not an instruction — triggers `slash` by any observer. |

**Exit-early surcharge model:** when a member with position p exits after k contributions:

```
refund_due          = k × amount × (10_000 − penalty_bps) / 10_000
surcharge_per_member = ceil(refund_due / (active_members − 1))
```

Each remaining member pays `surcharge_per_member` on top of their next contribution. Collected amounts flow to `refund_reserve`. At `close_member`, the exited member receives `min(refund_due, refund_reserve)` — never panics even if the reserve is short.

**Exit constraints:** not allowed in the last 2 rounds (no future contributions to collect the surcharge), and not allowed when `eff_pos == current_round` (use `claim_payout` instead).

---

## State Machine Diagrams

### Circle

```
[*] → Filling ──join fills last slot──► Active ──all rounds claimed──► Completed ──► [*]
        │                                                                               ↑
        └──cancel_circle (now > start_deadline)──► Cancelled ─────────────────────────┘
```

### Member

```
[*] → Active ──leave (Filling only)──► [*]
        │
        ├──exit_early──► Exited ──close_member──► [*]
        ├──slash──► Defaulted ──close_member──► [*]
        └──close_member (Completed, full contributions)──► [*]
```

---

## Tradeoffs & Honest Constraints

- **Sybil resistance:** `require_clean_history` checks `history.defaults == 0` (O(1), provable). A fresh wallet has a clean history — the flag is a filter, not a full sybil defense.
- **Partial pot on default:** the round where a default occurs may have a smaller pot (missing contributor's share). The slash redistributes collateral as `pot_bonus` to partially compensate.
- **Asymmetry on exit:** early-round recipients received full pots before the exit; exiting reduces subsequent pots by one contributor. The `penalty_bps` fee partially compensates remaining members.
- **Locked window:** a member whose payout round has just arrived cannot exit (`PayoutAvailableUseClaim`) and cannot claim early if the pot isn't full yet (`ClaimTooEarly`). This window lasts at most one `round_duration`.
- **Exit-refund is best-effort:** if a member with zero collateral (position N) defaults before paying their surcharge, the exiter absorbs a proportional shortfall. `close_member` pays `min(refund_due, refund_reserve)` and never blocks `close_circle`.
- **Max 16 members:** enables u16 contribution bitmaps and fixed-size arrays. Practical ROSCA groups are typically 5–15 members.
- **Classic SPL Token only** (not Token-2022): minimizes the testing surface.
- **My Circles discovery:** the web dashboard uses `getProgramAccounts` + `localStorage` — no indexer required. GPA may be rate-limited on shared RPC endpoints; set `VITE_RPC_URL` in `app/.env` to point at a dedicated node (e.g. Helius free tier).
- **10 instructions** (vs. "6–8" target): the program specification implicitly requires all 10; removing any would drop mandatory functionality.

---

## Devnet Deployment

**Program:** [`A2V2rfqjFiXAGiqBSX9BGUUyxRaaAQUtHs4amk5sHnyj`](https://explorer.solana.com/address/A2V2rfqjFiXAGiqBSX9BGUUyxRaaAQUtHs4amk5sHnyj?cluster=devnet)

**Demo circle (3-member, 90-second rounds, completed):**
[`8vDKkWNdaikiy3ihuAhnKfTmHUhUZijpehcZCYXvQuHh`](https://explorer.solana.com/address/8vDKkWNdaikiy3ihuAhnKfTmHUhUZijpehcZCYXvQuHh?cluster=devnet) · [Open in dashboard →](https://rosca-devnet.vercel.app/circle/8vDKkWNdaikiy3ihuAhnKfTmHUhUZijpehcZCYXvQuHh)

### Transaction Links by Instruction Type

| Instruction | Explorer Link |
|---|---|
| `create_circle` | [2sUMXJ…](https://explorer.solana.com/tx/2sUMXJwUA8mKFASjuFx7zzyVVXeiZz1pqfmwXuF9ynoip3hbonQc6WCboRMJHozPNF18iLZcn9hxpC1JY5gVqNTE?cluster=devnet) |
| `join` (creator, pos 1) | [4BrAk8…](https://explorer.solana.com/tx/4BrAk879HJiSDmhSjuH9YQ3BxQh6HxKDC7BijQaKkbEUgd9UA61Hkb4oz2oUTvxBg8ciKdWRcSiwydkaCjEJBqVj?cluster=devnet) |
| `join` (alice, pos 2) | [3URWjC…](https://explorer.solana.com/tx/3URWjCZ9BmtXYu6tXia4hFKJMVqJLZbHbQh73vs1eLHgoSKVXWoELgvjnCuQLqzsCR5g4mgra1zHmDdjUPQJuWiY?cluster=devnet) |
| `join` (bob, pos 3 — auto-start) | [27oUHv…](https://explorer.solana.com/tx/27oUHvJUjjBv633Yzicv7GWjHfEbsD2s86M75b5rwTXhbdyCNx9DboCwYPh92WdmPMXgDo6tiv735FF33x6dLrJn?cluster=devnet) |
| `contribute` (round 1, creator) | [D7Vuie…](https://explorer.solana.com/tx/D7Vuie5ZeX1sTgNKgN4SU1C5cYu4bB4WS7HtY3GwTvcxsix8z7n5zghSyegstVZ9m6ogPY7ycpofRaquDgMxfeK?cluster=devnet) |
| `contribute` (round 1, alice) | [5aYkVX…](https://explorer.solana.com/tx/5aYkVXuWKuvp7LbYsaoj5Cg8c7iWRgmL4cfWRswDhhyghQicmMKC3yP1no7wehLEByBRJdSCHyJAT1zEKSaGSPho?cluster=devnet) |
| `contribute` (round 1, bob) | [34a6ko…](https://explorer.solana.com/tx/34a6kozdZBPD5NdhUbJPvgAzBwexjKdZjsJQr8EQVYUvP2oXLFR68HdKVT8hVqqSGZ7e3aLoJMahUQ5J6KcopWHu?cluster=devnet) |
| `claim_payout` (round 1 → creator) | [3QUxJx…](https://explorer.solana.com/tx/3QUxJxX1cgAWZ5yqYPcFq6Dmj47RmqJhnAXmcFauzZ2dTHkj2Eb7GmPc9RQEaVwPH15LDyyAat8iP3yLUkPVCGZy?cluster=devnet) |
| `contribute` (round 2, creator) | [4s3nAb…](https://explorer.solana.com/tx/4s3nAbM7j5KiKPtmD5z9qAaC1uMBoesQ1ktWfquwTKACaoB4SXA7jcbrRatcRY9GM3GaUn4J8ADxCpB2LUg8WKkg?cluster=devnet) |
| `claim_payout` (round 2 → alice) | [21heuK…](https://explorer.solana.com/tx/21heuKcDxZS3mGGD3KSk3BKot98gKkrWsUFMELwhSpCjDzSpzt6yaoEzmNSvhrBfSMTmSVfYidGGGT4hE76U1iQz?cluster=devnet) |
| `contribute` (round 3, creator) | [3JesHN…](https://explorer.solana.com/tx/3JesHNWDh8NpSpczdX5uYVTH4Az9ePnKQNiqdYnnXW1sudCKYiydkZvwsvMHzFXy8PmceoADh5vLuNKZm4u4KZwF?cluster=devnet) |
| `claim_payout` (round 3 → bob, Completed) | [4ojFh2…](https://explorer.solana.com/tx/4ojFh258AHTbUGQyEre5MwJWbKHoEDTzZUrYaiijbR8HzLcuostaDAUMk4h4jPSq8MsEpJVzjRuXvrmXFZcwHSSR?cluster=devnet) |
| `close_member` (creator) | [2e2Hby…](https://explorer.solana.com/tx/2e2Hbyj7e2dwoerwRDCH5VDDR1ycKxjrJaXBV65cpSGvqe5gJvoRcwAcYCYn2cUUGjAcyEjqQ2EQPpNyfHV7pvnj?cluster=devnet) |
| `close_member` (alice) | [qniJQd…](https://explorer.solana.com/tx/qniJQdt4dzgGYTfwQLSSWSedtT6pDnVoWV2JSZLeVZeBW73d1sxZ4kYJ6fu9MiohH3g8XzF2ULuh5Xex99PFE1i?cluster=devnet) |
| `close_member` (bob) | [Y9oHXU…](https://explorer.solana.com/tx/Y9oHXU5AUAZdCYoLKUYvA4fX1ppxki5Z8NCAe5ohukB3pkfsuVDNtjDAX6Gsfi8TXYR62fMpBmtK87Ub3jPCKtM?cluster=devnet) |
| `close_circle` | [5FB4j3…](https://explorer.solana.com/tx/5FB4j3Kuqb9BG81YaYWzAydYE71sWdQaPiMKF8gCMXAJJWU4Ygcs5ATGQBZHqTXzcgSa9T3jDhTEJdRoDridCbnq?cluster=devnet) |

*Instructions `slash`, `exit_early`, `cancel_circle`, and `leave` are fully implemented and covered by the bankrun test suite. Run `anchor test` to see all 10 scenarios.*

---

## Running It

Two clients are available: a **web dashboard** (for end users) and a **CLI** (for scripting and testing).

### Web App (Dashboard)

The dashboard lets you view any circle, join, contribute, claim payouts, slash defaulters, and exit early — entirely through a browser, no CLI needed.

**Live:** [https://rosca-devnet.vercel.app](https://rosca-devnet.vercel.app)

**Run locally:**

```bash
cd app
npm install
npm run dev          # http://localhost:5173
```

Optionally create `app/.env` to use a dedicated RPC endpoint (reduces rate-limit risk):

```
VITE_RPC_URL=https://your-rpc-endpoint.com
```

See `app/.env.example` for reference. Without it, the public devnet endpoint is used.

---

### Requirements (CLI + Anchor)

- Rust + Cargo (with `solana` target)
- Solana CLI ≥ 1.18
- Anchor CLI 0.31.1
- Node 20 + npm

### Run Tests (bankrun — no validator needed)

```bash
npm install
anchor test
# Expected: 10 passing
```

### Deploy to Devnet

```bash
solana config set --url devnet
anchor build
anchor deploy --provider.cluster devnet
```

### CLI Quick Start

```bash
# Show help
npm run cli -- --help

# Create a circle (devnet, replace mint with your SPL mint)
npm run cli -- create \
  --mint <MINT_ADDRESS> \
  --amount 1000000 \
  --members 3 \
  --round-duration 86400 \
  --rpc https://api.devnet.solana.com

# Join
npm run cli -- join <CIRCLE_ADDRESS>

# Show status matrix
npm run cli -- status <CIRCLE_ADDRESS>

# Contribute (auto-detects current round)
npm run cli -- pay <CIRCLE_ADDRESS>

# Claim payout for round N
npm run cli -- claim <CIRCLE_ADDRESS> 1

# Slash a defaulter
npm run cli -- slash <CIRCLE_ADDRESS> <MEMBER_PDA> <ROUND>

# Exit early
npm run cli -- exit <CIRCLE_ADDRESS>

# Cancel a filling circle past deadline
npm run cli -- cancel <CIRCLE_ADDRESS>

# Close member account + circle if all closed
npm run cli -- close <CIRCLE_ADDRESS>
```

### Run the Devnet Demo (~5 minutes, uses 90-second rounds)

```bash
# Requires funded devnet keypair at ~/.config/solana/id.json
npx ts-node -P cli/tsconfig.json scripts/devnet-demo.ts
```

---

## Repository Structure

```
Rosca/
├── programs/rosca/src/
│   ├── lib.rs                 — declare_id! + 10 instruction dispatchers
│   ├── state.rs               — Circle, Member, MemberHistory; collateral formula; eff_pos
│   ├── errors.rs              — 24 custom errors (RoscaError)
│   ├── events.rs              — 12 events (one per state change)
│   └── instructions/          — one file per instruction
│       ├── create_circle.rs
│       ├── join.rs            — init_if_needed for MemberHistory; auto-start
│       ├── leave.rs
│       ├── contribute.rs      — surcharge accumulation
│       ├── claim_payout.rs    — permissionless; init_if_needed ATA
│       ├── slash.rs           — permissionless; collateral → reserve + pot_bonus
│       ├── exit_early.rs      — surcharge model; deferred refund
│       ├── cancel_circle.rs
│       ├── close_member.rs    — best-effort refund; init_if_needed ATA
│       └── close_circle.rs    — vault dust sweep
├── tests/
│   └── rosca.test.ts          — 10 bankrun scenarios + vault invariant checker
├── cli/
│   └── src/index.ts           — commander CLI (create/join/leave/pay/claim/exit/slash/cancel/close/status)
├── scripts/
│   └── devnet-demo.ts         — end-to-end happy path demo
├── app/                       — web dashboard (Vite + React + TanStack Query)
│   ├── src/
│   │   ├── lib/               — off-chain formula mirrors, unit-tested with vitest (24 tests)
│   │   ├── hooks/             — TanStack Query hooks; single RPC boundary
│   │   ├── components/        — dashboard, rounds matrix, action panel, cleanup
│   │   └── pages/             — HomePage, CreateCirclePage, CircleDashboardPage
│   └── vercel.json            — SPA rewrite rule
└── README.md
```

---

## Security Properties

- **No privileged authority:** vault is an ATA owned by the Circle PDA. All outflows use CPI with PDA signer seeds. The creator's only privilege is receiving vault dust and rent at `close_circle`, after all members have been closed.
- **Permissionless liveness:** `claim_payout`, `slash`, `cancel_circle`, `close_member`, `close_circle` can all be called by anyone. No single actor can hold the circle hostage.
- **ATA griefing resistance:** `claim_payout` and `close_member` use `init_if_needed` on the recipient's ATA (rent paid by the permissionless caller). Closing one's own ATA cannot block payouts to others.
- **MemberHistory re-init resistance:** `MemberHistory` is never closed. A member cannot reset their default count by closing and recreating the account.
- **Double-claim protection:** `claimed_rounds` bitmask + `has_received_payout` flag provide two independent guards.
- **Arithmetic:** all operations use `checked_*`; surcharge uses ceiling division (no undercharge); penalty uses floor (in protocol's favor); vault dust is deterministically swept at close.

---

## Out of Scope

- Interest accrual / yield on locked funds
- Dynamic round ordering or auctioned positions
- Cross-program composability / CPI re-entrancy hardening
- Token-2022 extensions (transfer fees, interest-bearing mints)
- On-chain oracle price feeds
- Governance / multi-sig admin
- Sybil resistance beyond `require_clean_history`
