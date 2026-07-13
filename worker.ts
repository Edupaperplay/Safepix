import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
import nodeCrypto from 'node:crypto';
import { Buffer } from 'node:buffer';
// @ts-ignore
import manifest from '__STATIC_CONTENT_MANIFEST';
import { Comment, ShareImage, ShareMetadata, AdminLog, SystemLog } from './src/types';

// Define a local KVNamespace interface to satisfy TS compiler outside of worker type context
interface KVNamespace {
  get(key: string, options?: any): Promise<any>;
  put(key: string, value: any, options?: any): Promise<void>;
  delete(key: string): Promise<void>;
}

type Bindings = {
  ACTIVE_SHARES: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// Helper functions for secure persistent key storage in KV
let masterKeyBuffer: Buffer | null = null;

async function getMasterKey(kv: KVNamespace): Promise<Buffer> {
  if (masterKeyBuffer) {
    return masterKeyBuffer;
  }
  const existing = await kv.get("__MASTER_KEY");
  if (existing) {
    masterKeyBuffer = Buffer.from(existing, "hex");
    return masterKeyBuffer;
  }
  const bytes = nodeCrypto.randomBytes(32);
  const hex = bytes.toString("hex");
  await kv.put("__MASTER_KEY", hex);
  masterKeyBuffer = bytes;
  return masterKeyBuffer;
}

// Encryption helpers matching server.ts exactly
function encryptImage(dataUrl: string, masterKey: Buffer) {
  const iv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv("aes-256-gcm", masterKey, iv);
  let encrypted = cipher.update(dataUrl, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return {
    encryptedData: encrypted,
    ivHex: iv.toString("hex"),
    authTagHex: authTag,
  };
}

function decryptImage(encryptedData: string, ivHex: string, authTagHex: string, masterKey: Buffer): string {
  if (!encryptedData || !ivHex || !authTagHex) {
    throw new Error("Missing secure payload elements.");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", masterKey, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function hashPin(pin: string, salt: string): string {
  return nodeCrypto.pbkdf2Sync(pin, salt, 1000, 64, "sha512").toString("hex");
}

// Persistent KV state accessors for admin and system logs
async function getAdminLogs(kv: KVNamespace): Promise<AdminLog[]> {
  try {
    const data = await kv.get("__ADMIN_LOGS");
    if (!data) return [];
    const logs = JSON.parse(data) as AdminLog[];
    
    let mutated = false;
    for (const log of logs) {
      if (log.cleanCopy) {
        const mainImageId = log.id + "-0";
        try {
          await kv.put(`__CLEAN_COPY:${log.id}:${mainImageId}`, log.cleanCopy);
        } catch (e) {
          console.error(`Migration error saving cleanCopy for ${log.id}`, e);
        }
        delete log.cleanCopy;
        mutated = true;
      }
      if (log.cleanCopies) {
        for (const copy of log.cleanCopies) {
          if (copy.cleanCopy) {
            try {
              await kv.put(`__CLEAN_COPY:${log.id}:${copy.id}`, copy.cleanCopy);
            } catch (e) {
              console.error(`Migration error saving cleanCopies item for ${log.id}`, e);
            }
            delete copy.cleanCopy;
            mutated = true;
          }
        }
      }
    }

    if (mutated) {
      await kv.put("__ADMIN_LOGS", JSON.stringify(logs));
    }

    return logs;
  } catch (err) {
    console.error("Failed to parse or migrate admin logs:", err);
    return [];
  }
}

async function saveAdminLogs(kv: KVNamespace, logs: AdminLog[]): Promise<void> {
  try {
    // Strip cleanCopy strings from the logs to prevent KV size limit issues
    const strippedLogs = logs.map(log => {
      const strippedLog = { ...log };
      delete strippedLog.cleanCopy;
      if (strippedLog.cleanCopies) {
        strippedLog.cleanCopies = strippedLog.cleanCopies.map(copy => {
          const strippedCopy = { ...copy };
          delete strippedCopy.cleanCopy;
          return strippedCopy;
        });
      }
      return strippedLog;
    });
    // Cap at 200 admin logs to prevent KV size limit issues
    const capped = strippedLogs.slice(-200);
    await kv.put("__ADMIN_LOGS", JSON.stringify(capped));
  } catch (err) {
    console.error("Failed to save admin logs:", err);
  }
}

async function getSystemLogs(kv: KVNamespace): Promise<SystemLog[]> {
  try {
    const data = await kv.get("__SYSTEM_LOGS");
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error("Failed to parse system logs:", err);
    return [];
  }
}

async function saveSystemLogs(kv: KVNamespace, logs: SystemLog[]): Promise<void> {
  try {
    // Cap at 200 system logs to prevent KV size limit issues
    const capped = logs.slice(-200);
    await kv.put("__SYSTEM_LOGS", JSON.stringify(capped));
  } catch (err) {
    console.error("Failed to save system logs:", err);
  }
}

async function getBlockedIps(kv: KVNamespace): Promise<string[]> {
  try {
    const data = await kv.get("__BLOCKED_IPS");
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error("Failed to parse blocked IPs:", err);
    return [];
  }
}

async function saveBlockedIps(kv: KVNamespace, ips: string[]): Promise<void> {
  await kv.put("__BLOCKED_IPS", JSON.stringify(ips));
}

function getClientIp(c: any): string {
  const req = c.req;
  const cfConnectingIp = req.header("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "127.0.0.1";
}

async function addSystemLog(kv: KVNamespace, action: string, clientIp: string, details: string) {
  const logs = await getSystemLogs(kv);
  const id = nodeCrypto.randomBytes(4).toString("hex");
  
  logs.push({
    id,
    timestamp: new Date().toISOString(),
    clientIp,
    action,
    details,
  });
  await saveSystemLogs(kv, logs);
  console.log(`[SYSTEM LOG] [${action}] ${clientIp} - ${details}`);
}

function validateImageUpload(image: string, filename: string, mimeType: string) {
  const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
  const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

  if (!image || !filename || !mimeType) {
    throw new Error("Missing required upload fields.");
  }

  const normalizedMime = mimeType.toLowerCase();
  if (!allowedMimeTypes.includes(normalizedMime)) {
    throw new Error(`Forbidden file format: ${mimeType}. Only PNG, JPG, WEBP, and GIF are allowed.`);
  }

  const extIndex = filename.lastIndexOf(".");
  if (extIndex === -1) {
    throw new Error("Invalid filename: Missing file extension.");
  }
  const ext = filename.substring(extIndex).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error(`Forbidden file format: ${ext}. Only PNG, JPG, WEBP, and GIF are allowed.`);
  }

  if (image.startsWith("data:")) {
    const match = image.match(/^data:([^;]+);base64,/);
    if (match) {
      const dataMime = match[1].toLowerCase();
      if (!allowedMimeTypes.includes(dataMime)) {
        throw new Error(`Forbidden encoded format: ${dataMime}. Only PNG, JPG, WEBP, and GIF are allowed.`);
      }
    } else {
      throw new Error("Invalid image encoding prefix.");
    }
  }

  const base64Content = image.includes(";base64,") ? image.split(";base64,")[1] : image;
  const sizeInBytes = (base64Content.length * 3) / 4;
  const maxBytes = 10 * 1024 * 1024; // 10MB
  if (sizeInBytes > maxBytes) {
    throw new Error("Image size exceeds the 10MB limit. Max allowed size is 10MB.");
  }
}

function isShareExpired(share: any): boolean {
  if (share.expiresAt) {
    return new Date() > new Date(share.expiresAt);
  }
  return false;
}

async function deleteShare(kv: KVNamespace, id: string, reason: "expiry" | "admin" | "view_limit") {
  const shareData = await kv.get(id);
  if (shareData) {
    try {
      const share = JSON.parse(shareData);
      const images = share.images || [{ id: id + "-0" }];
      for (const img of images) {
        await kv.delete(`__ENCRYPTED_IMAGE:${id}:${img.id}`);
        await kv.delete(`__CLEAN_COPY:${id}:${img.id}`);
      }
    } catch (parseErr) {
      await kv.delete(`__ENCRYPTED_IMAGE:${id}:${id}-0`);
      await kv.delete(`__CLEAN_COPY:${id}:${id}-0`);
    }

    await kv.delete(id);
    
    // Update admin log
    const adminLogs = await getAdminLogs(kv);
    const log = adminLogs.find((l) => l.id === id);
    if (log) {
      log.active = false;
      log.deletedAt = new Date().toISOString();
      await saveAdminLogs(kv, adminLogs);
    }
    console.log(`[CLEANUP] Deleted share ${id} due to ${reason}`);
  }
}

// IP Ban Blocklist Middleware
app.use('*', async (c, next) => {
  const path = c.req.path;
  if (path.startsWith('/api/')) {
    const clientIp = getClientIp(c);
    const blocked = await getBlockedIps(c.env.ACTIVE_SHARES);
    if (blocked.includes(clientIp)) {
      await addSystemLog(c.env.ACTIVE_SHARES, "SECURITY_BLOCKED", clientIp, `Blocked IP attempted intrusion: ${c.req.method} ${path}`);
      return c.json({ error: "Your IP address has been banned by the Administrator due to unethical activity." }, 403);
    }
  }
  await next();
});

// API Routes

app.get('/api/health', async (c) => {
  const kv = c.env.ACTIVE_SHARES;
  const adminLogs = await getAdminLogs(kv);
  return c.json({ status: 'ok', message: 'Worker operational', totalLogs: adminLogs.length });
});

app.post('/api/contact', async (c) => {
  try {
    const { name, email, subject, message } = await c.req.json();
    if (!name || !email || !subject || !message) {
      return c.json({ error: 'All fields are required.' }, 400);
    }
    const clientIp = getClientIp(c);
    const kv = c.env.ACTIVE_SHARES;
    
    await addSystemLog(
      kv,
      "CONTACT_SUBMITTED", 
      clientIp, 
      `Contact from ${name} (${email}) - Subject: ${subject}. Message: ${message.substring(0, 150)}${message.length > 150 ? "..." : ""}`
    );
    
    return c.json({ success: true, message: 'Thank you! Your message has been sent to the SafePix security and support team.' });
  } catch (err: any) {
    return c.json({ error: 'Failed to process contact request.' }, 500);
  }
});

app.post('/api/abuse-report', async (c) => {
  try {
    const { imageUrl, reason, email } = await c.req.json();
    if (!imageUrl || !reason) {
      return c.json({ error: 'Image URL and reason are required.' }, 400);
    }
    const clientIp = getClientIp(c);
    const kv = c.env.ACTIVE_SHARES;
    
    let detectedShareId = "External / Manual Link";
    try {
      const matches = imageUrl.match(/[?&]id=([a-f0-9]{16})/) || imageUrl.match(/#([a-f0-9]{16})/);
      if (matches && matches[1]) {
        detectedShareId = matches[1];
      } else {
        const hexMatch = imageUrl.match(/\b([a-f0-9]{16})\b/);
        if (hexMatch) {
          detectedShareId = hexMatch[1];
        }
      }
    } catch (pErr) {
      // ignore
    }
    
    await addSystemLog(
      kv,
      "ABUSE_REPORT",
      clientIp,
      `Abuse Report: Targeted Share: ${detectedShareId} - Reason: ${reason} - Reporter Email: ${email || "Anonymous"} - Full URL: ${imageUrl}`
    );
    
    return c.json({ 
      success: true, 
      message: 'Thank you for keeping SafePix secure. Our trust and safety team will inspect the reported content immediately and take appropriate action.' 
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to submit abuse report.' }, 500);
  }
});

app.post('/api/upload', async (c) => {
  try {
    const body = await c.req.json();
    const { image, filename, mimeType, timer, pin, commentsEnabled } = body;

    if (!image || !filename || !mimeType || !timer) {
      return c.json({ error: 'Missing required upload fields.' }, 400);
    }

    try {
      validateImageUpload(image, filename, mimeType);
    } catch (valErr: any) {
      return c.json({ error: valErr.message }, 400);
    }

    const id = nodeCrypto.randomBytes(8).toString("hex"); // unique 16 hex chars
    const clientIp = getClientIp(c);
    const timestamp = new Date();
    
    let expiresAt: Date | null = null;
    if (timer === "5m") expiresAt = new Date(timestamp.getTime() + 5 * 60 * 1000);
    else if (timer === "15m") expiresAt = new Date(timestamp.getTime() + 15 * 60 * 1000);
    else if (timer === "1h") expiresAt = new Date(timestamp.getTime() + 60 * 60 * 1000);
    else if (timer === "4h") expiresAt = new Date(timestamp.getTime() + 4 * 60 * 60 * 1000);

    let salt: string | null = null;
    let pinHash: string | null = null;
    if (pin && pin.trim().length > 0) {
      salt = nodeCrypto.randomBytes(16).toString("hex");
      pinHash = hashPin(pin.trim(), salt);
    }

    const masterKey = await getMasterKey(c.env.ACTIVE_SHARES);
    const encrypted = encryptImage(image, masterKey);
    const initialImageId = nodeCrypto.randomBytes(4).toString("hex");

    // Save the encrypted data separately in KV
    await c.env.ACTIVE_SHARES.put(`__ENCRYPTED_IMAGE:${id}:${initialImageId}`, encrypted.encryptedData);

    const share = {
      id,
      filename,
      mimeType,
      ivHex: encrypted.ivHex,
      authTagHex: encrypted.authTagHex,
      images: [
        {
          id: initialImageId,
          filename,
          mimeType,
          ivHex: encrypted.ivHex,
          authTagHex: encrypted.authTagHex,
        }
      ],
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      timer,
      commentsEnabled: !!commentsEnabled,
      comments: [],
      pinHash,
      salt,
      viewsCount: 0,
      createdAt: timestamp.toISOString(),
    };

    const ttlSeconds = expiresAt ? Math.floor((expiresAt.getTime() - timestamp.getTime()) / 1000) : undefined;
    const putOptions: any = {};
    if (ttlSeconds !== undefined && ttlSeconds >= 60) {
      putOptions.expirationTtl = ttlSeconds;
    }
    await c.env.ACTIVE_SHARES.put(id, JSON.stringify(share), putOptions);

    // Save the unencrypted clean copy separately for administrative auditing
    await c.env.ACTIVE_SHARES.put(`__CLEAN_COPY:${id}:${initialImageId}`, image);

    const adminLogs = await getAdminLogs(c.env.ACTIVE_SHARES);
    adminLogs.push({
      id,
      filename,
      mimeType,
      size: image.length,
      timestamp: timestamp.toISOString(),
      clientIp,
      timerSetting: timer,
      hasPin: !!pinHash,
      active: true,
      cleanCopies: [
        {
          id: initialImageId,
          filename,
          mimeType,
          size: image.length,
        }
      ],
      deletedAt: null,
    });
    await saveAdminLogs(c.env.ACTIVE_SHARES, adminLogs);

    await addSystemLog(
      c.env.ACTIVE_SHARES, 
      "UPLOAD_SHARE", 
      clientIp, 
      `Created secure share ${id} (${filename}, timer: ${timer}, pin-locked: ${!!pinHash})`
    );

    return c.json({ 
      success: true, 
      id, 
      expiresAt: expiresAt ? expiresAt.toISOString() : null 
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to upload image. ' + err.message }, 500);
  }
});

app.get('/api/share/:id', async (c) => {
  const id = c.req.param('id');
  const kv = c.env.ACTIVE_SHARES;
  const shareData = await kv.get(id);
  
  if (!shareData) {
    return c.json({ error: "Image not found or has been self-destructed." }, 404);
  }
  
  const share = JSON.parse(shareData);

  if (isShareExpired(share)) {
    await deleteShare(kv, id, "expiry");
    return c.json({ error: "This image has expired and is self-destructed." }, 410);
  }

  const metadata: ShareMetadata = {
    id: share.id,
    filename: share.filename,
    mimeType: share.mimeType,
    expiresAt: share.expiresAt,
    timer: share.timer,
    commentsEnabled: share.commentsEnabled,
    comments: share.comments || [],
    hasPin: !!share.pinHash,
    isExpired: false,
    createdAt: share.createdAt,
    viewsCount: share.viewsCount,
    images: share.images ? share.images.map((img: any) => ({
      id: img.id,
      filename: img.filename,
      mimeType: img.mimeType,
    })) : [{ id: share.id + "-0", filename: share.filename, mimeType: share.mimeType }],
  };

  return c.json(metadata);
});

app.post('/api/share/:id/view', async (c) => {
  try {
    const id = c.req.param('id');
    const { pin } = await c.req.json();
    const kv = c.env.ACTIVE_SHARES;
    const shareData = await kv.get(id);

    if (!shareData) {
      return c.json({ error: "Image not found or has been self-destructed." }, 404);
    }

    const share = JSON.parse(shareData);

    if (isShareExpired(share)) {
      await deleteShare(kv, id, "expiry");
      return c.json({ error: "This image has expired and is self-destructed." }, 410);
    }

    if (share.pinHash && share.salt) {
      if (!pin) {
        return c.json({ error: "PIN is required to view this image.", pinRequired: true }, 401);
      }
      const submittedHash = hashPin(pin.trim(), share.salt);
      if (submittedHash !== share.pinHash) {
        await addSystemLog(kv, "DECRYPT_AUTH_FAILED", getClientIp(c), `Incorrect symmetric PIN submitted for share: ${id}`);
        return c.json({ error: "Incorrect PIN. Access Denied." }, 403);
      }
    }

    const masterKey = await getMasterKey(kv);
    
    // Graceful fallback for root-level encrypted components if missing
    let rootEncryptedData = share.encryptedData || (share.images && share.images[0]?.encryptedData);
    if (!rootEncryptedData) {
      rootEncryptedData = (await kv.get(`__ENCRYPTED_IMAGE:${id}:${id}-0`)) || (share.images && (await kv.get(`__ENCRYPTED_IMAGE:${id}:${share.images[0].id}`)));
    }
    const rootIvHex = share.ivHex || (share.images && share.images[0]?.ivHex);
    const rootAuthTagHex = share.authTagHex || (share.images && share.images[0]?.authTagHex);

    let decryptedData = "";
    if (rootEncryptedData && rootIvHex && rootAuthTagHex) {
      try {
        decryptedData = decryptImage(rootEncryptedData, rootIvHex, rootAuthTagHex, masterKey);
      } catch (err: any) {
        console.error("Error decrypting master/first image:", err);
      }
    }

    if (!decryptedData) {
      return c.json({ error: "Failed to decrypt secure image payload. Decryption key mismatch or missing payload parts." }, 500);
    }

    const defaultImg = [{
      id: id + "-0",
      filename: share.filename,
      mimeType: share.mimeType,
      ivHex: rootIvHex,
      authTagHex: rootAuthTagHex,
    }];

    const decryptedImagesList = [];
    const imagesToDecrypt = share.images || defaultImg;
    for (const img of imagesToDecrypt) {
      try {
        const iv = img.ivHex || rootIvHex;
        const tag = img.authTagHex || rootAuthTagHex;
        
        let encData = img.encryptedData;
        if (!encData) {
          encData = await kv.get(`__ENCRYPTED_IMAGE:${id}:${img.id}`);
        }
        if (!encData && img.id === id + "-0") {
          encData = rootEncryptedData || (await kv.get(`__ENCRYPTED_IMAGE:${id}:${id}-0`));
        }
        
        if (!encData) {
          throw new Error(`Encrypted payload not found for image ${img.id}`);
        }
        
        const data = decryptImage(encData, iv, tag, masterKey);
        decryptedImagesList.push({
          id: img.id,
          filename: img.filename,
          mimeType: img.mimeType,
          data,
        });
      } catch (err: any) {
        console.error(`Error decrypting image ${img.id}:`, err);
      }
    }

    if (decryptedImagesList.length === 0) {
      return c.json({ error: "Failed to decrypt any secure image payload." }, 500);
    }

    share.viewsCount += 1;
    await kv.put(id, JSON.stringify(share));

    const clientIp = getClientIp(c);
    await addSystemLog(kv, "VIEW_DECRYPT", clientIp, `Successfully decrypted & viewed share ${id} (total views: ${share.viewsCount})`);

    const limitReached = false;

    return c.json({
      image: decryptedData,
      images: decryptedImagesList,
      viewsCount: share.viewsCount,
      selfDestructedNow: limitReached,
      clientIp,
    });
  } catch (err: any) {
    console.error("View decrypt error:", err);
    return c.json({ error: "Failed to decrypt secure image payload." }, 500);
  }
});

app.post('/api/share/:id/add-photo', async (c) => {
  try {
    const id = c.req.param('id');
    const { image, filename, mimeType, pin } = await c.req.json();
    const kv = c.env.ACTIVE_SHARES;

    if (!image || !filename || !mimeType) {
      return c.json({ error: 'Missing required upload fields.' }, 400);
    }

    try {
      validateImageUpload(image, filename, mimeType);
    } catch (valErr: any) {
      return c.json({ error: valErr.message }, 400);
    }

    const shareData = await kv.get(id);
    if (!shareData) {
      return c.json({ error: 'Image session not found or has been self-destructed.' }, 404);
    }
    
    const share = JSON.parse(shareData);

    if (isShareExpired(share)) {
      await deleteShare(kv, id, "expiry");
      return c.json({ error: "This session has expired and is self-destructed." }, 410);
    }

    if (share.pinHash && share.salt) {
      if (!pin) {
        return c.json({ error: "PIN is required to add photo to this session.", pinRequired: true }, 401);
      }
      const submittedHash = hashPin(pin.trim(), share.salt);
      if (submittedHash !== share.pinHash) {
        return c.json({ error: "Incorrect PIN. Access Denied." }, 403);
      }
    }

    const masterKey = await getMasterKey(kv);
    const encrypted = encryptImage(image, masterKey);
    const imageId = nodeCrypto.randomBytes(4).toString("hex");

    // Save the new encrypted data separately in KV
    await kv.put(`__ENCRYPTED_IMAGE:${id}:${imageId}`, encrypted.encryptedData);

    const newImageItem = {
      id: imageId,
      filename,
      mimeType,
      ivHex: encrypted.ivHex,
      authTagHex: encrypted.authTagHex,
    };

    if (!share.images) {
      share.images = [
        {
          id: id + "-0",
          filename: share.filename,
          mimeType: share.mimeType,
          ivHex: share.ivHex || share.images?.[0]?.ivHex,
          authTagHex: share.authTagHex || share.images?.[0]?.authTagHex,
        }
      ];
      if (share.encryptedData) {
        await kv.put(`__ENCRYPTED_IMAGE:${id}:${id}-0`, share.encryptedData);
      }
    }

    // Move any existing legacy inline image data to separate KV keys and clear them
    if (share.encryptedData) {
      await kv.put(`__ENCRYPTED_IMAGE:${id}:${id}-0`, share.encryptedData);
      delete share.encryptedData;
    }

    for (const img of share.images) {
      if (img.encryptedData) {
        await kv.put(`__ENCRYPTED_IMAGE:${id}:${img.id}`, img.encryptedData);
        delete img.encryptedData;
      }
    }

    share.images.push(newImageItem);
    await kv.put(id, JSON.stringify(share));

    // Save the new unencrypted clean copy separately for administrative auditing
    await kv.put(`__CLEAN_COPY:${id}:${imageId}`, image);

    const adminLogs = await getAdminLogs(kv);
    const adminLog = adminLogs.find(log => log.id === id);
    if (adminLog) {
      if (!adminLog.cleanCopies) {
        adminLog.cleanCopies = [
          {
            id: id + "-0",
            filename: adminLog.filename,
            mimeType: adminLog.mimeType,
            size: adminLog.size,
          }
        ];
        // If there was an inline legacy copy, save it to clean copy KV store for safety
        if (adminLog.cleanCopy) {
          await kv.put(`__CLEAN_COPY:${id}:${id}-0`, adminLog.cleanCopy);
          delete adminLog.cleanCopy;
        }
      }
      adminLog.cleanCopies.push({
        id: imageId,
        filename,
        mimeType,
        size: image.length,
      });
      adminLog.size += image.length; // cumulative size
      await saveAdminLogs(kv, adminLogs);
    }

    const clientIp = getClientIp(c);
    await addSystemLog(kv, "ADD_PHOTO", clientIp, `Added photo ${imageId} (${filename}) to share ${id}`);

    return c.json({
      success: true,
      imageId,
      imagesCount: share.images.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to add photo. ' + err.message }, 500);
  }
});

app.delete('/api/share/:id', async (c) => {
  const id = c.req.param('id');
  const kv = c.env.ACTIVE_SHARES;
  const shareData = await kv.get(id);
  
  if (!shareData) {
    return c.json({ error: "Image already deleted or not found." }, 404);
  }
  
  const clientIp = getClientIp(c);
  await addSystemLog(kv, "DELETE_SHARE", clientIp, `User self-destructed share: ${id}`);
  await deleteShare(kv, id, "admin");
  return c.json({ success: true, message: "Image self-destructed immediately." });
});

app.post('/api/share/:id/comment', async (c) => {
  try {
    const id = c.req.param('id');
    const { nickname, text, x, y, imageId } = await c.req.json();
    const kv = c.env.ACTIVE_SHARES;
    const shareData = await kv.get(id);
    
    if (!shareData) {
      return c.json({ error: "Image not found or self-destructed." }, 404);
    }
    
    const share = JSON.parse(shareData);

    if (!share.commentsEnabled) {
      return c.json({ error: "Comments are disabled for this image." }, 400);
    }

    if (isShareExpired(share)) {
      await deleteShare(kv, id, "expiry");
      return c.json({ error: "Image has expired." }, 410);
    }
    
    const commentId = nodeCrypto.randomBytes(4).toString("hex");
    const comment: Comment = {
      id: commentId,
      nickname: (nickname && nickname.trim().length > 0) ? nickname.trim() : "Anonymous",
      text: text || "",
      timestamp: new Date().toISOString(),
      x: typeof x === "number" ? x : undefined,
      y: typeof y === "number" ? y : undefined,
      imageId: imageId || undefined,
    };
    
    if (!share.comments) share.comments = [];
    share.comments.push(comment);
    await kv.put(id, JSON.stringify(share));
    
    const clientIp = getClientIp(c);
    await addSystemLog(kv, "ADD_COMMENT", clientIp, `Comment posted by "${comment.nickname}" on share ${id}: "${text.substring(0, 30)}${text.length > 30 ? "..." : ""}"`);

    return c.json({ success: true, comments: share.comments });
  } catch (err: any) {
    return c.json({ error: "Failed to post comment." }, 500);
  }
});

// Admin endpoints

app.post('/api/admin/logs', async (c) => {
  try {
    const { passcode } = await c.req.json();
    const kv = c.env.ACTIVE_SHARES;
    const clientIp = getClientIp(c);
    const ADMIN_PASSCODE = "admin123";

    if (!passcode || passcode !== ADMIN_PASSCODE) {
      await addSystemLog(kv, "ADMIN_LOGIN_FAILED", clientIp, "Attempted unauthorized access to Admin Terminal.");
      return c.json({ error: "Unauthorized. Invalid administrative passcode." }, 403);
    }

    await addSystemLog(kv, "ADMIN_LOGIN_SUCCESS", clientIp, "Authorized Admin Terminal session opened.");

    const logs = await getAdminLogs(kv);
    const systemLogsList = await getSystemLogs(kv);
    const blockedIpsList = await getBlockedIps(kv);

    const mappedLogs = await Promise.all(logs.map(async (log: any) => {
      const activeData = await kv.get(log.id);
      return {
        ...log,
        active: !!activeData,
      };
    }));

    return c.json({
      success: true,
      logs: mappedLogs,
      systemLogs: systemLogsList,
      blockedIps: blockedIpsList
    });
  } catch (err: any) {
    return c.json({ error: "Failed to retrieve logs." }, 500);
  }
});

app.post('/api/admin/clean-copy', async (c) => {
  try {
    const { passcode, shareId, imageId } = await c.req.json();
    const kv = c.env.ACTIVE_SHARES;
    const ADMIN_PASSCODE = "admin123";

    if (!passcode || passcode !== ADMIN_PASSCODE) {
      return c.json({ error: "Unauthorized." }, 403);
    }

    if (!shareId || !imageId) {
      return c.json({ error: "shareId and imageId are required." }, 400);
    }

    // Try dedicated __CLEAN_COPY key
    let cleanCopy = await kv.get(`__CLEAN_COPY:${shareId}:${imageId}`);

    // Fallback to legacy logs inside __ADMIN_LOGS if not found separately
    if (!cleanCopy) {
      const logs = await getAdminLogs(kv);
      const log = logs.find((l: any) => l.id === shareId);
      if (log) {
        if (imageId === shareId + "-0" && log.cleanCopy) {
          cleanCopy = log.cleanCopy;
        } else if (log.cleanCopies) {
          const copy = log.cleanCopies.find((c: any) => c.id === imageId);
          if (copy && copy.cleanCopy) {
            cleanCopy = copy.cleanCopy;
          }
        }
      }
    }

    if (!cleanCopy) {
      return c.json({ error: "Prinstine administrative copy not found." }, 404);
    }

    return c.json({ success: true, cleanCopy });
  } catch (err: any) {
    return c.json({ error: "Failed to retrieve clean copy. " + err.message }, 500);
  }
});

app.post('/api/admin/delete/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { passcode } = await c.req.json();
    const kv = c.env.ACTIVE_SHARES;
    const clientIp = getClientIp(c);
    const ADMIN_PASSCODE = "admin123";

    if (!passcode || passcode !== ADMIN_PASSCODE) {
      await addSystemLog(kv, "ADMIN_ACTION_FAILED", clientIp, `Unauthorized force-delete attempt on share: ${id}`);
      return c.json({ error: "Unauthorized." }, 403);
    }

    const shareData = await kv.get(id);
    if (shareData) {
      await addSystemLog(kv, "FORCE_DELETE_SHARE", clientIp, `Administrator forcefully purged share: ${id}`);
      await deleteShare(kv, id, "admin");
      return c.json({ success: true, message: "Share forcefully deleted by Administrator." });
    } else {
      return c.json({ error: "Share not found or already deleted." }, 404);
    }
  } catch (err: any) {
    return c.json({ error: "Failed to delete share." }, 500);
  }
});

app.post('/api/admin/block-ip', async (c) => {
  try {
    const { passcode, ip } = await c.req.json();
    const kv = c.env.ACTIVE_SHARES;
    const clientIp = getClientIp(c);
    const ADMIN_PASSCODE = "admin123";

    if (!passcode || passcode !== ADMIN_PASSCODE) {
      await addSystemLog(kv, "ADMIN_ACTION_FAILED", clientIp, `Unauthorized attempt to block IP: ${ip}`);
      return c.json({ error: "Unauthorized." }, 403);
    }

    if (!ip || ip.trim().length === 0) {
      return c.json({ error: "IP address is required." }, 400);
    }

    const normalizedIp = ip.trim();
    const blockedList = await getBlockedIps(kv);
    if (!blockedList.includes(normalizedIp)) {
      blockedList.push(normalizedIp);
      await saveBlockedIps(kv, blockedList);
    }

    await addSystemLog(kv, "IP_BLOCKED", clientIp, `Administrator banned IP address: ${normalizedIp}`);

    return c.json({
      success: true,
      message: `IP ${normalizedIp} blocked successfully.`,
      blockedIps: blockedList
    });
  } catch (err: any) {
    return c.json({ error: "Failed to block IP." }, 500);
  }
});

app.post('/api/admin/unblock-ip', async (c) => {
  try {
    const { passcode, ip } = await c.req.json();
    const kv = c.env.ACTIVE_SHARES;
    const clientIp = getClientIp(c);
    const ADMIN_PASSCODE = "admin123";

    if (!passcode || passcode !== ADMIN_PASSCODE) {
      await addSystemLog(kv, "ADMIN_ACTION_FAILED", clientIp, `Unauthorized attempt to unblock IP: ${ip}`);
      return c.json({ error: "Unauthorized." }, 403);
    }

    if (!ip || ip.trim().length === 0) {
      return c.json({ error: "IP address is required." }, 400);
    }

    const normalizedIp = ip.trim();
    let blockedList = await getBlockedIps(kv);
    blockedList = blockedList.filter(item => item !== normalizedIp);
    await saveBlockedIps(kv, blockedList);

    await addSystemLog(kv, "IP_UNBLOCKED", clientIp, `Administrator unbanned IP address: ${normalizedIp}`);

    return c.json({
      success: true,
      message: `IP ${normalizedIp} unblocked successfully.`,
      blockedIps: blockedList
    });
  } catch (err: any) {
    return c.json({ error: "Failed to unblock IP." }, 500);
  }
});

// Serve frontend for all other requests with SPA routing fallback to index.html
app.get('/*', serveStatic({
  manifest,
  rewriteRequestPath: (path) => {
    // If the path is an API endpoint, let Hono route it normally
    if (path.startsWith('/api')) {
      return path;
    }
    // If the path doesn't contain a file extension, fallback to index.html
    if (!path.includes('.')) {
      return '/index.html';
    }
    return path;
  }
}));

export default app;
