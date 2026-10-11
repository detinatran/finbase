import {
  createPublicClient,
  createWalletClient,
  defineChain,
  erc20Abi,
  http,
  parseAbi,
  zeroAddress,
  type Address,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil, baseSepolia } from "viem/chains";
import { config, loadDeployment } from "./config";

export const walletAbi = parseAbi([
  "function owner() view returns (address)",
  "function operator() view returns (address)",
  "function paused() view returns (bool)",
  "function recipientDelay() view returns (uint64)",
  "function tokenPolicy(address) view returns (bool enabled, uint128 perTxLimit, uint128 dailyLimit)",
  "function recipientActiveAt(address) view returns (uint64)",
  "function remainingToday(address) view returns (uint256)",
  "function requestCount() view returns (uint256)",
  "function getRequest(uint256 id) view returns ((address token, address to, uint256 amount, uint64 createdAt, uint8 status, string memo))",
  "function executeTransfer(address token, address to, uint256 amount, string memo)",
  "function requestTransfer(address token, address to, uint256 amount, string memo) returns (uint256)",
  "function pause()",
  "function unpause()",
  "function approveRequest(uint256 id)",
  "function rejectRequest(uint256 id)",
  "function addRecipient(address recipient)",
  "function removeRecipient(address recipient)",
  "event TransferExecuted(address indexed by, address indexed token, address indexed to, uint256 amount, uint256 requestId, string memo)",
  "event TransferRequested(uint256 indexed id, address indexed token, address indexed to, uint256 amount, string memo)",
  "error NotOwner()",
  "error NotOperator()",
  "error NotOwnerOrOperator()",
  "error WalletPaused()",
  "error ZeroAddress()",
  "error ZeroAmount()",
  "error TokenNotAllowed(address token)",
  "error RecipientNotAllowed(address recipient)",
  "error RecipientNotYetActive(address recipient, uint64 activeAt)",
  "error ExceedsPerTxLimit(uint256 amount, uint256 limit)",
  "error ExceedsDailyLimit(uint256 amount, uint256 remaining)",
  "error InvalidRequest(uint256 id)",
  "error TransferFailed()",
  "error Reentrancy()",
]);

function resolveChain(): Chain {
  if (config.chainId === anvil.id) return anvil;
  if (config.chainId === baseSepolia.id) return baseSepolia;
  return defineChain({
    id: config.chainId,
    name: `chain-${config.chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
}

export const chain = resolveChain();
export const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

function walletClientFor(key: `0x${string}` | undefined, role: string) {
  if (!key) throw new Error(`${role} private key is not configured`);
  return createWalletClient({ chain, transport: http(config.rpcUrl), account: privateKeyToAccount(key) });
}

export const operatorClient = () => walletClientFor(config.operatorKey, "OPERATOR");
export const ownerClient = () => walletClientFor(config.ownerKey, "OWNER");

// ------------------------------------------------------------------ tokens

export interface TokenInfo {
  symbol: string;
  address: Address;
  decimals: number;
}

export function knownTokens(): TokenInfo[] {
  const d = loadDeployment();
  return [
    { symbol: "USDC", address: d.usdc, decimals: 6 },
    { symbol: "ETH", address: zeroAddress, decimals: 18 },
  ];
}

export function tokenBySymbol(symbol: string): TokenInfo | undefined {
  return knownTokens().find((t) => t.symbol.toLowerCase() === symbol.trim().toLowerCase());
}

export function tokenByAddress(address: string): TokenInfo | undefined {
  return knownTokens().find((t) => t.address.toLowerCase() === address.toLowerCase());
}

// ------------------------------------------------------------------- state

export interface TokenState extends TokenInfo {
  balance: bigint;
  enabled: boolean;
  perTxLimit: bigint;
  dailyLimit: bigint;
  remainingToday: bigint;
}

export interface DiscoveredToken {
  address: Address;
  name: string;
  symbol: string;
  balance: bigint;
}

export interface PendingRequest {
  id: number;
  token: Address;
  to: Address;
  amount: bigint;
  createdAt: number;
  status: "pending" | "executed" | "rejected";
  memo: string;
}

export interface WalletState {
  address: Address;
  owner: Address;
  operator: Address;
  paused: boolean;
  recipientDelay: number;
  tokens: TokenState[];
  discovered: DiscoveredToken[];
  requests: PendingRequest[];
  blockTime: number;
}

export interface RecipientStatus {
  address: Address;
  activeAt: number; // 0 = not allowlisted
  active: boolean;
}

const STATUS = ["pending", "executed", "rejected"] as const;

export async function getWalletState(): Promise<WalletState> {
  const d = loadDeployment();
  const w = { address: d.wallet, abi: walletAbi } as const;
  const [owner, operator, paused, recipientDelay, requestCount, block] = await Promise.all([
    publicClient.readContract({ ...w, functionName: "owner" }),
    publicClient.readContract({ ...w, functionName: "operator" }),
    publicClient.readContract({ ...w, functionName: "paused" }),
    publicClient.readContract({ ...w, functionName: "recipientDelay" }),
    publicClient.readContract({ ...w, functionName: "requestCount" }),
    publicClient.getBlock(),
  ]);

  const tokens = await Promise.all(
    knownTokens().map(async (t): Promise<TokenState> => {
      const [policy, remaining, balance] = await Promise.all([
        publicClient.readContract({ ...w, functionName: "tokenPolicy", args: [t.address] }),
        publicClient.readContract({ ...w, functionName: "remainingToday", args: [t.address] }),
        t.address === zeroAddress
          ? publicClient.getBalance({ address: d.wallet })
          : publicClient.readContract({ address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [d.wallet] }),
      ]);
      const [enabled, perTxLimit, dailyLimit] = policy;
      return { ...t, balance, enabled, perTxLimit, dailyLimit, remainingToday: remaining };
    }),
  );

  // Tokens that showed up in the wallet uninvited (airdrops). Their name/symbol
  // are attacker-controlled strings and are treated as untrusted data.
  const discovered: DiscoveredToken[] = [];
  for (const address of [d.poisonToken]) {
    try {
      const [name, symbol, balance] = await Promise.all([
        publicClient.readContract({ address, abi: erc20Abi, functionName: "name" }),
        publicClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
        publicClient.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [d.wallet] }),
      ]);
      if (balance > 0n) discovered.push({ address, name, symbol, balance });
    } catch {
      // token not deployed on this chain
    }
  }

  const requests: PendingRequest[] = [];
  const count = Number(requestCount);
  for (let id = Math.max(0, count - 20); id < count; id++) {
    const r = await publicClient.readContract({ ...w, functionName: "getRequest", args: [BigInt(id)] });
    requests.push({
      id,
      token: r.token,
      to: r.to,
      amount: r.amount,
      createdAt: Number(r.createdAt),
      status: STATUS[r.status] ?? "pending",
      memo: r.memo,
    });
  }

  return {
    address: d.wallet,
    owner,
    operator,
    paused,
    recipientDelay: Number(recipientDelay),
    tokens,
    discovered,
    requests,
    blockTime: Number(block.timestamp),
  };
}

export async function getRecipientStatus(address: Address): Promise<RecipientStatus> {
  const d = loadDeployment();
  const [activeAt, block] = await Promise.all([
    publicClient.readContract({ address: d.wallet, abi: walletAbi, functionName: "recipientActiveAt", args: [address] }),
    publicClient.getBlock(),
  ]);
  const at = Number(activeAt);
  return { address, activeAt: at, active: at !== 0 && at <= Number(block.timestamp) };
}
