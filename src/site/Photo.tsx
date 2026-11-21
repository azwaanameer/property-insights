/** A static example photo from public/img. Credits are in credits.ts and the footer. */
export function Photo({ name, alt, lazy = false }: { name: string; alt: string; lazy?: boolean }) {
  return <img src={`/img/${name}.jpg`} alt={alt} width={800} height={500} loading={lazy ? "lazy" : undefined} decoding="async" />;
}
