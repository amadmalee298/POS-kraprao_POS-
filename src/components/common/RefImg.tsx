import React from 'react';
import { useImage } from '../../services/imageStore';

/** An <img> for a bill picture that may be a reference (img:…), read when shown */
export const RefImg: React.FC<React.ImgHTMLAttributes<HTMLImageElement> & { src?: string | null }> = ({ src, alt = '', className, ...rest }) => {
  const data = useImage(src);
  if (!data) return <span className={`inline-block bg-slate-800/60 animate-pulse ${className || ''}`} aria-label={alt} />;
  return <img src={data} alt={alt} className={className} {...rest} />;
};
