import type DLMM from "@meteora-ag/dlmm";
import fs from "node:fs/promises";
import path from "node:path";

export async function logInventory(
  dlmm: DLMM,
  inventory: { baseValue: number; quoteValue: number },
) {
  const marketPair = `${dlmm.tokenX.mint.address.toString().slice(0, 4)}-${dlmm.tokenY.mint.address.toString().slice(0, 4)}`;
  const today = new Date()
    .toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" })
    .replaceAll("/", "-");

  const fileName = `balances/${marketPair}/${today}.csv`;

  // Ensure the balances directory exists
  const dir = path.dirname(fileName);
  await fs.mkdir(dir, { recursive: true });

  // Check if file exists, if not create it with headers
  try {
    await fs.access(fileName);
  } catch {
    // File doesn't exist, create it with CSV headers
    const headers = "timestamp,baseValue,quoteValue,totalValue\n";
    await fs.writeFile(fileName, headers);
  }
  // Append the current inventory data
  const timestamp = new Date().toISOString();
  const totalValue = inventory.baseValue + inventory.quoteValue;
  const csvLine = `${timestamp},${inventory.baseValue},${inventory.quoteValue},${totalValue}\n`;
  await fs.appendFile(fileName, csvLine);
}
