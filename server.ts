import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { Comment, ShareMetadata, AdminLog, SystemLog } from "./src/types.js";

// Active Shares Store (Viewer-facing: Ephemeral & Encrypted)
interface EncryptedImageItem {
  id: string;
  filename: string;
  mimeType: string;
  encryptedData: string;
  ivHex: string;
  authTagHex: string;
}

interface ActiveShareInternal {
  id: string;
  filename: string;
  mimeType: string;
  encryptedData: string;
  ivHex: string;
  authTagHex: string;
  images: EncryptedImageItem[];
  expiresAt: Date | null; // null for '1view' until viewed
  timer: '5m' | '15m' | '1h' | '4h';
  commentsEnabled: boolean;
  comments: Comment[];
  pinHash: string | null;
  salt: string | null;
  viewsCount: number;
  createdAt: Date;
}

const activeShares = new Map<string, ActiveShareInternal>();
const cleanCopiesStore = new Map<string, string>();

// Admin Logs Store (Durable backend tracking - preserves clean copies for security auditing)
const adminLogs: AdminLog[] = [];

// System Activity and Security Auditing Logs
const systemLogs: SystemLog[] = [];

// Blocked Unethical IP Restrictors Set
const blockedIps = new Set<string>();

// Helper to log system/security events securely
function addSystemLog(action: string, clientIp: string, details: string) {
  systemLogs.push({
    id: crypto.randomBytes(4).toString("hex"),
    timestamp: new Date().toISOString(),
    clientIp,
    action,
    details,
  });
  console.log(`[SYSTEM LOG] [${action}] ${clientIp} - ${details}`);
}

// Encryption helper
const MASTER_ENCRYPTION_KEY = crypto.randomBytes(32); // Rotates on server restart for security

function encryptImage(dataUrl: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", MASTER_ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(dataUrl, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return {
    encryptedData: encrypted,
    ivHex: iv.toString("hex"),
    authTagHex: authTag,
  };
}

function decryptImage(encryptedData: string, ivHex: string, authTagHex: string): string {
  if (!encryptedData || !ivHex || !authTagHex) {
    throw new Error("Missing secure payload elements.");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", MASTER_ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// PIN hashing helper
function hashPin(pin: string, salt: string): string {
  return crypto.pbkdf2Sync(pin, salt, 1000, 64, "sha512").toString("hex");
}

// Helper to extract client IP address accurately in cloud/proxy settings
function getClientIp(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = (typeof forwarded === "string" ? forwarded : forwarded[0]).split(",");
    return ips[0].trim();
  }
  return req.socket.remoteAddress || req.ip || "127.0.0.1";
}

// Check expiration of a share and perform delete if needed
function isShareExpired(share: ActiveShareInternal): boolean {
  if (share.expiresAt && new Date() > share.expiresAt) {
    return true;
  }
  return false;
}

// Strict Image Format and Size Validation Helper
function validateImageUpload(image: string, filename: string, mimeType: string) {
  const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
  const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

  if (!image || !filename || !mimeType) {
    throw new Error("Missing required upload fields.");
  }

  // 1. Validate MIME type parameter
  const normalizedMime = mimeType.toLowerCase();
  if (!allowedMimeTypes.includes(normalizedMime)) {
    throw new Error(`Forbidden file format: ${mimeType}. Only PNG, JPG, WEBP, and GIF are allowed.`);
  }

  // 2. Validate file extension of filename
  const extIndex = filename.lastIndexOf(".");
  if (extIndex === -1) {
    throw new Error("Invalid filename: Missing file extension.");
  }
  const ext = filename.substring(extIndex).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error(`Forbidden file format: ${ext}. Only PNG, JPG, WEBP, and GIF are allowed.`);
  }

  // 3. Validate image string prefix if it contains the actual mime
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

  // 4. Calculate exact binary size from the base64 string
  const base64Content = image.includes(";base64,") ? image.split(";base64,")[1] : image;
  const sizeInBytes = (base64Content.length * 3) / 4;
  const maxBytes = 10 * 1024 * 1024; // 10MB
  if (sizeInBytes > maxBytes) {
    throw new Error("Image size exceeds the 10MB limit. Max allowed size is 10MB.");
  }
}

