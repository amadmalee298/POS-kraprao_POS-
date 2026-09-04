/**
 * Compresses an image file selected from device/gallery or camera.
 * Resizes dimensions up to maxDimension (default 800px) and converts to JPEG Data URL.
 */
export const compressImageFile = (file: File, maxDimension = 800, quality = 0.75): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const resultStr = e.target?.result as string;
      if (!resultStr) {
        resolve('');
        return;
      }
      compressBase64Image(resultStr, maxDimension, quality).then(resolve);
    };
    reader.readAsDataURL(file);
  });
};

/**
 * Compresses an existing base64 image data URL so it's optimized for Firestore (under 100KB)
 * and prevents browser LocalStorage 5MB QuotaExceeded errors.
 */
export const compressBase64Image = (
  dataUrl: string,
  maxDimension = 800,
  quality = 0.7
): Promise<string> => {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      resolve(dataUrl || '');
      return;
    }

    // If it's already under 80KB (approx 110,000 characters in base64), return directly
    if (dataUrl.length < 110000 && !dataUrl.startsWith('data:image/png')) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        // Try initial compression
        let compressed = canvas.toDataURL('image/jpeg', quality);
        // If still large, compress with lower quality
        if (compressed.length > 250000) {
          compressed = canvas.toDataURL('image/jpeg', 0.55);
        }
        resolve(compressed);
      } else {
        resolve(dataUrl);
      }
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
};
