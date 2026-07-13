import React, { useState, useEffect } from "react";

interface SecureCanvasImageProps {
  src: string | null;
  className?: string;
  alt?: string;
  watermarkText?: string;
}

export default function SecureCanvasImage({ src, className, alt, watermarkText }: SecureCanvasImageProps) {
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [idSuffix] = useState(() => Math.random().toString(36).substring(2, 9));

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      // Get exact natural dimensions of the decrypted image
      setDimensions({
        width: img.naturalWidth || img.width || 800,
        height: img.naturalHeight || img.height || 600,
      });
    };
    img.src = src;
  }, [src]);

  if (!src) {
    return null;
  }

  const patternId = `secure-watermark-pattern-${idSuffix}`;

  return (
    <svg
      id={`secure-svg-viewport-${idSuffix}`}
      viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      className={className}
      aria-label={alt}
      style={{
        display: "block",
        maxWidth: "100%",
        height: "auto",
        userSelect: "none",
        WebkitUserSelect: "none",
        pointerEvents: "none", // Prevent hover selecting, highlighting, or dragging in browser
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <defs>
        {/* Repeating text pattern angled over the image */}
        <pattern
          id={patternId}
          width="260"
          height="180"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-25)"
        >
          <text
            x="0"
            y="90"
            fill="#ffffff"
            fillOpacity="0.11"
            fontSize="13"
            fontFamily="'JetBrains Mono', monospace"
            fontWeight="bold"
            letterSpacing="0.05em"
          >
            {watermarkText || "SafePix SAFE SESSION"}
          </text>
        </pattern>
      </defs>

      {/* The base image converted into SVG's inline binary structure */}
      <image
        href={src}
        x="0"
        y="0"
        width={dimensions.width}
        height={dimensions.height}
        style={{ pointerEvents: "none" }}
      />

      {/* Tiled Watermark Grid directly in the SVG vector structure */}
      <rect
        x="0"
        y="0"
        width={dimensions.width}
        height={dimensions.height}
        fill={`url(#${patternId})`}
        style={{ pointerEvents: "none" }}
      />
    </svg>
  );
}

