import "server-only";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getPool, queryOne, type Db } from "./db";
import { sha256Hex } from "./crypto";
import { ServiceError } from "./errors";

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export type ImageType = "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp";
export type FilePurpose = "app_logo" | "portal_logo";

const EXTENSIONS: Record<ImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

/**
 * Storage backend:
 *   s3       – Neon Object Storage (private bucket, path-style S3 API)
 *   database – bytes in the `files` table (no bucket needed)
 * Default: s3 when the Neon bucket credentials are present, else database.
 */
export function storageDriver(): "s3" | "database" {
  const explicit = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (explicit === "s3" || explicit === "database") return explicit;
  return process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_ACCESS_KEY_ID ? "s3" : "database";
}

function bucket(): string {
  return process.env.STORAGE_BUCKET?.trim() || "data";
}

const globalForS3 = globalThis as unknown as { __jjS3?: S3Client };

function s3(): S3Client {
  // Endpoint, region and credentials come from the standard AWS_* variables
  // that `neon link` / `neon env pull` write. Neon requires path-style URLs.
  globalForS3.__jjS3 ??= new S3Client({ forcePathStyle: true });
  return globalForS3.__jjS3;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** Things an SVG may not contain: scripts, event handlers, external references, embedded HTML. */
const SVG_FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /<\s*script/i, reason: "scripts" },
  { pattern: /<\s*foreignObject/i, reason: "embedded HTML" },
  { pattern: /<\s*(iframe|embed|object|audio|video|link|meta|base)\b/i, reason: "embedded content" },
  { pattern: /<!ENTITY/i, reason: "XML entities" },
  { pattern: /<!DOCTYPE/i, reason: "a DOCTYPE" },
  { pattern: /\son[a-z]+\s*=/i, reason: "event handlers" },
  { pattern: /javascript\s*:/i, reason: "javascript: links" },
  { pattern: /(?:xlink:)?href\s*=\s*["']\s*(?!#|data:image\/(?:png|jpeg|gif|webp);)/i, reason: "external links" },
  { pattern: /url\(\s*["']?\s*(?!#|data:image\/(?:png|jpeg|gif|webp);)/i, reason: "external resources" },
  { pattern: /@import/i, reason: "style imports" },
];

/**
 * Checks an uploaded image by its content (magic bytes), not by its name or
 * the browser-reported type. Returns the real content type.
 */
export function inspectImage(bytes: Uint8Array): ImageType {
  if (bytes.length === 0) throw new ServiceError("The file is empty.", "logo");
  if (bytes.length > MAX_LOGO_BYTES) throw new ServiceError("The logo must be 2 MB or smaller.", "logo");
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    throw new ServiceError("Upload a PNG, JPG, SVG or WebP image.", "logo");
  }
  const head = text.trimStart().slice(0, 512).toLowerCase();
  const looksSvg = (head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!--")) && /<svg[\s>]/i.test(text);
  if (!looksSvg) throw new ServiceError("Upload a PNG, JPG, SVG or WebP image.", "logo");
  for (const { pattern, reason } of SVG_FORBIDDEN) {
    if (pattern.test(text)) throw new ServiceError(`This SVG contains ${reason}, which is not allowed for security reasons. Export a plain SVG or use PNG.`, "logo");
  }
  return "image/svg+xml";
}

export async function storeImage(
  file: File,
  purpose: FilePurpose,
  actorId: string | null,
  db: Db = getPool(),
): Promise<string> {
  if (file.size > MAX_LOGO_BYTES) throw new ServiceError("The logo must be 2 MB or smaller.", "logo");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = inspectImage(bytes);
  const id = randomUUID();
  const originalName = (file.name || "logo").replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 200);
  const driver = storageDriver();
  let storageKey: string | null = null;
  if (driver === "s3") {
    storageKey = `logos/${purpose}/${id}.${EXTENSIONS[contentType]}`;
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: storageKey,
        Body: bytes,
        ContentType: contentType,
        CacheControl: "private, max-age=31536000, immutable",
      }),
    );
  }
  try {
    await db.query(
      `INSERT INTO files (id, storage, storage_key, data, content_type, size_bytes, sha256, original_name, purpose, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, driver, storageKey, driver === "database" ? Buffer.from(bytes) : null, contentType, bytes.length, sha256Hex(bytes), originalName, purpose, actorId],
    );
  } catch (err) {
    if (storageKey) await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: storageKey })).catch(() => undefined);
    throw err;
  }
  return id;
}

export type StoredFile = { contentType: ImageType; purpose: FilePurpose; body: Uint8Array; sha256: string };

export async function readFile(id: string): Promise<StoredFile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = await queryOne<{ storage: string; storage_key: string | null; data: Buffer | null; content_type: ImageType; purpose: FilePurpose; sha256: string }>(
    "SELECT storage, storage_key, data, content_type, purpose, sha256 FROM files WHERE id = $1",
    [id],
  );
  if (!row) return null;
  if (row.storage === "database") {
    return row.data ? { contentType: row.content_type, purpose: row.purpose, body: new Uint8Array(row.data), sha256: row.sha256 } : null;
  }
  const obj = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: row.storage_key! }));
  const body = await obj.Body?.transformToByteArray();
  return body ? { contentType: row.content_type, purpose: row.purpose, body, sha256: row.sha256 } : null;
}

/**
 * Deletes the file row (inside the caller's transaction) and returns the
 * bucket key to remove afterwards. Removing the object only after the
 * transaction commits means a rollback can never leave a row without its file.
 */
export async function removeFileRow(id: string | null | undefined, db: Db): Promise<string | null> {
  if (!id) return null;
  const row = await queryOne<{ storage: string; storage_key: string | null }>(
    "DELETE FROM files WHERE id = $1 RETURNING storage, storage_key",
    [id],
    db,
  );
  return row?.storage === "s3" ? row.storage_key : null;
}

/** Best-effort removal of bucket objects whose rows are already gone. */
export async function removeStoredObjects(keys: (string | null | undefined)[]): Promise<void> {
  for (const key of keys) {
    if (!key) continue;
    await s3()
      .send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
      .catch((err) => console.error("[files] could not delete object:", (err as Error).message));
  }
}

export async function deleteFile(id: string | null | undefined): Promise<void> {
  const key = await removeFileRow(id, getPool());
  await removeStoredObjects([key]);
}
