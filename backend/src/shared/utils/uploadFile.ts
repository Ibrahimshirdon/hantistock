import { cloudinary } from "../../config/cloudinary.js";

interface UploadOptions {
  folder: string;
  resourceType?: "image" | "raw" | "auto";
}

export function uploadBuffer(
  buffer: Buffer,
  { folder, resourceType = "auto" }: UploadOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `hantistock/${folder}`, resource_type: resourceType },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Cloudinary upload failed"));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}
