import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const filename = `${Date.now()}_${req.headers['x-filename'] || 'upload'}`;
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    await s3.send(new PutObjectCommand({
      Bucket: 'carlisle-uploads',
      Key: filename,
      Body: buffer,
      ContentType: contentType,
    }));

    res.status(200).json({ 
      url: `${process.env.R2_PUBLIC_URL}/${filename}` 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
}