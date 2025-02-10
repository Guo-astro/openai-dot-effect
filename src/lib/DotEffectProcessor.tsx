import React, {
  useState,
  useRef,
  useEffect,
  ChangeEvent,
  DragEvent,
} from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import { parseGIF, decompressFrames } from "gifuct-js";
import { GIF } from "react-gif-editor";

// Define an interface for GIF frames (as returned by gifuct-js)
interface GifFrame {
  dims: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  delay: number;
  disposalType: number;
  patch: Uint8ClampedArray;
}

interface DownloadOptions {
  fastForwardFactor: number; // e.g. 2 means half the delay per frame
  quality: number; // Lower numbers here mean higher quality (and larger files)
}

const DotEffectProcessor: React.FC = () => {
  // Image processing settings
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [blockSize, setBlockSize] = useState<number>(6);
  const [maxRadius, setMaxRadius] = useState<number>(3);
  const [spacing, setSpacing] = useState<number>(1);
  const [threshold, setThreshold] = useState<number>(20);
  const [darkBackground, setDarkBackground] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Download options for GIF
  const [fastForwardFactor, setFastForwardFactor] = useState<number>(1);
  const [gifQuality, setGifQuality] = useState<number>(15);

  // Refs for canvas, preview container, and file input
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Ref to store captured frames (each frame is a canvas element)
  const capturedFramesRef = useRef<HTMLCanvasElement[]>([]);

  // Process a static image (non-GIF)
  const processImage = (sourceImage: HTMLImageElement): void => {
    const canvas = canvasRef.current;
    const previewContainer = previewRef.current;
    if (!canvas || !previewContainer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Determine canvas dimensions based on preview container
    const previewWidth = previewContainer.clientWidth;
    const previewHeight = previewContainer.clientHeight;
    const MAX_CANVAS_SIZE = 4096;
    const scale = Math.min(
      MAX_CANVAS_SIZE / sourceImage.width,
      MAX_CANVAS_SIZE / sourceImage.height,
      1
    );

    const imageAspectRatio = sourceImage.width / sourceImage.height;
    const containerAspectRatio = previewWidth / previewHeight;
    let width: number, height: number;
    if (imageAspectRatio > containerAspectRatio) {
      width = Math.min(previewWidth, sourceImage.width * scale);
      height = width / imageAspectRatio;
    } else {
      height = Math.min(previewHeight, sourceImage.height * scale);
      width = height * imageAspectRatio;
    }
    width = Math.floor(width);
    height = Math.floor(height);
    canvas.width = width;
    canvas.height = height;

    // Draw original image
    ctx.drawImage(sourceImage, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Clear canvas and set background
    ctx.fillStyle = darkBackground ? "black" : "white";
    ctx.fillRect(0, 0, width, height);

    // Draw dot effect
    const stepSize = blockSize + spacing;
    ctx.fillStyle = darkBackground ? "white" : "black";
    for (let y = 0; y < height; y += stepSize) {
      for (let x = 0; x < width; x += stepSize) {
        let totalBrightness = 0;
        let samples = 0;
        for (let sy = 0; sy < blockSize; sy++) {
          for (let sx = 0; sx < blockSize; sx++) {
            const sampleX = x + sx;
            const sampleY = y + sy;
            if (sampleX < width && sampleY < height) {
              const pos = (sampleY * width + sampleX) * 4;
              const brightness =
                (data[pos] + data[pos + 1] + data[pos + 2]) / 3;
              totalBrightness += brightness;
              samples++;
            }
          }
        }
        const avgBrightness = totalBrightness / samples;
        if (avgBrightness > threshold * 2.55) {
          const radius = (maxRadius * avgBrightness) / 255;
          ctx.beginPath();
          ctx.arc(x + blockSize / 2, y + blockSize / 2, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  };

  // Animate GIF frames, applying the dot effect to each frame and capturing them
  const animateGif = (
    frames: GifFrame[],
    fullWidth: number,
    fullHeight: number
  ): void => {
    let currentFrame = 0;
    const canvas = canvasRef.current;
    const previewContainer = previewRef.current;
    if (!canvas || !previewContainer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset captured frames for the new animation
    capturedFramesRef.current = [];

    const renderFrame = () => {
      const frame = frames[currentFrame];

      // Create an offscreen canvas for compositing the current frame
      const offscreen = document.createElement("canvas");
      offscreen.width = fullWidth;
      offscreen.height = fullHeight;
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) return;
      offCtx.clearRect(0, 0, fullWidth, fullHeight);

      // Create ImageData from the frame patch and draw it
      const frameImageData = new ImageData(
        frame.patch,
        frame.dims.width,
        frame.dims.height
      );
      offCtx.putImageData(frameImageData, frame.dims.left, frame.dims.top);

      // Determine canvas dimensions based on preview container
      const previewWidth = previewContainer.clientWidth;
      const previewHeight = previewContainer.clientHeight;
      const MAX_CANVAS_SIZE = 4096;
      const scale = Math.min(
        MAX_CANVAS_SIZE / fullWidth,
        MAX_CANVAS_SIZE / fullHeight,
        1
      );
      const imageAspectRatio = fullWidth / fullHeight;
      const containerAspectRatio = previewWidth / previewHeight;
      let width: number, height: number;
      if (imageAspectRatio > containerAspectRatio) {
        width = Math.min(previewWidth, fullWidth * scale);
        height = width / imageAspectRatio;
      } else {
        height = Math.min(previewHeight, fullHeight * scale);
        width = height * imageAspectRatio;
      }
      width = Math.floor(width);
      height = Math.floor(height);
      canvas.width = width;
      canvas.height = height;

      // Draw offscreen composited frame onto visible canvas
      ctx.drawImage(offscreen, 0, 0, width, height);
      const processedImageData = ctx.getImageData(0, 0, width, height);
      const data = processedImageData.data;
      ctx.fillStyle = darkBackground ? "black" : "white";
      ctx.fillRect(0, 0, width, height);
      const stepSize = blockSize + spacing;
      ctx.fillStyle = darkBackground ? "white" : "black";
      for (let y = 0; y < height; y += stepSize) {
        for (let x = 0; x < width; x += stepSize) {
          let totalBrightness = 0;
          let samples = 0;
          for (let sy = 0; sy < blockSize; sy++) {
            for (let sx = 0; sx < blockSize; sx++) {
              const sampleX = x + sx;
              const sampleY = y + sy;
              if (sampleX < width && sampleY < height) {
                const pos = (sampleY * width + sampleX) * 4;
                const brightness =
                  (data[pos] + data[pos + 1] + data[pos + 2]) / 3;
                totalBrightness += brightness;
                samples++;
              }
            }
          }
          const avgBrightness = totalBrightness / samples;
          if (avgBrightness > threshold * 2.55) {
            const radius = (maxRadius * avgBrightness) / 255;
            ctx.beginPath();
            ctx.arc(
              x + blockSize / 2,
              y + blockSize / 2,
              radius,
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
        }
      }

      // Capture the processed frame by copying the visible canvas
      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = canvas.width;
      frameCanvas.height = canvas.height;
      const frameCtx = frameCanvas.getContext("2d");
      if (frameCtx) {
        frameCtx.drawImage(canvas, 0, 0);
        capturedFramesRef.current.push(frameCanvas);
      }

      // Move to the next frame
      currentFrame = (currentFrame + 1) % frames.length;
      const delay = frame.delay ? frame.delay * 10 : 100; // delay in ms
      setTimeout(() => {
        requestAnimationFrame(renderFrame);
      }, delay);
    };

    renderFrame();
  };

  // Download the processed frames as a new GIF
  const downloadProcessedGif = (
    frames: HTMLCanvasElement[],
    options: DownloadOptions
  ) => {
    if (frames.length === 0) return;
    const { fastForwardFactor, quality } = options;
    const width = frames[0].width;
    const height = frames[0].height;

    // Create a new GIF encoder instance
    const gif = new GIF({
      workers: 2,
      quality, // Lower numbers produce higher quality (but larger files)
      width,
      height,
    });

    // Add each captured frame with a delay adjusted by fastForwardFactor
    frames.forEach((frameCanvas) => {
      gif.addFrame(frameCanvas, { copy: true, delay: 100 / fastForwardFactor });
    });

    // When finished, trigger a download
    gif.on("finished", (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dot-effect.gif";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    gif.render();
  };

  // Handle file upload (static images or GIF)
  const handleFile = (file: File | undefined): void => {
    if (!file) return;
    if (file.type === "image/gif") {
      // For GIF files, decode and animate
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const buffer = e.target?.result;
        if (buffer instanceof ArrayBuffer) {
          const gif = parseGIF(buffer);
          const frames: GifFrame[] = decompressFrames(gif, true) as GifFrame[];
          // Use global dimensions (LSD) if available; else compute max dimensions from frames
          const fullWidth =
            gif.lsd && gif.lsd.width
              ? gif.lsd.width
              : Math.max(
                  ...frames.map((frame) => frame.dims.left + frame.dims.width)
                );
          const fullHeight =
            gif.lsd && gif.lsd.height
              ? gif.lsd.height
              : Math.max(
                  ...frames.map((frame) => frame.dims.top + frame.dims.height)
                );
          animateGif(frames, fullWidth, fullHeight);
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (file.type.startsWith("image/")) {
      // For static images
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const result = e.target?.result;
        if (typeof result === "string") {
          const img = new Image();
          img.onload = () => {
            setImage(img);
            processImage(img);
          };
          img.src = result;
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Drag and drop event handlers
  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(false);
  };

  // For static images, re-run processing on window resize
  useEffect(() => {
    let resizeTimer: number;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (image) {
          processImage(image);
        }
      }, 100);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimer);
    };
  }, [image, blockSize, maxRadius, spacing, threshold, darkBackground]);

  // Re-run processing when static image settings change
  useEffect(() => {
    if (image) {
      processImage(image);
    }
  }, [blockSize, maxRadius, spacing, threshold, darkBackground, image]);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Controls Panel */}
      <div className="w-full lg:w-96 p-6 flex flex-col">
        <Card className="flex-1">
          <div className="p-6 space-y-6">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors
                  ${
                    isDragging
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-300"
                  }
                  ${image ? "border-green-500" : ""}`}
            >
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  handleFile(e.target.files?.[0])
                }
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-12 h-12 text-gray-400" />
                <p className="text-sm text-gray-600">
                  Drag and drop an image here, or{" "}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    browse
                  </button>
                </p>
                {image && (
                  <p className="text-sm text-green-600">
                    Image loaded successfully!
                  </p>
                )}
              </div>
            </div>

            {/* Settings Controls */}
            <div className="space-y-4">
              {/* Block Size */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Block Size</Label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      value={blockSize}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        if (!isNaN(value) && value >= 4) {
                          setBlockSize(value);
                        }
                      }}
                      className="w-16 px-2 py-1 text-right text-sm border rounded"
                    />
                    <span className="ml-1 text-sm text-gray-500">px</span>
                  </div>
                </div>
                <Slider
                  value={[blockSize]}
                  onValueChange={(value: number[]) => setBlockSize(value[0])}
                  min={4}
                  max={40}
                  step={1}
                />
              </div>

              {/* Max Dot Radius */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Max Dot Radius</Label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      value={maxRadius}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        if (!isNaN(value) && value >= 1) {
                          setMaxRadius(value);
                        }
                      }}
                      className="w-16 px-2 py-1 text-right text-sm border rounded"
                    />
                    <span className="ml-1 text-sm text-gray-500">px</span>
                  </div>
                </div>
                <Slider
                  value={[maxRadius]}
                  onValueChange={(value: number[]) => setMaxRadius(value[0])}
                  min={1}
                  max={20}
                  step={1}
                />
              </div>

              {/* Spacing */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Spacing</Label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      value={spacing}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        if (!isNaN(value) && value >= 0) {
                          setSpacing(value);
                        }
                      }}
                      className="w-16 px-2 py-1 text-right text-sm border rounded"
                    />
                    <span className="ml-1 text-sm text-gray-500">px</span>
                  </div>
                </div>
                <Slider
                  value={[spacing]}
                  onValueChange={(value: number[]) => setSpacing(value[0])}
                  min={0}
                  max={10}
                  step={1}
                />
              </div>

              {/* Brightness Threshold */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Brightness Threshold</Label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      value={threshold}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        if (!isNaN(value) && value >= 0 && value <= 100) {
                          setThreshold(value);
                        }
                      }}
                      className="w-16 px-2 py-1 text-right text-sm border rounded"
                    />
                    <span className="ml-1 text-sm text-gray-500">%</span>
                  </div>
                </div>
                <Slider
                  value={[threshold]}
                  onValueChange={(value: number[]) => setThreshold(value[0])}
                  min={0}
                  max={100}
                  step={1}
                />
              </div>

              {/* Dark Background Switch */}
              <div className="flex items-center justify-between">
                <Label>Dark Background</Label>
                <Switch
                  checked={darkBackground}
                  onCheckedChange={(checked: boolean) =>
                    setDarkBackground(checked)
                  }
                />
              </div>

              {/* Fast Forward Control */}
              <div className="flex items-center justify-between">
                <Label>Fast Forward</Label>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={0.5}
                  value={fastForwardFactor}
                  onChange={(e) =>
                    setFastForwardFactor(parseFloat(e.target.value))
                  }
                />
                <span>{fastForwardFactor}x</span>
              </div>

              {/* GIF Quality Control */}
              <div className="flex items-center justify-between">
                <Label>GIF Quality</Label>
                <input
                  type="number"
                  value={gifQuality}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!isNaN(value)) {
                      setGifQuality(value);
                    }
                  }}
                  className="w-16 px-2 py-1 text-right text-sm border rounded"
                />
                <span className="ml-1 text-sm text-gray-500">
                  (Lower number = better quality)
                </span>
              </div>
            </div>
          </div>
        </Card>

        <div className="mt-4">
          <button
            onClick={() =>
              downloadProcessedGif(capturedFramesRef.current, {
                fastForwardFactor,
                quality: gifQuality,
              })
            }
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
          >
            Download GIF
          </button>
        </div>

        <footer className="py-4 text-center text-sm text-gray-500">
          Created by{" "}
          <a
            href="https://x.com/btibor91"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800"
          >
            @btibor91
          </a>
        </footer>
      </div>

      {/* Preview Panel */}
      <div
        ref={previewRef}
        className={`flex-1 flex items-center justify-center p-6 h-[50vh] lg:h-screen ${
          darkBackground ? "bg-black" : "bg-white"
        }`}
      >
        <canvas ref={canvasRef} className="max-w-full max-h-full" />
      </div>
    </div>
  );
};

export default DotEffectProcessor;
