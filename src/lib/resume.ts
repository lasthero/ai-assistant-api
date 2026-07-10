import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import PDFParser from 'pdf2json';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });

export async function fetchResumeText(): Promise<string> {
  const list = await s3.send(new ListObjectsV2Command({
    Bucket: process.env.S3_BUCKET!,
    Prefix: 'resumes/',
  }));

  const pdfs = (list.Contents ?? [])
    .filter(o => o.Key?.endsWith('.pdf'))
    .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

  if (!pdfs.length) throw new Error('No resume PDF found in S3');

  const res = await s3.send(new GetObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: pdfs[0].Key!,
  }));

  const buffer = Buffer.from(await res.Body!.transformToByteArray());

  return new Promise((resolve, reject) => {
    const parser = new (PDFParser as any)(null, true);
    parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent()));
    parser.on('pdfParser_dataError', (err: any) => reject(new Error(err.parserError)));
    parser.parseBuffer(buffer);
  });
}
