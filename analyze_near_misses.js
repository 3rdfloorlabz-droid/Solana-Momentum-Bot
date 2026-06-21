const fs = require("fs");

const NEAR_MISS_FILE = "near_misses.json";

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];

  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const misses = readJsonLines(NEAR_MISS_FILE);

console.log("\n=== NEAR MISS AGENT ===");

console.log("\n=== HIGH SCORE REJECTION BREAKDOWN ===");

console.log("\n=== MOST FREQUENT HIGH SCORE REJECTS ===");

console.log("\n=== HIGH SCORE REJECTS BY MARKET CAP ===");

misses
  .filter(m => Number(m.score || 0) >= 85)
  .sort((a,b) => Number(b.marketCap || 0) - Number(a.marketCap || 0))
  .slice(0,20)
  .forEach(m => {
    console.log(
      `${m.symbol} | Score ${m.score} | MC $${Math.round(m.marketCap).toLocaleString()} | ${m.reason}`
    );
  });

const freq = {};

for (const m of misses.filter(x => Number(x.score || 0) >= 85)) {
  const key = m.symbol;

  freq[key] = (freq[key] || 0) + 1;
}

Object.entries(freq)
  .sort((a,b) => b[1] - a[1])
  .slice(0,20)
  .forEach(([symbol,count]) => {
    console.log(`${symbol} | ${count}`);
  });

const high = misses.filter(m => Number(m.score || 0) >= 85);

const breakdown = {};

for (const m of high) {
  const reason = m.reason.split(":")[0];

  breakdown[reason] = (breakdown[reason] || 0) + 1;
}

Object.entries(breakdown)
  .sort((a,b) => b[1] - a[1])
  .forEach(([reason,count]) => {
    console.log(`${count} | ${reason}`);
  });

console.log(`Total Near Misses: ${misses.length}`);

console.log("\n=== HIGH SCORE REJECTS (85+) ===");

misses
  .filter(m => Number(m.score || 0) >= 85)
  .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
  .slice(0, 25)
  .forEach(m => {
    console.log(
      `${m.symbol} | Score ${m.score} | ${m.reason}`
    );
  });

console.log("\n=== REJECTION REASONS ===");

const reasons = {};

for (const m of misses) {
  reasons[m.reason] = (reasons[m.reason] || 0) + 1;
}

Object.entries(reasons)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([reason, count]) => {
    console.log(`${count} | ${reason}`);
  });