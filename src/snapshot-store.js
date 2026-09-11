import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { snapshotAt } from "./cost-engine.js";

export class JsonSnapshotStore {
  constructor(directory = ".cost-snapshots") { this.directory = directory; }
  async create(snapshot) {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `${snapshot.id}.json`);
    await writeFile(path, JSON.stringify(snapshot, null, 2), { flag: "wx" });
    return snapshot;
  }
  async get(id, now = new Date()) {
    const snapshot = JSON.parse(await readFile(join(this.directory, `${id}.json`), "utf8"));
    return snapshotAt(snapshot, now);
  }
  async getCurrent(id, now = new Date()) {
    const snapshot = await this.get(id, now);
    if (snapshot.status === "expired") throw new Error("Cost snapshot has expired; refresh to obtain a current quote");
    return snapshot;
  }
}
