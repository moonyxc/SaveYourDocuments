import sharp from 'sharp';

export interface ImagePreprocessResult {
  buffer: Buffer;
  format: string;
  width: number;
  height: number;
}

export async function preprocessImage(
  input: Buffer,
  options?: {
    rotate?: number;
    grayscale?: boolean;
    contrast?: number;
    resize?: number;
  }
): Promise<ImagePreprocessResult> {
  let pipeline = sharp(input);

  if (options?.rotate) {
    pipeline = pipeline.rotate(options.rotate);
  }

  if (options?.grayscale) {
    pipeline = pipeline.grayscale();
  }

  if (options?.resize) {
    pipeline = pipeline.resize({ width: options.resize, withoutEnlargement: true });
  }

  const metadata = await pipeline.metadata();
  const buffer = await pipeline.toBuffer();

  return {
    buffer,
    format: metadata.format ?? 'png',
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
  };
}

export async function createThumbnail(input: Buffer, size = 300): Promise<Buffer> {
  return sharp(input)
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}