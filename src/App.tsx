import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Shield, 
  Clock, 
  Lock, 
  Unlock, 
  MessageSquare, 
  Terminal, 
  User, 
  Trash2, 
  Copy, 
  Check, 
  RefreshCw, 
  Send, 
  AlertTriangle, 
  FileImage,
  Eye,
  Calendar,
  Layers,
  Sparkles,
  Link as LinkIcon,
  MapPin,
  Upload,
  Plus
} from "lucide-react";
import UploadForm from "./components/UploadForm";
import SecureCanvasImage from "./components/SecureCanvasImage";
import { ShareMetadata, Comment, AdminLog, SystemLog } from "./types";

export default function App() {
  // Navigation & URL Router state
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "view" | "admin">("upload");
  
  // Successful upload state
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);
  const [newlyCreatedExpires, setNewlyCreatedExpires] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Viewer state
  const [shareMetadata, setShareMetadata] = useState<ShareMetadata | null>(null);
  const [pinInput, setPinInput] = useState<string>("");
  const [decryptedImage, setDecryptedImage] = useState<string | null>(null);
  const [decryptedImages, setDecryptedImages] = useState<Array<{ id: string, data: string, filename: string, mimeType: string }>>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [activePin, setActivePin] = useState<string>("");
  const [viewerIp, setViewerIp] = useState<string | null>(null);
  const [isViewingLoading, setIsViewingLoading] = useState<boolean>(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [pinRequired, setPinRequired] = useState<boolean>(false);
  
  // Commenting state
  const [nickname, setNickname] = useState<string>(() => {
    const adjectives = ["Anonymous", "Silent", "Shadow", "Secret", "Secure", "Cipher", "Agent", "Cryptic", "Ghost"];
    const nouns = ["Viewer", "Observer", "User", "Node", "Spectator", "Sentry", "Expert", "Analyst", "Operator"];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(100 + Math.random() * 900);
    return `${adj}${noun}${num}`;
  });
  const [commentText, setCommentText] = useState<string>("");
  const [isSubmittingComment, setIsSubmittingComment] = useState<boolean>(false);

  // Admin section state
  const [adminPasscode, setAdminPasscode] = useState<string>("");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [adminCleanCopies, setAdminCleanCopies] = useState<Record<string, string>>({});
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [blockedIps, setBlockedIps] = useState<string[]>([]);
  const [adminTab, setAdminTab] = useState<"audit" | "systemLogs" | "ips">("audit");
  const [newBlockedIp, setNewBlockedIp] = useState<string>("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState<boolean>(false);
  const [selectedAdminImage, setSelectedAdminImage] = useState<AdminLog | null>(null);
  const [selectedAdminSubImageId, setSelectedAdminSubImageId] = useState<string | null>(null);

  // Session Upload History for Multiple Uploads
  const [sessionUploads, setSessionUploads] = useState<Array<{ id: string, expiresAt: string | null, filename: string, timestamp: string }>>(() => {
    try {
      const stored = localStorage.getItem("safepix_session_uploads");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Interactive Pin Placement state
  const [pendingPin, setPendingPin] = useState<{ x: number, y: number } | null>(null);
  const [hoveredPinComment, setHoveredPinComment] = useState<Comment | null>(null);
  const [selectedPinComment, setSelectedPinComment] = useState<Comment | null>(null);
  const [discussionTab, setDiscussionTab] = useState<"pinned" | "global">("pinned");

  // System statistics computed from Admin Logs
  const [systemStats, setSystemStats] = useState({
    totalUploads: 0,
    activeSharesCount: 0,
    cleanedBytes: 0,
  });

  // Custom State-based Notifications & Confirmations
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);
  const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
  const [showCopyrightModal, setShowCopyrightModal] = useState<boolean>(false);
  const [showContactModal, setShowContactModal] = useState<boolean>(false);
  const [contactTab, setContactTab] = useState<"contact" | "abuse">("contact");

  // Contact Form Inputs
  const [contactName, setContactName] = useState<string>("");
  const [contactEmail, setContactEmail] = useState<string>("");
  const [contactSubject, setContactSubject] = useState<string>("");
  const [contactMessage, setContactMessage] = useState<string>("");
  const [isContactSubmitting, setIsContactSubmitting] = useState<boolean>(false);

  // Abuse Form Inputs
  const [abuseImageUrl, setAbuseImageUrl] = useState<string>("");
  const [abuseReason, setAbuseReason] = useState<string>("");
  const [abuseEmail, setAbuseEmail] = useState<string>("");
  const [isAbuseSubmitting, setIsAbuseSubmitting] = useState<boolean>(false);

  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; action: () => void } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(prev => prev && prev.message === message ? null : prev);
    }, 4000);
  };

  const askConfirmation = (title: string, message: string, action: () => void) => {
    setConfirmDialog({ title, message, action });
  };

  // Synchronized ticker time for real-time accurate countdowns
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Clock tick effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Automatic self-destruction redirect and reload when expired
  useEffect(() => {
    if (shareMetadata && shareMetadata.expiresAt) {
      const expiresTime = new Date(shareMetadata.expiresAt).getTime();
      if (currentTime >= expiresTime) {
        window.location.hash = "";
        window.location.href = window.location.origin; // Redirects and refreshes the page to home
      }
    }
  }, [shareMetadata, currentTime]);

  // Refresh admin logs automatically when entering the admin tab, with live background updates
  useEffect(() => {
    if (activeTab === "admin" && isAdminAuthenticated) {
      handleAdminAuth(false); // First fetch is non-silent/loud

      // Silent interval polling for live admin log synchronization (every 4 seconds)
      const interval = setInterval(() => {
        handleAdminAuth(true); // Silent background fetch
      }, 4000);

      return () => clearInterval(interval);
    }
  }, [activeTab, isAdminAuthenticated, adminPasscode]);

  // Watch URL hash changes for sharing links (e.g. #id=xxxx)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith("#id=")) {
        const id = hash.substring(4);
        setCurrentId(id);
        setActiveTab("view");
        loadShareMetadata(id);
      }
    };

    // Run once on load
    handleHashChange();

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Fetch Viewer-facing Metadata
  const loadShareMetadata = async (id: string) => {
    setIsViewingLoading(true);
    setViewerError(null);
    if (id !== currentId) {
      setDecryptedImage(null);
      setDecryptedImages([]);
      setSelectedImageId(null);
      setActivePin("");
    }
    setPinInput("");
    setPinRequired(false);

    try {
      const response = await fetch(`/api/share/${id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Image share not found or has self-destructed.");
      }

      setShareMetadata(data);
      if (data.hasPin) {
        if (id === currentId && activePin) {
          await fetchDecryptedImage(id, activePin);
        } else {
          setPinRequired(true);
        }
      } else {
        // Automatically attempt to fetch the clean decrypted image if no PIN is set
        await fetchDecryptedImage(id, "");
      }
    } catch (err: any) {
      setViewerError(err.message || "Failed to load image details.");
    } finally {
      setIsViewingLoading(false);
    }
  };

  // Fetch decrypted payload (requires PIN if configured)
  const fetchDecryptedImage = async (id: string, pin: string) => {
    setIsViewingLoading(true);
    setViewerError(null);

    try {
      const response = await fetch(`/api/share/${id}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to decrypt secure image payload.");
      }

      setDecryptedImage(data.image);
      const decImgs = data.images || [];
      setDecryptedImages(decImgs);
      setActivePin(pin);
      if (decImgs.length > 0) {
        setSelectedImageId(prev => {
          if (prev && decImgs.some((img: any) => img.id === prev)) {
            return prev;
          }
          return decImgs[0].id;
        });
      } else {
        setSelectedImageId(null);
      }
      setViewerIp(data.clientIp || null);
      setPinRequired(false);
      
      // Update local viewer count
      if (shareMetadata) {
        setShareMetadata({
          ...shareMetadata,
          viewsCount: data.viewsCount,
        });
      }

      if (data.selfDestructedNow) {
        // Trigger a friendly warning that this single view image has been destroyed
        setViewerError("Single-view limit reached. This image has been forcefully self-destructed on the server!");
      }
    } catch (err: any) {
      setViewerError(err.message || "Invalid PIN or failed decryption.");
    } finally {
      setIsViewingLoading(false);
    }
  };

  const [isAddingPhoto, setIsAddingPhoto] = useState<boolean>(false);

  const handleAddAdditionalPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentId) return;

    const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
    
    const mime = file.type.toLowerCase();
    const extIndex = file.name.lastIndexOf(".");
    const ext = extIndex !== -1 ? file.name.substring(extIndex).toLowerCase() : "";

    if (!allowedMimeTypes.includes(mime) && !allowedExtensions.includes(ext)) {
      showToast("Forbidden file format. Only PNG, JPG, WEBP, and GIF images are allowed.", "error");
      e.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast("Image size exceeds the 10MB limit. Max allowed size is 10MB.", "error");
      e.target.value = "";
      return;
    }

    setIsAddingPhoto(true);
    showToast("Encrypting & uploading additional photo...", "info");

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      if (!base64Data) {
        showToast("Failed to read selected image.", "error");
        setIsAddingPhoto(false);
        return;
      }

      try {
        const response = await fetch(`/api/share/${currentId}/add-photo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: base64Data,
            filename: file.name,
            mimeType: file.type,
            pin: activePin,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to add additional photo.");
        }

        showToast("Additional photo successfully encrypted and added to safe session!", "success");
        await loadShareMetadata(currentId);
        if (data.imageId) {
          setSelectedImageId(data.imageId);
        }
      } catch (err: any) {
        showToast(err.message || "Failed to add photo.", "error");
      } finally {
        setIsAddingPhoto(false);
        e.target.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  // Immediate Self-Destruct Action for Uploader
  const handleDeleteNow = () => {
    if (!currentId) return;
    askConfirmation(
      "Confirm Immediate Self-Destruct",
      "Are you sure you want to permanently delete and self-destruct this image right now? This action cannot be undone.",
      async () => {
        try {
          const response = await fetch(`/api/share/${currentId}`, {
            method: "DELETE",
          });
          if (response.ok) {
            showToast("Image has been permanently deleted and self-destructed.", "success");
            // Redirect to home
            window.location.hash = "";
            setCurrentId(null);
            setNewlyCreatedId(null);
            setNewlyCreatedExpires(null);
            setShareMetadata(null);
            setDecryptedImage(null);
            setActiveTab("upload");
          } else {
            const errData = await response.json();
            showToast(errData.error || "Failed to delete image.", "error");
          }
        } catch (err) {
          showToast("Error deleting image.", "error");
        }
      }
    );
  };

  // Submit Comments
  const handleAddComment = async (e: React.FormEvent, customX?: number, customY?: number) => {
    if (e) e.preventDefault();
    if (!currentId || !commentText.trim()) return;

    setIsSubmittingComment(true);
    try {
      const pinX = typeof customX === "number" ? customX : pendingPin?.x;
      const pinY = typeof customY === "number" ? customY : pendingPin?.y;

      const response = await fetch(`/api/share/${currentId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim() || "Anonymous",
          text: commentText.trim(),
          x: pinX,
          y: pinY,
          imageId: selectedImageId || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to add comment.");
      }

      // Update comments locally
      if (shareMetadata) {
        setShareMetadata({
          ...shareMetadata,
          comments: data.comments,
        });
      }
      setCommentText("");
      setPendingPin(null); // Reset pending pin on placement success
      
      // Auto-switch tab based on comment type
      if (typeof pinX !== "number" || typeof pinY !== "number") {
        setDiscussionTab("global");
        showToast("Message sent to Global Chat.", "success");
      } else {
        setDiscussionTab("pinned");
        showToast("Pin comment successfully added to image.", "success");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Authenticate Admin & Fetch Logs
  const handleAdminAuth = async (e?: React.FormEvent | boolean, silent: boolean = false) => {
    const isSilent = typeof e === "boolean" ? e : silent;
    if (e && typeof e !== "boolean") e.preventDefault();
    
    if (!isSilent) {
      setAdminLoading(true);
      setAdminError(null);
    }

    try {
      const response = await fetch("/api/admin/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: adminPasscode }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unauthorized passcode.");
      }

      const logsList = data.logs || [];
      setAdminLogs(logsList);
      setSystemLogs(data.systemLogs || []);
      setBlockedIps(data.blockedIps || []);
      setIsAdminAuthenticated(true);
      
      // Compute stats
      const totalBytes = logsList.reduce((acc: number, log: AdminLog) => {
        // Count approximate deleted bytes
        if (!log.active) return acc + log.size;
        return acc;
      }, 0);

      setSystemStats({
        totalUploads: logsList.length,
        activeSharesCount: logsList.filter((l: any) => l.active).length,
        cleanedBytes: totalBytes,
      });

      // Keep selected administrative image up to date with fresh server data
      if (selectedAdminImage) {
        const freshLog = logsList.find((l: AdminLog) => l.id === selectedAdminImage.id);
        if (freshLog) {
          setSelectedAdminImage(freshLog);
          const freshCopies = freshLog.cleanCopies || [];
          if (freshCopies.length > 0) {
            // If currently selected sub-image is not in freshCopies, reset to first item
            if (!selectedAdminSubImageId || !freshCopies.some((c: any) => c.id === selectedAdminSubImageId)) {
              setSelectedAdminSubImageId(freshCopies[0].id);
            }
          } else {
            setSelectedAdminSubImageId(null);
          }
        }
      }

    } catch (err: any) {
      if (!isSilent) {
        setAdminError(err.message || "Admin authorization failed.");
      }
    } finally {
      if (!isSilent) {
        setAdminLoading(false);
      }
    }
  };

  // Administrative Clean Copy On-Demand Fetching
  useEffect(() => {
    if (!selectedAdminImage || !isAdminAuthenticated) return;
    const targetImageId = selectedAdminSubImageId || (selectedAdminImage.cleanCopies && selectedAdminImage.cleanCopies[0]?.id) || (selectedAdminImage.id + "-0");
    
    // Check local cache first without triggering dependency tracking
    let alreadyHas = false;
    setAdminCleanCopies(prev => {
      if (prev[targetImageId]) {
        alreadyHas = true;
      }
      return prev;
    });
    if (alreadyHas) return;

    // Check if the log item already has cleanCopy locally (legacy support)
    let localCleanCopy = "";
    if (selectedAdminImage.id + "-0" === targetImageId && selectedAdminImage.cleanCopy) {
      localCleanCopy = selectedAdminImage.cleanCopy;
    } else if (selectedAdminImage.cleanCopies) {
      const found = selectedAdminImage.cleanCopies.find((c: any) => c.id === targetImageId);
      if (found && found.cleanCopy) {
        localCleanCopy = found.cleanCopy;
      }
    }

    if (localCleanCopy) {
      setAdminCleanCopies(prev => ({ ...prev, [targetImageId]: localCleanCopy }));
      return;
    }

    // Fetch from on-demand API
    const fetchCleanCopy = async () => {
      try {
        const res = await fetch("/api/admin/clean-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passcode: adminPasscode,
            shareId: selectedAdminImage.id,
            imageId: targetImageId,
          }),
        });
        const data = await res.json();
        if (res.ok && data.cleanCopy) {
          setAdminCleanCopies(prev => ({ ...prev, [targetImageId]: data.cleanCopy }));
        }
      } catch (err) {
        console.error("Failed to fetch administrative clean copy:", err);
      }
    };

    fetchCleanCopy();
  }, [selectedAdminImage?.id, selectedAdminSubImageId, isAdminAuthenticated, adminPasscode]);

  // Admin Force Delete Share
  const handleAdminForceDelete = (id: string) => {
    askConfirmation(
      "Force Immediate Self-Destruct",
      "Are you sure you want to forcefully self-destruct this active share? This will purge it completely.",
      async () => {
        try {
          const response = await fetch(`/api/admin/delete/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ passcode: adminPasscode }),
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || "Failed to delete share.");
          }

          showToast("Image has been successfully purged.", "success");
          // Reload admin logs to reflect change
          handleAdminAuth();
          if (selectedAdminImage?.id === id) {
            setSelectedAdminImage(null);
          }
        } catch (err: any) {
          showToast(err.message, "error");
        }
      }
    );
  };

  // Admin Block IP Address
  const handleBlockIp = async (ipToBlock: string) => {
    if (!ipToBlock.trim()) return;
    try {
      const response = await fetch("/api/admin/block-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: adminPasscode, ip: ipToBlock.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to block IP.");
      }
      showToast(data.message, "success");
      setNewBlockedIp("");
      setBlockedIps(data.blockedIps || []);
      handleAdminAuth(true); // silent refresh logs
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // Admin Unblock IP Address
  const handleUnblockIp = async (ipToUnblock: string) => {
    try {
      const response = await fetch("/api/admin/unblock-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: adminPasscode, ip: ipToUnblock }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to unblock IP.");
      }
      showToast(data.message, "success");
      setBlockedIps(data.blockedIps || []);
      handleAdminAuth(true); // silent refresh logs
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // Contact Form Submission
  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim() || !contactSubject.trim() || !contactMessage.trim()) {
      showToast("Please fill in all contact fields.", "error");
      return;
    }
    setIsContactSubmitting(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName.trim(),
          email: contactEmail.trim(),
          subject: contactSubject.trim(),
          message: contactMessage.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to submit message.");
      }
      showToast(data.message, "success");
      setContactName("");
      setContactEmail("");
      setContactSubject("");
      setContactMessage("");
      setShowContactModal(false);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsContactSubmitting(false);
    }
  };

  // Abuse Report Submission
  const handleAbuseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!abuseImageUrl.trim() || !abuseReason.trim()) {
      showToast("Image URL and reason are required.", "error");
      return;
    }
    setIsAbuseSubmitting(true);
    try {
      const response = await fetch("/api/abuse-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: abuseImageUrl.trim(),
          reason: abuseReason.trim(),
          email: abuseEmail.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to submit report.");
      }
      showToast(data.message, "success");
      setAbuseImageUrl("");
      setAbuseReason("");
      setAbuseEmail("");
      setShowContactModal(false);
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsAbuseSubmitting(false);
    }
  };

  const handleUploadSuccess = (id: string, expiresAt: string | null, filename: string) => {
    setNewlyCreatedId(id);
    setNewlyCreatedExpires(expiresAt);
    setCurrentId(id);
    setActiveTab("upload"); // Remain on upload tab to show link details

    const newUpload = { id, expiresAt, filename, timestamp: new Date().toISOString() };
    const updated = [newUpload, ...sessionUploads];
    setSessionUploads(updated);
    try {
      localStorage.setItem("safepix_session_uploads", JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyLink = () => {
    const fullLink = `${window.location.origin}/#id=${newlyCreatedId}`;
    navigator.clipboard.writeText(fullLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const calculateTimeRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return "Burn after 1 view";
    const diff = new Date(expiresAt).getTime() - currentTime;
    if (diff <= 0) return "Expired";
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Format File Sizes
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const isUploader = currentId ? sessionUploads.some(up => up.id === currentId) : false;

  const activeDecryptedImageObj = decryptedImages.find(img => img.id === selectedImageId);
  const activeDecryptedImageSrc = activeDecryptedImageObj ? activeDecryptedImageObj.data : decryptedImage;

  const adminCopies = selectedAdminImage?.cleanCopies || (selectedAdminImage ? [{
    id: selectedAdminImage.id + "-0",
    filename: selectedAdminImage.filename,
    mimeType: selectedAdminImage.mimeType,
    size: selectedAdminImage.size,
    cleanCopy: selectedAdminImage.cleanCopy,
  }] : []);

  const activeAdminCopy = adminCopies.find(c => c.id === selectedAdminSubImageId) || adminCopies[0];
  const activeAdminCopyId = activeAdminCopy?.id || (selectedAdminImage ? selectedAdminImage.id + "-0" : "");
  const activeAdminCleanCopySrc = adminCleanCopies[activeAdminCopyId] || activeAdminCopy?.cleanCopy || selectedAdminImage?.cleanCopy || "";

  return (
    <div id="app-root" className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      
      {/* Top Professional Header Bar */}
      <header id="app-header" className="flex items-center justify-between px-6 py-4 h-16 bg-white border-b border-slate-200 shadow-sm z-10">
        <div 
          onClick={() => {
            window.location.hash = "";
            setCurrentId(null);
            setNewlyCreatedId(null);
            setActiveTab("upload");
          }} 
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-90"
        >
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-extrabold shadow-sm">
            S
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800">
            Safe<span className="text-blue-600">Pix</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            AES-256 GCM ACTIVE
          </div>

          <nav className="flex gap-2">
            <button
              onClick={() => {
                setActiveTab("upload");
                setNewlyCreatedId(null);
              }}
              className={`text-xs font-semibold px-4 py-2 rounded-md transition-colors ${
                activeTab === "upload"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-blue-600 hover:bg-slate-100"
              }`}
            >
              Upload Share
            </button>
            
            {currentId && (
              <button
                onClick={() => {
                  setActiveTab("view");
                  loadShareMetadata(currentId);
                }}
                className={`text-xs font-semibold px-4 py-2 rounded-md transition-colors ${
                  activeTab === "view"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-blue-600 hover:bg-slate-100"
                }`}
              >
                Active Share
              </button>
            )}

            <button
              onClick={() => setActiveTab("admin")}
              className={`text-xs font-semibold px-4 py-2 rounded-md transition-colors ${
                activeTab === "admin"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              Admin Auditing
            </button>

            <button
              onClick={() => setShowPrivacyModal(true)}
              className="text-xs font-semibold px-4 py-2 rounded-md text-slate-600 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Privacy Policy
            </button>
          </nav>
        </div>
      </header>

      {/* Main Body Layout */}
      <main id="app-main" className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 gap-6">
        
        <AnimatePresence mode="wait">
          
          {/* TAB 1: UPLOAD OR LINK GENERATION PANEL */}
          {activeTab === "upload" && (
            <motion.div
              key="upload-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              {!newlyCreatedId ? (
                <div className="space-y-4">
                  <UploadForm onUploadSuccess={handleUploadSuccess} />
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-center text-xs">
                    <button
                      type="button"
                      onClick={() => setShowPrivacyModal(true)}
                      className="text-slate-400 hover:text-blue-600 underline cursor-pointer transition-colors font-medium"
                    >
                      Privacy Policy
                    </button>
                    <span className="text-slate-300 hidden sm:inline">•</span>
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="text-slate-400 hover:text-blue-600 underline cursor-pointer transition-colors font-medium"
                    >
                      Terms of Service
                    </button>
                    <span className="text-slate-300 hidden sm:inline">•</span>
                    <button
                      type="button"
                      onClick={() => setShowCopyrightModal(true)}
                      className="text-slate-400 hover:text-blue-600 underline cursor-pointer transition-colors font-medium"
                    >
                      Copyright Policy (DMCA)
                    </button>
                    <span className="text-slate-300 hidden sm:inline">•</span>
                    <button
                      type="button"
                      onClick={() => {
                        setContactTab("contact");
                        setShowContactModal(true);
                      }}
                      className="text-slate-400 hover:text-blue-600 underline cursor-pointer transition-colors font-medium"
                    >
                      Contact Support
                    </button>
                    <span className="text-slate-300 hidden sm:inline">•</span>
                    <button
                      type="button"
                      onClick={() => {
                        setContactTab("abuse");
                        setShowContactModal(true);
                      }}
                      className="text-red-400 hover:text-red-600 underline cursor-pointer transition-colors font-medium"
                    >
                      Report Abuse
                    </button>
                  </div>
                </div>
              ) : (
                /* Post-Upload Share Success screen */
                <div className="w-full max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden p-6 md:p-8">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-200 shadow-sm">
                      <Shield className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-800">
                      Link Securely Generated!
                    </h2>
                    <p className="text-slate-500 text-sm max-w-md mx-auto mt-2">
                      Your temporary image has been encrypted and is now active. Send this link to your recipient securely.
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                    {/* Share Link Input field with easy Copy */}
                    <div className="space-y-2">
                      <label className="text-slate-500 text-xs font-bold uppercase tracking-wider block">
                        Encrypted Viewer URL
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.origin}/#id=${newlyCreatedId}`}
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none"
                        />
                        <button
                          onClick={handleCopyLink}
                          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>

                    {/* Meta Indicators */}
                    <div className="grid grid-cols-2 gap-4 text-xs border-t border-slate-200/60 pt-4">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <div>
                          <span className="font-semibold block text-slate-700">Self-Destruct Timeline</span>
                          {newlyCreatedExpires ? (
                            <span>Auto-deletes at {new Date(newlyCreatedExpires).toLocaleTimeString()}</span>
                          ) : (
                            <span>Single-view burn enabled</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-slate-600">
                        <Lock className="w-4 h-4 text-slate-400" />
                        <div>
                          <span className="font-semibold block text-slate-700">Encrypted Payload</span>
                          <span>In-memory symmetric AES-256-GCM</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => {
                        window.location.hash = `#id=${newlyCreatedId}`;
                        loadShareMetadata(newlyCreatedId);
                        setActiveTab("view");
                      }}
                      className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2 transition-all shadow-md"
                    >
                      <Eye className="w-4 h-4" />
                      Verify Shared View
                    </button>

                    <button
                      onClick={() => {
                        setNewlyCreatedId(null);
                        setNewlyCreatedExpires(null);
                      }}
                      className="flex-1 py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold text-center transition-all"
                    >
                      Upload Another Image
                    </button>
                  </div>
                </div>
              )}


            </motion.div>
          )}

          {/* TAB 2: SECURE ACTIVE VIEW PREVIEW */}
          {activeTab === "view" && (
            <motion.div
              key="view-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              {/* Left Column - Meta controls & decryption */}
              <div className="md:col-span-2 space-y-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col min-h-[400px]">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3 flex-wrap gap-2">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span>
                      Encrypted Safe Session
                    </h3>
                    
                    <div className="flex items-center gap-2.5">
                      <label
                        className="flex items-center gap-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors font-bold shadow-xs cursor-pointer"
                        title="Upload an additional image to this safe session"
                      >
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/jpg, image/webp, image/gif"
                          className="hidden"
                          onChange={handleAddAdditionalPhoto}
                          disabled={isAddingPhoto}
                        />
                        {isAddingPhoto ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>{isAddingPhoto ? "Uploading..." : "Add Additional Photo"}</span>
                      </label>

                      {isUploader && (
                        <button
                          type="button"
                          onClick={handleDeleteNow}
                          className="flex items-center gap-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg border border-red-200 transition-colors font-bold shadow-xs cursor-pointer"
                          title="Permanently self-destruct this image immediately"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Now</span>
                        </button>
                      )}

                      {shareMetadata && (
                        <span className="text-xs font-mono bg-red-50 text-red-600 px-3 py-1 rounded border border-red-100 uppercase tracking-wide font-bold animate-pulse">
                          EXPIRES: {calculateTimeRemaining(shareMetadata.expiresAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {viewerError && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Access Denied / Self-Destructed</span>
                        {viewerError}
                      </div>
                    </div>
                  )}

                  {/* Encryption Decryptor Canvas screen */}
                  <div className="flex-1 flex flex-col gap-3 bg-slate-100 rounded-lg p-4 min-h-[300px] border border-slate-200 justify-center">
                    {isViewingLoading ? (
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-500 py-12">
                        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                        <span className="text-xs font-medium">Decrypting Secure Buffer...</span>
                      </div>
                    ) : pinRequired ? (
                      /* PIN Authentication Lock Overlay */
                      <div className="text-center max-w-sm mx-auto p-6 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-lg my-auto">
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Lock className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-slate-800 text-base">Symmetric PIN Required</h4>
                        <p className="text-xs text-slate-500 mt-1 mb-4">
                          This share was locked with an upload PIN. Enter it below to initiate client decryption.
                        </p>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (currentId) fetchDecryptedImage(currentId, pinInput);
                          }}
                          className="space-y-3"
                        >
                          <input
                            type="password"
                            value={pinInput}
                            onChange={(e) => setPinInput(e.target.value)}
                            placeholder="Enter security PIN"
                            required
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-center font-mono placeholder-slate-400 focus:outline-none focus:border-blue-500"
                          />
                          <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 rounded-lg transition-colors shadow"
                          >
                            Decrypt Image
                          </button>
                        </form>
                      </div>
                    ) : decryptedImage ? (
                      /* Secure original image render with dynamic watermark overlays, right-click, selection, and drag-drop blocks */
                      <div className="w-full flex flex-col gap-3">
                        {/* Interactive Viewer Header */}
                        <div className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-xs">
                          <span className="flex items-center gap-1.5 font-bold text-slate-700">
                            <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                            Secure Interactive SVG Viewer
                          </span>
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-mono font-bold">
                            PROTECTED VIEW
                          </span>
                        </div>

                        {/* Secure Viewport Container */}
                        <div 
                          className="relative max-h-[500px] overflow-auto rounded-xl border border-slate-200 select-none bg-slate-900/5 p-1 flex shadow-inner"
                          onContextMenu={(e) => e.preventDefault()}
                        >
                          <div 
                            className="relative select-none m-auto w-full max-w-full"
                            onContextMenu={(e) => e.preventDefault()}
                          >
                            <SecureCanvasImage
                              src={activeDecryptedImageSrc || ""}
                              alt="Shared Decrypted Payload"
                              className="w-full object-contain select-none pointer-events-none rounded"
                              watermarkText={viewerIp ? `SECURE VIEW - IP: ${viewerIp}` : "SafePix SAFE SESSION"}
                            />
                            {/* Overlay transparent shield to intercept clicks, saves, selection attempts and capture comment pins */}
                            <div 
                              className="absolute inset-0 z-20 bg-transparent cursor-crosshair select-none pointer-events-auto"
                              onContextMenu={(e) => e.preventDefault()}
                              onClick={(e) => {
                                if (!shareMetadata?.commentsEnabled) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const x = parseFloat((((e.clientX - rect.left) / rect.width) * 100).toFixed(2));
                                const y = parseFloat((((e.clientY - rect.top) / rect.height) * 100).toFixed(2));
                                setPendingPin({ x, y });
                              }}
                            />
                            {/* Dynamic tiled watermark of client IP to prevent camera shots and screenshots */}
                            {viewerIp && (
                              <div className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden flex flex-wrap items-center justify-center gap-x-12 gap-y-16 p-4 opacity-25">
                                {Array.from({ length: 15 }).map((_, idx) => (
                                  <div 
                                    key={idx} 
                                    className="text-[11px] font-mono font-black text-slate-950 tracking-wider rotate-[-25deg] whitespace-nowrap bg-white/40 px-2 py-1 rounded shadow-sm border border-slate-900/10"
                                  >
                                    IP: {viewerIp} &bull; TRACED
                                  </div>
                                ))}
                              </div>
                            )}

                             {/* Render existing pin comments */}
                            {shareMetadata?.comments?.filter(c => {
                              if (typeof c.x !== "number" || typeof c.y !== "number") return false;
                              const firstImageId = decryptedImages[0]?.id;
                              const commentImageId = c.imageId || firstImageId;
                              return commentImageId === selectedImageId;
                            }).map((comment, index) => (
                              <div
                                key={comment.id}
                                className="absolute z-30 flex items-center justify-center cursor-pointer transition-transform hover:scale-110 active:scale-95"
                                style={{ left: `${comment.x}%`, top: `${comment.y}%`, transform: 'translate(-50%, -50%)' }}
                                onMouseEnter={() => setHoveredPinComment(comment)}
                                onMouseLeave={() => setHoveredPinComment(null)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPinComment(selectedPinComment?.id === comment.id ? null : comment);
                                }}
                              >
                                <div className="relative">
                                  <span className="absolute inline-flex h-6 w-6 rounded-full bg-blue-500/40 animate-ping -left-0.5 -top-0.5" />
                                  <div className="relative w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center font-mono font-bold text-[10px] shadow border border-white">
                                    {index + 1}
                                  </div>
                                </div>

                                {/* Floating Comment Card on Hover / Selection */}
                                {(hoveredPinComment?.id === comment.id || selectedPinComment?.id === comment.id) && (
                                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md text-white p-2.5 rounded-lg shadow-xl border border-slate-700 min-w-[200px] pointer-events-none select-none">
                                    <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1 mb-1 text-[10px] text-slate-400 font-bold">
                                      <span>{comment.nickname}</span>
                                      <span>{new Date(comment.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                    </div>
                                    <p className="text-xs text-slate-200 font-medium whitespace-pre-wrap">{comment.text}</p>
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* Pending comment pin creation marker */}
                            {pendingPin && (
                              <div
                                className="absolute z-30 flex flex-col items-center"
                                style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%`, transform: 'translate(-50%, -50%)' }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="relative">
                                  <span className="absolute inline-flex h-8 w-8 rounded-full bg-red-500/35 animate-ping -left-1.5 -top-1.5" />
                                  <div className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center font-bold text-xs shadow border border-white">
                                    +
                                  </div>
                                </div>

                                {/* Pinned comment creation dialog popup */}
                                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-45 bg-white border border-slate-200 p-3 rounded-lg shadow-2xl min-w-[240px] pointer-events-auto text-left">
                                  <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-red-500" /> Place Pin Comment
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPendingPin(null);
                                      }}
                                      className="text-slate-400 hover:text-slate-600 text-sm font-bold font-mono px-1"
                                    >
                                      &times;
                                    </button>
                                  </div>
                                  <div className="space-y-2">
                                    <input
                                      type="text"
                                      placeholder="Nickname"
                                      value={nickname}
                                      onChange={(e) => setNickname(e.target.value)}
                                      maxLength={20}
                                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 font-medium"
                                    />
                                    <textarea
                                      placeholder="Message..."
                                      value={commentText}
                                      onChange={(e) => setCommentText(e.target.value)}
                                      required
                                      maxLength={200}
                                      rows={2}
                                      className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 resize-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => handleAddComment(e, pendingPin.x, pendingPin.y)}
                                      disabled={isSubmittingComment || !commentText.trim()}
                                      className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold text-[11px] py-1.5 px-3 rounded flex items-center justify-center gap-1 transition-all disabled:opacity-50 shadow-sm"
                                    >
                                      {isSubmittingComment ? (
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <MessageSquare className="w-3 h-3" />
                                      )}
                                      Pin Comment Here
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Visual Security Notice Badge */}
                            <div className="absolute bottom-2 left-2 right-2 z-35 bg-black/85 backdrop-blur-xs text-white text-[9px] font-semibold font-mono tracking-wider px-3 py-1.5 rounded flex items-center justify-between shadow pointer-events-none select-none">
                              <span className="flex items-center gap-1.5">
                                <Shield className="w-3 h-3 text-red-500 animate-pulse" />
                                SCREENSHOT PROTECTION SYSTEM
                              </span>
                              <span>VIEWER IP LOGGED: {viewerIp || "Unknown"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Thumbnail gallery strip & Add additional photo option */}
                        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs mt-3">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                            <span>Image Session Pool ({decryptedImages.length} {decryptedImages.length === 1 ? 'photo' : 'photos'})</span>
                            {activeDecryptedImageObj && (
                              <span className="font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 max-w-[200px] truncate" title={activeDecryptedImageObj.filename}>
                                {activeDecryptedImageObj.filename}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 overflow-x-auto py-1.5 px-0.5">
                            {decryptedImages.map((img, idx) => (
                              <button
                                key={img.id}
                                type="button"
                                onClick={() => setSelectedImageId(img.id)}
                                className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                                  selectedImageId === img.id 
                                    ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-sm' 
                                    : 'border-slate-200 hover:border-slate-400'
                                }`}
                                title={img.filename}
                              >
                                <SecureCanvasImage src={img.data} className="w-full h-full object-cover select-none pointer-events-none" alt={img.filename} />
                                <span className="absolute bottom-0 inset-x-0 bg-slate-900/75 text-white text-[9px] truncate px-1 text-center font-bold font-mono">
                                  #{idx + 1}
                                </span>
                              </button>
                            ))}

                            {/* Clickable slot to add photo inside strip */}
                            <label className="flex-shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/30 flex flex-col items-center justify-center cursor-pointer transition-all">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleAddAdditionalPhoto}
                                disabled={isAddingPhoto}
                              />
                              {isAddingPhoto ? (
                                <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                              ) : (
                                <Plus className="w-5 h-5 text-slate-400 hover:text-blue-500" />
                              )}
                              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tight mt-0.5">Add</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center max-w-sm mx-auto py-12">
                        <FileImage className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                        <span className="text-xs text-slate-400 font-medium block">
                          No active unencrypted preview available.
                        </span>
                      </div>
                    )}
                    {shareMetadata?.commentsEnabled && decryptedImage && (
                      <div className="mt-2.5 text-[10px] text-slate-400 flex items-center justify-center gap-1.5 font-medium">
                        <MapPin className="w-3.5 h-3.5 text-blue-500 animate-bounce" />
                        <span>Interactive Mode: Click anywhere on the image above to drop a pin-comment.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Comments panel */}
              <div className="md:col-span-1 font-sans">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-full min-h-[400px]">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-500" /> Viewer Discussions
                  </h4>

                  {shareMetadata && !shareMetadata.commentsEnabled ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                      <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-2">
                        <Lock className="w-4 h-4" />
                      </div>
                      <p className="text-xs font-medium text-slate-500">Comments disabled</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">The uploader deactivated commentary for this upload.</p>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col h-full justify-between gap-4">
                      {/* Tab toggler inside sidebar */}
                      {(() => {
                        const pinnedCommentsCount = (shareMetadata?.comments || []).filter(c => {
                          const isPinned = typeof c.x === "number" && typeof c.y === "number";
                          if (!isPinned) return false;
                          const firstImageId = decryptedImages[0]?.id;
                          const commentImageId = c.imageId || firstImageId;
                          return commentImageId === selectedImageId;
                        }).length;

                        const globalCommentsCount = (shareMetadata?.comments || []).filter(c => {
                          return typeof c.x !== "number" || typeof c.y !== "number";
                        }).length;

                        return (
                          <div className="flex border border-slate-100 bg-slate-50 p-1 rounded-lg">
                            <button
                              type="button"
                              onClick={() => setDiscussionTab("pinned")}
                              className={`flex-1 py-1.5 px-1.5 text-[10px] font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                                discussionTab === "pinned"
                                  ? "bg-white text-blue-600 shadow-xs border border-slate-200/50"
                                  : "text-slate-500 hover:text-slate-800 hover:bg-white/30"
                              }`}
                            >
                              <MapPin className="w-3 h-3" />
                              <span>Pinned Pins</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-sans font-black ${
                                discussionTab === "pinned" ? "bg-blue-50 text-blue-600" : "bg-slate-200 text-slate-600"
                              }`}>
                                {pinnedCommentsCount}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDiscussionTab("global")}
                              className={`flex-1 py-1.5 px-1.5 text-[10px] font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                                discussionTab === "global"
                                  ? "bg-white text-blue-600 shadow-xs border border-slate-200/50"
                                  : "text-slate-500 hover:text-slate-800 hover:bg-white/30"
                              }`}
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>Global Chat</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-sans font-black ${
                                discussionTab === "global" ? "bg-blue-50 text-blue-600" : "bg-slate-200 text-slate-600"
                              }`}>
                                {globalCommentsCount}
                              </span>
                            </button>
                          </div>
                        );
                      })()}

                      {/* Comments feed scroll container */}
                      <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px] min-h-[180px] pr-1">
                        {(() => {
                          if (discussionTab === "pinned") {
                            const pinnedComments = (shareMetadata?.comments || []).filter(c => {
                              const isPinned = typeof c.x === "number" && typeof c.y === "number";
                              if (!isPinned) return false;
                              const firstImageId = decryptedImages[0]?.id;
                              const commentImageId = c.imageId || firstImageId;
                              return commentImageId === selectedImageId;
                            });

                            if (pinnedComments.length > 0) {
                              return pinnedComments.map((comment) => {
                                // Find sequence number to match on-canvas marker numbers
                                const allPinsOfThisImage = (shareMetadata?.comments || []).filter(c => {
                                  if (typeof c.x !== "number" || typeof c.y !== "number") return false;
                                  const firstImageId = decryptedImages[0]?.id;
                                  const commentImageId = c.imageId || firstImageId;
                                  return commentImageId === selectedImageId;
                                });
                                const pinSeq = allPinsOfThisImage.findIndex(p => p.id === comment.id) + 1;

                                return (
                                  <div key={comment.id} className="flex gap-2 items-start text-xs animate-fadeIn">
                                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center font-mono font-bold text-[10px] text-blue-600 flex-shrink-0 border border-blue-200 shadow-xs">
                                      {pinSeq}
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg flex-1">
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="font-bold text-slate-700">{comment.nickname}</span>
                                        <span className="text-[9px] text-slate-400">{new Date(comment.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                      </div>
                                      <p className="text-slate-600 leading-relaxed break-words">{comment.text}</p>
                                      <button
                                        type="button"
                                        onClick={() => setSelectedPinComment(comment)}
                                        className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors"
                                        title="Highlight Pin on Image"
                                      >
                                        <MapPin className="w-2.5 h-2.5" />
                                        Highlight Pin at {Math.round(comment.x || 0)}%, {Math.round(comment.y || 0)}%
                                      </button>
                                    </div>
                                  </div>
                                );
                              });
                            } else {
                              return (
                                <div className="text-center py-10 px-4">
                                  <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2 animate-bounce" />
                                  <span className="text-xs text-slate-400 font-bold block">
                                    No pins dropped on this photo yet.
                                  </span>
                                  <p className="text-[10px] text-slate-400 mt-1 max-w-[180px] mx-auto leading-normal">
                                    Click anywhere on the image canvas above to place a pinned comment!
                                  </p>
                                </div>
                              );
                            }
                          } else {
                            // Global chat comments (no coordinates, visible on all image switches)
                            const globalComments = (shareMetadata?.comments || []).filter(c => {
                              return typeof c.x !== "number" || typeof c.y !== "number";
                            });

                            if (globalComments.length > 0) {
                              return globalComments.map((comment) => (
                                <div key={comment.id} className="flex gap-2 items-start text-xs animate-fadeIn">
                                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center font-sans font-bold text-[10px] text-slate-600 flex-shrink-0 border border-slate-200 shadow-xs">
                                    {comment.nickname.substring(0, 2).toUpperCase()}
                                  </div>
                                  <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="font-bold text-slate-700">{comment.nickname}</span>
                                      <span className="text-[9px] text-slate-400">{new Date(comment.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                    </div>
                                    <p className="text-slate-600 leading-relaxed break-words">{comment.text}</p>
                                  </div>
                                </div>
                              ));
                            } else {
                              return (
                                <div className="text-center py-10 px-4">
                                  <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                  <span className="text-xs text-slate-400 font-bold block">
                                    Global discussion session is empty.
                                  </span>
                                  <p className="text-[10px] text-slate-400 mt-1 max-w-[180px] mx-auto leading-normal">
                                    All uploader/viewer switches share this chat! Speak to everyone.
                                  </p>
                                </div>
                              );
                            }
                          }
                        })()}
                      </div>

                      {/* Add Comment form */}
                      <div className="border-t border-slate-100 pt-3 space-y-2">
                        <div className="text-[9px] font-bold text-slate-400 flex items-center gap-1 leading-normal">
                          {discussionTab === "pinned" ? (
                            <>
                              <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                              <span>Click on the image above to place a pinned comment, or send a general chat below:</span>
                            </>
                          ) : (
                            <>
                              <MessageSquare className="w-3 h-3 text-blue-500 shrink-0" />
                              <span>Send a message to the global discussion (shared across all photos):</span>
                            </>
                          )}
                        </div>
                        <form onSubmit={handleAddComment} className="space-y-2">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Nickname"
                              value={nickname}
                              onChange={(e) => setNickname(e.target.value)}
                              maxLength={20}
                              className="w-1/3 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-medium"
                            />
                            <span className="text-slate-300 self-center text-xs">|</span>
                            <input
                              type="text"
                              placeholder={discussionTab === "pinned" ? "Write a global message..." : "Type chat message here..."}
                              value={commentText}
                              onChange={(e) => setCommentText(e.target.value)}
                              required
                              maxLength={200}
                              className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={isSubmittingComment}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2 px-3 rounded flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer"
                          >
                            {isSubmittingComment ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Send className="w-3 h-3" />
                            )}
                            {discussionTab === "pinned" ? "Post to Global Chat" : "Send Global Message"}
                          </button>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 3: ADMIN INSTRUMENT & SECURE BACKEND LOGGING */}
          {activeTab === "admin" && (
            <motion.div
              key="admin-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full max-w-6xl mx-auto space-y-6"
            >
              {!isAdminAuthenticated ? (
                /* Admin authentication Lock Screen */
                <div className="w-full max-w-md mx-auto bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden p-6 md:p-8">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-slate-100 text-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-sm">
                      <Terminal className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-800">
                      System Integrity Auditing
                    </h2>
                    <p className="text-slate-500 text-sm max-w-md mx-auto mt-2">
                      Access strict server-side audit logs with original clean copies, IP logging, and manual deletion control.
                    </p>
                  </div>

                  <form onSubmit={handleAdminAuth} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-slate-600 text-xs font-bold uppercase tracking-wider block">
                        Administrator Passcode
                      </label>
                      <input
                        type="password"
                        placeholder="Enter admin passcode"
                        value={adminPasscode}
                        onChange={(e) => setAdminPasscode(e.target.value)}
                        required
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-900 font-mono text-center"
                      />
                    </div>

                    {adminError && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-500 text-xs text-center">
                        {adminError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={adminLoading}
                      className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md"
                    >
                      {adminLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Terminal className="w-4 h-4" />
                      )}
                      Authorize Terminal
                    </button>
                  </form>
                  
                </div>
              ) : (
                /* Admin Dashboard Terminal view */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left Column - Logs audit List */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2 flex-wrap gap-2">
                        <div>
                          <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-slate-900" />
                            Administrative Management Center
                          </h3>
                          <p className="text-slate-400 text-[10px]">Real-time security activity monitoring and access restrictions</p>
                        </div>
                        <button
                          onClick={() => handleAdminAuth()}
                          className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 rounded-md transition-colors"
                          title="Refresh admin records"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Tab buttons */}
                      <div className="flex gap-1 border-b border-slate-100 pb-3 mb-4 flex-wrap">
                        <button
                          onClick={() => setAdminTab("audit")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            adminTab === "audit" 
                              ? "bg-slate-900 text-white shadow-sm" 
                              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                          }`}
                        >
                          Verification Records ({adminLogs.length})
                        </button>
                        <button
                          onClick={() => setAdminTab("systemLogs")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            adminTab === "systemLogs" 
                              ? "bg-slate-900 text-white shadow-sm" 
                              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                          }`}
                        >
                          System Activity Logs ({systemLogs.length})
                        </button>
                        <button
                          onClick={() => setAdminTab("ips")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            adminTab === "ips" 
                              ? "bg-slate-900 text-white shadow-sm" 
                              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                          }`}
                        >
                          Banned IP Restrictor ({blockedIps.length})
                        </button>
                      </div>

                      {adminTab === "audit" && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px] bg-slate-50">
                                <th className="py-2 px-3">Metadata</th>
                                <th className="py-2 px-3">Logged Client IP</th>
                                <th className="py-2 px-3">Size</th>
                                <th className="py-2 px-3">Status</th>
                                <th className="py-2 px-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono">
                              {adminLogs && adminLogs.length > 0 ? (
                                adminLogs.slice().reverse().map((log) => (
                                  <tr 
                                    key={log.id} 
                                    onClick={() => {
                                      setSelectedAdminImage(log);
                                      if (log.cleanCopies && log.cleanCopies.length > 0) {
                                        setSelectedAdminSubImageId(log.cleanCopies[0].id);
                                      } else {
                                        setSelectedAdminSubImageId(null);
                                      }
                                    }}
                                    className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                                      selectedAdminImage?.id === log.id ? "bg-slate-100/70 font-semibold" : ""
                                    }`}
                                  >
                                    <td className="py-2.5 px-3">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-slate-800 font-bold block truncate max-w-[140px]" title={log.filename}>{log.filename}</span>
                                        {log.cleanCopies && log.cleanCopies.length > 1 && (
                                          <span className="bg-blue-50 text-blue-600 border border-blue-100 text-[9px] px-1.5 py-0.5 rounded-full font-sans font-bold flex-shrink-0" title={`${log.cleanCopies.length} photos uploaded in this session`}>
                                            {log.cleanCopies.length} photos
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[10px] text-slate-400 block">{new Date(log.timestamp).toLocaleTimeString()} &bull; {log.timerSetting}</span>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <div className="flex items-center gap-2">
                                        <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] border border-slate-200">{log.clientIp}</span>
                                        {!blockedIps.includes(log.clientIp) && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleBlockIp(log.clientIp);
                                            }}
                                            className="text-[9px] font-bold text-red-600 hover:text-red-800 bg-red-50 border border-red-100 px-1 py-0.5 rounded hover:bg-red-100 cursor-pointer"
                                            title="Ban this client IP"
                                          >
                                            Ban
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-500">
                                      {formatSize(log.size)}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      {log.active ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                                          Active
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                                          Destroyed
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                      {log.active ? (
                                        <button
                                          onClick={() => handleAdminForceDelete(log.id)}
                                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                          title="Force delete"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      ) : (
                                        <span className="text-[9px] text-slate-400 italic">Expired</span>
                                      )}
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={5} className="text-center py-8 text-slate-400 italic">
                                    No transaction records logged in database yet.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {adminTab === "systemLogs" && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px] bg-slate-50">
                                <th className="py-2 px-3">Timestamp</th>
                                <th className="py-2 px-3">Action</th>
                                <th className="py-2 px-3">Logged Client IP</th>
                                <th className="py-2 px-3">Event Details</th>
                                <th className="py-2 px-3 text-right">Restrict</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono">
                              {systemLogs && systemLogs.length > 0 ? (
                                systemLogs.slice().reverse().map((sLog) => {
                                  let badgeColor = "bg-slate-100 text-slate-600 border-slate-200";
                                  if (sLog.action.includes("FAIL") || sLog.action.includes("BLOCKED")) {
                                    badgeColor = "bg-red-50 text-red-700 border-red-200";
                                  } else if (sLog.action.includes("SUCCESS")) {
                                    badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                                  } else if (sLog.action.includes("UPLOAD")) {
                                    badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                                  } else if (sLog.action.includes("DELETE") || sLog.action.includes("PURGE")) {
                                    badgeColor = "bg-orange-50 text-orange-700 border-orange-200";
                                  } else if (sLog.action.includes("COMMENT")) {
                                    badgeColor = "bg-purple-50 text-purple-700 border-purple-200";
                                  }

                                  return (
                                    <tr key={sLog.id} className="hover:bg-slate-50/80 transition-colors">
                                      <td className="py-2 px-3 text-[10px] text-slate-500 whitespace-nowrap">
                                        {new Date(sLog.timestamp).toLocaleTimeString()}
                                      </td>
                                      <td className="py-2 px-3">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${badgeColor}`}>
                                          {sLog.action}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3 font-semibold text-slate-700">
                                        {sLog.clientIp}
                                      </td>
                                      <td className="py-2 px-3 text-slate-600 max-w-[200px] truncate" title={sLog.details}>
                                        {sLog.details}
                                      </td>
                                      <td className="py-2 px-3 text-right">
                                        {blockedIps.includes(sLog.clientIp) ? (
                                          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">Banned</span>
                                        ) : (
                                          <button
                                            onClick={() => handleBlockIp(sLog.clientIp)}
                                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200 cursor-pointer"
                                          >
                                            Ban IP
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan={5} className="text-center py-8 text-slate-400 italic">
                                    No system activity or security incidents logged yet.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {adminTab === "ips" && (
                        <div className="space-y-4">
                          {/* Add manual IP block form */}
                          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <Shield className="w-3.5 h-3.5 text-red-500" /> Restrict Unethical IP Client
                            </h4>
                            <p className="text-slate-500 text-[11px] mb-3 leading-relaxed">
                              Banning an IP address entirely isolates SafePix from that user. Banned IPs are forbidden from viewing shared image bundles, comments, uploads, or making any API request.
                            </p>
                            <form 
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleBlockIp(newBlockedIp);
                              }}
                              className="flex gap-2"
                            >
                              <input
                                type="text"
                                value={newBlockedIp}
                                onChange={(e) => setNewBlockedIp(e.target.value)}
                                placeholder="e.g. 192.168.1.1 or 203.0.113.5"
                                required
                                className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-red-500"
                              />
                              <button
                                type="submit"
                                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors shadow shadow-red-500/10 cursor-pointer"
                              >
                                Restrict IP
                              </button>
                            </form>
                          </div>

                          {/* Blocked IP table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px] bg-slate-50">
                                  <th className="py-2 px-3">Banned IP Address</th>
                                  <th className="py-2 px-3">Restriction Status</th>
                                  <th className="py-2 px-3">Action Details</th>
                                  <th className="py-2 px-3 text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-mono">
                                {blockedIps && blockedIps.length > 0 ? (
                                  blockedIps.map((ip) => (
                                    <tr key={ip} className="hover:bg-slate-50/80 transition-colors">
                                      <td className="py-2.5 px-3 font-semibold text-red-600 bg-red-50/20">
                                        {ip}
                                      </td>
                                      <td className="py-2.5 px-3">
                                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-red-700 bg-red-100/60 border border-red-200 px-1.5 py-0.5 rounded">
                                          BANNED - ACCESS DENIED
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 text-slate-500 italic text-[11px] font-sans">
                                        Manual administrator restriction for unethical behavior.
                                      </td>
                                      <td className="py-2.5 px-3 text-right">
                                        <button
                                          onClick={() => handleUnblockIp(ip)}
                                          className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded border border-emerald-200 cursor-pointer font-sans transition-colors"
                                        >
                                          Unban IP
                                        </button>
                                      </td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan={4} className="text-center py-8 text-slate-400 italic">
                                      No client IP addresses are currently restricted. SafePix is open to clean access.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column - Audit Inspector (Clean Original Copies) */}
                  <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-full justify-between min-h-[400px]">
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                          <Eye className="w-3.5 h-3.5 text-blue-500" /> Administrative Image Inspector
                        </h4>

                        {selectedAdminImage ? (
                          <div className="space-y-4">
                            {/* Metadata list */}
                            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs space-y-1.5 font-mono">
                              <div><span className="text-slate-400">ID:</span> <span className="text-slate-800 font-bold">{selectedAdminImage.id}</span></div>
                              <div><span className="text-slate-400">Filename:</span> <span className="text-slate-800 truncate block max-w-full">{selectedAdminImage.filename}</span></div>
                              <div><span className="text-slate-400">IP logged:</span> <span className="text-slate-800">{selectedAdminImage.clientIp}</span></div>
                              <div><span className="text-slate-400">Timestamp:</span> <span className="text-slate-800">{new Date(selectedAdminImage.timestamp).toLocaleString()}</span></div>
                              {selectedAdminImage.deletedAt && (
                                <div><span className="text-red-400">Self-Destructed:</span> <span className="text-red-700 font-bold">{new Date(selectedAdminImage.deletedAt).toLocaleTimeString()}</span></div>
                              )}
                            </div>

                            {/* Clean pristine preview from admin database logs */}
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide block">Clean Database Mirror Copy:</span>
                              <div className="relative border border-slate-200 rounded bg-slate-950/5 overflow-hidden flex items-center justify-center p-2 min-h-[160px]">
                                <SecureCanvasImage
                                  src={activeAdminCleanCopySrc}
                                  alt={activeAdminCopy ? activeAdminCopy.filename : "Pristine database mirror copy"}
                                  className="max-h-52 object-contain rounded"
                                  watermarkText="ADMIN ARCHIVE"
                                />
                                <div className="absolute top-2 right-2 bg-slate-900/80 text-white font-mono text-[9px] px-1.5 py-0.5 rounded border border-slate-700/60 shadow">
                                  MIRROR COPY
                                </div>
                              </div>
                            </div>

                            {/* Administrative sub-image selector for pool */}
                            {adminCopies.length > 1 && (
                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 shadow-xs mt-2">
                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between font-mono">
                                  <span>Photo Pool ({adminCopies.length} items)</span>
                                  {activeAdminCopy && (
                                    <span className="text-slate-500 truncate max-w-[120px]" title={activeAdminCopy.filename}>
                                      {activeAdminCopy.filename}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 overflow-x-auto py-1">
                                  {adminCopies.map((copy, idx) => (
                                    <button
                                      key={copy.id}
                                      type="button"
                                      onClick={() => setSelectedAdminSubImageId(copy.id)}
                                      className={`relative flex-shrink-0 w-11 h-11 rounded overflow-hidden border-2 transition-all cursor-pointer ${
                                        (selectedAdminSubImageId === copy.id || (!selectedAdminSubImageId && idx === 0))
                                          ? 'border-blue-600 ring-2 ring-blue-500/10 shadow-xs' 
                                          : 'border-slate-200 hover:border-slate-400'
                                      }`}
                                      title={copy.filename}
                                    >
                                      <SecureCanvasImage src={adminCleanCopies[copy.id] || copy.cleanCopy || ""} className="w-full h-full object-cover" alt={copy.filename} />
                                      <span className="absolute bottom-0 inset-x-0 bg-slate-900/75 text-white text-[8px] truncate px-0.5 text-center font-bold font-mono">
                                        #{idx + 1}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-slate-400 text-xs">
                            <FileImage className="w-10 h-10 text-slate-300 mb-2" />
                            Select an audit log item to inspect the pristine administrative copy.
                          </div>
                        )}
                      </div>

                      {/* Diagnostic status banner */}
                      <div className="bg-slate-900 text-slate-400 p-4 rounded-lg font-mono text-[9px] leading-relaxed border border-slate-800 space-y-1 shadow-inner mt-4">
                        <div className="flex justify-between text-[10px] font-bold text-slate-300 border-b border-slate-800 pb-1 mb-1">
                          <span>SYSTEM INTEGRITY METRICS</span>
                          <span className="text-emerald-500">[ONLINE]</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Logs:</span>
                          <span className="text-white">{systemStats.totalUploads} uploads</span>
                        </div>
                        <div className="flex justify-between">
                          <span>In-Memory Active:</span>
                          <span className="text-white">{systemStats.activeSharesCount} files</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Self-Destructed Purges:</span>
                          <span className="text-emerald-400">{formatSize(systemStats.cleanedBytes)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>

      </main>

      {/* System Footer */}
      <footer id="app-footer" className="bg-slate-900 p-6 text-slate-400 border-t border-slate-800 mt-auto">
        {/* Footer legal and support links */}
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-xs">
          <div className="text-slate-500 text-center sm:text-left">
            &copy; {new Date().getFullYear()} SafePix - Secure image sharing with self-destruct timer.
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-slate-400">
            <button
              onClick={() => setShowPrivacyModal(true)}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Privacy Policy
            </button>
            <span>•</span>
            <button
              onClick={() => setShowTermsModal(true)}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Terms of Service
            </button>
            <span>•</span>
            <button
              onClick={() => setShowCopyrightModal(true)}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Copyright Policy (DMCA)
            </button>
            <span>•</span>
            <button
              onClick={() => {
                setContactTab("contact");
                setShowContactModal(true);
              }}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Contact Support
            </button>
            <span>•</span>
            <button
              onClick={() => {
                setContactTab("abuse");
                setShowContactModal(true);
              }}
              className="text-red-400 hover:text-red-300 transition-colors cursor-pointer"
            >
              Report Abuse
            </button>
          </div>
        </div>
      </footer>

      {/* Custom Dialog & Toast Notifications Container */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-800 p-4 flex items-start gap-3"
          >
            <div className={`p-1.5 rounded-lg flex-shrink-0 ${
              notification.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
              notification.type === 'error' ? 'bg-red-500/20 text-red-400' :
              'bg-blue-500/20 text-blue-400'
            }`}>
              <Shield className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-0.5">
                {notification.type === 'success' ? 'Success' : notification.type === 'error' ? 'System Warning' : 'System Notice'}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">{notification.message}</p>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="text-slate-500 hover:text-slate-300 transition-colors text-sm font-bold font-mono px-1.5 cursor-pointer"
            >
              &times;
            </button>
          </motion.div>
        )}

        {confirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl max-w-md w-full"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-red-600 flex-shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-base font-bold text-slate-800 mb-1">{confirmDialog.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{confirmDialog.message}</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmDialog.action();
                    setConfirmDialog(null);
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors shadow-md shadow-red-500/10 cursor-pointer"
                >
                  Confirm & Self-Destruct
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showPrivacyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs text-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl max-w-lg w-full flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  <h4 className="text-lg font-bold text-slate-800">SafePix Privacy Policy</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPrivacyModal(false)}
                  className="text-slate-400 hover:text-slate-600 font-mono text-xl font-bold cursor-pointer transition-colors p-1"
                >
                  &times;
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs text-slate-600 leading-relaxed">
                <div>
                  <h5 className="font-bold text-slate-800 mb-1">1. Zero-Knowledge Commitment</h5>
                  <p>
                    SafePix is designed with strict privacy at its core. We operate as a zero-knowledge service, meaning we do not possess the capabilities to decrypt, inspect, or monitor any of your shared image assets.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-800 mb-1">2. Client-Side Cryptographic Sanitation</h5>
                  <p>
                    Every image or file uploaded is encrypted locally on your browser using standard 256-bit AES-GCM cryptography. Your passcode or security PIN forms the cryptographic basis of the decryption key, and is never transmitted or stored on SafePix databases.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-800 mb-1">3. Automated Ephemeral Deletion</h5>
                  <p>
                    All shares are designed to self-destruct. Images and discussion posts are forcefully and permanently purged from server memory upon the expiration of your custom timer, after a single view (if requested), or when manually deleted. We maintain no residual backups or restoration logs.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-800 mb-1">4. Abuse Mitigation & IP Processing</h5>
                  <p>
                    To mitigate brute-force attempts on share PINs, prevent automated DDoS scraping, and ban unethical access patterns, we temporarily record connecting IP addresses. These logs are processed locally with cryptographic hash protection and are automatically deleted when the associated secure share expires or is deleted.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-800 mb-1">5. No Tracking & Third-Parties</h5>
                  <p>
                    We do not deploy advertising trackers, use analytics cookies, or monetize your activity. SafePix has no third-party integrations and is entirely isolated from external tracking services.
                  </p>
                </div>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowPrivacyModal(false)}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  I Understand
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showTermsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs text-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl max-w-lg w-full flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-blue-600" />
                  <h4 className="text-lg font-bold text-slate-800">SafePix Terms of Service</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  className="text-slate-400 hover:text-slate-600 font-mono text-xl font-bold cursor-pointer transition-colors p-1"
                >
                  &times;
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs text-slate-600 leading-relaxed">
                <div>
                  <h5 className="font-bold text-slate-800 mb-1">1. Acceptable Use</h5>
                  <p>
                    SafePix is an accountless, zero-knowledge ephemeral sharing platform designed for the secure transmission of private imagery. By using this service, you agree to share only media that you hold legal rights to, and to respect the cryptographic privacy of your recipients.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-800 mb-1">2. Prohibited Content</h5>
                  <p>
                    You are strictly prohibited from uploading any illegal material, child exploitation media, non-consensual intimate imagery, copyright-infringing works, malware, harassment material, or content that triggers unethical cyberbullying.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-800 mb-1">3. Liability Disclaimer</h5>
                  <p>
                    Because SafePix operates strictly on a zero-knowledge architectural framework, we do not store or transmit decryption passcodes. We cannot restore, retrieve, or decrypt your shares. SafePix disclaims all liability for accidental data loss, key misplacement, unauthorized access due to compromised recipient passwords, or server-level forced deletions under valid security requirements.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-800 mb-1">4. Share Deletion & IP Restriction</h5>
                  <p>
                    Although SafePix has no traditional accounts, we enforce strict trust policies. We reserve the absolute right to permanently delete any active share or restrict any client IP address found violating these guidelines, without notice.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-800 mb-1">5. Age Requirements</h5>
                  <p>
                    You must be at least 18 years of age (or the minimum legal age of majority in your jurisdiction) to upload, view, or participate in SafePix sessions. By accessing SafePix, you warrant that you satisfy this age threshold.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-800 mb-1">6. Governing Law</h5>
                  <p>
                    These terms and your use of SafePix shall be governed by, and interpreted in accordance with, local and federal laws, without regard to conflicts of law.
                  </p>
                </div>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Accept Terms
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showCopyrightModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs text-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl max-w-lg w-full flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  <h4 className="text-lg font-bold text-slate-800">Copyright Policy (DMCA)</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCopyrightModal(false)}
                  className="text-slate-400 hover:text-slate-600 font-mono text-xl font-bold cursor-pointer transition-colors p-1"
                >
                  &times;
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs text-slate-600 leading-relaxed">
                <div>
                  <h5 className="font-bold text-slate-800 mb-1">1. DMCA & Copyright Compliance</h5>
                  <p>
                    SafePix respects intellectual property rights. Because all uploads are encrypted with zero-knowledge, we cannot view or decrypt images. However, we act quickly to delete reported shares when copyright owners provide proper notice.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-800 mb-1">2. Submitting Takedown Requests</h5>
                  <p>
                    If you are a copyright owner or authorized representative and believe content shared on SafePix infringes your copyright, please submit a formal takedown request containing:
                  </p>
                  <ul className="list-disc pl-4 mt-1 space-y-1">
                    <li>The exact SafePix viewer URL (with share ID).</li>
                    <li>Identification of the copyrighted work claimed to have been infringed.</li>
                    <li>Your full name, physical/email address, and electronic signature.</li>
                    <li>A statement made under penalty of perjury that the information in the notification is accurate and you are the copyright holder.</li>
                  </ul>
                  <p className="mt-2">
                    Submit your claim via our <strong>Abuse Report</strong> form or email directly to <span className="font-semibold text-blue-600">copyright@safepix.io</span>.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-800 mb-1">3. Counter-Notice Process</h5>
                  <p>
                    If your share was forcefully deleted and you believe it was done in error or due to misidentification, you may file a counter-notification. It must contain the Share ID, explanation of your legal rights, your contact information, and consent to local jurisdiction. Upon receipt, our legal team will evaluate the counter-statement.
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-slate-800 mb-1">4. Designated Contact</h5>
                  <p>
                    SafePix Trust and Copyright Operations<br />
                    Email: <span className="font-semibold text-slate-800">copyright@safepix.io</span>
                  </p>
                </div>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowCopyrightModal(false)}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  I Understand
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showContactModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs text-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl max-w-lg w-full flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                  <h4 className="text-lg font-bold text-slate-800">Contact & Trust Center</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className="text-slate-400 hover:text-slate-600 font-mono text-xl font-bold cursor-pointer transition-colors p-1"
                >
                  &times;
                </button>
              </div>

              {/* Tabs inside contact modal */}
              <div className="flex bg-slate-100 p-1 rounded-xl mb-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setContactTab("contact")}
                  className={`flex-1 py-2 text-center rounded-lg transition-all ${
                    contactTab === "contact"
                      ? "bg-white text-slate-800 shadow-xs font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  General Support
                </button>
                <button
                  type="button"
                  onClick={() => setContactTab("abuse")}
                  className={`flex-1 py-2 text-center rounded-lg transition-all ${
                    contactTab === "abuse"
                      ? "bg-white text-red-600 shadow-xs font-bold"
                      : "text-slate-500 hover:text-red-500"
                  }`}
                >
                  Report Image Abuse
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-1">
                {contactTab === "contact" ? (
                  <form onSubmit={handleContactSubmit} className="space-y-4">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Have questions regarding cryptographic safety, symmetric keys, or general inquiries? Drop our secure support team a message below.
                    </p>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Your Name</label>
                      <input
                        type="text"
                        required
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Your Email Address</label>
                      <input
                        type="email"
                        required
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="john@example.com"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Subject</label>
                      <input
                        type="text"
                        required
                        value={contactSubject}
                        onChange={(e) => setContactSubject(e.target.value)}
                        placeholder="General Inquiry / Support Request"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Message</label>
                      <textarea
                        required
                        rows={4}
                        value={contactMessage}
                        onChange={(e) => setContactMessage(e.target.value)}
                        placeholder="Type your message here..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all resize-none"
                      />
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={isContactSubmitting}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                      >
                        {isContactSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        {isContactSubmitting ? "Sending..." : "Send Message"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleAbuseSubmit} className="space-y-4">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      SafePix maintains a zero-tolerance policy for abuse, illegal acts, or copyright infringements. Report offending image links immediately for administrative review and destruction.
                    </p>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Target Image URL</label>
                      <input
                        type="text"
                        required
                        value={abuseImageUrl}
                        onChange={(e) => setAbuseImageUrl(e.target.value)}
                        placeholder="https://safepix.io/#id=f893d..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Reason for Report</label>
                      <select
                        required
                        value={abuseReason}
                        onChange={(e) => setAbuseReason(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      >
                        <option value="">-- Select a reason --</option>
                        <option value="Copyright Violation / DMCA">Copyright Violation / DMCA</option>
                        <option value="Illegal Content / Child exploitation">Illegal Content / Exploitation</option>
                        <option value="Abusive Content / Harassment">Abusive Content / Harassment</option>
                        <option value="Malicious Material / Spam">Malicious Material / Spam</option>
                        <option value="Other Policy Violation">Other Policy Violation</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Optional Email (For Follow-Up)</label>
                      <input
                        type="email"
                        value={abuseEmail}
                        onChange={(e) => setAbuseEmail(e.target.value)}
                        placeholder="john@example.com (optional)"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={isAbuseSubmitting}
                        className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                      >
                        {isAbuseSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                        {isAbuseSubmitting ? "Submitting..." : "Submit Abuse Report"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
