import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonlSnapshotRepository {
  constructor(path) { this.path = path; }
  async save(snapshot) {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(snapshot)}\n`, { encoding: "utf8", flag: "a" });
    return snapshot;
  }
  async all() {
    try { return (await readFile(this.path, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
  }
}

export class MemorySnapshotRepository {
  snapshots = [];
  async save(snapshot) { this.snapshots.push(structuredClone(snapshot)); return snapshot; }
  async all() { return structuredClone(this.snapshots); }
}
