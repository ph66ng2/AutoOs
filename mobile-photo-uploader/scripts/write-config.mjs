import { writeFileSync } from "node:fs";

const url = process.env.PHOTO_UPLOAD_FUNCTION_URL;
if (!url?.startsWith("https://")) {
  throw new Error("PHOTO_UPLOAD_FUNCTION_URL deve ser uma URL HTTPS da Edge Function.");
}

writeFileSync("config.js", `window.PHOTO_UPLOAD_FUNCTION_URL = ${JSON.stringify(url)};\n`, "utf8");
