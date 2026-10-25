import { mkdir, readFile, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createJob, getDataPath, getOwner, listJobs, updateJob } from "@/lib/jobs";
import { moderatePrompt } from "@/lib/moderation";
import { createVideoProvider, explainProviderError } from "@/lib/video-provider";
import { checkFfmpeg, finalizeVideo } from "@/lib/video-processing";
import { isSameOriginMutation } from "@/lib/request-security";

export const runtime = "nodejs";
export const maxDuration = 300;

const inputSchema = z.object({
  prompt: z.string().trim().max(1000).default(""),
  language: z.enum(["fr", "en"]).default("fr"),
  style: z.enum(["realistic", "anime", "cinematic", "3d"]),
  format: z.enum(["landscape", "portrait", "square"]),
  duration: z.coerce.number().int().min(3).max(10),
  watermark: z.preprocess((value) => value === true || value === "true", z.boolean()).default(true)
});

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listJobs(getOwner(request)));
  } catch {
    return NextResponse.json({ error: "Impossible de lire l’historique local." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Requête non autorisée." }, { status: 403 });
  }
  let imagePath: string | undefined;
  let language: "fr" | "en" = "fr";
  try {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > 12 * 1024 * 1024) {
      return NextResponse.json({ error: "La requête dépasse la taille maximale autorisée." }, { status: 413 });
    }
    const form = await request.formData();
    language = form.get("language") === "en" ? "en" : "fr";
    const message = (fr: string, en: string) => language === "en" ? en : fr;
    const parsed = inputSchema.safeParse({
      prompt: form.get("prompt") ?? "",
      language,
      style: form.get("style"),
      format: form.get("format"),
      duration: form.get("duration"),
      watermark: form.get("watermark") ?? "true"
    });
    if (!parsed.success) return NextResponse.json({ error: message("Vérifiez les options de génération.", "Check your generation options.") }, { status: 400 });
    const imageFile = form.get("image");
    if (!(imageFile instanceof File) && !parsed.data.prompt) {
      return NextResponse.json({ error: message("Ajoutez une description ou importez une image.", "Add a description or upload an image.") }, { status: 400 });
    }
    if (parsed.data.prompt && !moderatePrompt(parsed.data.prompt)) {
      return NextResponse.json({ error: message("Ce prompt ne respecte pas les règles de sécurité.", "This prompt does not meet the safety guidelines.") }, { status: 400 });
    }
    let image: Buffer | undefined;
    let imageType: string | undefined;
    if (imageFile instanceof File) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(imageFile.type)) {
        return NextResponse.json({ error: message("Importez une image JPG, PNG ou WebP.", "Upload a JPG, PNG, or WebP image.") }, { status: 400 });
      }
      if (imageFile.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: message("L’image doit faire 10 Mo maximum.", "The image must be 10 MB or smaller.") }, { status: 413 });
      }
      if (imageFile.size === 0) {
        return NextResponse.json({ error: message("Le fichier image est vide.", "The image file is empty.") }, { status: 400 });
      }
      image = Buffer.from(await imageFile.arrayBuffer());
      imageType = imageFile.type;
    }
    const owner = getOwner(request);
    const limit = Math.max(1, Number.parseInt(process.env.DAILY_GENERATION_LIMIT || "3", 10) || 3);
    const storedImagePath = image ? getDataPath("uploads", `${globalThis.crypto.randomUUID()}.${imageType!.split("/")[1]}`) : undefined;
    if (storedImagePath) {
      await mkdir(getDataPath("uploads"), { recursive: true });
      await writeFile(storedImagePath, image!);
      imagePath = storedImagePath;
    }
    const { job, remaining } = await createJob({
      owner,
      prompt: parsed.data.prompt,
      language: parsed.data.language,
      style: parsed.data.style,
      format: parsed.data.format,
      duration: parsed.data.duration,
      watermark: parsed.data.watermark,
      imagePath: storedImagePath
    }, limit);
    const processJob = async () => {
      try {
        await updateJob(job.id, { status: "processing", progress: 12 });
        await checkFfmpeg();
        const inputImage = storedImagePath ? await readFile(storedImagePath) : undefined;
        const rawVideo = await createVideoProvider().generate({
          prompt: job.prompt,
          style: job.style,
          format: job.format,
          duration: job.duration,
          image: inputImage,
          imageType
        });
        await updateJob(job.id, { progress: 75 });
        const video = await finalizeVideo(rawVideo, job.format, job.duration, job.watermark);
        const outputPath = getDataPath("videos", `${job.id}.mp4`);
        await mkdir(getDataPath("videos"), { recursive: true });
        await writeFile(outputPath, video);
        await updateJob(job.id, { status: "completed", progress: 100, videoPath: outputPath });
      } catch (error) {
        await updateJob(job.id, { status: "failed", progress: 0, error: explainProviderError(error, job.language) });
      }
    };
    void processJob().catch((error) => console.error("Video job failed unexpectedly:", error));
    return NextResponse.json({ job: { ...job, owner: undefined, imagePath: undefined }, remaining }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "DAILY_LIMIT") {
      return NextResponse.json({ error: language === "en" ? "Your free daily quota is used up." : "Votre quota gratuit du jour est épuisé." }, { status: 429 });
    }
    if (imagePath) await import("node:fs/promises").then(({ unlink }) => unlink(imagePath!).catch(() => undefined));
    console.error("Unable to create video job:", error);
    return NextResponse.json({ error: "Impossible de démarrer la génération. Vérifiez la configuration du serveur." }, { status: 500 });
  }
}
