import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Upload, Image as ImageIcon, Shield, MessageSquare, Clock, Key, Eye, EyeOff, Loader2, Copy, Check, ExternalLink } from "lucide-react";
import SecureCanvasImage from "./SecureCanvasImage";

interface UploadFormProps {
  onUploadSuccess: (id: string, expiresAt: string | null, filename: string) => void;
}

export default function UploadForm({ onUploadSuccess }: UploadFormProps) {
  const [image, setImage] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [mimeType, setMimeType] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  
  const [timer, setTimer] = useState<'5m' | '15m' | '1h' | '4h'>("15m");
  const [pin, setPin] = useState<string>("");
  const [showPin, setShowPin] = useState<boolean>(false);
  const [commentsEnabled, setCommentsEnabled] = useState<boolean>(true);
  
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
    
    const mime = file.type.toLowerCase();
    const extIndex = file.name.lastIndexOf(".");
    const ext = extIndex !== -1 ? file.name.substring(extIndex).toLowerCase() : "";

    if (!allowedMimeTypes.includes(mime) && !allowedExtensions.includes(ext)) {
      setError("Forbidden file format. Only PNG, JPG, WEBP, and GIF images are allowed.");
      setImage(null);
      setFilename("");
      setMimeType("");
      setFileSize(0);
      return;
    }
    
    // Max 10MB limit check
    if (file.size > 10 * 1024 * 1024) {
      setError("Image size exceeds the 10MB limit. Max allowed size is 10MB.");
      setImage(null);
      setFilename("");
      setMimeType("");
      setFileSize(0);
      return;
    }

    setError(null);
    setFilename(file.name);
    setMimeType(file.type);
    setFileSize(file.size);

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result && typeof e.target.result === "string") {
        setImage(e.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image) {
      setError("Please select an image first.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image,
          filename,
          mimeType,
          timer,
          pin: pin ? pin.trim() : undefined,
          commentsEnabled,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to upload image.");
      }

      onUploadSuccess(data.id, data.expiresAt, filename);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during upload.");
    } finally {
      setIsUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-6 md:p-8">
      <div className="text-center mb-6">
        <h2 className="text-2xl md:text-3xl font-sans font-semibold tracking-tight text-white mb-2">
          Secure Temporary Image Upload
        </h2>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Upload images with symmetric server-side encryption, custom self-destruct timers, and optional PIN protection.
        </p>
      </div>

      <form onSubmit={handleUpload} className="space-y-6">
        {/* Drag & Drop Area */}
        <div
          id="dropzone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={!image ? triggerFileSelect : undefined}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[220px] ${
            image
              ? "border-emerald-500/50 bg-slate-950/40"
              : isDragging
              ? "border-emerald-400 bg-slate-800/40"
              : "border-slate-800 hover:border-slate-700 bg-slate-950/20"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/png, image/jpeg, image/jpg, image/webp, image/gif"
            className="hidden"
          />

          <AnimatePresence mode="wait">
            {!image ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center"
              >
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 mb-4 border border-slate-700">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-white font-medium text-sm mb-1">
                  Drag and drop your image here, or <span className="text-emerald-400 font-semibold underline">browse</span>
                </p>
                <p className="text-slate-500 text-xs">
                  Supports PNG, JPG, WEBP, GIF up to 10MB
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="preview"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full flex flex-col items-center"
              >
                <div className="relative group max-w-xs overflow-hidden rounded-lg border border-slate-800 shadow-md mb-4 bg-slate-950">
                  <SecureCanvasImage
                    src={image}
                    alt="Upload Preview"
                    className="max-h-48 object-contain mx-auto transition-transform group-hover:scale-[1.02]"
                    watermarkText="PREVIEW - SafePix"
                  />
                  <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerFileSelect();
                      }}
                      className="px-3 py-1.5 bg-slate-900 border border-slate-700 hover:bg-slate-800 rounded-md text-xs font-semibold text-white transition-all shadow-lg"
                    >
                      Change Image
                    </button>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-white font-medium text-sm truncate max-w-md px-4">
                    {filename}
                  </p>
                  <p className="text-slate-500 text-xs mt-1">
                    {formatSize(fileSize)} &bull; {mimeType}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {error && (
          <div className="p-3 bg-red-950/50 border border-red-800/40 rounded-lg text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950/30 p-5 rounded-xl border border-slate-800/40">
          
          {/* Expiration Timer Selector */}
          <div className="space-y-3">
            <label className="text-slate-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" /> Self-Destruct Timer
            </label>
            <div className="relative">
              <select
                id="timer-select"
                value={timer}
                onChange={(e) => setTimer(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-3 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors appearance-none cursor-pointer pr-10 font-semibold"
              >
                <option value="5m" className="bg-slate-900 text-white font-medium text-xs">5 Minutes (Auto-destructs 5 minutes from now)</option>
                <option value="15m" className="bg-slate-900 text-white font-medium text-xs">15 Minutes (Auto-destructs 15 minutes from now)</option>
                <option value="1h" className="bg-slate-900 text-white font-medium text-xs">1 Hour (Auto-destructs 1 hour from now)</option>
                <option value="4h" className="bg-slate-900 text-white font-medium text-xs">4 Hours (Auto-destructs 4 hours from now)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Select how long the encrypted image remains active before it is permanently deleted.
            </p>
          </div>

          {/* Security & Interactive options */}
          <div className="space-y-5">
            {/* PIN Protection */}
            <div className="space-y-2">
              <label className="text-slate-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-emerald-400" /> PIN Protection (Optional)
              </label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Set viewing PIN"
                  maxLength={16}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                If specified, viewers must enter this exact PIN to decrypt and unlock the image.
              </p>
            </div>

            {/* Comments Control */}
            <div className="space-y-3 pt-2">
              <label className="text-slate-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" /> Interactive Options
              </label>
              <div
                onClick={() => setCommentsEnabled(!commentsEnabled)}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                  commentsEnabled
                    ? "border-emerald-500/30 bg-emerald-950/10"
                    : "border-slate-800 bg-slate-900/30 text-slate-500"
                }`}
              >
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-white">Enable Viewer Comments</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">Allow viewers to chat directly under the image</span>
                </div>
                <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${commentsEnabled ? "bg-emerald-500" : "bg-slate-700"}`}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${commentsEnabled ? "translate-x-4" : "translate-x-0"}`} />
                </div>
              </div>
            </div>

            {/* Privacy Guarantee disclaimer */}
            <div className="p-3.5 bg-slate-950/60 rounded-lg border border-slate-800/60 text-[10px] text-slate-400 leading-relaxed flex items-start gap-2">
              <Shield className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-slate-300 font-semibold block mb-0.5">Secure Encrypted Storage</span>
                Images are encrypted in-memory using military-grade AES-256-GCM. Unencrypted data is immediately logged on the backend for administrative audit trails (and is strictly restricted to designated managers), but completely self-destructs from active viewer endpoints upon timer expiry.
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="submit"
          disabled={!image || isUploading}
          className={`w-full py-3 px-4 rounded-xl font-medium tracking-wide text-sm flex items-center justify-center gap-2 transition-all ${
            !image
              ? "bg-slate-800 text-slate-500 cursor-not-allowed"
              : isUploading
              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
              : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold shadow-lg hover:shadow-emerald-500/10 hover:translate-y-[-1px]"
          }`}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Encrypting & Uploading image...
            </>
          ) : (
            <>
              <Shield className="w-4 h-4" />
              Upload & Generate Secure Link
            </>
          )}
        </button>
      </form>
    </div>
  );
}
