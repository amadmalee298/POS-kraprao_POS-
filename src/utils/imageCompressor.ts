/**
 * Compresses an image file selected from device/gallery or camera.
 * Resizes dimensions up to maxDimension (default 800px) and converts to JPEG Data URL.
 */
export const compressImageFile = (file: File, maxDimension = 800, quality = 0.82): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const resultStr = e.target?.result as string;
      if (!resultStr) {
        resolve('');
        return;
      }

      const img = new Image();
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
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(resultStr);
        }
      };

      img.onerror = () => {
        resolve(resultStr);
      };

      img.src = resultStr;
    };
    reader.readAsDataURL(file);
  });
};
