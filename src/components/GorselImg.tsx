import React from 'react';
import { useGorsel } from '../lib/gorselDeposu';

/**
 * Galeri görseli (21 Ekim): `src` bir `gorsel:<id>` başvurusuysa görsel
 * belgesinden çözülür, eski değerler (data:, http, /) olduğu gibi gösterilir.
 * Yüklenirken boş bir kutu, bulunamazsa küçük bir not çıkar.
 */
type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string | undefined };

export const GorselImg: React.FC<Props> = ({ src, alt = '', className, style, ...diger }) => {
  const adres = useGorsel(src);
  if (adres === undefined) return <span aria-hidden className={className} style={{ ...style, display: 'block', background: 'transparent' }} />;
  if (adres === null) return <span className={className} style={{ ...style, display: 'block', fontSize: 10, textAlign: 'center' }}>görsel bulunamadı</span>;
  return <img src={adres} alt={alt} className={className} style={style} {...diger} />;
};

export default GorselImg;
