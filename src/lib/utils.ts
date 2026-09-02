/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

/** Format seconds to HH:MM:SS */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

/** Get region label from region code */
export function regionLabel(region: string): string {
  const map: Record<string, string> = {
    "eu-west": "Europe West",
    "eu-central": "Europe Central",
    "eu-north": "Europe North",
    "us-east": "US East",
    "us-west": "US West",
    "ap-northeast": "Asia Pacific",
    "ap-southeast": "Asia Pacific",
    "ap-south": "Oceania",
  };
  return map[region] ?? region;
}

/** Get flag emoji for region (using region code heuristics) */
export function regionFlag(nodeId: string): string {
  const prefix = nodeId.split("-")[0];
  const flags: Record<string, string> = {
    AMS: "\u{1F1F3}\u{1F1F1}", // NL
    FRA: "\u{1F1E9}\u{1F1EA}", // DE
    HEL: "\u{1F1EB}\u{1F1EE}", // FI
    NYC: "\u{1F1FA}\u{1F1F8}", // US
    LAX: "\u{1F1FA}\u{1F1F8}", // US
    TKY: "\u{1F1EF}\u{1F1F5}", // JP
    SGP: "\u{1F1F8}\u{1F1EC}", // SG
    SYD: "\u{1F1E6}\u{1F1FA}", // AU
    LON: "\u{1F1EC}\u{1F1E7}", // UK
  };
  return flags[prefix] ?? "";
}
