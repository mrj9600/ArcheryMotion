import { Injectable } from '@angular/core';
import Dexie, { EntityTable } from 'dexie';
import { Archer, EquipmentSetup, SampleChunk, Session, ShotRecord } from './models';

class ArcheryMotionDb extends Dexie {
  archers!: EntityTable<Archer, 'id'>;
  setups!: EntityTable<EquipmentSetup, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  shots!: EntityTable<ShotRecord, 'id'>;
  chunks!: EntityTable<SampleChunk, 'id'>;

  constructor() {
    super('archery-motion');
    this.version(1).stores({
      archers: 'id, name',
      setups: 'id, archerId',
      sessions: 'id, archerId, startedAt',
      shots: 'id, sessionId, [sessionId+number]',
      chunks: '++id, sessionId, [sessionId+sensorIndex+seq]',
    });
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Local storage of profiles, equipment and recordings (IndexedDB). */
@Injectable({ providedIn: 'root' })
export class Db {
  readonly db = new ArcheryMotionDb();

  /** Asks the browser not to evict the data when space runs low. */
  async requestPersistence(): Promise<boolean> {
    try {
      return (await navigator.storage?.persist?.()) ?? false;
    } catch {
      return false;
    }
  }

  archers(): Promise<Archer[]> {
    return this.db.archers.orderBy('name').toArray();
  }

  saveArcher(archer: Archer): Promise<string> {
    return this.db.archers.put(archer);
  }

  /** Deletes the archer with all equipment and sessions. */
  async deleteArcher(id: string): Promise<void> {
    const sessions = await this.db.sessions.where('archerId').equals(id).primaryKeys();
    for (const s of sessions) await this.deleteSession(s);
    await this.db.setups.where('archerId').equals(id).delete();
    await this.db.archers.delete(id);
  }

  setups(archerId: string): Promise<EquipmentSetup[]> {
    return this.db.setups.where('archerId').equals(archerId).sortBy('createdAt');
  }

  saveSetup(setup: EquipmentSetup): Promise<string> {
    return this.db.setups.put(setup);
  }

  deleteSetup(id: string): Promise<void> {
    return this.db.setups.delete(id);
  }

  sessions(): Promise<Session[]> {
    return this.db.sessions.orderBy('startedAt').reverse().toArray();
  }

  session(id: string): Promise<Session | undefined> {
    return this.db.sessions.get(id);
  }

  saveSession(session: Session): Promise<string> {
    return this.db.sessions.put(session);
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.sessions, this.db.shots, this.db.chunks, async () => {
      await this.db.chunks.where('sessionId').equals(id).delete();
      await this.db.shots.where('sessionId').equals(id).delete();
      await this.db.sessions.delete(id);
    });
  }

  shots(sessionId: string): Promise<ShotRecord[]> {
    return this.db.shots.where('[sessionId+number]').between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey]).toArray();
  }

  saveShot(shot: ShotRecord): Promise<string> {
    return this.db.shots.put(shot);
  }

  addChunk(chunk: SampleChunk): Promise<number> {
    return this.db.chunks.add(chunk) as Promise<number>;
  }

  /** All chunks of one sensor in order. */
  chunks(sessionId: string, sensorIndex: number): Promise<SampleChunk[]> {
    return this.db.chunks
      .where('[sessionId+sensorIndex+seq]')
      .between([sessionId, sensorIndex, Dexie.minKey], [sessionId, sensorIndex, Dexie.maxKey])
      .toArray();
  }
}
