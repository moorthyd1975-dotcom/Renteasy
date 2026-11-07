/**
 * Image Quality and Preprocessing Utilities
 * Detects blur using Laplacian Variance and detects severe glare/lighting issues.
 */

export interface ImageQualityReport {
  isBlurry: boolean;
  blurScore: number; // Higher is sharper; typically < 15 is blurry
  isTooDark: boolean;
  isOverexposed: boolean;
  averageBrightness: number; // 0 to 255
  recommendation: string;
}

/**
 * Calculates the Laplacian variance of an image using HTML5 Canvas.
 * Laplacian operator approximates the second derivative of the image;
 * sharp edges have high variance, smooth or blurred images have low variance.
 */
export async function analyzeImageQuality(
  imageSrc: string
): Promise<ImageQualityReport> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve({
            isBlurry: false,
            blurScore: 50,
            isTooDark: false,
            isOverexposed: false,
            averageBrightness: 128,
            recommendation: 'Standard quality',
          });
          return;
        }

        // Downscale for fast real-time analysis
        const width = 300;
        const height = Math.round((img.height / img.width) * 300);
        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // 1. Grayscale & Brightness calculation
        const gray = new Float32Array(width * height);
        let totalBrightness = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          gray[i / 4] = lum;
          totalBrightness += lum;
        }

        const avgBrightness = totalBrightness / (width * height);

        // 2. 3x3 Laplacian Convolution Kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
        let sum = 0;
        let sumSq = 0;
        let count = 0;

        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const laplacian =
              gray[idx - width] +
              gray[idx + width] +
              gray[idx - 1] +
              gray[idx + 1] -
              4 * gray[idx];

            sum += laplacian;
            sumSq += laplacian * laplacian;
            count++;
          }
        }

        const mean = sum / count;
        const variance = sumSq / count - mean * mean;
        // Normalize score roughly between 0 and 100
        const blurScore = Math.min(100, Math.max(0, Math.round(variance / 8)));

        const isBlurry = blurScore < 16;
        const isTooDark = avgBrightness < 40;
        const isOverexposed = avgBrightness > 225;

        let recommendation = 'Image quality is good.';
        if (isBlurry && (isTooDark || isOverexposed)) {
          recommendation =
            'Image is blurry and lighting is poor. Retake with steady hands in well-lit conditions.';
        } else if (isBlurry) {
          recommendation =
            'Image appears blurry. Hold camera steady or tap to focus before capturing.';
        } else if (isTooDark) {
          recommendation =
            'Scene is too dark. Turn on the room light or meter flashlight.';
        } else if (isOverexposed) {
          recommendation =
            'Severe glare or flash reflection detected on meter glass. Avoid direct flash.';
        }

        resolve({
          isBlurry,
          blurScore,
          isTooDark,
          isOverexposed,
          averageBrightness: Math.round(avgBrightness),
          recommendation,
        });
      } catch {
        resolve({
          isBlurry: false,
          blurScore: 40,
          isTooDark: false,
          isOverexposed: false,
          averageBrightness: 120,
          recommendation: 'Visual verification ready.',
        });
      }
    };

    img.onerror = () => {
      resolve({
        isBlurry: true,
        blurScore: 0,
        isTooDark: false,
        isOverexposed: false,
        averageBrightness: 0,
        recommendation: 'Failed to process image format.',
      });
    };

    img.src = imageSrc;
  });
}

/**
 * Resizes and compresses an image to avoid massive payloads while maintaining readability.
 */
export async function compressImage(
  fileOrBase64: File | string,
  maxWidth = 1400,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    const process = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };

    img.onload = process;
    img.onerror = (err) => reject(err);

    if (typeof fileOrBase64 === 'string') {
      img.src = fileOrBase64;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(fileOrBase64);
    }
  });
}
