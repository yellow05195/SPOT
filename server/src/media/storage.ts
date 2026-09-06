import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

/** Stockage objet des images TRAITÉES uniquement. La suppression est réelle (spec 1.5). */
export interface ObjectStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, Buffer>();
  async put(key: string, body: Buffer): Promise<void> {
    this.objects.set(key, body);
  }
  async get(key: string): Promise<Buffer | null> {
    return this.objects.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
  publicUrl(key: string): string {
    return `memory://${key}`;
  }
}

/** Dev local : n'écrit que des images déjà traitées. */
export class FsObjectStore implements ObjectStore {
  constructor(
    private readonly dir: string,
    private readonly baseUrl: string,
  ) {}
  async put(key: string, body: Buffer): Promise<void> {
    const file = path.join(this.dir, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  async get(key: string): Promise<Buffer | null> {
    return readFile(path.join(this.dir, key)).catch(() => null);
  }
  async delete(key: string): Promise<void> {
    await unlink(path.join(this.dir, key)).catch(() => undefined);
  }
  publicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}

export class S3ObjectStore implements ObjectStore {
  private readonly client: S3Client;
  constructor(
    private readonly bucket: string,
    private readonly baseUrl: string,
    endpoint?: string,
    region?: string,
  ) {
    this.client = new S3Client({ ...(endpoint ? { endpoint, forcePathStyle: true } : {}), ...(region ? { region } : {}) });
  }
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  publicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}

export function imageKey(wallet: string, sha256: string): string {
  return `fiches/${wallet.toLowerCase()}/${sha256.slice(2, 18)}.webp`;
}
