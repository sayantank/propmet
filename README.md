# propmet

## Getting Started

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Configure environment variables:**

   Copy `.env.example` to `.env` and fill in the following variables:
   ```
   RPC_URL=YOUR_SOLANA_RPC_URL
   SECRET_KEY=YOUR_PRIVATE_KEY_COMMA_SEPARATED
   POOL=jup/sol   # or jup/usdc
   ```

   - `RPC_URL`: Solana RPC endpoint  
   - `SECRET_KEY`: Your keypair  
   - `POOL`: One of the supported DLMM pool names (currently `jup/sol` or `jup/usdc`)

3. **Run the project:**
   ```bash
   bun run index.ts
   ```
   The bot will start, listen to live Pyth price feeds for the chosen pool, and manage positions automatically according to your config.

---
 