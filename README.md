# HOPR Channels Manager

A minimal browser tool for inspecting and funding [HOPR](https://hoprnet.org/) payment channels on **Gnosis Chain**.

No build step, no dependencies, no framework — plain HTML and vanilla JS.

## Files

```
index.html   the entire UI and application logic
server.js    tiny Node.js HTTP server for local testing (stdlib only)
```

## What it does

- **Connect wallet** — uses any EIP-1193 browser wallet (MetaMask, Rabby, etc.) as the RPC provider for all on-chain calls.
- **Configure contracts** — pre-filled with the production defaults; both fields can be overridden:
  - wxHOPR token: `0xD4fdec44DB9D44B8f2b6d529620f9C0C7066A2c1`
  - HoprChannels: `0x69E63A01a2209F733C83ECa619ddDa2BEA4d5Cdf`
- **Query a channel** — select or manually enter a *from* and *to* address, then click **Query Channel**. The tool calls `_getChannelId(from, to)` followed by `channels(channelId)` and displays the decoded struct:
  - `balance` (formatted to 18 decimals)
  - `ticketIndex`, `closureTime`, `epoch`
  - `status` (CLOSED / WAITING_FOR_COMMITMENT / OPEN / PENDING_TO_CLOSE)
- **Top up a channel** — enter an amount in HOPR and click **Top Up Channel**. This calls `wxHOPR.send(channelsContract, amount, userData)` where `userData` is `abi.encodePacked(from, uint96(amount), to, uint96(0))`, funding the *from → to* direction. Your wallet must hold wxHOPR.
- **wxHOPR balance** — shown in the wallet bar; refreshes automatically on connect and after each top-up.

The pre-loaded *from*/*to* dropdown contains six public relay nodes (UK, Brazil, USA, Australia, India, South Korea). Custom addresses can be typed in directly.

## Usage

```bash
node server.js
# → http://localhost:8080
```

Open `http://localhost:8080` in a browser that has a wallet extension installed and connected to Gnosis Chain.
