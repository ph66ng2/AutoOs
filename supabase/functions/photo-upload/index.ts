import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_FILES = 6;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

type UploadFile = { filename: string; mimeType: string; size: number; storagePath?: string };
type Session = { id: string; empresa_id: string; status: string; expires_at: string };

const json = (body: unknown, status = 200, origin?: string | null) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) } });

function corsHeaders(origin?: string | null) {
  const allowed = (Deno.env.get("PHOTO_UPLOAD_ALLOWED_ORIGINS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return { "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : "null", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}

function isAllowedOrigin(origin: string | null) { return !origin || corsHeaders(origin)["Access-Control-Allow-Origin"] === origin; }

function validateFiles(files: unknown): UploadFile[] | null {
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) return null;
  const valid = files.every((file) => {
    if (!file || typeof file !== "object") return false;
    const candidate = file as UploadFile;
    return typeof candidate.filename === "string" && candidate.filename.trim().length > 0 && candidate.filename.length <= 180 && typeof candidate.mimeType === "string" && ALLOWED_MIME_TYPES.has(candidate.mimeType) && Number.isInteger(candidate.size) && candidate.size > 0 && candidate.size <= MAX_FILE_SIZE_BYTES;
  });
  return valid ? files as UploadFile[] : null;
}

async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function extensionFor(mimeType: string) { return mimeType === "image/png" ? "png" : "jpg"; }
function safeFilename(filename: string) { return filename.trim().replace(/[\\/\\\\\u0000-\u001f]/g, "_").slice(0, 180); }
function storageFolder(session: Session) { return `${session.empresa_id}/${session.id}`; }
function isSessionPath(session: Session, storagePath: string) { return storagePath.startsWith(`${storageFolder(session)}/`) && /^[0-9a-f-]+\.(jpg|png)$/.test(storagePath.slice(storageFolder(session).length + 1)); }

function getConfig() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("Configuração segura do upload indisponível");
  return { url, serviceRoleKey, bucket: Deno.env.get("PHOTO_UPLOAD_BUCKET") ?? "photo-upload-staging" };
}

async function loadSession(supabase: ReturnType<typeof createClient>, sessionId: unknown, token: unknown) {
  if (typeof sessionId !== "string" || typeof token !== "string" || !sessionId || token.length !== 64) return null;
  const tokenHash = await sha256(token);
  const { data, error } = await supabase.from("photo_upload_sessions").select("id, empresa_id, status, expires_at").eq("id", sessionId).eq("token_hash", tokenHash).eq("status", "PENDING").gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw new Error("Não foi possível validar a sessão de fotos");
  return data as Session | null;
}

async function currentItemCount(supabase: ReturnType<typeof createClient>, sessionId: string) {
  const { count, error } = await supabase.from("photo_upload_session_items").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
  if (error) throw new Error("Não foi possível consultar os itens da sessão");
  return count ?? 0;
}

async function prepareUploads(supabase: ReturnType<typeof createClient>, bucket: string, session: Session, files: UploadFile[]) {
  if ((await currentItemCount(supabase, session.id)) + files.length > MAX_FILES) return { error: "O limite de seis fotos desta sessão já foi atingido." };
  const uploads = await Promise.all(files.map(async (file) => {
    const storagePath = `${storageFolder(session)}/${crypto.randomUUID()}.${extensionFor(file.mimeType)}`;
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(storagePath, { upsert: false });
    if (error || !data) throw new Error("Não foi possível preparar uma das fotos para envio");
    return { storagePath, signedUrl: data.signedUrl, token: data.token };
  }));
  return { uploads };
}

async function completeUploads(supabase: ReturnType<typeof createClient>, bucket: string, session: Session, files: UploadFile[]) {
  if (files.some((file) => !file.storagePath || !isSessionPath(session, file.storagePath))) return { error: "Uma foto não pertence a esta sessão." };
  if ((await currentItemCount(supabase, session.id)) + files.length > MAX_FILES) return { error: "O limite de seis fotos desta sessão já foi atingido." };
  const { data: stored, error: listError } = await supabase.storage.from(bucket).list(storageFolder(session), { limit: MAX_FILES });
  if (listError) throw new Error("Não foi possível confirmar as fotos enviadas");
  const storedNames = new Set((stored ?? []).map((item) => item.name));
  if (files.some((file) => !storedNames.has(file.storagePath!.split("/").at(-1)!))) return { error: "Uma foto ainda não chegou ao armazenamento. Tente novamente." };
  const { data: existing, error: positionError } = await supabase.from("photo_upload_session_items").select("position").eq("session_id", session.id).order("position");
  if (positionError) throw new Error("Não foi possível reservar as posições das fotos");
  const used = new Set((existing ?? []).map((item) => item.position));
  const positions = Array.from({ length: MAX_FILES }, (_, position) => position).filter((position) => !used.has(position));
  const { error: insertError } = await supabase.from("photo_upload_session_items").insert(files.map((file, index) => ({ session_id: session.id, position: positions[index], storage_path: file.storagePath, filename: safeFilename(file.filename), mime_type: file.mimeType, tamanho_bytes: file.size, status: "UPLOADED" })));
  if (insertError) return { error: "As fotos foram enviadas, mas a sessão mudou. Atualize a página." };
  return { accepted: files.length };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return json({ error: "Origem não autorizada." }, 403, origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return json({ error: "Use POST para enviar fotos." }, 405, origin);
  try {
    const body = await request.json();
    const files = validateFiles(body.files);
    if (!files) return json({ error: "Envie de uma a seis imagens JPEG ou PNG de até 10 MB." }, 400, origin);
    const config = getConfig();
    const supabase = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false } });
    const session = await loadSession(supabase, body.session, body.token);
    if (!session) return json({ error: "Esta sessão não é válida, expirou ou foi cancelada. Gere outro QR no computador." }, 401, origin);
    if (body.action === "prepare") { const result = await prepareUploads(supabase, config.bucket, session, files); return "error" in result ? json(result, 409, origin) : json(result, 200, origin); }
    if (body.action === "complete") { const result = await completeUploads(supabase, config.bucket, session, files); return "error" in result ? json(result, 409, origin) : json(result, 201, origin); }
    return json({ error: "Ação de upload inválida." }, 400, origin);
  } catch (error) {
    console.error("Falha no upload de fotos", error instanceof Error ? error.message : "erro desconhecido");
    return json({ error: "Não foi possível processar as fotos. Verifique a conexão e tente novamente." }, 500, origin);
  }
});
