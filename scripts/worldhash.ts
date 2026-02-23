import { randomSeedStr } from "../src/lib/seed";
import { worldHash } from "../src/world/worldHash";

const args = process.argv.slice(2);

function getArgValue(names: string[]): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    if (names.includes(args[i])) {
      return args[i + 1];
    }
  }

  return undefined;
}

function parseRadius(raw: string | undefined): number {
  if (raw === undefined) {
    return 2;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error("Invalid --radius value. Expected a non-negative integer.");
  }

  return Number.parseInt(raw, 10);
}

const seed = getArgValue(["--seed", "-s"]) ?? randomSeedStr();

let radius: number;

try {
  radius = parseRadius(getArgValue(["--radius", "-r"]));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const hash = worldHash(seed, radius);
console.log(`${seed}:${radius}: ${hash}`);