// Clean up expired uploads
function deleteShare(id: string, reason: "expiry" | "admin" | "view_limit") {
  const share = activeShares.get(id);
  if (share) {
    activeShares.delete(id);
    
    // Update admin log
    const log = adminLogs.find((l) => l.id === id);
    if (log) {
      log.active = false;
      log.deletedAt = new Date().toISOString();
    }
    console.log(`[CLEANUP] Deleted share ${id} due to ${reason}`);
  }
}

// Background cleanup interval (runs every 5 seconds)
setInterval(() => {
  const now = new Date();
  for (const [id, share] of activeShares.entries()) {
    if (isShareExpired(share)) {
      deleteShare(id, "expiry");
    }
  }
}, 5000);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // Increase payload size limit to accommodate base64 image data (up to 50MB)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Strict Security Middleware: IP Blocklist & Audit Filter
  app.use((req, res, next) => {
    const clientIp = getClientIp(req);
    if (blockedIps.has(clientIp)) {
      if (req.path.startsWith("/api/")) {
        // Log the intrusion attempt
        addSystemLog("SECURITY_BLOCKED", clientIp, `Blocked IP attempted intrusion: ${req.method} ${req.path}`);
        return res.status(403).json({ error: "Your IP address has been banned by the Administrator due to unethical activity." });
      }
    }
    next();
  });

  // API: Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", activeShares: activeShares.size, totalLogs: adminLogs.length });
  });

  // API: Contact Form Submission
  app.post("/api/contact", (req, res) => {
    try {
      const { name, email, subject, message } = req.body;
      if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: "All fields are required." });
      }
      const clientIp = getClientIp(req);
      
      addSystemLog(
        "CONTACT_SUBMITTED", 
        clientIp, 
        `Contact from ${name} (${email}) - Subject: ${subject}. Message: ${message.substring(0, 150)}${message.length > 150 ? "..." : ""}`
      );
      
      res.json({ success: true, message: "Thank you! Your message has been sent to the SafePix security and support team." });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to process contact request." });
    }
  });

  // API: Abuse Reporting Form
  app.post("/api/abuse-report", (req, res) => {
    try {
      const { imageUrl, reason, email } = req.body;
      if (!imageUrl || !reason) {
        return res.status(400).json({ error: "Image URL and reason are required." });
      }
      const clientIp = getClientIp(req);
      
      // Try to parse the share ID if it is a local URL
      let detectedShareId = "External / Manual Link";
      try {
        const matches = imageUrl.match(/[?&]id=([a-f0-9]{16})/) || imageUrl.match(/#([a-f0-9]{16})/);
        if (matches && matches[1]) {
          detectedShareId = matches[1];
        } else {
          // Check for hex string of 16 characters in URL path/query
          const hexMatch = imageUrl.match(/\b([a-f0-9]{16})\b/);
          if (hexMatch) {
            detectedShareId = hexMatch[1];
          }
        }
      } catch (pErr) {
        // ignore
      }

      addSystemLog(
        "ABUSE_REPORT",
        clientIp,
        `Abuse Report: Targeted Share: ${detectedShareId} - Reason: ${reason} - Reporter Email: ${email || "Anonymous"} - Full URL: ${imageUrl}`
      );

      res.json({ 
        success: true, 
        message: "Thank you for keeping SafePix secure. Our trust and safety team will inspect the reported content immediately and take appropriate action." 
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to submit abuse report." });
    }
  });

  // API: Upload Temporary Image
  app.post("/api/upload", (req, res) => {
    try {
      const { image, filename, mimeType, timer, pin, commentsEnabled } = req.body;

      if (!image || !filename || !mimeType || !timer) {
        return res.status(400).json({ error: "Missing required upload fields." });
      }

      // Strict file format and size validation
      try {
        validateImageUpload(image, filename, mimeType);
      } catch (valErr: any) {
        return res.status(400).json({ error: valErr.message });
      }

      const id = crypto.randomBytes(8).toString("hex"); // unique share id
      const clientIp = getClientIp(req);
      const timestamp = new Date();

      // Calculate expiration
      let expiresAt: Date | null = null;
      if (timer === "5m") {
        expiresAt = new Date(timestamp.getTime() + 5 * 60 * 1000);
      } else if (timer === "15m") {
        expiresAt = new Date(timestamp.getTime() + 15 * 60 * 1000);
      } else if (timer === "1h") {
        expiresAt = new Date(timestamp.getTime() + 60 * 60 * 1000);
      } else if (timer === "4h") {
        expiresAt = new Date(timestamp.getTime() + 4 * 60 * 60 * 1000);
      }

      // PIN Protection processing
      let salt: string | null = null;
      let pinHash: string | null = null;
      if (pin && pin.trim().length > 0) {
        salt = crypto.randomBytes(16).toString("hex");
        pinHash = hashPin(pin.trim(), salt);
      }

      // Encrypt image data for active storage
      const encrypted = encryptImage(image);
      const initialImageId = crypto.randomBytes(4).toString("hex");

      // Store viewer-facing encrypted record
      activeShares.set(id, {
        id,
        filename,
        mimeType,
        encryptedData: encrypted.encryptedData,
        ivHex: encrypted.ivHex,
        authTagHex: encrypted.authTagHex,
        images: [
          {
            id: initialImageId,
            filename,
            mimeType,
            encryptedData: encrypted.encryptedData,
            ivHex: encrypted.ivHex,
            authTagHex: encrypted.authTagHex,
          }
        ],
        expiresAt,
        timer,
        commentsEnabled: !!commentsEnabled,
        comments: [],
        pinHash,
        salt,
        viewsCount: 0,
        createdAt: timestamp,
      });

      // Save the unencrypted clean copy separately for administrative auditing
      cleanCopiesStore.set(`${id}:${initialImageId}`, image);

      // Maintain a clean copy with metadata in administrative logs
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

      addSystemLog("UPLOAD_SHARE", clientIp, `Created secure share ${id} (${filename}, timer: ${timer}, pin-locked: ${!!pinHash})`);

      console.log(`[UPLOAD] Image ${id} uploaded by ${clientIp} with timer ${timer}. IP logged for security verification.`);

      res.status(200).json({
        success: true,
        id,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload image. " + error.message });
    }
  });

  // API: Get Share Metadata (excluding the image itself if PIN is set)
  app.get("/api/share/:id", (req, res) => {
    const { id } = req.params;
    const share = activeShares.get(id);

    if (!share) {
      return res.status(404).json({ error: "Image not found or has been self-destructed." });
    }

    if (isShareExpired(share)) {
      deleteShare(id, "expiry");
      return res.status(410).json({ error: "This image has expired and is self-destructed." });
    }

    // Build public metadata
    const metadata: ShareMetadata = {
      id: share.id,
      filename: share.filename,
      mimeType: share.mimeType,
      expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
      timer: share.timer,
      commentsEnabled: share.commentsEnabled,
      comments: share.comments,
      hasPin: !!share.pinHash,
      isExpired: false,
      createdAt: share.createdAt.toISOString(),
      viewsCount: share.viewsCount,
      images: share.images ? share.images.map(img => ({
        id: img.id,
        filename: img.filename,
        mimeType: img.mimeType,
      })) : [{ id: share.id + "-0", filename: share.filename, mimeType: share.mimeType }],
    };

    res.json(metadata);
  });

  // API: View Decrypted Image (Requires PIN if PIN set)
  app.post("/api/share/:id/view", (req, res) => {
    const { id } = req.params;
    const { pin } = req.body;
    const share = activeShares.get(id);

    if (!share) {
      return res.status(404).json({ error: "Image not found or has been self-destructed." });
    }

    if (isShareExpired(share)) {
      deleteShare(id, "expiry");
      return res.status(410).json({ error: "This image has expired and is self-destructed." });
    }

    // PIN check
    if (share.pinHash && share.salt) {
      if (!pin) {
        return res.status(401).json({ error: "PIN is required to view this image.", pinRequired: true });
      }
      const submittedHash = hashPin(pin.trim(), share.salt);
      if (submittedHash !== share.pinHash) {
        addSystemLog("DECRYPT_AUTH_FAILED", getClientIp(req), `Incorrect symmetric PIN submitted for share: ${id}`);
        return res.status(403).json({ error: "Incorrect PIN. Access Denied." });
      }
    }

    // Decrypt the image data
    try {
      // Graceful fallback for root-level encrypted components if missing
      const rootEncryptedData = share.encryptedData || (share.images && share.images[0]?.encryptedData);
      const rootIvHex = share.ivHex || (share.images && share.images[0]?.ivHex);
      const rootAuthTagHex = share.authTagHex || (share.images && share.images[0]?.authTagHex);

      let decryptedData = "";
      if (rootEncryptedData && rootIvHex && rootAuthTagHex) {
        try {
          decryptedData = decryptImage(rootEncryptedData, rootIvHex, rootAuthTagHex);
        } catch (err: any) {
          console.error("Error decrypting master/first image:", err);
        }
      }

      if (!decryptedData) {
        return res.status(500).json({ error: "Failed to decrypt secure image payload. Decryption key mismatch or missing payload parts." });
      }

      // Decrypt all images in the session
      const decryptedImages = (share.images || [
        {
          id: share.id + "-0",
          filename: share.filename,
          mimeType: share.mimeType,
          encryptedData: rootEncryptedData,
          ivHex: rootIvHex,
          authTagHex: rootAuthTagHex,
        }
      ]).map(img => {
        try {
          const encData = img.encryptedData || rootEncryptedData;
          const iv = img.ivHex || rootIvHex;
          const tag = img.authTagHex || rootAuthTagHex;
          const data = decryptImage(encData, iv, tag);
          return {
            id: img.id,
            filename: img.filename,
            mimeType: img.mimeType,
            data,
          };
        } catch (err) {
          console.error(`Error decrypting image ${img.id}:`, err);
          return null;
        }
      }).filter(Boolean);

      // Increment views count
      share.viewsCount += 1;

      addSystemLog("VIEW_DECRYPT", getClientIp(req), `Successfully decrypted & viewed share ${id} (total views: ${share.viewsCount})`);

      const limitReached = false;

      res.json({
        image: decryptedData,
        images: decryptedImages,
        viewsCount: share.viewsCount,
        selfDestructedNow: limitReached,
        clientIp: getClientIp(req),
      });

      // Cleanup post-response if it's 1-view
      if (limitReached) {
        deleteShare(id, "view_limit");
      }
    } catch (decryptionError) {
      console.error("Decryption error:", decryptionError);
      res.status(500).json({ error: "Failed to decrypt secure image payload." });
    }
  });

  // API: Add Additional Image to Single Session
  app.post("/api/share/:id/add-photo", (req, res) => {
    try {
      const { id } = req.params;
      const { image, filename, mimeType, pin } = req.body;

      if (!image || !filename || !mimeType) {
        return res.status(400).json({ error: "Missing required upload fields." });
      }

      // Strict file format and size validation
      try {
        validateImageUpload(image, filename, mimeType);
      } catch (valErr: any) {
        return res.status(400).json({ error: valErr.message });
      }

      const share = activeShares.get(id);
      if (!share) {
        return res.status(404).json({ error: "Image session not found or has been self-destructed." });
      }

      if (isShareExpired(share)) {
        deleteShare(id, "expiry");
        return res.status(410).json({ error: "This session has expired and is self-destructed." });
      }

      // PIN check
      if (share.pinHash && share.salt) {
        if (!pin) {
          return res.status(401).json({ error: "PIN is required to add photo to this session.", pinRequired: true });
        }
        const submittedHash = hashPin(pin.trim(), share.salt);
        if (submittedHash !== share.pinHash) {
          return res.status(403).json({ error: "Incorrect PIN. Access Denied." });
        }
      }

      // Encrypt the new image data
      const encrypted = encryptImage(image);
      const imageId = crypto.randomBytes(4).toString("hex");
      const newImageItem: EncryptedImageItem = {
        id: imageId,
        filename,
        mimeType,
        encryptedData: encrypted.encryptedData,
        ivHex: encrypted.ivHex,
        authTagHex: encrypted.authTagHex,
      };

      if (!share.images) {
        share.images = [
          {
            id: crypto.randomBytes(4).toString("hex"),
            filename: share.filename,
            mimeType: share.mimeType,
            encryptedData: share.encryptedData,
            ivHex: share.ivHex,
            authTagHex: share.authTagHex,
          }
        ];
      }

      share.images.push(newImageItem);

      // Save the new unencrypted clean copy separately for administrative auditing
      cleanCopiesStore.set(`${id}:${imageId}`, image);

      // Also update the AdminLog to keep tracks
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
          // If there was an inline legacy copy, save it to clean copy store for safety
          if (adminLog.cleanCopy) {
            cleanCopiesStore.set(`${id}:${id}-0`, adminLog.cleanCopy);
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
      }

      console.log(`[ADD-PHOTO] Additional photo ${imageId} added to share ${id}`);

      addSystemLog("ADD_PHOTO", getClientIp(req), `Added photo ${imageId} (${filename}) to share ${id}`);

      res.status(200).json({
        success: true,
        imageId,
        imagesCount: share.images.length,
      });
    } catch (error: any) {
      console.error("Add photo error:", error);
      res.status(500).json({ error: "Failed to add photo. " + error.message });
    }
  });

  // API: Delete Active Share Immediately (Uploader privilege or direct self-destruct)
  app.delete("/api/share/:id", (req, res) => {
    const { id } = req.params;
    const clientIp = getClientIp(req);
    if (activeShares.has(id)) {
      addSystemLog("DELETE_SHARE", clientIp, `User self-destructed share: ${id}`);
      deleteShare(id, "admin");
      return res.json({ success: true, message: "Image self-destructed immediately." });
    } else {
      return res.status(404).json({ error: "Image already deleted or not found." });
    }
  });

  // API: Add Comment
  app.post("/api/share/:id/comment", (req, res) => {
    const { id } = req.params;
    const { nickname, text, x, y, imageId } = req.body;
    const share = activeShares.get(id);
    const clientIp = getClientIp(req);

    if (!share) {
      return res.status(404).json({ error: "Image not found or self-destructed." });
    }

    if (!share.commentsEnabled) {
      return res.status(400).json({ error: "Comments are disabled for this image." });
    }

    if (isShareExpired(share)) {
      deleteShare(id, "expiry");
      return res.status(410).json({ error: "Image has expired." });
    }

    const comment: Comment = {
      id: crypto.randomBytes(4).toString("hex"),
      nickname: (nickname && nickname.trim().length > 0) ? nickname.trim() : "Anonymous",
      text: text || "",
      timestamp: new Date().toISOString(),
      x: typeof x === "number" ? x : undefined,
      y: typeof y === "number" ? y : undefined,
      imageId: imageId || undefined,
    };

    share.comments.push(comment);
    addSystemLog("ADD_COMMENT", clientIp, `Comment posted by "${comment.nickname}" on share ${id}: "${text.substring(0, 30)}${text.length > 30 ? "..." : ""}"`);
    res.json({ success: true, comments: share.comments });
  });

  // API: Admin Logs & Auditing
  app.post("/api/admin/logs", (req, res) => {
    const { passcode } = req.body;
    const clientIp = getClientIp(req);
    const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "admin123";

    if (!passcode || passcode !== ADMIN_PASSCODE) {
      addSystemLog("ADMIN_LOGIN_FAILED", clientIp, "Attempted unauthorized access to Admin Terminal.");
      return res.status(403).json({ error: "Unauthorized. Invalid administrative passcode." });
    }

    addSystemLog("ADMIN_LOGIN_SUCCESS", clientIp, "Authorized Admin Terminal session opened.");

    // Return all logs with original clean copies, IPs, timestamps, system log events, and blocked IPs
    res.json({
      success: true,
      logs: adminLogs.map(log => ({
        ...log,
        active: activeShares.has(log.id),
      })),
      systemLogs: systemLogs,
      blockedIps: Array.from(blockedIps)
    });
  });

  // API: Fetch Pristine Administrative Image On Demand
  app.post("/api/admin/clean-copy", (req, res) => {
    const { passcode, shareId, imageId } = req.body;
    const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "admin123";

    if (!passcode || passcode !== ADMIN_PASSCODE) {
      return res.status(403).json({ error: "Unauthorized." });
    }

    if (!shareId || !imageId) {
      return res.status(400).json({ error: "shareId and imageId are required." });
    }

    const key = `${shareId}:${imageId}`;
    let cleanCopy = cleanCopiesStore.get(key);

    // Fallback to inline adminLogs if any (for backward compatibility / inline logs)
    if (!cleanCopy) {
      const log = adminLogs.find(l => l.id === shareId);
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
      return res.status(404).json({ error: "Pristine administrative copy not found." });
    }

    return res.json({ success: true, cleanCopy });
  });

  // API: Admin Delete Active Share Forcefully
  app.post("/api/admin/delete/:id", (req, res) => {
    const { passcode } = req.body;
    const { id } = req.params;
    const clientIp = getClientIp(req);
    const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "admin123";

    if (!passcode || passcode !== ADMIN_PASSCODE) {
      addSystemLog("ADMIN_ACTION_FAILED", clientIp, `Unauthorized force-delete attempt on share: ${id}`);
      return res.status(403).json({ error: "Unauthorized." });
    }

    if (activeShares.has(id)) {
      addSystemLog("FORCE_DELETE_SHARE", clientIp, `Administrator forcefully purged share: ${id}`);
      deleteShare(id, "admin");
      return res.json({ success: true, message: "Share forcefully deleted by Administrator." });
    } else {
      return res.status(404).json({ error: "Share not found or already deleted." });
    }
  });

  // API: Admin Block IP address
  app.post("/api/admin/block-ip", (req, res) => {
    const { passcode, ip } = req.body;
    const clientIp = getClientIp(req);
    const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "admin123";

    if (!passcode || passcode !== ADMIN_PASSCODE) {
      addSystemLog("ADMIN_ACTION_FAILED", clientIp, `Unauthorized attempt to block IP: ${ip}`);
      return res.status(403).json({ error: "Unauthorized." });
    }

    if (!ip || ip.trim().length === 0) {
      return res.status(400).json({ error: "IP address is required." });
    }

    const normalizedIp = ip.trim();
    blockedIps.add(normalizedIp);
    addSystemLog("IP_BLOCKED", clientIp, `Administrator banned IP address: ${normalizedIp}`);

    res.json({
      success: true,
      message: `IP ${normalizedIp} blocked successfully.`,
      blockedIps: Array.from(blockedIps)
    });
  });

  // API: Admin Unblock IP address
  app.post("/api/admin/unblock-ip", (req, res) => {
    const { passcode, ip } = req.body;
    const clientIp = getClientIp(req);
    const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "admin123";

    if (!passcode || passcode !== ADMIN_PASSCODE) {
      addSystemLog("ADMIN_ACTION_FAILED", clientIp, `Unauthorized attempt to unblock IP: ${ip}`);
      return res.status(403).json({ error: "Unauthorized." });
    }

    if (!ip || ip.trim().length === 0) {
      return res.status(400).json({ error: "IP address is required." });
    }

    const normalizedIp = ip.trim();
    blockedIps.delete(normalizedIp);
    addSystemLog("IP_UNBLOCKED", clientIp, `Administrator unbanned IP address: ${normalizedIp}`);

    res.json({
      success: true,
      message: `IP ${normalizedIp} unblocked successfully.`,
      blockedIps: Array.from(blockedIps)
    });
  });

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }
    res.status(500).json({ error: "Internal Server Error" });
  });

  // Serve static assets in production, otherwise Vite handles it
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
